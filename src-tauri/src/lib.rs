use std::path::{Path, PathBuf};

use rusqlite::Connection;
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

// ───────────────────────────── SQLite（rusqlite）─────────────────────────────
//
// DB 檔路徑由前端組好（<dataRoot>/LearnEnglish.db）傳入，後端不自行決定位置，
// 維持與既有 command「路徑由前端決定」的一致原則。DB 小、查詢低頻，故每個
// command 開新 Connection 即可，不引入連線池 / 共用 state（YAGNI）。

/// 只允許英數與底線的識別字。PRAGMA 與 table 名無法以參數綁定，
/// 用白名單擋掉非法字元以防 SQL 注入。
fn is_valid_ident(s: &str) -> bool {
    !s.is_empty() && s.chars().all(|c| c.is_ascii_alphanumeric() || c == '_')
}

/// 將任意 SQLite 值轉成顯示用字串；NULL 回 `None`。
fn value_to_string(v: rusqlite::types::Value) -> Option<String> {
    use rusqlite::types::Value::*;
    match v {
        Null => None,
        Integer(i) => Some(i.to_string()),
        Real(f) => Some(f.to_string()),
        Text(s) => Some(s),
        Blob(b) => Some(format!("<blob {} bytes>", b.len())),
    }
}

/// 開啟（不存在則建立）DB，並確保 demo 用的 `test` 表存在。
///
/// 表為空時塞入幾筆種子資料（供「資料」tab demo）；非空則不動，故可重複呼叫。
#[tauri::command]
fn db_init(db_path: String) -> Result<(), String> {
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS test (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );",
    )
    .map_err(|e| e.to_string())?;

    // 僅在空表時種子，避免每次啟動重複塞。
    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM test", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    if count == 0 {
        conn.execute(
            "INSERT INTO test (name) VALUES ('Alice'), ('Bob'), ('Carol'), ('Dave')",
            [],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// 列出 DB 內所有使用者資料表名稱（排除 `sqlite_` 內部表），依名稱排序。
#[tauri::command]
fn db_list_tables(db_path: String) -> Result<Vec<String>, String> {
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT name FROM sqlite_master \
             WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
        )
        .map_err(|e| e.to_string())?;
    let names = stmt
        .query_map([], |r| r.get::<_, String>(0))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(names)
}

/// 單一欄位的結構資訊（對應 `PRAGMA table_info`）。
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ColumnInfo {
    name: String,
    type_name: String,
    not_null: bool,
    pk: bool,
    default_value: Option<String>,
}

/// 取得指定表的欄位結構（`PRAGMA table_info`）。
#[tauri::command]
fn db_table_schema(db_path: String, table: String) -> Result<Vec<ColumnInfo>, String> {
    if !is_valid_ident(&table) {
        return Err(format!("非法表名：{table}"));
    }
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
    // 表名已過白名單，PRAGMA 不支援參數綁定故以 format! 內插。
    let mut stmt = conn
        .prepare(&format!("PRAGMA table_info(\"{table}\")"))
        .map_err(|e| e.to_string())?;
    let cols = stmt
        .query_map([], |r| {
            Ok(ColumnInfo {
                name: r.get(1)?,
                type_name: r.get(2)?,
                not_null: r.get::<_, i64>(3)? != 0,
                default_value: r.get(4)?,
                pk: r.get::<_, i64>(5)? != 0,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(cols)
}

/// 表的資料列（前 `limit` 筆）。欄名 + 字串化儲存格，避免動態型別序列化複雜度。
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct TableRows {
    columns: Vec<String>,
    rows: Vec<Vec<Option<String>>>,
}

/// 取得指定表的資料列（`SELECT * LIMIT ?`）。
#[tauri::command]
fn db_table_rows(db_path: String, table: String, limit: u32) -> Result<TableRows, String> {
    if !is_valid_ident(&table) {
        return Err(format!("非法表名：{table}"));
    }
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(&format!("SELECT * FROM \"{table}\" LIMIT ?1"))
        .map_err(|e| e.to_string())?;
    let columns: Vec<String> = stmt.column_names().iter().map(|s| s.to_string()).collect();
    let col_count = columns.len();
    let rows = stmt
        .query_map([limit], |r| {
            let mut row = Vec::with_capacity(col_count);
            for i in 0..col_count {
                let v: rusqlite::types::Value = r.get(i)?;
                row.push(value_to_string(v));
            }
            Ok(row)
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(TableRows { columns, rows })
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
            download_subtitle,
            db_init,
            db_list_tables,
            db_table_schema,
            db_table_rows
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
