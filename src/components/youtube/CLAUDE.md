# src/components/youtube/ — 學習 YouTube Player

> 「學習 → Youtube」(`learning.youtube`) → `setView("youtube")` 的主視圖。原子化設計：小元件各司其職，由 `youtube-view` 殼組裝。設計見 `Tasks/imp-youtube-player.md`。

## 檔案與資料流

```
youtube-view.tsx          orchestrator：videoId/字幕/播放進度/seek 全在此
   ├─ youtube-url-bar.tsx        atom：URL 輸入 + 確定，onSubmit(raw) 上拋
   ├─ youtube-player.tsx         atom：封裝 react-youtube（IFrame Player API）
   └─ youtube-subtitle-panel.tsx 狀態機面板（idle/loading/ready/empty/error）
        └─ subtitle-list.tsx     清單；active 卡 scrollIntoView
             └─ subtitle-card.tsx atom：單句；active 高亮、點擊 seek、預留 actions 區
```

輸入 → `url-bar` 上拋原始字串 → `view` 用 `parseYouTubeId`（`src/lib/youtube.ts`）解析 → 有效則 `setVideoId`/`setUrl`、無效則 `setError`（顯示於 url-bar 下方）。

## 字幕資料流（yt-dlp 下載 + 同步高亮）

```
videoId/url 變更 → resolveDataRoot()（data-root-store）
  → downloadSubtitle(url, videoId, dataRoot, "en")  ← Rust：有快取跳過、無則 yt-dlp
     → readTextFile(srtPath) → parseSrt()（src/lib/srt.ts）→ setCues / status="ready"
player onReady → 存 playerRef；onStateChange=PLAYING → 每 250ms getCurrentTime()
  → activeCueIndex(cues, t) → 高亮 + 自動捲動
點字幕卡 → player.seekTo(start)
```

- **前置需求**：PATH 上需有 `yt-dlp`、`ffmpeg`、`deno` 三者。yt-dlp 抓字幕；ffmpeg 負責 `--convert-subs srt`（無它會停在 .vtt，`find_srt` 找不到→誤判無字幕）；**deno 是 yt-dlp 預設 JS runtime**——新版 yt-dlp 缺 JS runtime 會對許多影片誤報「This video is not available」，裝 deno 即解。
- **字幕來源**：手動優先、無則自動。`--sub-langs` 用**有界英文清單** `en-orig,en,en-US,en-GB`（見 `download_subtitle`）——**切勿用 `en.*`**：它會匹配上百條自動翻譯軌，YouTube 直接回 **HTTP 429** 限流且產出一堆檔。後端 command 見 `src-tauri/src/lib.rs`，設計見 `Tasks/imp-youtube-Subtitles.md`。
- **yt-dlp JS runtime 警告**：新版 yt-dlp 會警告「No supported JavaScript runtime（deno）」，目前仍可抓字幕；若日後抽取失敗，需裝 deno（見 yt-dlp EJS wiki）。
- **快取**：以 `<videoId>*.srt` 前綴掃描判斷（不寫死語言碼，容 `en-US`/`en-orig`），命中即不重抓。
- **狀態機**：`SubtitleStatus = idle|loading|ready|empty|error`；後端以訊息「無可用英文字幕」區分 empty 與真正 error。
- **data root vs workdir**：字幕存 `<dataRoot>/subtitles/`（`data-root-store`，app 產生物的家），**與編輯器 `workdir`（使用者文件）分開**。新增會寫檔的功能沿用此 data root 加子資料夾，勿再散出新 workdir 設定。

## 必守的眉角

- **videoId 是 view-local 狀態**：用 `youtube-view` 內 `useState`，**不**建跨檔 store（YAGNI）。與 editor 視圖不同（後者需 menu action 跨界取值才用 editor-store）。
- **⚠️ dev 下 data root 預設＝專案根 `data/`**，下載字幕會寫進去；`vite.config.ts` 的 `server.watch.ignored` 已加 `**/data/**` 防 HMR 整頁重載（否則正在播的影片狀態歸零跳首頁）。新增其他寫入 data root 的功能不需再改（同根目錄）。
- **進度輪詢用 `setInterval` + playerRef**：YT IFrame API 無 timeupdate 事件，靠 `onStateChange=PLAYING` 啟動、其餘狀態停止；卸載與換片都要 `clearInterval`。
- **字幕卡 `actions` 區為未來錄音預留**：實作時傳入動作鈕即可，卡片與清單布局不需重構（路線見 `Tasks/imp-youtube-Subtitles.md` 末段）。
- **URL 解析在 `src/lib/youtube.ts`**（純函式 + vitest `youtube.test.ts`），元件不自己 regex。支援 `watch?v=` / `youtu.be` / `embed` / `shorts` / 純 11 碼 id，失敗回 `null`。
- **`<YouTubePlayer>` 用 `key={videoId}`** 強制換片重建，確保載入新影片。
- **無需後端 / capabilities / CSP**：iframe 載入外部 `youtube.com`，`tauri.conf.json` 的 `security.csp` 為 `null`（無 frame-src 限制）。動到 CSP 才需補 frame-src。
- 播放器尺寸交由外層容器（`h-full`），`opts.width/height: "100%"`；左欄底色 `bg-black` 避免載入時白底閃爍。

## 未來字幕同步（接點已留）

- `youtube-player.tsx` 已透傳 `onReady` / `onStateChange`（react-youtube 的 `YouTubeEvent`，`event.target` 為 player 實例）。
- 實作逐句高亮：`onStateChange` 啟動輪詢 `player.getCurrentTime()` → 比對字幕時間軸 → 更新 `youtube-subtitle-panel`。
- 屆時只換 `subtitle-panel` 內容並從 `view` 下傳 `currentTime`，**殼與 resizable 布局不需更動**。
