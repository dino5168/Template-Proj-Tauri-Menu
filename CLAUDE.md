# CLAUDE.md

桌面應用範本（template）：**Tauri v2 + React 19 + TypeScript + Vite + Tailwind v4 + shadcn/ui + Lucide**。
核心特色是**無原生標題列**（`decorations: false`）的自訂標題列 + menubar + 視窗控制鈕。

> 完整建置步驟與 rationale 見 `setup.md`（含 shadcn 新版旗標、Tailwind v4 變更、踩雷排查）。

---

## 常用指令

```powershell
pnpm tauri dev      # 開發：Vite HMR + Rust 熱重編，啟動即最大化視窗
pnpm tauri build    # 打包 .msi / .exe
pnpm build          # 僅前端：tsc 型別檢查 + vite build（驗證 TS/import 最快的方式）

pnpm dlx shadcn@latest add <component> -y   # 新增 shadcn 元件（生成於 src/components/ui/）
pnpm tauri icon <方形圖>                     # 重生整套 app icon（見下方「換 icon」）
```

---

## 架構重點

### 自訂標題列（decorations: false）
原生標題列已關閉，**最小化／最大化／關閉／拖曳全由前端 JS 觸發**，三處必須一致：

1. `src-tauri/tauri.conf.json` → `app.windows[0]`：`"decorations": false`、`"maximized": true`（啟動最大化）。
2. `src-tauri/capabilities/default.json` → 必須包含對應 `core:window:allow-*` 權限
   （`start-dragging` / `minimize` / `maximize` / `unmaximize` / `toggle-maximize` / `close` / `is-maximized`）。
   **少任何一個，對應按鈕就會靜默失效。**
3. 前端元件：
   - `src/components/layout/title-bar.tsx`：Logo + 自訂 Menubar（檔案/編輯/檢視）+ 拖曳區 + `<WindowControls />`。
   - `src/components/layout/window-controls.tsx`：用 `getCurrentWindow()`（`@tauri-apps/api/window`）控制視窗，`onResized` 同步最大化狀態以切換圖示。

> **拖曳規則**：可拖曳區塊加 `data-tauri-drag-region`；互動元素（menu、按鈕）**不要**加，否則點擊會被當拖曳。

### 樣式（Tailwind v4）
- CSS-first，**無 `tailwind.config.js`**。入口 `src/index.css`：`@import "tailwindcss";` + shadcn 寫入的 `@theme` / `@custom-variant dark` / CSS variables。
- 配色用 CSS variable（`--background`、`--primary`…），dark mode 在 `<html>` 加 `class="dark"`。

### 路徑別名
`@/*` → `src/*`，**`vite.config.ts`（resolve.alias）與 `tsconfig.json`（paths）兩邊都已設**，缺一不可。

### IPC（Rust ⇄ 前端）
- Rust command 定義於 `src-tauri/src/lib.rs`（範例 `greet`），註冊於 `invoke_handler`。
- 前端用 `invoke<T>("cmd", args)`（`@tauri-apps/api/core`）。
- **慣例**：未來 `invoke` 集中封裝於 `src/lib/tauri.ts`，回傳採 Result type
  `{ data: T; error: null } | { data: null; error: Error }`，不在各元件散落 raw `invoke`。

---

## 目錄結構

```
src/
├── components/
│   ├── ui/            # shadcn 生成；可改原始碼，勿大改檔名（add 會以檔名覆蓋）
│   └── layout/        # title-bar.tsx, window-controls.tsx
├── lib/utils.ts       # cn()
├── App.tsx            # flex h-screen flex-col 包住 <TitleBar/> + <main>
├── main.tsx           # import "./index.css"
└── index.css          # @import "tailwindcss"; + theme tokens
src-tauri/
├── src/lib.rs         # Tauri commands + Builder（真正入口；main.rs 只呼叫 run()）
├── capabilities/default.json   # v2 權限（取代 v1 allowlist）
├── tauri.conf.json    # 視窗設定、bundle、identifier
└── icons/             # 由 `pnpm tauri icon` 生成
public/                # 靜態資源，根路徑取用（例：/deepseek-icon.svg）
```

---

## 慣例與規範

- **TypeScript strict，禁用 `any`**；public API 標註型別。
- 元件 / 工具函數加 Google 風格 docstring；複雜邏輯註解「為什麼」。
- 套件管理一律 `pnpm`。pnpm 10 會擋 build script：`package.json` 的 `pnpm.onlyBuiltDependencies` 已放行 `esbuild`，新增需要 postinstall 的套件時記得補。
- 不 hardcode secret，一律走環境變數。

---

## 換 app icon

`pnpm tauri icon` 要求**方形**來源圖。流程：

1. 準備方形圖（≥512px PNG 去背，或方形 SVG）。
2. `pnpm tauri icon <path>` → 覆蓋 `src-tauri/icons/`（含 `icon.ico`）。
3. **`icon.ico` 在編譯時經 `build.rs` 嵌入 exe**，cargo 可能不會自動偵測變更 → 需 `touch src-tauri/build.rs` 後重編才生效。
4. Windows 工作列若仍顯示舊圖，是 icon cache，重開視窗即可。

> 前端標題列 logo 是另一回事（`title-bar.tsx` 的 `<img src="/...">`），與 app icon 互相獨立。

---

## 已知小事

- `src/App.css` 已不再被 import（改用 Tailwind），保留無妨，可刪。
- ⚠️ 在非空目錄執行 scaffolder 的 `--force` 會清檔，勿用（曾誤刪檔案）。
