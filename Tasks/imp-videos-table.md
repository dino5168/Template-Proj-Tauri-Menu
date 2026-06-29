# 執行計畫：videos 資料表 + 每-id 影片資料夾（字幕 / 封面 / mp3）

> 目標：把 YouTube「確定」的下載流程從**扁平 `subtitles/<id>.srt`** 改為**每影片一資料夾 `videos/<id>/`**（含 `en.srt`、`cover.jpg`、`info.json`），
> mp3 改由**按鈕手動下載**，並用 SQLite `videos` 表記錄每支影片的 metadata 與各檔案路徑。

## 決策（已與使用者確認）

- **mp3 下載時機**：按鈕手動。「確定」只抓字幕+封面+metadata（輕量快）；mp3 另由「下載音訊」鈕觸發。
- **videos 表**：存豐富 metadata，需 yt-dlp 抓 `info.json`（用 `serde_json` 解析，已是依賴）。
- **舊資料**：新下載一律走 `videos/<id>/`；既有 `subtitles/` 保留不動、不遷移。

## 與現況的關係

| 現況（`download_subtitle`） | 改為 |
|---|---|
| `<dataRoot>/subtitles/` 扁平、所有影片 srt 混放 | `<dataRoot>/videos/<id>/` 每影片一夾 |
| 只 `--skip-download` 抓字幕 | 字幕 + 封面(`--write-thumbnail`) + metadata(`--write-info-json`)，mp3 另鈕 |
| 無 DB 記錄 | `videos` 表 upsert 一筆 |
| `youtube-view` 呼叫 `downloadSubtitle` | 改呼叫 `prepareVideo`，成功後 `videosUpsert` |

> **綜效**：`videos` 表自動顯示在「資料庫 → 管理 → 資料庫表格」瀏覽器，無需另寫檢視 UI。

---

## 資料夾結構

```
<dataRoot>/videos/<id>/
├── en.srt        # 字幕（手動優先、無則自動，convert→srt）；無字幕則不存在
├── cover.jpg     # 封面（--write-thumbnail + --convert-thumbnails jpg，需 ffmpeg）
├── info.json     # yt-dlp metadata（--write-info-json），供建表，亦留存
└── audio.mp3     # 僅「下載音訊」後存在
```

> yt-dlp 原生輸出名為 `<id>.en.srt` / `<id>.jpg` / `<id>.info.json`，下載後 `std::fs::rename` 統一成上表名稱（封面取第一個 `.jpg`）。找不到字幕則 `en.srt` 不存在、`subtitlePath` 回 `None`。

---

## videos 表設計

```sql
CREATE TABLE IF NOT EXISTS videos (
  id             TEXT PRIMARY KEY,       -- YouTube video id（v= 參數）
  url            TEXT NOT NULL,          -- watch 網址
  title          TEXT,                   -- info.json: title
  channel        TEXT,                   -- info.json: channel / uploader
  duration       INTEGER,                -- 秒；info.json: duration
  upload_date    TEXT,                   -- info.json: upload_date（YYYYMMDD）
  folder_path    TEXT NOT NULL,          -- <dataRoot>/videos/<id> 絕對路徑
  subtitle_path  TEXT,                   -- en.srt 絕對路徑；無字幕為 NULL
  thumbnail_path TEXT,                   -- cover.jpg 絕對路徑
  audio_path     TEXT,                   -- audio.mp3 絕對路徑；未下載為 NULL
  created_at     TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at     TEXT
);
```

**Upsert**（保留 `created_at`、只更新其餘）：
```sql
INSERT INTO videos (id, url, title, channel, duration, upload_date,
                    folder_path, subtitle_path, thumbnail_path, audio_path, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
ON CONFLICT(id) DO UPDATE SET
  url=excluded.url, title=excluded.title, channel=excluded.channel,
  duration=excluded.duration, upload_date=excluded.upload_date,
  folder_path=excluded.folder_path, subtitle_path=excluded.subtitle_path,
  thumbnail_path=excluded.thumbnail_path,
  audio_path=COALESCE(excluded.audio_path, videos.audio_path),  -- 不被後續 prepare 清掉已下載的音訊
  updated_at=CURRENT_TIMESTAMP;
```

### 建議補充欄位（可選，預設先不做 — YAGNI）
學習型 app 之後可能想加，列出供你決定是否一併納入：
- `description TEXT`、`view_count INTEGER`、`thumbnail_url TEXT`（info.json 都有）
- `lang TEXT`（字幕語言碼，目前固定 en，多語時有用）
- `last_played_at TEXT` / `play_count INTEGER`（學習進度）
- `note TEXT` / `tags TEXT`（使用者註記）

> **未來分表建議**（非本輪）：若要做「逐句書籤 / 跟讀錄音」，另開 `recordings(id, video_id FK, cue_index, start_sec, audio_path, created_at)`，以 `video_id` 關聯 `videos`。本輪不建（YAGNI），先把單表打穩。

---

## Step 1 — Rust 後端（`src-tauri/src/lib.rs`）

### 1.1 `prepare_video`（取代 `download_subtitle` 的角色，擴充版）
回傳 struct（camelCase）：
```rust
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct VideoInfo {
    id: String,
    url: String,
    title: Option<String>,
    channel: Option<String>,
    duration: Option<i64>,
    upload_date: Option<String>,
    folder_path: String,
    subtitle_path: Option<String>,
    thumbnail_path: Option<String>,
    audio_path: Option<String>,   // prepare 階段一律 None；資料由前端 upsert 後維護
}
```
流程（`spawn_blocking`，含外部 CLI + 網路 IO）：
1. `folder = <data_root>/videos/<id>`，`create_dir_all`。
2. 快取：若 `en.srt` 已存在且 `info.json` 已存在 → 直接讀 info.json 組 `VideoInfo` 回傳，不呼叫 yt-dlp。
3. 否則一次 yt-dlp（沿用 **429-safe** 有界 `--sub-langs`，見既有 `download_subtitle` 註解）：
   ```
   yt-dlp --skip-download \
     --write-subs --write-auto-subs --sub-langs "en-orig,en,en-US,en-GB" --convert-subs srt \
     --write-thumbnail --convert-thumbnails jpg \
     --write-info-json \
     -o "<folder>/%(id)s.%(ext)s" <url>
   ```
4. `find_srt`（既有函式）找字幕 → rename 成 `en.srt`；找 `<id>.jpg` → rename `cover.jpg`；`<id>.info.json` → rename `info.json`。
5. 讀 `info.json` 用 `serde_json::from_str::<serde_json::Value>` 取 `title/channel/uploader/duration/upload_date`（缺欄回 `None`）。
6. 組 `VideoInfo` 回傳。yt-dlp 未產字幕 → `subtitle_path: None`（**不**視為 error，前端據此顯示 empty）。
   - 找不到 yt-dlp / ffmpeg → 沿用既有 `ErrorKind::NotFound` 友善訊息。

### 1.2 `download_audio`
```rust
#[tauri::command]
async fn download_audio(url: String, video_id: String, data_root: String) -> Result<String, String>
```
- `folder = <data_root>/videos/<id>`，`create_dir_all`。
- 快取：`audio.mp3` 已存在即回。
- 否則：
  ```
  yt-dlp -f bestaudio --extract-audio --audio-format mp3 -o "<folder>/%(id)s.%(ext)s" <url>
  ```
  （需 ffmpeg）→ rename `<id>.mp3` → `audio.mp3` → 回絕對路徑。

### 1.3 `videos_upsert`（DB）
```rust
#[tauri::command]
fn videos_upsert(db_path: String, video: VideoInfo) -> Result<(), String>
```
- `CREATE TABLE IF NOT EXISTS videos (...)`（與 1.x schema 一致；冪等，亦讓 youtube-view 先下載也能建表）。
- 跑上面的 upsert SQL（具名參數綁定，**非字串內插**——值是資料不是識別字）。

### 1.4 db_init 也建 videos 表
`db_init` 內 `CREATE TABLE IF NOT EXISTS videos (...)` 一併建（讓 DB 瀏覽器一開就看得到空表）。`test` 表保留。

### 1.5 移除 `download_subtitle`
唯一呼叫者是 `youtube-view`，改用 `prepare_video` 後移除此 command 與 `tauri.ts` 的 `downloadSubtitle`。`find_srt` / `clean_path` 仍被 `prepare_video` 用，保留。

### 1.6 註冊
`generate_handler![... , prepare_video, download_audio, videos_upsert]`（移除 `download_subtitle`）。

> 權限：無需新增 capability（本地 fs + process spawn + sqlite，皆既有）。`cargo check` 驗證。

---

## Step 2 — 前端 IPC（`src/lib/tauri.ts`）

- 新增介面 `VideoInfo`（對齊 Rust，camelCase，含 `audioPath: string | null` 等）。
- `prepareVideo(url, videoId, dataRoot): Promise<Result<VideoInfo>>`
- `downloadAudio(url, videoId, dataRoot): Promise<Result<string>>`
- `videosUpsert(dbPath, video: VideoInfo): Promise<Result<void>>`
- 移除 `downloadSubtitle`。
- 仿既有 try/catch + `toError()` 樣板。

---

## Step 3 — 前端流程（`src/components/youtube/`）

### 3.1 `youtube-view.tsx`（orchestrator 調整）
- DB 路徑：`resolveDataRoot()` → `dbPath = joinPath(root, DB_FILE_NAME)`（`@/lib/path` + `DB_FILE_NAME`）。
- 換片下載流程：`downloadSubtitle` → **`prepareVideo`**：
  - 成功：`videosUpsert(dbPath, info)`（寫表）；`info.subtitlePath` 有值 → `readTextFile` → `parseSrt` → `status="ready"`；為 `null` → `status="empty"`。
  - 失敗（找不到 yt-dlp 等）→ `status="error"`。
- 保存 `videoInfo` 於 view state（mp3 下載與顯示用）。
- 新增「下載音訊」處理：`downloadAudio` → 成功後 `videosUpsert`（帶 `audioPath`，COALESCE 保住）→ 更新 audio 狀態。
- 音訊下載狀態：`audioStatus: "idle" | "downloading" | "done" | "error"`（view-local `useState`，比照字幕狀態機，不建跨檔 store）。

### 3.2 `youtube-url-bar.tsx`（加一顆 presentational 按鈕）
- 新增 props：`onDownloadAudio?: () => void`、`audioStatus?`、`canDownload: boolean`（有 videoId 才 enabled）。
- 在「確定」旁加「下載音訊」鈕（icon `Music` / `Download`），依 `audioStatus` 顯示 loading / 完成。純上拋，不持有邏輯。

> 封面 `cover.jpg` 顯示為選配：若要在面板秀封面，用 `convertFileSrc(thumbnailPath)`（asset protocol 已啟用）。本輪可不顯示，僅存檔+入庫。

---

## Step 4 — 驗證

```powershell
cargo check --manifest-path src-tauri/Cargo.toml   # 後端（注意：用 --manifest-path，勿 cd 進 src-tauri 以免 cwd 殘留）
pnpm build                                          # 前端型別
pnpm tauri dev                                      # 整合
```
驗收：
- [ ] 貼網址按「確定」→ `<dataRoot>/videos/<id>/` 出現 `en.srt`、`cover.jpg`、`info.json`。
- [ ] 字幕同步高亮如舊正常。
- [ ] 「資料庫 → 管理 → 資料庫表格」選 `videos` →「資料」tab 見該影片一列，metadata（title/channel/duration…）與路徑正確。
- [ ] 按「下載音訊」→ 產生 `audio.mp3`，`videos.audio_path` 更新（再按「確定」不會清掉 audio_path）。
- [ ] 無字幕影片 → status=empty、`subtitle_path` 為 NULL、仍入庫且可播放。

---

## 影響檔案清單

| 檔 | 動作 |
|---|---|
| `src-tauri/src/lib.rs` | +`prepare_video`/`download_audio`/`videos_upsert` + `VideoInfo` struct；db_init 建 videos 表；移除 `download_subtitle`；註冊調整 |
| `src/lib/tauri.ts` | +`VideoInfo` + `prepareVideo`/`downloadAudio`/`videosUpsert`；移除 `downloadSubtitle` |
| `src/components/youtube/youtube-view.tsx` | 流程改 prepareVideo + 入庫 + 音訊下載狀態 |
| `src/components/youtube/youtube-url-bar.tsx` | +「下載音訊」鈕（props 驅動） |
| `src/components/youtube/CLAUDE.md` | 更新字幕資料流段（subtitles/ → videos/<id>/、+videos 表、+音訊鈕） |

## 範疇外（YAGNI，不做）

- 不遷移既有 `subtitles/` 舊檔。
- 不做 mp3 內建播放器（僅下載存檔；YouTube 播放沿用現有 player）。
- 不做 videos 表的刪除/編輯 UI（DB 瀏覽器目前唯讀；要刪整理手動或日後再做）。
- 不做 `recordings` 等關聯子表（待逐句錄音功能再開）。
- 建議補充欄位（description/tags/play_count…）預設不加，待你點頭再納入。
