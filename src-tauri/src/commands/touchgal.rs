//! Public StarryGal relay client. Developer tokens exist only on the Vercel server.
use super::error::{CmdError, CmdResult};
use std::time::Duration;

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
pub async fn touchgal_request(endpoint: String, action: String, keyword: Option<String>, unique_id: Option<String>, page: Option<u32>, allow_nsfw: bool) -> CmdResult<serde_json::Value> {
    let url = request_url(&endpoint, &action, keyword.as_deref(), unique_id.as_deref(), page, allow_nsfw)?;
    let client = reqwest::Client::builder().timeout(Duration::from_secs(20)).user_agent("StarryGal/0.2 (+https://github.com/loveyong07/loveyong-starrygal)").redirect(reqwest::redirect::Policy::limited(3)).build().map_err(|_| CmdError("资料查询初始化失败。".into()))?;
    let mut response = client.get(url).send().await.map_err(|_| CmdError("资料服务连接失败，请检查网络后重试。".into()))?;
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|_| CmdError("资料响应读取失败。".into()))? {
        if bytes.len() + chunk.len() > 2 * 1024 * 1024 { return Err(CmdError("资料响应过大。".into())); }
        bytes.extend_from_slice(&chunk);
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
    }
}
