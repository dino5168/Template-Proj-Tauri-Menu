# 用 Claude Code 開發與維護本專案 — 原則與實務

> 本文整理「如何讓 Claude Code 長期記住專案、控制 token 成本、並一致地擴充功能」的原則，**並對齊本 repo 的實際結構**。新成員（或新 session）讀這份就能上手協作節奏。

---

## 1. 核心觀念：用「檔案」記住專案，不是用「對話」

Claude Code 沒有跨 session 的隱形記憶。它每次「記住」專案，靠的是啟動時讀進來的**檔案**。

- `resume`（接續舊對話）會**逐字重播整段歷史**進每一輪 → token 隨對話長度滾雪球。
- 新 session 只載入少量固定檔案（CLAUDE.md + memory 索引）→ **成本固定且低**。

**結論：把該長期記住的東西寫進檔案，然後多開新 session、少 resume。**

---

## 2. 持久記憶的四層架構（依載入時機）

| 層 | 位置 | 何時進入上下文 | 放什麼 |
| --- | --- | --- | --- |
| 1. 根地圖 | `CLAUDE.md`（根） | **每個 session 必載** | 技術棧、架構重點、慣例、常用指令 |
| 2. 子系統 | 巢狀 `CLAUDE.md` | **在該目錄工作時載入** | 該子系統的工作層眉角 + 擴充步驟 |
| 3. 決策/偏好 | `memory/`（索引 `MEMORY.md`） | 索引每次載入、單篇按需 | 不可從程式碼推導的事：偏好、決策理由、進行中目標 |
| 4. 細節文件 | `docs/*.md` | **僅被引用/需要時讀取** | 計畫、rationale、長篇說明 |

原則：**越常需要的放越上層、越精簡**；越細的往下沉，平時不佔成本。

### 本專案的巢狀 CLAUDE.md
就近說明，編輯該區時自動載入：

- `src-tauri/` — Rust 後端：新增 command 三步驟、capabilities 雷、asset protocol、`cargo check`。
- `src/lib/` — IPC Result 封裝、view-store、theme。
- `src/config/` — data-driven 選單跨三檔關係、加選單項步驟。
- `src/components/layout/` — 自訂標題列三處一致性、拖曳規則。
- `src/components/doc/` — DocBrowser 共用殼、加新 viewer。
- `src/components/editor/` — Crepe 編輯器、加格式按鈕、StrictMode/主題眉角。

---

## 3. Session 操作習慣（省 token 的關鍵）

- **不同任務之間用 `/clear` 開新局**，而不是 resume 接舊的。新 session 重新讀 CLAUDE.md 即可「重新讀懂」專案，成本固定。
- **同一任務太長時用 `/compact`** 壓縮上下文，而非無限累積。
- **`resume` 只在真的要接續同一條思路時用**，收斂後就 `/clear`。
- 需要 Claude 跑互動式登入或想看輸出時，在輸入框用 `!<command>` 直接在 session 內執行（例 `!pnpm tauri dev`）。
- 架構有變動時，**順手請 Claude 更新對應的 CLAUDE.md**；或定期 `/init` 重生根檔。

---

## 4. 文件何時寫、寫去哪

| 情境 | 去處 |
| --- | --- |
| 架構/慣例改變（新 view、新目錄、新模式） | 更新根或子系統 `CLAUDE.md` |
| 較大功能的實作計畫、取捨記錄 | `docs/Plans/*.md`（從 CLAUDE.md 連結） |
| 任務需求單 | `docs/Tasks/*.md` |
| 你的偏好 / 為何這樣決策 | `memory/`（讓 Claude 寫入並更新 `MEMORY.md` 索引） |

**不要記**程式碼結構、git 歷史、過去修法等「讀檔就有」的東西——那是雜訊。

---

## 5. 推薦工作流：任務 → 計畫 → 實作 → 驗證 → 收尾

本 repo 已用這套流程（例：開新檔案功能）：

1. **任務**：需求寫成 `docs/Tasks/<name>.md`（功能描述 + 輸出位置 + 「不清楚就先問」）。
2. **計畫**：Claude 先讀既有架構，需求有歧義時**用提問釐清**，再輸出計畫到 `docs/Plans/imp-plan-<name>.md`，待你確認（回 `OK`）才動手。
3. **實作**：優先**重用既有模式**（DocBrowser / data-driven menu / Result type / dispatch table），勿另起爐灶。
4. **驗證**：`pnpm build`（tsc + vite，最快驗 TS/import）；動到 Rust/權限再 `cargo check`；要看實機跑 `!pnpm tauri dev`。
5. **收尾**：補 Google 風格 docstring、更新受影響的 CLAUDE.md、必要時記一筆 memory。

---

## 6. 常用指令（驗證循環）

```powershell
pnpm build          # tsc 型別檢查 + vite build —— 驗 TS/import 最快
cargo check         # 在 src-tauri/：驗 commands + tauri.conf + capabilities 權限字串
pnpm tauri dev      # 完整開發：Vite HMR + Rust 熱重編（GUI 視窗請用 !pnpm tauri dev 在自家終端開）
pnpm tauri build    # 打包 .msi / .exe
```

> 改 `capabilities` / `tauri.conf.json` 後**務必 `cargo check`**：錯的權限字串只在編譯期爆，執行期是「按了沒反應」的靜默失效。

---

## 7. 擴充功能的標準路徑（重用優先）

| 要做的事 | 改哪裡 | 安全網 |
| --- | --- | --- |
| 新增選單項目 | `config/menu.ts`（id + 項目）+ `lib/menu-actions.ts`（handler） | `Record<MenuActionId>` 缺 handler → TS 擋下 |
| 新增主視圖 | `lib/view-store.ts`（View union）+ menu action + `App.tsx` 分支 | union 比對 |
| 新增文件瀏覽器 | 仿 `markdown-view`，餵 `DocBrowser` 四個 prop（exts/dir/icon/preview） | — |
| 新增編輯器格式鈕 | `markdown-editor.tsx`（EditorCommandId + commandRunners）+ `editor-toolbar.tsx`（config） | `Record<EditorCommandId>` 缺項 → TS 擋下 |
| 新增後端能力 | `src-tauri/src/lib.rs`（command + 註冊）+ `src/lib/tauri.ts`（Result 封裝）+ 必要的 capability | `cargo check` |

---

## 8. 慣例底線（與根 CLAUDE.md 一致）

- TypeScript strict，**禁用 `any`**；public API 標型別。
- 元件 / 工具函數加 Google 風格 docstring；複雜邏輯註解「為什麼」。
- 套件管理一律 `pnpm`（pnpm 10 擋 build script，需 postinstall 的套件要補 `pnpm.onlyBuiltDependencies`）。
- 不 hardcode secret，一律走環境變數。
- 顏色走 CSS variable，跟隨明暗主題。

---

## 9. 進一步自動化（選用）

- **重複流程做成 slash command**（`.claude/commands/*.md`）：例如「新增選單項目」「換 app icon」的 SOP，下次一句話觸發。
- **自動行為（每次 X 就做 Y）要用 hooks**（settings.json），那是 harness 執行的，不是靠記憶或偏好能達成。

---

## 一句話總結

> 把該記住的寫進 **根 CLAUDE.md（地圖）+ 巢狀 CLAUDE.md（子系統眉角）+ docs/（細節）+ memory/（決策與偏好）**，每個新任務用 `/clear` 開新 session。如此 Claude 每次都能低成本「重新讀懂」專案，而不必靠 resume 把歷史越滾越大。
