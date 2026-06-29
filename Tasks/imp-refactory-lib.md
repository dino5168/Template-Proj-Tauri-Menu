# 重構計畫：拆分 src-tauri/src/lib.rs（612 行 → 模組化）

> **純結構重構，零行為變更**：command 名稱全部不變 → 前端 `tauri.ts`、capabilities、tauri.conf 皆**不動**。
> 目標是讓 `lib.rs` 從「所有功能擠一檔」變成「入口 + 領域模組」，降低導航成本、開出單元測試接縫。

## 現況盤點（lib.rs 的 5 個領域）

| 領域 | 內容 | 行數約 |
|---|---|---|
| demo | `greet` | 5 |
| 檔案系統 | `FileNode` / `has_ext` / `build_tree` / `list_dir` / `read_markdown` / `write_file` / `read_text_file` | ~110 |
| 路徑/app 目錄 | `clean_path` / `default_dir` / `default_data_root` | ~70 |
| 影片（yt-dlp） | `find_srt` / `find_thumbnail` / `VideoInfo` / `prepare_video` / `download_audio` | ~215 |
| SQLite | `is_valid_ident` / `value_to_string` / `VIDEOS_SCHEMA` / `ColumnInfo` / `TableRows` / `db_init` / `db_list_tables` / `db_table_schema` / `db_table_rows` / `videos_upsert` | ~190 |
| 入口 | `run()` + `generate_handler!` | ~25 |

**跨領域共用**（拆分時的關鍵約束）：
- `clean_path` → 被 路徑模組自身 + 影片模組（`prepare_video`/`download_audio`）使用 → 放 `paths`，標 `pub(crate)`。
- `VideoInfo` → `prepare_video` 回傳 + `videos_upsert` 收參 → 放 `video`，`db` 以 `crate::video::VideoInfo` 引入（僅型別耦合，可接受）。

---

## 目標模組結構（flat，4 模組 + 入口）

```
src-tauri/src/
├── main.rs     # 不變（呼叫 run()）
├── lib.rs      # 入口：mod 宣告 + greet + run()/generate_handler!（只剩 ~40 行）
├── fs.rs       # 檔案系統：FileNode/has_ext/build_tree/list_dir/read_markdown/write_file/read_text_file
├── paths.rs    # 路徑/app 目錄：clean_path/default_dir/default_data_root
├── video.rs    # 影片：find_srt/find_thumbnail/VideoInfo/prepare_video/download_audio
└── db.rs       # SQLite：is_valid_ident/value_to_string/VIDEOS_SCHEMA/ColumnInfo/TableRows/db_*/videos_upsert
```

> 不切 `commands/` 子目錄、不做「每 command 一檔」——以**領域**為界即為正確 altitude（YAGNI，避免過度切分）。`greet` 是 template demo，量小且無歸屬，留在 `lib.rs`。

---

## 可見性規則（拆模組最常踩的雷）

- **`#[tauri::command]` 函式一律 `pub`**：`generate_handler!` 在 `lib.rs` 以 `fs::list_dir`、`db::db_init` 等路徑引用，函式與其生成的 `__cmd__*` 巨集需對 crate 可見。（`pub(crate)` 多數情況也行，但 `pub` 最省事、不踩邊界。）
- **跨模組共用 helper**：`clean_path` 標 `pub(crate)`；`VideoInfo` 標 `pub(crate)`（欄位亦 `pub(crate)` 供 `db` 讀取）。
- **模組內部 helper**：`has_ext` / `build_tree` / `find_srt` / `find_thumbnail` / `is_valid_ident` / `value_to_string` / `VIDEOS_SCHEMA` 維持私有（不加 `pub`）。
- 每個模組檔頭加 `//!` 模組級文件；把現有 `// SQLite…連線哲學` 區塊註解移到 `db.rs` 的 `//!`。
- 各模組各自宣告需要的 `use`（`std::path::{Path, PathBuf}`、`rusqlite::Connection`、`serde::{Deserialize, Serialize}`、`serde::Serialize` 等），不靠 lib.rs re-export。

---

## 執行步驟

### Step 1 — 建 `paths.rs`（先搬被依賴者，後搬依賴者）
搬入 `clean_path`(`pub(crate)`)、`default_dir`、`default_data_root`。`default_dir`/`default_data_root` 為 `pub` command。

### Step 2 — 建 `fs.rs`
搬入 `FileNode`、`has_ext`、`build_tree`、`list_dir`、`read_markdown`、`write_file`、`read_text_file`。commands 為 `pub`。

### Step 3 — 建 `video.rs`
搬入 `find_srt`、`find_thumbnail`、`VideoInfo`(`pub(crate)`)、`prepare_video`、`download_audio`。
- 內部對 `clean_path` 的呼叫改 `crate::paths::clean_path`。
- commands 為 `pub`。

### Step 4 — 建 `db.rs`
搬入 `is_valid_ident`、`value_to_string`、`VIDEOS_SCHEMA`、`ColumnInfo`、`TableRows`、`db_init`、`db_list_tables`、`db_table_schema`、`db_table_rows`、`videos_upsert`。
- `videos_upsert` 簽名改用 `crate::video::VideoInfo`。
- commands 為 `pub`。

### Step 5 — 收斂 `lib.rs`
```rust
mod db;
mod fs;
mod paths;
mod video;

/// template demo command（HomeView 的 greet 示範）。
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            fs::list_dir,
            fs::read_markdown,
            fs::write_file,
            fs::read_text_file,
            paths::default_dir,
            paths::default_data_root,
            video::prepare_video,
            video::download_audio,
            db::db_init,
            db::db_list_tables,
            db::db_table_schema,
            db::db_table_rows,
            db::videos_upsert,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```
> command **名稱不變**（invoke 字串＝函式名），故前端零改動。

### Step 6 — 更新文件
`src-tauri/CLAUDE.md` 的「真正的入口」段目前寫「定義所有 `#[tauri::command]` 與 Builder」——改為：`lib.rs` 僅留 `run()`/`generate_handler!` 與 `greet`，各 command 按領域分於 `fs.rs`/`paths.rs`/`video.rs`/`db.rs`；新增 command 時放對應領域模組（`pub fn`）並在 `lib.rs` 的 `generate_handler!` 以 `模組::名稱` 註冊。

---

## 驗證

```powershell
cargo check --manifest-path src-tauri/Cargo.toml   # 主驗：模組路徑 + 可見性 + generate_handler!
cargo build --manifest-path src-tauri/Cargo.toml   # 確認連結無誤
pnpm tauri dev                                     # 煙霧測試：各 command 仍 invoke 得到（檔案樹/DB/影片）
```
驗收：
- [ ] `cargo check` 無錯（重點看 `pub` 可見性、`crate::paths::clean_path`、`crate::video::VideoInfo` 路徑）。
- [ ] 前端未改動下，Markdown/HTML 瀏覽、編輯器存檔、資料庫表格、YouTube 下載全部照常。
- [ ] `lib.rs` 縮到 ~40 行。

> 因屬純搬移，行為不變；不需改 `tauri.ts`、`capabilities/default.json`、`tauri.conf.json`。

---

## 影響檔案

| 檔 | 動作 |
|---|---|
| `src-tauri/src/lib.rs` | 縮為入口（mod + greet + run）|
| `src-tauri/src/paths.rs` | 新增（路徑/app 目錄）|
| `src-tauri/src/fs.rs` | 新增（檔案系統）|
| `src-tauri/src/video.rs` | 新增（yt-dlp 影片）|
| `src-tauri/src/db.rs` | 新增（SQLite）|
| `src-tauri/CLAUDE.md` | 更新「入口/新增 command」說明 |

## 範疇外（本輪不做，YAGNI）

- 不引入 DB 連線池 / 共用 state（維持每 command 開新 Connection 的現有哲學）。
- 不改任何 command 行為、簽名、回傳型別、名稱。
- 不新增單元測試（重構只開接縫；待之後有純邏輯需求再為 `paths`/`db` 等補 `#[cfg(test)]`）。
- 不拆 `commands/` 子目錄或每-command 一檔（過度切分）。
- `greet` 暫留（template demo）；要清掉是另一個決定，不混入本次重構。
