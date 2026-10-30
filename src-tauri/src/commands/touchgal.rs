//! Public StarryGal relay client. Optional user-supplied TouchGal API token is supported locally.
use super::error::{CmdError, CmdResult};
use std::time::Duration;

fn clean_token(api_token: Option<&str>) -> CmdResult<Option<String>> {
    let Some(raw) = api_token else { return Ok(None) };
    let trimmed = raw.trim();
    let trimmed = trimmed.strip_prefix("Bearer ").or_else(|| trimmed.strip_prefix("bearer ")).unwrap_or(trimmed).trim();
    if trimmed.is_empty() {
        return Ok(None);
    }
    if trimmed.len() > 512 || trimmed.chars().any(|c| c.is_whitespace() || c.is_control()) {
        return Err(CmdError("请填写不含空格或换行的有效 TouchGal Token。".into()));
    }
    Ok(Some(trimmed.to_string()))
}

fn direct_upstream_url(action: &str, keyword: Option<&str>, unique_id: Option<&str>, page: Option<u32>, allow_nsfw: bool) -> CmdResult<reqwest::Url> {
    if !["status", "search", "detail", "resources", "patches"].contains(&action) {
        return Err(CmdError("无效的资料查询类型。".into()));
    }
    if action == "search" && !keyword.is_some_and(|value| (3..=100).contains(&value.trim().chars().count())) {
        return Err(CmdError("请填写 3～100 个字符的游戏名称。".into()));
    }
    if ["detail", "resources", "patches"].contains(&action) && !unique_id.is_some_and(|value| value.len() == 8 && value.bytes().all(|c| c.is_ascii_alphanumeric())) {
        return Err(CmdError("无效的 TouchGal 条目编号。".into()));
    }
    let path = match action {
        "status" => "/api/v1/me".to_string(),
        "search" => "/api/v1/games/search".to_string(),
        "detail" => format!("/api/v1/games/{}", unique_id.unwrap_or_default()),
        _ => format!("/api/v1/games/{}/{}", unique_id.unwrap_or_default(), action),
    };
    let mut url = reqwest::Url::parse(&format!("https://developer.touchgal.com{path}")).map_err(|_| CmdError("无效的资料接口地址。".into()))?;
    if action != "status" {
        let mut query = url.query_pairs_mut();
        query.append_pair("allowNsfw", if allow_nsfw { "true" } else { "false" });
        if action == "search" {
            query
                .append_pair("keyword", keyword.unwrap_or_default().trim())
                .append_pair("page", &page.unwrap_or(1).clamp(1, 100).to_string())
                .append_pair("limit", "20");
        }
    }
    Ok(url)
}

fn request_url(endpoint: &str, action: &str, keyword: Option<&str>, unique_id: Option<&str>, page: Option<u32>, allow_nsfw: bool) -> CmdResult<reqwest::Url> {
    let mut url = reqwest::Url::parse(endpoint).map_err(|_| CmdError("无效的资料接口地址。".into()))?;
    if url.scheme() != "https" || !url.username().is_empty() || url.password().is_some() || url.query().is_some() || url.fragment().is_some() {
        return Err(CmdError("资料接口需要不含账号和参数的 HTTPS 地址。".into()));
    }
    if !["status", "search", "detail", "resources", "patches"].contains(&action) {
        return Err(CmdError("无效的资料查询类型。".into()));
    }
    if action == "search" && !keyword.is_some_and(|value| (3..=100).contains(&value.trim().chars().count())) {
        return Err(CmdError("请填写 3～100 个字符的游戏名称。".into()));
    }
    if ["detail", "resources", "patches"].contains(&action) && !unique_id.is_some_and(|value| value.len() == 8 && value.bytes().all(|c| c.is_ascii_alphanumeric())) {
        return Err(CmdError("无效的 TouchGal 条目编号。".into()));
    }
    let mut query = url.query_pairs_mut();
    query.append_pair("action", action).append_pair("allowNsfw", if allow_nsfw { "true" } else { "false" });
    if action == "search" {
        query.append_pair("keyword", keyword.unwrap_or_default().trim()).append_pair("page", &page.unwrap_or(1).clamp(1, 100).to_string());
    }
    if let Some(id) = unique_id { query.append_pair("uniqueId", id); }
    drop(query);
    Ok(url)
}

#[tauri::command]
pub async fn touchgal_request(endpoint: String, action: String, keyword: Option<String>, unique_id: Option<String>, page: Option<u32>, allow_nsfw: bool, api_token: Option<String>) -> CmdResult<serde_json::Value> {
    let token = clean_token(api_token.as_deref())?;
    let trimmed_endpoint = endpoint.trim().trim_end_matches('/');
    let use_direct = token.is_some() && (trimmed_endpoint == "https://loveyong07.top/api/starrygal" || trimmed_endpoint.starts_with("https://developer.touchgal.com"));
    let url = if use_direct {
        direct_upstream_url(&action, keyword.as_deref(), unique_id.as_deref(), page, allow_nsfw)?
    } else {
        request_url(&endpoint, &action, keyword.as_deref(), unique_id.as_deref(), page, allow_nsfw)?
    };
    let client = reqwest::Client::builder().timeout(Duration::from_secs(20)).user_agent("StarryGal/0.2 (+https://github.com/loveyong07/loveyong-starrygal)").redirect(reqwest::redirect::Policy::limited(3)).build().map_err(|_| CmdError("资料查询初始化失败。".into()))?;
    let mut req = client.get(url).header(reqwest::header::ACCEPT, "application/json");
    if let Some(secret) = &token {
        req = req.header(reqwest::header::AUTHORIZATION, format!("Bearer {secret}"));
    }
    let mut response = req.send().await.map_err(|_| CmdError("资料服务连接失败，请检查网络后重试。".into()))?;
    let status = response.status();
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|_| CmdError("资料响应读取失败。".into()))? {
        if bytes.len() + chunk.len() > 2 * 1024 * 1024 { return Err(CmdError("资料响应过大。".into())); }
        bytes.extend_from_slice(&chunk);
    }
    if let Ok(value) = serde_json::from_slice::<serde_json::Value>(&bytes) {
        if value.get("success").is_some() {
            return Ok(value);
        }
    }
    if !status.is_success() {
        let code = match status.as_u16() {
            400 => "BAD_REQUEST",
            401 | 403 => "UNAUTHORIZED",
            404 => "NOT_FOUND",
            429 => "RATE_LIMITED",
            _ => "UPSTREAM_UNAVAILABLE",
        };
        return Ok(serde_json::json!({
            "success": false,
            "error": { "code": code, "message": code }
        }));
    }
    serde_json::from_slice(&bytes).map_err(|_| CmdError("资料接口返回的不是 JSON，请检查服务部署状态。".into()))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn validates_and_encodes_relay_requests() {
        let url = request_url("https://loveyong07.top/api/starrygal", "search", Some("夏日 & 回忆"), None, Some(2), true).unwrap();
        let pairs: std::collections::HashMap<_, _> = url.query_pairs().into_owned().collect();
        assert_eq!(pairs["keyword"], "夏日 & 回忆");
        assert_eq!(pairs["allowNsfw"], "true");
        assert_eq!(pairs["page"], "2");
        for endpoint in ["http://example.com", "https://user:pass@example.com", "https://example.com?token=secret", "file:///etc/passwd"] {
            assert!(request_url(endpoint, "status", None, None, None, false).is_err());
        }
        assert!(request_url("https://example.com", "detail", None, Some("../games"), None, false).is_err());
        assert_eq!(clean_token(Some("  Bearer tg_123  ")).unwrap().as_deref(), Some("tg_123"));
        assert!(clean_token(Some("bad token")).is_err());
        let direct = direct_upstream_url("search", Some("Summer Pockets"), None, Some(1), false).unwrap();
        assert_eq!(direct.as_str(), "https://developer.touchgal.com/api/v1/games/search?allowNsfw=false&keyword=Summer+Pockets&page=1&limit=20");
    }
}
