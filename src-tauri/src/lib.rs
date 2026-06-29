use std::path::{Path, PathBuf};

use serde::Serialize;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

/// FileTree 節點。`children` 僅資料夾有值，檔案為 `None`。
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct FileNode {
    name: String,
    path: String,
    is_dir: bool,
    children: Option<Vec<FileNode>>,
}

/// 副檔名是否在允許清單內（不分大小寫）。
fn has_ext(path: &Path, exts: &[String]) -> bool {
    match path.extension().and_then(|e| e.to_str()) {
        Some(ext) => {
            let ext = ext.to_lowercase();
            exts.iter().any(|e| e == &ext)
        }
        None => false,
    }
}

/// 遞迴建立目錄樹：只保留「資料夾」與符合 `exts` 的檔案，資料夾優先、依名稱排序。
fn build_tree(path: &Path, exts: &[String]) -> std::io::Result<FileNode> {
    let is_dir = path.is_dir();
    let name = path
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| path.to_string_lossy().into_owned());

    let children = if is_dir {
        let mut nodes: Vec<FileNode> = Vec::new();
        for entry in std::fs::read_dir(path)? {
            let child = entry?.path();
            if child.is_dir() || has_ext(&child, exts) {
                nodes.push(build_tree(&child, exts)?);
            }
        }
        // 資料夾優先，再依名稱（不分大小寫）排序
        nodes.sort_by(|a, b| {
            b.is_dir
                .cmp(&a.is_dir)
                .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
        });
        Some(nodes)
    } else {
        None
    };

    Ok(FileNode {
        name,
        path: path.to_string_lossy().into_owned(),
        is_dir,
        children,
    })
}

/// 讀取目錄樹（根目錄可為任意絕對路徑）；只含資料夾與符合 `exts` 的檔案。
#[tauri::command]
fn list_dir(root: String, exts: Vec<String>) -> Result<FileNode, String> {
    let path = Path::new(&root);
    if !path.is_dir() {
        return Err(format!("不是有效的資料夾：{root}"));
    }
    build_tree(path, &exts).map_err(|e| e.to_string())
}

/// 讀取單一 markdown 檔內容（UTF-8）。
#[tauri::command]
fn read_markdown(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}

/// 將 UTF-8 內容寫入指定路徑（覆蓋既有檔）。
///
/// 路徑由前端 save dialog 產生（使用者明示選定），故不在此額外做目錄白名單；
/// 寫檔失敗（權限、唯讀等）以 `Err` 字串回傳前端。
#[tauri::command]
fn write_file(path: String, contents: String) -> Result<(), String> {
    std::fs::write(&path, contents).map_err(|e| e.to_string())
}

/// 嘗試找出名為 `name` 的預設根目錄；找不到回傳空字串（前端再請使用者選）。
///
/// 依序檢查：cwd/{name}、cwd/../{name}（涵蓋 `tauri dev` cwd=src-tauri）、
/// 執行檔同層 /{name}。
#[tauri::command]
fn default_dir(name: String) -> String {
    let mut candidates: Vec<PathBuf> = Vec::new();
    if let Ok(cwd) = std::env::current_dir() {
        candidates.push(cwd.join(&name));
        candidates.push(cwd.join("..").join(&name));
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            candidates.push(dir.join(&name));
        }
    }
    candidates
        .into_iter()
        .find(|p| p.is_dir())
        .and_then(|p| std::fs::canonicalize(&p).ok())
        .map(|p| {
            // 去掉 Windows canonicalize 的 \\?\ 延伸長度前綴
            let s = p.to_string_lossy().into_owned();
            s.strip_prefix(r"\\?\").map(str::to_owned).unwrap_or(s)
        })
        .unwrap_or_default()
}

/// 去掉 Windows `canonicalize` 的 `\\?\` 延伸長度前綴；canonicalize 失敗則回原路徑字串。
fn clean_path(path: &Path) -> String {
    let s = std::fs::canonicalize(path)
        .map(|c| c.to_string_lossy().into_owned())
        .unwrap_or_else(|_| path.to_string_lossy().into_owned());
    s.strip_prefix(r"\\?\").map(str::to_owned).unwrap_or(s)
}

/// 在 `dir` 內尋找該影片的字幕 srt。
///
/// yt-dlp 可能同時輸出多條英文軌（`<id>.en.srt`、`<id>.en-orig.srt`…），故先取
/// 精確的 `<id>.<lang>.srt`（通常較乾淨），找不到再退而求任一 `<id>*.srt`。
fn find_srt(dir: &Path, video_id: &str, lang: &str) -> Option<PathBuf> {
    let exact = dir.join(format!("{video_id}.{lang}.srt"));
    if exact.is_file() {
        return Some(exact);
    }
    std::fs::read_dir(dir)
        .ok()?
        .flatten()
        .map(|e| e.path())
        .find(|p| {
            p.extension().and_then(|e| e.to_str()) == Some("srt")
                && p.file_name()
                    .and_then(|n| n.to_str())
                    .is_some_and(|n| n.starts_with(video_id))
        })
}

/// 解析並建立預設應用資料根目錄，回傳絕對路徑。
///
/// debug：專案根 `/data`（`CARGO_MANIFEST_DIR` 為 `src-tauri`，取其父）。
/// release：執行檔同層 `/data`。供前端 data-root-store 在使用者未自訂時取用。
#[tauri::command]
fn default_data_root() -> Result<String, String> {
    let base: PathBuf = if cfg!(debug_assertions) {
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .map(Path::to_path_buf)
            .unwrap_or_else(|| PathBuf::from("."))
    } else {
        std::env::current_exe()
            .ok()
            .and_then(|exe| exe.parent().map(Path::to_path_buf))
            .unwrap_or_else(|| PathBuf::from("."))
    };
    let root = base.join("data");
    std::fs::create_dir_all(&root).map_err(|e| e.to_string())?;
    Ok(clean_path(&root))
}

/// 讀任意 UTF-8 文字檔（字幕 srt 等用）。
#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}

/// 確保指定影片的英文字幕存在於 `<data_root>/subtitles/`，回傳 srt 絕對路徑。
///
/// 流程：建立 subtitles 目錄 → 命中快取（`<video_id>*.srt`）即回、不下載 →
/// 否則 yt-dlp 下載（手動優先、無則自動，轉 srt）→ 重掃 → 仍無則 `Err`。
///
/// yt-dlp 為外部 CLI、含網路 IO，故以 `spawn_blocking` 包裝避免阻塞 async runtime。
#[tauri::command]
async fn download_subtitle(
    url: String,
    video_id: String,
    data_root: String,
    lang: String,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let subtitles_dir = Path::new(&data_root).join("subtitles");
        std::fs::create_dir_all(&subtitles_dir).map_err(|e| e.to_string())?;

        // 快取：已下載過就直接回，不再呼叫 yt-dlp。
        if let Some(p) = find_srt(&subtitles_dir, &video_id, &lang) {
            return Ok(clean_path(&p));
        }

        // 有界的英文優先清單：涵蓋手動 `en` 與自動原文 `en-orig` 等常見軌，
        // 但**不**用 `en.*`（會匹配上百條自動翻譯軌→YouTube 回 HTTP 429 限流）。
        let sub_langs = format!("{lang}-orig,{lang},{lang}-US,{lang}-GB");
        let out_tmpl = subtitles_dir.join("%(id)s.%(ext)s");

        let output = std::process::Command::new("yt-dlp")
            .arg("--skip-download")
            .arg("--write-subs")
            .arg("--write-auto-subs")
            .arg("--sub-langs")
            .arg(&sub_langs)
            .arg("--convert-subs")
            .arg("srt")
            .arg("-o")
            .arg(&out_tmpl)
            .arg(&url)
            .output()
            .map_err(|e| match e.kind() {
                std::io::ErrorKind::NotFound => {
                    "找不到 yt-dlp，請確認已安裝並加入 PATH".to_string()
                }
                _ => e.to_string(),
            })?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("yt-dlp 失敗：{}", stderr.trim()));
        }

        match find_srt(&subtitles_dir, &video_id, &lang) {
            Some(p) => Ok(clean_path(&p)),
            None => Err("此影片無可用英文字幕".to_string()),
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            list_dir,
            read_markdown,
            write_file,
            default_dir,
            default_data_root,
            read_text_file,
            download_subtitle
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
