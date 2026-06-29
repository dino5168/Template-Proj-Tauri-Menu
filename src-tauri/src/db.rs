//! SQLite（rusqlite）資料存取。
//!
//! DB 檔路徑由前端組好（`<dataRoot>/LearnEnglish.db`）傳入，後端不自行決定位置，
//! 維持與其他 command「路徑由前端決定」的一致原則。DB 小、查詢低頻，故每個
//! command 開新 `Connection` 即可，不引入連線池 / 共用 state（YAGNI）。

use rusqlite::Connection;
use serde::Serialize;

use crate::video::VideoInfo;

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

/// `videos` 表 schema（供 db_init 與 videos_upsert 共用，皆 IF NOT EXISTS、冪等）。
const VIDEOS_SCHEMA: &str = "CREATE TABLE IF NOT EXISTS videos (
    id             TEXT PRIMARY KEY,
    url            TEXT NOT NULL,
    title          TEXT,
    channel        TEXT,
    duration       INTEGER,
    upload_date    TEXT,
    folder_path    TEXT NOT NULL,
    subtitle_path  TEXT,
    thumbnail_path TEXT,
    audio_path     TEXT,
    created_at     TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at     TEXT
);";

/// 開啟（不存在則建立）DB，並確保 demo `test` 表與 `videos` 表存在。
///
/// `test` 表為空時塞幾筆種子（供「資料」tab demo）；非空則不動，故可重複呼叫。
#[tauri::command]
pub fn db_init(db_path: String) -> Result<(), String> {
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS test (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );",
    )
    .map_err(|e| e.to_string())?;
    conn.execute_batch(VIDEOS_SCHEMA).map_err(|e| e.to_string())?;

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
pub fn db_list_tables(db_path: String) -> Result<Vec<String>, String> {
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
pub(crate) struct ColumnInfo {
    name: String,
    type_name: String,
    not_null: bool,
    pk: bool,
    default_value: Option<String>,
}

/// 取得指定表的欄位結構（`PRAGMA table_info`）。
#[tauri::command]
pub fn db_table_schema(db_path: String, table: String) -> Result<Vec<ColumnInfo>, String> {
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
pub(crate) struct TableRows {
    columns: Vec<String>,
    rows: Vec<Vec<Option<String>>>,
}

/// 取得指定表的資料列（`SELECT * LIMIT ?`）。
#[tauri::command]
pub fn db_table_rows(db_path: String, table: String, limit: u32) -> Result<TableRows, String> {
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

/// 寫入/更新一筆影片記錄到 `videos` 表（不存在則建表）。
///
/// 以 `id` upsert；`audio_path` 用 `COALESCE` 保護，避免後續 prepare_video（audio 為
/// None）清掉已下載的音訊路徑。值以具名參數綁定（資料、非識別字）。
#[tauri::command]
pub fn videos_upsert(db_path: String, video: VideoInfo) -> Result<(), String> {
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
    conn.execute_batch(VIDEOS_SCHEMA).map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO videos (id, url, title, channel, duration, upload_date,
            folder_path, subtitle_path, thumbnail_path, audio_path, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, CURRENT_TIMESTAMP)
         ON CONFLICT(id) DO UPDATE SET
            url=excluded.url, title=excluded.title, channel=excluded.channel,
            duration=excluded.duration, upload_date=excluded.upload_date,
            folder_path=excluded.folder_path, subtitle_path=excluded.subtitle_path,
            thumbnail_path=excluded.thumbnail_path,
            audio_path=COALESCE(excluded.audio_path, videos.audio_path),
            updated_at=CURRENT_TIMESTAMP",
        rusqlite::params![
            video.id,
            video.url,
            video.title,
            video.channel,
            video.duration,
            video.upload_date,
            video.folder_path,
            video.subtitle_path,
            video.thumbnail_path,
            video.audio_path,
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}
