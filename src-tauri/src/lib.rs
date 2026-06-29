//! Tauri 後端入口：模組宣告 + Builder。
//!
//! 各 command 按領域分於 `fs` / `paths` / `video` / `db`；本檔只保留 template demo
//! 的 `greet` 與 `run()`（`generate_handler!` 以 `模組::名稱` 註冊）。新增 command 時
//! 放對應領域模組（`pub fn`）並在下方 handler 補一筆。

mod db;
mod fs;
mod paths;
mod video;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
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
            db::videos_upsert
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
