//! First-run discovery. No network access; uncertain games require confirmation.
use std::collections::HashSet;
use std::path::{Component, Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};

use serde::Serialize;
use tauri::{AppHandle, Emitter};
use tauri_plugin_opener::OpenerExt;

use crate::commands::error::{CmdError, CmdResult};

static RUNNING: AtomicBool = AtomicBool::new(false);
static CANCELLED: AtomicBool = AtomicBool::new(false);
const MAX_DIRS: usize = 20_000;
const MAX_GAMES: usize = 1_000;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveredGame {
    pub title: String,
    pub install_path: String,
    pub exe_path: Option<String>,
    pub source: String,
    pub steam_app_id: Option<String>,
    pub recognized: bool,
}

#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveryReport {
    pub games: Vec<DiscoveredGame>,
    pub roots_scanned: Vec<String>,
    pub warnings: Vec<String>,
    pub cancelled: bool,
}

/// Tokenize quoted Valve KeyValues. Escaped backslashes and quotes are decoded.
fn vdf_tokens(text: &str) -> Vec<String> {
    let mut chars = text.chars().peekable();
    let mut tokens = Vec::new();
    while let Some(ch) = chars.next() {
        if ch == '/' && chars.peek() == Some(&'/') {
            for next in chars.by_ref() {
                if next == '\n' { break; }
            }
        } else if ch == '"' {
            let mut value = String::new();
            while let Some(next) = chars.next() {
                if next == '"' { break; }
                if next == '\\' {
                    match chars.peek() {
                        Some('"') | Some('\\') => value.push(chars.next().unwrap_or('\\')),
                        _ => value.push(next),
                    }
                } else { value.push(next); }
            }
            tokens.push(value);
        } else if ch == '{' || ch == '}' {
            tokens.push(ch.to_string());
        }
    }
    tokens
}

fn value<'a>(tokens: &'a [String], key: &str) -> Option<&'a str> {
    tokens.windows(2).find(|pair| pair[0].eq_ignore_ascii_case(key)
        && pair[1] != "{" && pair[1] != "}").map(|pair| pair[1].as_str())
}

fn path_key(path: &Path) -> String { super::normalize_key(&path.to_string_lossy()) }

fn child_directory(parent: &Path, relative: &str) -> Option<PathBuf> {
    // Do not let malformed app manifests escape steamapps/common.
    let normalized = relative.replace('\\', "/");
    let child = Path::new(&normalized);
    if child.is_absolute() || normalized.contains(':') || !child.components().all(|part| matches!(part, Component::Normal(_))) {
        return None;
    }
    let path = parent.join(child);
    super::is_real_dir(&path).then_some(path)
}

fn vn_engine_present(path: &Path) -> bool {
    let Ok(entries) = std::fs::read_dir(path) else { return false; };
    entries.flatten().take(4096).any(|entry| {
        let name = entry.file_name().to_string_lossy().to_lowercase();
        name == "renpy" || ["bgi.exe", "advhd.exe", "siglusengine.exe", "reallive.exe", "onscripter.exe"].contains(&name.as_str())
            || [".xp3", ".rpa", ".nsa"].iter().any(|ext| name.ends_with(ext))
    })
}

fn recognized_exe(path: &Path) -> Option<String> {
    let files: Vec<_> = std::fs::read_dir(path).ok()?.flatten().take(4096)
        .filter_map(|entry| {
            let kind = entry.file_type().ok()?;
            (kind.is_file() && !kind.is_symlink()).then(|| (entry.path(), entry.metadata().map(|m| m.len()).unwrap_or(0)))
        }).collect();
    super::recognize(path, &files, &HashSet::new()).and_then(|candidate| candidate.suggested_exe)
}

fn steam_libraries(root: &Path) -> Vec<PathBuf> {
    let mut paths = vec![root.to_owned()];
    if let Ok(text) = std::fs::read_to_string(root.join("steamapps/libraryfolders.vdf")) {
        let tokens = vdf_tokens(&text);
        for pair in tokens.windows(2) {
            let modern = pair[0].eq_ignore_ascii_case("path");
            let legacy = pair[0].parse::<u32>().is_ok() && pair[1].contains(['\\', '/']);
            if modern || legacy {
                let path = PathBuf::from(&pair[1]);
                if path.is_absolute() && super::is_real_dir(&path.join("steamapps")) { paths.push(path); }
            }
        }
    }
    let mut seen = HashSet::new();
    paths.retain(|path| seen.insert(path_key(path)));
    paths
}

fn steam_manifest(manifest: &Path, library: &Path) -> Option<DiscoveredGame> {
    if std::fs::metadata(manifest).ok()?.len() > 1_000_000 { return None; }
    let text = std::fs::read_to_string(manifest).ok()?;
    let tokens = vdf_tokens(&text);
    let id = value(&tokens, "appid")?.parse::<u32>().ok().filter(|id| *id > 0)?;
    if manifest.file_name()?.to_string_lossy() != format!("appmanifest_{id}.acf") { return None; }
    let state = value(&tokens, "StateFlags").and_then(|s| s.parse::<u32>().ok()).unwrap_or(0);
    if state & 4 == 0 { return None; }
    let path = child_directory(&library.join("steamapps/common"), value(&tokens, "installdir")?)?;
    let title = value(&tokens, "name")?.trim();
    if title.is_empty() { return None; }
    Some(DiscoveredGame {
        title: title.to_string(), exe_path: recognized_exe(&path),
        recognized: vn_engine_present(&path), install_path: path.to_string_lossy().into_owned(),
        source: "steam".into(), steam_app_id: Some(id.to_string()),
    })
}

fn discover(
    local_roots: &[PathBuf], steam_roots: &[PathBuf], existing: &HashSet<String>,
    cancel: &AtomicBool, mut progress: impl FnMut(&str),
) -> DiscoveryReport {
    let mut report = DiscoveryReport::default();
    let mut seen = existing.clone();
    let mut scanned = HashSet::new();
    // Steam first so duplicates keep the app ID and can launch through the client.
    for root in steam_roots {
        for library in steam_libraries(root) {
            if cancel.load(Ordering::Relaxed) { report.cancelled = true; return report; }
            if !scanned.insert(path_key(&library)) { continue; }
            let display = library.to_string_lossy().into_owned();
            progress(&display); report.roots_scanned.push(display);
            let Ok(entries) = std::fs::read_dir(library.join("steamapps")) else { continue; };
            for entry in entries.flatten() {
                if cancel.load(Ordering::Relaxed) { report.cancelled = true; return report; }
                if let Some(game) = steam_manifest(&entry.path(), &library) {
                    if seen.insert(super::normalize_key(&game.install_path)) { report.games.push(game); }
                }
                if report.games.len() >= MAX_GAMES {
                    report.warnings.push("发现的游戏较多，本次最多显示 1000 部；其余可指定目录继续扫描。".into());
                    return report;
                }
            }
        }
    }
    let mut visited = 0;
    for root in local_roots {
        if !super::is_real_dir(root) { continue; }
        let display = root.to_string_lossy().into_owned();
        progress(&display); report.roots_scanned.push(display);
        let mut stack = vec![(root.to_owned(), 0)];
        while let Some((path, depth)) = stack.pop() {
            if cancel.load(Ordering::Relaxed) { report.cancelled = true; return report; }
            if !scanned.insert(path_key(&path)) { continue; }
            visited += 1;
            if visited > MAX_DIRS || report.games.len() >= MAX_GAMES {
                report.warnings.push("已达到本次扫描上限，可选择具体游戏目录继续扫描。".into());
                return report;
            }
            let Ok(entries) = std::fs::read_dir(&path) else { continue; };
            let mut files = Vec::new();
            let mut children = Vec::new();
            for entry in entries.flatten().take(4096) {
                let Ok(kind) = entry.file_type() else { continue; };
                if kind.is_symlink() { continue; }
                if kind.is_dir() {
                    if depth < 6 && !super::is_skipped_dir(&entry.path()) && super::is_real_dir(&entry.path()) {
                        children.push((entry.path(), depth + 1));
                    }
                } else if kind.is_file() {
                    files.push((entry.path(), entry.metadata().map(|m| m.len()).unwrap_or(0)));
                }
            }
            if let Some(candidate) = super::recognize(&path, &files, existing) {
                if seen.insert(path_key(&path)) {
                    report.games.push(DiscoveredGame {
                        title: candidate.suggested_title, install_path: candidate.folder_path,
                        exe_path: candidate.suggested_exe, recognized: vn_engine_present(&path),
                        source: "local".into(), steam_app_id: None,
                    });
                }
            }
            stack.extend(children);
        }
    }
    report.cancelled = cancel.load(Ordering::Relaxed);
    report
}

#[cfg(windows)]
fn registry_steam_path() -> Option<PathBuf> {
    use windows_sys::Win32::System::Registry::{RegGetValueW, HKEY_CURRENT_USER, RRF_RT_REG_SZ};
    let wide = |s: &str| s.encode_utf16().chain(std::iter::once(0)).collect::<Vec<_>>();
    let key = wide("Software\\Valve\\Steam");
    let name = wide("SteamPath");
    let mut bytes = 0u32;
    let result = unsafe { RegGetValueW(HKEY_CURRENT_USER, key.as_ptr(), name.as_ptr(), RRF_RT_REG_SZ, std::ptr::null_mut(), std::ptr::null_mut(), &mut bytes) };
    if result != 0 || bytes == 0 || bytes > 65_536 { return None; }
    let mut buffer = vec![0u16; (bytes as usize).div_ceil(2)];
    let result = unsafe { RegGetValueW(HKEY_CURRENT_USER, key.as_ptr(), name.as_ptr(), RRF_RT_REG_SZ, std::ptr::null_mut(), buffer.as_mut_ptr().cast(), &mut bytes) };
    if result != 0 { return None; }
    let len = buffer.iter().position(|v| *v == 0).unwrap_or(buffer.len());
    Some(PathBuf::from(String::from_utf16_lossy(&buffer[..len])))
}

fn default_roots() -> (Vec<PathBuf>, Vec<PathBuf>) {
    let mut local = Vec::new();
    let mut steam = Vec::new();
    #[cfg(windows)]
    {
        if let Some(path) = registry_steam_path() { steam.push(path); }
        for drive in b'C'..=b'Z' {
            let root = PathBuf::from(format!("{}:\\", drive as char));
            if !root.is_dir() { continue; }
            for name in ["Games", "Game", "Galgame", "Galgames", "VisualNovels", "游戏", "单机游戏"] {
                let path = root.join(name);
                if super::is_real_dir(&path) { local.push(path); }
            }
            for name in ["Steam", "SteamLibrary", "Games/Steam", "Program Files (x86)/Steam", "Program Files/Steam"] {
                let path = root.join(name);
                if super::is_real_dir(&path.join("steamapps")) { steam.push(path); }
            }
        }
    }
    // The application currently targets Windows. Other platforms can still
    // scan explicitly selected folders without pretending to discover drives.
    (local, steam)
}

#[tauri::command]
pub async fn discover_installed_games(app: AppHandle) -> CmdResult<DiscoveryReport> {
    if RUNNING.swap(true, Ordering::SeqCst) { return Err(CmdError("已有扫描正在进行。".into())); }
    CANCELLED.store(false, Ordering::SeqCst);
    let existing = match crate::commands::games::pool(&app).await {
        Ok(pool) => sqlx::query_scalar::<_, String>("SELECT install_path FROM games")
            .fetch_all(&pool).await.unwrap_or_default().iter().map(|s| super::normalize_key(s)).collect(),
        Err(_) => HashSet::new(),
    };
    let result = tauri::async_runtime::spawn_blocking(move || {
        struct Finish;
        impl Drop for Finish { fn drop(&mut self) { RUNNING.store(false, Ordering::SeqCst); } }
        let _finish = Finish;
        let (local, steam) = default_roots();
        discover(&local, &steam, &existing, &CANCELLED, |path| { let _ = app.emit("game-discovery-progress", path); })
    }).await;
    RUNNING.store(false, Ordering::SeqCst);
    result.map_err(|error| CmdError(format!("自动扫描未完成：{error}")))
}

#[tauri::command]
pub fn cancel_game_discovery() { CANCELLED.store(true, Ordering::SeqCst); }

#[tauri::command]
pub fn launch_steam_game(app: AppHandle, app_id: String) -> CmdResult<()> {
    let id = app_id.parse::<u32>().ok().filter(|id| *id > 0).ok_or_else(|| CmdError("Steam 游戏编号无效。".into()))?;
    app.opener().open_url(format!("steam://rungameid/{id}"), None::<&str>)
        .map_err(|error| CmdError(format!("无法通过 Steam 启动游戏：{error}")))
}

#[cfg(test)]
mod tests {
    use super::*;

    struct Fixture(PathBuf);
    impl Fixture {
        fn new() -> Self {
            let nonce = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos();
            let path = std::env::temp_dir().join(format!("opengal-discovery-{}-{nonce}", std::process::id()));
            std::fs::create_dir_all(&path).unwrap(); Self(path)
        }
        fn file(&self, path: &str, text: &str) -> PathBuf {
            let path = self.0.join(path);
            std::fs::create_dir_all(path.parent().unwrap()).unwrap();
            std::fs::write(&path, text).unwrap(); path
        }
    }
    impl Drop for Fixture { fn drop(&mut self) { let _ = std::fs::remove_dir_all(&self.0); } }

    #[test]
    fn keyvalues_preserve_escaped_paths_and_names() {
        let tokens = vdf_tokens(r#""libraryfolders" { "0" { "path" "D:\\Steam Library" } } // comment"#);
        assert_eq!(value(&tokens, "path"), Some("D:\\Steam Library"));
        assert_eq!(vdf_tokens(r#""name" "A \"Story\"""#)[1], "A \"Story\"");
    }
    #[test]
    fn manifests_need_installed_state_and_cannot_escape_common() {
        let f = Fixture::new();
        f.file("steamapps/common/Novel/Game.exe", "");
        f.file("steamapps/common/Novel/data.xp3", "");
        let manifest = f.file("steamapps/appmanifest_123.acf", r#""AppState" { "appid" "123" "name" "My Novel" "installdir" "Novel" "StateFlags" "4" }"#);
        let game = steam_manifest(&manifest, &f.0).unwrap();
        assert_eq!(game.title, "My Novel"); assert_eq!(game.steam_app_id.as_deref(), Some("123")); assert!(game.recognized);
        assert!(child_directory(&f.0, "../outside").is_none());
        assert!(child_directory(&f.0, "C:\\outside").is_none());
        std::fs::write(&manifest, r#""appid" "123" "name" "Pending" "installdir" "Novel" "StateFlags" "1""#).unwrap();
        assert!(steam_manifest(&manifest, &f.0).is_none());
    }
    #[test]
    fn steam_and_folder_scan_deduplicate_without_claiming_all_games_are_novels() {
        let f = Fixture::new();
        f.file("steamapps/common/OrdinaryGame/Game.exe", "");
        f.file("steamapps/appmanifest_321.acf", r#""appid" "321" "name" "Ordinary Game" "installdir" "OrdinaryGame" "StateFlags" "4""#);
        let report = discover(&[f.0.join("steamapps/common")], &[f.0.clone()], &HashSet::new(), &AtomicBool::new(false), |_| {});
        assert_eq!(report.games.len(), 1); assert!(!report.games[0].recognized); assert_eq!(report.games[0].source, "steam");
    }
    #[test]
    fn local_scan_skips_installers_and_cancellation_returns_promptly() {
        let f = Fixture::new();
        f.file("Novel/Game.exe", ""); f.file("Novel/data.xp3", "");
        f.file("Installer/setup.exe", "");
        f.file("node_modules/Other/Game.exe", "");
        let report = discover(&[f.0.clone()], &[], &HashSet::new(), &AtomicBool::new(false), |_| {});
        assert_eq!(report.games.len(), 1); assert!(report.games[0].recognized);
        let stopped = discover(&[f.0.clone()], &[], &HashSet::new(), &AtomicBool::new(true), |_| {});
        assert!(stopped.cancelled); assert!(stopped.games.is_empty());
    }
}
