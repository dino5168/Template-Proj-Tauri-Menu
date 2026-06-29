//! 路徑與 app 目錄解析。
//!
//! 集中處理 Windows `canonicalize` 的 `\\?\` 前綴清理，以及預設根目錄
//! （docs/htmls 等內容根、data root）的探測。供前端在使用者未自訂時取用。

use std::path::{Path, PathBuf};

/// 去掉 Windows `canonicalize` 的 `\\?\` 延伸長度前綴；canonicalize 失敗則回原路徑字串。
pub(crate) fn clean_path(path: &Path) -> String {
    let s = std::fs::canonicalize(path)
        .map(|c| c.to_string_lossy().into_owned())
        .unwrap_or_else(|_| path.to_string_lossy().into_owned());
    s.strip_prefix(r"\\?\").map(str::to_owned).unwrap_or(s)
}

/// 嘗試找出名為 `name` 的預設根目錄；找不到回傳空字串（前端再請使用者選）。
///
/// 依序檢查：cwd/{name}、cwd/../{name}（涵蓋 `tauri dev` cwd=src-tauri）、
/// 執行檔同層 /{name}。
#[tauri::command]
pub fn default_dir(name: String) -> String {
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

/// 解析並建立預設應用資料根目錄，回傳絕對路徑。
///
/// debug：專案根 `/data`（`CARGO_MANIFEST_DIR` 為 `src-tauri`，取其父）。
/// release：執行檔同層 `/data`。供前端 data-root-store 在使用者未自訂時取用。
#[tauri::command]
pub fn default_data_root() -> Result<String, String> {
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
