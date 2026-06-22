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

/// 嘗試找出預設 docs 根目錄；找不到回傳空字串（前端再請使用者選）。
///
/// 依序檢查：cwd/docs、cwd/../docs（涵蓋 `tauri dev` cwd=src-tauri）、
/// 執行檔同層 /docs。
#[tauri::command]
fn default_docs_dir() -> String {
    let mut candidates: Vec<PathBuf> = Vec::new();
    if let Ok(cwd) = std::env::current_dir() {
        candidates.push(cwd.join("docs"));
        candidates.push(cwd.join("..").join("docs"));
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            candidates.push(dir.join("docs"));
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            list_dir,
            read_markdown,
            default_docs_dir
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
