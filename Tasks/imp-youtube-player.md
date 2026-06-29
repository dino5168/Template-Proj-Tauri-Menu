# 實作計畫：學習 → YouTube Player

> 來源需求：`docs/Plans/learning-english-by-youtube.md`
> 決策（已與使用者確認）：
> 1. **Player 方式**：`react-youtube`（官方 IFrame Player API 封裝）——可由 JS 讀取/控制 `currentTime`、`onStateChange`，為未來字幕同步高亮鋪路。
> 2. **右側字幕 Panel**：現在就放佔位 Panel（`resizable` 左右兩欄，右側顯示「開發中」佔位，未來只換內容）。

---

## 目標

選單新增頂層群組「**學習**」（置於「設定」之前），其下項目「**Youtube**」→ 切到新的 `youtube` 視圖。
視圖布局：

```
┌───────────────────────────────────────────────┐
│ [URL 輸入框..................]  [確定]   (頂部) │  ← youtube-url-bar
├──────────────────────┬────────────────────────┤
│                      │                        │
│   YouTube Player     │   字幕（佔位，開發中）   │  ← resizable 左右
│   (react-youtube)    │                        │
│                      │                        │
└──────────────────────┴────────────────────────┘
```

採**原子化設計 → 組合**：小元件各自單一職責，由 `youtube-view` 殼組裝。重用既有模式（data-driven menu / view-store / shadcn `resizable`），不另起爐灶。

---

## 架構決策

- **無需後端**：純前端，不新增 Rust command、不動 capabilities/CSP。`tauri.conf.json` 的 `security.csp` 為 `null`，外部 `https://www.youtube.com` iframe 可直接載入。
- **無需全域 store**：當前 `videoId` 是 view-local 狀態，用 `youtube-view` 內 `useState` 即可，**不**仿 editor-store 建跨檔 store（YAGNI）。
- **URL 解析抽純函式**：放 `src/lib/youtube.ts`，純函式好測（附 vitest）。
- **react-youtube** 無 postinstall build script，不需動 `package.json` 的 `pnpm.onlyBuiltDependencies`。

---

## 檔案異動清單

### 新增

| 檔 | 職責（原子） |
| --- | --- |
| `src/lib/youtube.ts` | 純函式 `parseYouTubeId(input): string \| null`，支援 `watch?v=`、`youtu.be/`、`embed/`、純 11 碼 id |
| `src/lib/youtube.test.ts` | vitest：涵蓋各 URL 形態 + 無效輸入 |
| `src/components/youtube/youtube-url-bar.tsx` | atom：URL input + 確定鈕，presentational，`onSubmit(url: string)` |
| `src/components/youtube/youtube-player.tsx` | atom：封裝 `react-youtube`，props `videoId`、`onReady?`、`onStateChange?`；無 id 時顯示空狀態提示 |
| `src/components/youtube/youtube-subtitle-panel.tsx` | atom：右側字幕佔位（「字幕功能開發中」），預留未來 props 介面 |
| `src/components/youtube/youtube-view.tsx` | 組合殼：返回鈕 + `YouTubeUrlBar` + `resizable`(Player \| SubtitlePanel)，持 `videoId` 狀態 |
| `src/components/youtube/CLAUDE.md` | 子系統工作層說明（仿 editor/doc 既有風格） |

### 修改

| 檔 | 異動 |
| --- | --- |
| `src/config/menu.ts` | `MenuActionId` union 加 `"learning.youtube"`；`menuConfig` 在「設定」**之前**插入「學習」群組（icon `GraduationCap`），含 item「Youtube」（icon `Youtube`） |
| `src/lib/menu-actions.ts` | `menuActions` 補 `"learning.youtube": () => setView("youtube")` |
| `src/lib/view-store.ts` | `View` union 加 `"youtube"` |
| `src/App.tsx` | 主視圖三元鏈加 `view === "youtube" ? <YoutubeView /> : ...` |
| `package.json` | 新增依賴 `react-youtube` |

---

## 實作步驟

### 1. 安裝依賴
```powershell
pnpm add react-youtube
```
> `react-youtube` 內建型別，符合「完整型別支援」標準。

### 2. URL 解析純函式 — `src/lib/youtube.ts`
- `parseYouTubeId(input: string): string | null`
- 支援：
  - `https://www.youtube.com/watch?v=VIDEOID`
  - `https://youtu.be/VIDEOID`
  - `https://www.youtube.com/embed/VIDEOID`
  - 直接貼 11 碼 video id
- 解析失敗回 `null`（呼叫端據此顯示錯誤提示，不丟例外）。
- 附 `youtube.test.ts`（vitest）。

### 3. 原子元件（`src/components/youtube/`）
- **`youtube-url-bar.tsx`**：受控 input + 確定鈕（`<form onSubmit>` 支援 Enter）。presentational，只把輸入字串往上拋 `onSubmit(raw)`；解析與錯誤由父層 `youtube-view` 負責。樣式對齊 `doc-browser` 工具列（`border-b`、shadcn `Button`/`Input`）。
- **`youtube-player.tsx`**：封裝 `react-youtube`，`opts` 設 `width/height: "100%"`、外層容器 `h-full` 填滿左欄；無 `videoId` 時渲染置中提示「請在上方輸入 YouTube 網址」。預先透傳 `onReady(player)`、`onStateChange`（未來字幕同步的接點，現階段可不接）。
- **`youtube-subtitle-panel.tsx`**：佔位，置中淡色文字「字幕功能開發中」。預留 `videoId?`/`currentTime?` 介面註解，標明未來實作點。

### 4. 組合殼 — `youtube-view.tsx`
- `useState<string | null>(videoId)`。
- `handleSubmit(raw)`：`parseYouTubeId(raw)` → 有效則 `setVideoId`，無效則設錯誤訊息（顯示於 url-bar 下方或 toast）。
- 布局：最上 `返回`（`setView("home")`，仿 doc-browser）+ `YouTubeUrlBar`；下方 `ResizablePanelGroup orientation="horizontal"`（左 Player `defaultSize 65`、右 SubtitlePanel `defaultSize 35`），中間 `ResizableHandle withHandle`。

### 5. 接線 data-driven menu + view
- `view-store.ts`：`View` 加 `"youtube"`。
- `menu.ts`：`MenuActionId` 加 `"learning.youtube"`；在「設定」群組前插入：
  ```ts
  {
    label: "學習",
    icon: GraduationCap,
    items: [
      { kind: "item", label: "Youtube", action: "learning.youtube", icon: Youtube },
    ],
  },
  ```
  （`GraduationCap`、`Youtube` 皆 lucide-react 既有 icon，記得加進 import。）
- `menu-actions.ts`：補 `"learning.youtube": () => setView("youtube")`。**漏實作 TS 會擋下**（`Record<MenuActionId>` 完整性）。
- `App.tsx`：import `YoutubeView` 並加分支。

### 6. 子系統文件
- 新增 `src/components/youtube/CLAUDE.md`：說明原子→組合結構、url-bar/player/subtitle 職責、未來字幕同步接點（`onStateChange` + `getCurrentTime`）、為何不建全域 store。

---

## 驗證

```powershell
pnpm build          # tsc 型別檢查 + vite build（驗 TS/import 最快）
pnpm vitest run     # youtube.ts 解析測試
pnpm tauri dev      # 實機：選單 學習→Youtube、貼網址、確定後 Player 出現、左右可拖曳
```
- 不需 `cargo check`（無 Rust/權限變更）。
- 手動檢查：無效網址有提示、空狀態提示正確、明暗主題下版面正常。

---

## 未來擴充（保留，不在本次範圍）

- 右側字幕：載入字幕來源（YouTube timedtext / 本機 `.vtt`），用 `react-youtube` 的 `onStateChange` + 輪詢 `player.getCurrentTime()` 做**逐句高亮 + 自動捲動**；`youtube-subtitle-panel` 換內容即可，殼與布局不動。
- 若字幕需持久化來源或跨視圖共享狀態，再考慮引入 view-local reducer 或小 store（屆時才加，避免提前抽象）。
