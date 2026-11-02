//! Durable public metadata, deliberately outside the disposable image cache.
use super::error::{CmdError, CmdResult};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{
    future::Future,
    io::Read,
    path::{Path, PathBuf},
};

const MAX_FILE_BYTES: u64 = 2 * 1024 * 1024 + 4096;
// Recheck the file after taking the lock: two simultaneous imports must only
// spend one request. The desktop is a single instance and files survive exit.
static REQUEST_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

pub struct CacheKey {
    request_url: String,
    action: String,
    unique_id: Option<String>,
}

impl CacheKey {
    /// `url` has already passed the relay request validator and has no token.
    pub fn new(url: &reqwest::Url, action: &str, unique_id: Option<&str>) -> Self {
        Self {
            request_url: url.as_str().to_owned(),
            action: action.to_owned(),
            unique_id: unique_id.map(str::to_owned),
        }
    }

    fn path(&self, root: &Path) -> PathBuf {
        let digest = format!("{:x}", Sha256::digest(self.request_url.as_bytes()));
        let name = match &self.unique_id {
            Some(id) => format!("{id}-{digest}.json"),
            None => format!("{digest}.json"),
        };
        root.join(&self.action).join(name)
    }

    fn valid_response(&self, value: &Value) -> bool {
        if value["success"] != true || !value["data"].is_object() {
            return false;
        }
        let data = &value["data"];
        let valid_item = |item: &Value| {
            item["name"].as_str().is_some_and(|s| !s.trim().is_empty())
                && item["uniqueId"]
                    .as_str()
                    .is_some_and(|s| s.len() == 8 && s.bytes().all(|c| c.is_ascii_alphanumeric()))
        };
        match self.action.as_str() {
            // Empty successful searches are useful too: do not repeat them on
            // every launch. The matching dialog offers an explicit refresh.
            "search" => data["items"]
                .as_array()
                .is_some_and(|items| items.iter().all(valid_item)),
            "detail" => valid_item(data) && data["uniqueId"].as_str() == self.unique_id.as_deref(),
            _ => false,
        }
    }

    fn read(&self, root: &Path) -> Option<Value> {
        let file = std::fs::File::open(self.path(root)).ok()?;
        if file.metadata().ok()?.len() > MAX_FILE_BYTES {
            return None;
        }
        let mut bytes = Vec::new();
        file.take(MAX_FILE_BYTES + 1).read_to_end(&mut bytes).ok()?;
        let record: Value = serde_json::from_slice(&bytes).ok()?;
        if record["version"] != 1
            || record["requestUrl"] != self.request_url
            || !self.valid_response(&record["response"])
        {
            return None;
        }
        Some(record["response"].clone())
    }

    fn write(&self, root: &Path, value: &Value) -> std::io::Result<()> {
        let path = self.path(root);
        std::fs::create_dir_all(path.parent().unwrap())?;
        let record = json!({
            "version": 1,
            "requestUrl": self.request_url,
            "fetchedAt": time::OffsetDateTime::now_utc().unix_timestamp(),
            "response": value,
        });
        let temporary = path.with_extension(format!(
            "json.{}.{}.tmp",
            std::process::id(),
            time::OffsetDateTime::now_utc().unix_timestamp_nanos()
        ));
        let result = (|| {
            std::fs::write(&temporary, serde_json::to_vec(&record)?)?;
            crate::file_ops::rename(&temporary, &path)
        })();
        if result.is_err() {
            let _ = std::fs::remove_file(&temporary);
        }
        result
    }
}

pub async fn load_or_fetch<F, Fut>(
    root: &Path,
    key: &CacheKey,
    refresh: bool,
    fetch: F,
) -> CmdResult<Value>
where
    F: FnOnce() -> Fut,
    Fut: Future<Output = CmdResult<Value>>,
{
    if !refresh && let Some(value) = key.read(root) {
        return Ok(value);
    }
    let _guard = REQUEST_LOCK.lock().await;
    if !refresh && let Some(value) = key.read(root) {
        return Ok(value);
    }
    let value = fetch().await?;
    if key.valid_response(&value) {
        key.write(root, &value).map_err(|_| {
            CmdError(
                "资料已获取，但本地缓存保存失败，请检查应用数据目录的写入权限和磁盘空间。".into(),
            )
        })?;
    }
    Ok(value)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};

    struct Fixture(PathBuf);
    impl Fixture {
        fn new() -> Self {
            Self(std::env::temp_dir().join(format!(
                "starrygal-touchgal-cache-{}-{}",
                std::process::id(),
                time::OffsetDateTime::now_utc().unix_timestamp_nanos()
            )))
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }
    fn key(action: &str, suffix: &str) -> CacheKey {
        let url = reqwest::Url::parse(&format!("https://example.com/api?action={action}&{suffix}"))
            .unwrap();
        CacheKey::new(&url, action, (action == "detail").then_some("abcd1234"))
    }
    fn detail(name: &str) -> Value {
        json!({"success":true,"data":{"name":name,"uniqueId":"abcd1234","introduction":"saved story"}})
    }

    #[tokio::test]
    async fn persists_across_clients_and_only_refresh_spends_another_request() {
        let root = Fixture::new();
        let calls = AtomicUsize::new(0);
        let fetch = || async {
            calls.fetch_add(1, Ordering::SeqCst);
            Ok(detail("first"))
        };
        let first = load_or_fetch(&root.0, &key("detail", "allowNsfw=false"), false, fetch)
            .await
            .unwrap();
        assert_eq!(first["data"]["name"], "first");
        let second = load_or_fetch(&root.0, &key("detail", "allowNsfw=false"), false, fetch)
            .await
            .unwrap();
        assert_eq!(second, first);
        assert_eq!(calls.load(Ordering::SeqCst), 1);
        let updated = load_or_fetch(&root.0, &key("detail", "allowNsfw=false"), true, || async {
            calls.fetch_add(1, Ordering::SeqCst);
            Ok(detail("updated"))
        })
        .await
        .unwrap();
        assert_eq!(updated["data"]["name"], "updated");
        assert_eq!(calls.load(Ordering::SeqCst), 2);
        assert_eq!(
            key("detail", "allowNsfw=false").read(&root.0),
            Some(updated)
        );
        let record =
            std::fs::read_to_string(key("detail", "allowNsfw=false").path(&root.0)).unwrap();
        assert!(record.contains("fetchedAt") && record.contains("saved story"));
        assert!(!record.contains("apiToken") && !record.contains("Authorization"));
    }

    #[tokio::test]
    async fn empty_searches_are_reused_and_concurrent_misses_are_merged() {
        let root = Fixture::new();
        let key = key("search", "keyword=unknown&page=1&allowNsfw=false");
        let calls = AtomicUsize::new(0);
        let fetch = || async {
            calls.fetch_add(1, Ordering::SeqCst);
            tokio::task::yield_now().await;
            Ok(json!({"success":true,"data":{"items":[],"pagination":{"hasMore":false}}}))
        };
        let (a, b) = tokio::join!(
            load_or_fetch(&root.0, &key, false, fetch),
            load_or_fetch(&root.0, &key, false, fetch)
        );
        assert_eq!(a.unwrap(), b.unwrap());
        assert_eq!(calls.load(Ordering::SeqCst), 1);
        assert!(key.read(&root.0).is_some());
    }

    #[tokio::test]
    async fn failures_and_invalid_payloads_never_poison_saved_data() {
        let root = Fixture::new();
        let key = key("detail", "allowNsfw=false");
        for response in [
            json!({"success":false,"error":{"code":"RATE_LIMITED"}}),
            json!({"success":true,"data":{"uniqueId":"bad","name":"bad"}}),
        ] {
            load_or_fetch(&root.0, &key, false, || async { Ok(response) })
                .await
                .unwrap();
            assert!(key.read(&root.0).is_none());
        }
        key.write(&root.0, &detail("old")).unwrap();
        assert!(
            load_or_fetch(&root.0, &key, true, || async {
                Err(CmdError("offline".into()))
            })
            .await
            .is_err()
        );
        assert_eq!(key.read(&root.0).unwrap()["data"]["name"], "old");
        let error = json!({"success":false,"error":{"code":"UNAUTHORIZED"}});
        load_or_fetch(&root.0, &key, true, || async { Ok(error) })
            .await
            .unwrap();
        assert_eq!(key.read(&root.0).unwrap()["data"]["name"], "old");
        std::fs::write(key.path(&root.0), "{interrupted").unwrap();
        load_or_fetch(&root.0, &key, false, || async { Ok(detail("recovered")) })
            .await
            .unwrap();
        assert_eq!(key.read(&root.0).unwrap()["data"]["name"], "recovered");
    }

    #[test]
    fn endpoint_rating_keyword_and_page_have_separate_cache_files() {
        let root = Fixture::new();
        let first = key("search", "keyword=Summer&page=1&allowNsfw=false");
        let empty = json!({"success":true,"data":{"items":[]}});
        first.write(&root.0, &empty).unwrap();
        for suffix in [
            "keyword=Summer&page=2&allowNsfw=false",
            "keyword=Other&page=1&allowNsfw=false",
            "keyword=Summer&page=1&allowNsfw=true",
        ] {
            assert!(key("search", suffix).read(&root.0).is_none());
        }
        let other = reqwest::Url::parse(
            "https://other.example/api?action=search&keyword=Summer&page=1&allowNsfw=false",
        )
        .unwrap();
        assert!(
            CacheKey::new(&other, "search", None)
                .read(&root.0)
                .is_none()
        );
    }
}
