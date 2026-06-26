# src-tauri/ — Rust 後端（Tauri v2）

> 此檔為 `src-tauri/` 子系統說明，補充根 `CLAUDE.md` 的「IPC」與「自訂標題列」段落。在這個目錄下工作時讀這份。

## 真正的入口

- `src/lib.rs` 是真入口：定義所有 `#[tauri::command]` 與 `tauri::Builder`。`src/main.rs` 只呼叫 `run()`。
- **新增 command 的三步驟**（漏任一步前端就 invoke 不到）：
  1. 在 `lib.rs` 寫 `#[tauri::command] fn xxx(...) -> Result<T, String>`。
  2. 加進 `invoke_handler(tauri::generate_handler![... , xxx])`。
  3. 前端在 `src/lib/tauri.ts` 加封裝（**不要**在元件散落 raw `invoke`，見 `src/lib/CLAUDE.md`）。
- 回傳型別慣例：可能失敗的用 `Result<T, String>`（前端 `tauri.ts` 轉成 Result type）；不會失敗的回純值（如 `default_dir` 找不到回空字串）。
- 序列化：struct 加 `#[derive(Serialize)]` + `#[serde(rename_all = "camelCase")]`，前端介面用 camelCase（見 `FileNode`）。

## 權限（capabilities/default.json）— 最常踩的雷

- **任何 `core:window:*` / plugin 操作都要在此明列權限字串，少一個就「靜默失效」**（無錯誤、按鈕沒反應）。
- 自訂標題列目前依賴這些（對應 `components/layout/window-controls.tsx` 的呼叫）：
  `allow-start-dragging / minimize / maximize / unmaximize / toggle-maximize / close / is-maximized / set-fullscreen / is-fullscreen`。
- dialog 選資料夾用 `dialog:allow-open`。
- 改完權限**一定要 `cargo check`** —— 錯的權限字串只在編譯期才爆。

## tauri.conf.json 重點

- `app.windows[0]`：`decorations: false`（無原生標題列）、`maximized: true`（啟動最大化）。改這兩個要同步 `components/layout/`。
- **asset protocol**：`assetProtocol` 設定 + Cargo `protocol-asset` feature + scope `["**"]`。這是讓 `convertFileSrc()` 能載入本機檔（markdown 圖片、HTML iframe、編輯器資源）的關鍵，**屬設定非 capability**，別跑去 capabilities 找。
- plugins：`opener`、`dialog`。

## 驗證

- `cargo check`（在 `src-tauri/` 內）：驗 commands + tauri.conf + capabilities 權限字串，比跑整個 `tauri dev` 快。
- 換 icon 後 `icon.ico` 經 `build.rs` 嵌入 exe，cargo 可能不偵測變更 → `touch build.rs` 再重編。

## 存檔（write_file）

- `write_file(path, contents)`（`std::fs::write`，已註冊）供編輯器「儲存檔案」(`file.save`) 使用；前端封裝在 `src/lib/tauri.ts` 的 `writeFile`，存檔對話框用 `dialog:allow-save` 權限。設計見 `docs/Plans/Save-file.md`。
- 路徑由前端 save dialog 產生（使用者明示選定），故 command 內不另做目錄白名單；寫檔失敗以 `Err` 回傳。
