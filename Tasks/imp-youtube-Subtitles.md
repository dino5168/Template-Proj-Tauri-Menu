# 實作計畫：YouTube 右側字幕（yt-dlp 下載 + 字幕卡同步）

> 來源需求：`docs/Plans/Plan-Subtitles.md`
> 前置：`Tasks/imp-youtube-player.md`（YouTube Player 已完成，右側為 `youtube-subtitle-panel` 佔位）

## 決策（已與使用者確認）

1. **資料目錄架構**：新增**單一「應用資料根目錄」(data root)**，取代「每功能一個 workdir」。
   - 環境設定可改、持久化；**預設**：release＝`.exe` 同層 `data/`，dev＝專案根 `data/`。
   - 底下依功能分子資料夾：`subtitles/`（本次）、未來 `recordings/`（錄音）等。
   - **與現有編輯器 `workdir`（使用者文件位置）分開**：data root 是「app 產生物」的家，workdir 是「使用者文件」的家，語意不同不混用。
2. **yt-dlp 字幕來源**：手動優先、無則自動 —— `--write-subs --write-auto-subs --sub-langs "en.*" --convert-subs srt`。
3. **yt-dlp 呼叫方式**：Rust `std::process::Command`（自家 command，**免設 shell plugin scope／capability**），長時操作以 `spawn_blocking` 包裝避免卡住 async runtime。
4. **快取策略**：先掃 `subtitles/` 是否已有 `<videoId>*.srt`，**有就不下載**、直接回傳；無才呼叫 yt-dlp，跑完再掃一次。

---

## 架構總覽

```
youtube-view.tsx  ← 組合根 / orchestrator（持 videoId, player, currentTime, cues, 載入狀態）
   ├─ youtube-url-bar.tsx        （現成）
   ├─ youtube-player.tsx          onReady→存 player ref；輪詢 getCurrentTime()
   └─ youtube-subtitle-panel.tsx  ← 改為真實面板（狀態 + SubtitleList）
        └─ subtitle-list.tsx      list；active cue 自動捲入視野
             └─ subtitle-card.tsx atom：單句；active 高亮、點擊 seek、預留動作區（未來錄音）
```

資料流：
```
URL 確定 → parseYouTubeId → setVideoId
  └→ resolveDataRoot()（override 或 Rust 預設）
     └→ downloadSubtitle(url, videoId, dataRoot, "en")  ← 有快取則跳過下載
        └→ readTextFile(srtPath) → parseSrt() → setCues
player PLAYING → 每 ~250ms getCurrentTime() → setCurrentTime
  → active cue = start ≤ currentTime < end → 高亮 + 自動捲動
點字幕卡 → player.seekTo(cue.start)
```

---

## 檔案異動清單

### 新增（前端）

| 檔 | 職責 |
| --- | --- |
| `src/lib/data-root-store.ts` | data root 設定（localStorage，仿 workdir-store）+ `resolveDataRoot()`（override→Rust 預設） |
| `src/lib/srt.ts` | 純函式 `parseSrt(text): Cue[]`（`Cue = { index; start; end; text }`，時間轉秒） |
| `src/lib/srt.test.ts` | vitest：時間碼解析、多行、空白容錯 |
| `src/components/youtube/subtitle-card.tsx` | atom：單句字幕卡，active 高亮、點擊 onSeek、預留 `actions` 動作區 |
| `src/components/youtube/subtitle-list.tsx` | 字幕清單；`activeIndex` 自動 `scrollIntoView` |

### 修改（前端）

| 檔 | 異動 |
| --- | --- |
| `src/lib/tauri.ts` | 加 `defaultDataRoot()`、`downloadSubtitle(...)`、`readTextFile(path)` 封裝（Result type） |
| `src/components/youtube/youtube-player.tsx` | `onReady` 存 player 實例；新增 `onProgress?(seconds)` 由父層輪詢驅動（或父層持 player ref 自輪詢，見步驟 5） |
| `src/components/youtube/youtube-subtitle-panel.tsx` | 由佔位改為真實面板：吃 `cues / activeIndex / status / onSeek`，渲染 `SubtitleList` 或狀態訊息 |
| `src/components/youtube/youtube-view.tsx` | 升為 orchestrator：載入字幕、持 player、輪詢 currentTime、算 activeIndex、seek |
| `src/config/menu.ts` | 「設定」加項目「資料目錄」→ `settings.dataRoot`（`MenuActionId` 補一筆） |
| `src/lib/menu-actions.ts` | 補 `settings.dataRoot` handler（選資料夾→`setDataRoot`） |
| `vite.config.ts` | `server.watch.ignored` 加 `**/data/**`（**關鍵**，見下方眉角） |
| `src/components/youtube/CLAUDE.md` | 補字幕子系統說明（資料流、同步、未來錄音接點） |

### 修改（後端 Rust）

| 檔 | 異動 |
| --- | --- |
| `src-tauri/src/lib.rs` | 加 3 個 command：`default_data_root`、`download_subtitle`、`read_text_file`；註冊進 `invoke_handler` |

> capabilities **不需改**：`std::process::Command` 為自家 command；選資料夾用既有 `dialog:allow-open`。

---

## Rust commands 設計（`src-tauri/src/lib.rs`）

```rust
/// 解析（並建立）預設應用資料根目錄。
/// debug：專案根/data（CARGO_MANIFEST_DIR 之父 /data）；release：exe 同層/data。
#[tauri::command]
fn default_data_root() -> Result<String, String> { /* create_dir_all 後回絕對路徑 */ }

/// 確保指定影片的英文字幕存在於 <data_root>/subtitles/，回傳 srt 絕對路徑。
/// 1) subtitles_dir = data_root/subtitles（create_dir_all）
/// 2) 掃 <video_id>*.srt → 命中即回（快取，不下載）
/// 3) 否則 yt-dlp 下載（spawn_blocking），跑完重掃
/// 4) 仍無 → Err("此影片無可用英文字幕")
#[tauri::command]
async fn download_subtitle(
    url: String, video_id: String, data_root: String, lang: String,
) -> Result<String, String> { ... }

/// 讀任意 UTF-8 文字檔（srt 用）。read_markdown 之通用版；可日後讓 read_markdown 共用。
#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}
```

**yt-dlp 指令**（`Command::new("yt-dlp")`）：
```
--skip-download --write-subs --write-auto-subs
--sub-langs en.*          # 涵蓋 en / en-US / en-orig
--convert-subs srt
-o <subtitles_dir>/%(id)s.%(ext)s
<url>
```
- 找不到 yt-dlp（`ErrorKind::NotFound`）→ `Err("找不到 yt-dlp，請確認已安裝並加入 PATH")`。
- 非 0 exit → 回傳 stderr 摘要。
- 輸出檔名可能是 `<id>.en.srt` 或 `<id>.en-US.srt`，故快取/結果一律用「`<id>` 前綴 + `.srt` 後綴」掃描比對，不寫死語言碼。

---

## 實作步驟

### 1. Rust：3 個 command + 註冊
- 寫 `default_data_root` / `download_subtitle` / `read_text_file`，加進 `generate_handler!`。
- `cargo check`（在 `src-tauri/`）驗證。

### 2. 前端 IPC 封裝（`tauri.ts`）
- `defaultDataRoot()`、`downloadSubtitle(url, videoId, dataRoot, lang)`、`readTextFile(path)`，皆回 Result type。

### 3. data root store（`data-root-store.ts`）
- `getDataRoot()/setDataRoot()`（localStorage，key `dataRoot`，仿 workdir-store）。
- `async resolveDataRoot()`：有 override 回 override；否則 `defaultDataRoot()`。
- 「設定 → 資料目錄」(`settings.dataRoot`)：dialog 選資料夾 → `setDataRoot`。

### 4. SRT 解析（`srt.ts` + 測試）
- `parseSrt(text): Cue[]`，`Cue = { index: number; start: number; end: number; text: string }`。
- 時間碼 `HH:MM:SS,mmm` → 秒（float）；多行字幕合併（`\n`）；容忍 BOM、CRLF、區塊間空行。
- vitest 覆蓋：單句 / 多行 / 多區塊 / 畸形容錯。

### 5. Player 進度輪詢
- `youtube-player.tsx`：`onReady` 把 `event.target`（player）交給父層（callback `onReady(player)`）。
- `youtube-view.tsx`：存 player ref；`onStateChange` 為 PLAYING(1) 時 `setInterval(~250ms)` 讀 `player.getCurrentTime()` → `setCurrentTime`；PAUSED/ENDED/離開清除 interval。換片 / unmount 清除。

### 6. 字幕卡與清單
- `subtitle-card.tsx`：props `cue`、`active`、`onSeek(start)`、`actions?: ReactNode`（**預留未來錄音鈕**）。active 用 shadcn token 高亮（跟隨明暗）；點整張卡 `onSeek`。
- `subtitle-list.tsx`：map cards；`useEffect` 依 `activeIndex` 把 active 卡 `scrollIntoView({ block: "center", behavior: "smooth" })`。

### 7. 面板狀態機（`youtube-subtitle-panel.tsx`）
- status：`idle`（未選片）/ `loading`（下載中）/ `ready`（有 cues）/ `empty`（無字幕）/ `error`。
- 各狀態對應訊息；`ready` 渲染 `SubtitleList`。

### 8. orchestrator 串接（`youtube-view.tsx`）
- videoId 變更 → 設 `loading` → `resolveDataRoot()` → `downloadSubtitle` → `readTextFile` → `parseSrt` → `setCues`/狀態；錯誤落 `error`/`empty`。
- `activeIndex` 由 `currentTime` 二分／線性找 `start ≤ t < end`。
- `handleSeek(start)`：`player.seekTo(start, true)`。

### 9. 文件
- 更新 `src/components/youtube/CLAUDE.md`：字幕資料流、yt-dlp 快取、data-root 與 workdir 之別、未來錄音接點。

---

## 必守的眉角 / 風險

- **⚠️ Vite HMR 跳首頁**：dev 預設 data root＝專案根 `data/`，下載 srt 會寫進去；若被 Vite 監看會觸發整頁重載、in-memory 狀態（含正在播的影片）歸零。**務必在 `vite.config.ts` 的 `server.watch.ignored` 加 `**/data/**`**（與既有 `docs/**`、`htmls/**` 同列）。正式 build 無此問題。
- **yt-dlp 在 PATH**：使用者環境已安裝；找不到時回明確錯誤。未來可加「yt-dlp 路徑」設定（YAGNI，先不做）。
- **首播延遲**：第一次看某片需等 yt-dlp 下載（數秒），面板顯示 `loading`；之後同片走快取秒開。
- **非同步 command**：`download_subtitle` 用 `spawn_blocking` 包 `std::process::Command::output()`，勿在 async 執行緒直接 block。
- **時間軸對齊**：auto-sub 時間碼通常足夠精確；輪詢 250ms 的高亮誤差可接受，無需逐毫秒。

---

## 未來擴充（保留，不在本次範圍）

- **字幕卡錄音**：`subtitle-card` 已留 `actions` 區。實作時於卡片加「錄音」鈕 → 依 `cue.start/end` 從該片**音訊**切段存檔到 `<dataRoot>/recordings/`。技術路線：yt-dlp 下載音訊（`-x --audio-format mp3`）+ ffmpeg `-ss/-to` 切段（需另判斷 ffmpeg 是否安裝）。屆時新增 Rust `extract_audio_clip` command，面板/卡片布局不需重構。
- **多語字幕 / 雙語對照**：`sub-langs` 與 `Cue` 已不綁死單一語言，可擴為多軌。
- **read_markdown 收斂**：可改為呼叫 `read_text_file`，去除重複（清理性質，非必要）。
```
