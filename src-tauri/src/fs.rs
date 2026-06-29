//! 檔案系統存取：目錄樹與文字檔讀寫。
//!
//! 供 Markdown/HTML 瀏覽器（目錄樹）與編輯器（讀/存檔）使用。路徑由前端
//! （dialog 或預設根目錄）提供，故不在此另做白名單。

use std::path::Path;

use serde::Serialize;

/// FileTree 節點。`children` 僅資料夾有值，檔案為 `None`。
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct FileNode {
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
pub fn list_dir(root: String, exts: Vec<String>) -> Result<FileNode, String> {
    let path = Path::new(&root);
    if !path.is_dir() {
        return Err(format!("不是有效的資料夾：{root}"));
    }
    build_tree(path, &exts).map_err(|e| e.to_string())
}

/// 讀取單一 markdown 檔內容（UTF-8）。
#[tauri::command]
pub fn read_markdown(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}

/// 將 UTF-8 內容寫入指定路徑（覆蓋既有檔）。
///
/// 路徑由前端 save dialog 產生（使用者明示選定），故不在此額外做目錄白名單；
/// 寫檔失敗（權限、唯讀等）以 `Err` 字串回傳前端。
#[tauri::command]
pub fn write_file(path: String, contents: String) -> Result<(), String> {
    std::fs::write(&path, contents).map_err(|e| e.to_string())
}

/// 讀任意 UTF-8 文字檔（字幕 srt 等用）。
#[tauri::command]
pub fn read_text_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}
