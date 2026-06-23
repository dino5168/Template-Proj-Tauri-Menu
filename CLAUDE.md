# CLAUDE.md

桌面應用範本（template）：**Tauri v2 + React 19 + TypeScript + Vite + Tailwind v4 + shadcn/ui + Lucide**。
特色：**無原生標題列**（`decorations: false`）的自訂標題列、**data-driven 選單**、**亮/暗主題切換**、內建 **Markdown / HTML 文件瀏覽器**。

> 建置步驟與 rationale 見 `setup.md`；選單外部化見 `docs/plan-markdown.md`、`docs/plan-html.md`。

> **巢狀 CLAUDE.md**：各子系統另有就近的工作層說明（含眉角與擴充步驟），在該目錄工作時會被載入——
> `src-tauri/`、`src/lib/`、`src/config/`、`src/components/{layout,doc,editor}/`。本檔保持架構地圖，細節在子檔。

---

## 常用指令

```powershell
pnpm tauri dev      # 開發：Vite HMR + Rust 熱重編，啟動即最大化視窗
pnpm tauri build    # 打包 .msi / .exe
pnpm build          # 僅前端：tsc 型別檢查 + vite build（驗證 TS/import 最快）
cargo check         # 在 src-tauri 內：驗證 Rust commands + tauri.conf + capabilities 權限字串

pnpm dlx shadcn@latest add <component> -y   # 新增 shadcn 元件（生成於 src/components/ui/）
pnpm tauri icon <方形圖>                     # 重生整套 app icon（見「換 app icon」）
```

> 改 `capabilities` / `tauri.conf.json` 權限後，務必 `cargo check`：錯誤的權限字串只會在編譯期才爆。

---

## 架構重點

### 自訂標題列（decorations: false）
原生標題列已關閉，**最小化／最大化／關閉／拖曳全由前端 JS 觸發**，三處必須一致：

1. `src-tauri/tauri.conf.json` → `app.windows[0]`：`"decorations": false`、`"maximized": true`。
2. `src-tauri/capabilities/default.json` → 對應 `core:window:allow-*` 權限（start-dragging / minimize / maximize / unmaximize / toggle-maximize / close / is-maximized / set-fullscreen / is-fullscreen）。**少一個按鈕就靜默失效。**
3. `src/components/layout/title-bar.tsx`（Logo + `<AppMenubar>` + 拖曳區 + `<WindowControls>`）、`window-controls.tsx`（`getCurrentWindow()` + `onResized` 同步圖示）。

> **拖曳規則**：可拖曳區塊加 `data-tauri-drag-region`；互動元素（menu、按鈕）**不要**加。

### Data-driven 選單
選單**不寫死 JSX**，由設定驅動：
- `src/config/menu.ts`：型別化結構（discriminated union：`item` / `separator` / `submenu`）+ `menuConfig`。主選單、項目、子選單皆可選 `icon?: LucideIcon`。
- `src/lib/menu-actions.ts`：`Record<MenuActionId, () => void>` dispatch table。**漏實作任一 action 會被 TS 擋下。**
- `src/components/layout/app-menubar.tsx`：config → shadcn Menubar，遞迴渲染。
- 新增選單項目 = 改這兩個檔（加 `MenuActionId` + config 項目 + handler），不動元件。

### 視圖切換 + 主題
- `src/lib/view-store.ts`：極輕量 store（`useSyncExternalStore`），`View = "home" | "markdown" | "html" | "editor"`。menu action 用 `setView()`、元件用 `useView()`。`App.tsx` 依此切換 `<main>`。
- `src/lib/theme.ts`：亮/暗切換（切 `<html>.dark`、`localStorage` 持久化、未選過跟隨系統）。`main.tsx` 於 render 前呼叫 `initTheme()` 防 FOUC。選單「檢視 → 切換深/淺色」觸發。

### 文件瀏覽器（Markdown / HTML）
共用殼 `src/components/doc/doc-browser.tsx`（工具列 + `FileTree` + shadcn `resizable` 分割），以 props 注入差異：
- `MarkdownView`：`MARKDOWN_EXTS`、預設目錄 `docs`、icon `FileText`、預覽 `MarkdownPanel`（react-markdown + remark-gfm + rehype-highlight；相對圖片走 `convertFileSrc`、相對 .md 連結樹內導航）。
- `HtmlView`：`HTML_EXTS`、預設目錄 `htmls`、icon `FileCode`、預覽 `HtmlPanel`（iframe + asset protocol，`sandbox="allow-same-origin allow-scripts"`）。
- `FileTree`（`components/doc/file-tree.tsx`）為泛型，吃 `fileIcon` prop。

### Markdown 編輯器（開新檔案 / Live Preview）
選單「檔案 → 開新檔案」(`file.new`) → `setView("editor")`，主視圖為 Obsidian 式 Live Preview 編輯器（`components/editor/`）：
- `markdown-editor-view.tsx`：殼 = `EditorToolbar` + `MarkdownEditor`。
- `markdown-editor.tsx`：封裝 **milkdown Crepe**（ProseMirror，含 commonmark + gfm），`forwardRef` 暴露 `{ run(id), getMarkdown() }`；`commandRunners` 為 `EditorCommandId → callCommand` dispatch table（與工具列解耦）。清單 / Tab 縮排 / Enter 自動延續清單由 Crepe 內建。
- `editor-toolbar.tsx`：data-driven 工具列 config（icon + label + `EditorCommandId`），presentational，點擊 `onMouseDown.preventDefault()` 保住選取。
- 主題：Crepe 自帶 `theme/common` + `theme/frame`，但 `index.css` 用 `.milkdown.milkdown` 把 `--crepe-color-*` 重新對應到專案 shadcn tokens，**自動跟隨明暗主題**（不載入 Crepe 的 dark 主題）。
- 目前為**純編輯**（內容存記憶體，尚無存檔）；未來存檔需新增 Rust `write_file` command + dialog，見 `docs/Plans/imp-plan-newfile.md`。

### 樣式（Tailwind v4）
- CSS-first，**無 `tailwind.config.js`**。入口 `src/index.css`：`@import "tailwindcss";`、`@plugin "@tailwindcss/typography";`、shadcn 的 `@theme` / `@custom-variant dark` / CSS variables。
- 配色用 CSS variable；markdown 預覽用 `prose dark:prose-invert`。

### 路徑別名
`@/*` → `src/*`，**`vite.config.ts`（resolve.alias）與 `tsconfig.json`（paths）兩邊都要設**。

### IPC（Rust ⇄ 前端）
- Rust commands 在 `src-tauri/src/lib.rs`：`greet`、`list_dir(root, exts)`、`read_markdown(path)`、`default_dir(name)`，註冊於 `invoke_handler`。
- 前端**一律經 `src/lib/tauri.ts`** 封裝，回傳 Result type `{ data; error: null } | { data: null; error }`，不在元件散落 raw `invoke`。
- plugins：`opener`、`dialog`（選資料夾）。asset protocol 已啟用（`tauri.conf.json` 的 `assetProtocol` + Cargo `protocol-asset` feature + scope `["**"]`）——非 capability。

---

## 目錄結構

```
src/
├── components/
│   ├── ui/            # shadcn 生成；勿大改檔名（add 會以檔名覆蓋）
│   ├── layout/        # title-bar, window-controls, app-menubar
│   ├── doc/           # doc-browser, file-tree（Markdown/HTML 共用）
│   ├── markdown/      # markdown-view（薄殼）, markdown-panel
│   ├── html/          # html-view（薄殼）, html-panel
│   └── editor/        # markdown-editor-view, markdown-editor（Crepe）, editor-toolbar
├── config/menu.ts     # 選單結構（data-driven）
├── lib/
│   ├── utils.ts       # cn()
│   ├── tauri.ts       # IPC 封裝（Result type）
│   ├── menu-actions.ts# action dispatch table
│   ├── view-store.ts  # 視圖切換
│   └── theme.ts       # 亮/暗主題
├── App.tsx            # TitleBar + 依 useView 切換 main
├── main.tsx           # initTheme() + import "./index.css"
└── index.css          # tailwind + typography + theme tokens
src-tauri/
├── src/lib.rs         # commands + Builder（真正入口；main.rs 只呼叫 run()）
├── capabilities/default.json   # v2 權限
├── tauri.conf.json    # 視窗、bundle、identifier、assetProtocol
└── icons/             # 由 `pnpm tauri icon` 生成
docs/                  # Markdown viewer 預設根目錄
htmls/                 # HTML viewer 預設根目錄
public/                # 靜態資源，根路徑取用（例：/deepseek-icon.svg）
```

---

## 慣例與規範

- **TypeScript strict，禁用 `any`**；public API 標註型別。
- 元件 / 工具函數加 Google 風格 docstring；複雜邏輯註解「為什麼」。
- 套件管理一律 `pnpm`。pnpm 10 會擋 build script：`package.json` 的 `pnpm.onlyBuiltDependencies` 已放行 `esbuild`，新增需 postinstall 的套件記得補。
- 新功能優先**重用** `DocBrowser` / data-driven menu / Result type 等既有模式，勿另起爐灶。
- 不 hardcode secret，一律走環境變數。

---

## 換 app icon

`pnpm tauri icon` 要求**方形**來源圖：

1. 準備方形圖（≥512px PNG 去背，或方形 SVG）。
2. `pnpm tauri icon <path>` → 覆蓋 `src-tauri/icons/`（含 `icon.ico`）。
3. **`icon.ico` 編譯時經 `build.rs` 嵌入 exe**，cargo 可能不偵測變更 → `touch src-tauri/build.rs` 後重編。
4. Windows 工作列仍顯示舊圖 = icon cache，重開視窗即可。

> 前端標題列 logo（`title-bar.tsx` 的 `<img>`）與 app icon 互相獨立。

---

## 已知小事

- `src/App.css` 已不再 import（改用 Tailwind），可刪。
- `.obsidian/` 已 gitignore，不追蹤。
- ⚠️ 在非空目錄執行 scaffolder 的 `--force` 會清檔，勿用（曾誤刪檔案）。
