# 專案建置指南 — React + Tailwind CSS + Tauri + shadcn/ui + Lucide

> 目標：以 Vite 為核心，建立桌面應用骨架。
> 本文鎖定 **2026 當前 stable** 版本組合，特別標註 Tailwind v4 / Tauri v2 / shadcn 的配置變更點。
> 本專案已依此文建置完成（含 `decorations: false` + 自訂標題列/menubar）。

---

## 0. 版本鎖定（rationale）

| 元件 | 版本 | 為什麼 |
|------|------|--------|
| Tauri | **v2** | v2 為現行穩定版，plugin 系統、權限模型（capabilities）與 v1 不相容，文件一律以 v2 為準 |
| 建構工具 | **Vite** | Tauri 官方 React 模板即 Vite，HMR 與 shadcn 整合最順 |
| 前端 | **React 19 + TypeScript (strict)** | scaffold 預設 React 19.1；禁用 `any`，public API 標註型別 |
| 樣式 | **Tailwind CSS v4** | v4 改為 CSS-first 設定，**不再需要 `tailwind.config.js`**，透過 `@tailwindcss/vite` plugin 注入 |
| 元件 | **shadcn/ui** | 非 npm 套件，是「複製原始碼進專案」的模式，已支援 Tailwind v4 |
| Icon | **lucide-react** | 由 shadcn `nova` preset 一併安裝，tree-shakable |
| 套件管理 | **pnpm** | — |

---

## 1. 前置需求（Windows）

已具備：`rustc 1.93`、`node v22`、`pnpm 10`。仍需確認：

- **MSVC C++ Build Tools**：Tauri 編譯需要。安裝 *Visual Studio Build Tools* 並勾選「使用 C++ 的桌面開發」。
- **WebView2 Runtime**：Windows 11 已內建，無需處理。

驗證：

```powershell
rustc --version; cargo --version; node -v; pnpm -v
```

---

## 2. 建立專案骨架

```powershell
pnpm create tauri-app@latest <project-name> --template react-ts --manager pnpm --tauri-version 2
```

> ⚠️ **`--force` 慎用**：用於「在非空目錄建立」時，會**清除目錄內既有檔案**（本次建置即因此誤刪了 `setup.md` 與 `.obsidian/`）。
> 建議改在「全新空目錄」scaffold，或先把既有檔案備份到他處，再 scaffold、最後移回。

互動選項（不帶旗標時）：Frontend = TypeScript / React / TypeScript，Package manager = pnpm。

完成後：

```powershell
pnpm install
pnpm tauri dev   # 首次會編譯 Rust，較久；確認視窗能開
```

---

## 3. 導入 Tailwind CSS v4

```powershell
pnpm add tailwindcss @tailwindcss/vite
```

> v4 不需 `npx tailwindcss init`，亦無 `tailwind.config.js`。設定改在 Vite plugin 與 CSS 入口。

**`vite.config.ts`**（同時補上 Tauri 與 shadcn 必要設定）：

```ts
import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

export default defineConfig(async () => ({
  plugins: [react(), tailwindcss()],

  // shadcn/ui 路徑別名
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },

  // ↓ 以下為 Tauri 必要設定，請勿移除
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
    watch: { ignored: ["**/src-tauri/**"] }, // 避免監看 Rust 觸發整頁重載
  },
}));
```

**CSS 入口**（`src/index.css`），先寫入：

```css
@import "tailwindcss";
```

並於 `src/main.tsx` 加上 `import "./index.css";`（shadcn init 之後會再補上 theme tokens）。

---

## 4. 設定 TypeScript 路徑別名

shadcn 依賴 `@/*` 別名解析。於 **`tsconfig.json`** 的 `compilerOptions` 補上：

```jsonc
{
  "compilerOptions": {
    "strict": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

---

## 5. 初始化 shadcn/ui

> ⚠️ 新版 shadcn CLI（4.11+）旗標已變動，舊教學會踩雷：
> - `-b/--base` 改指「元件庫」(`radix` | `base`)，**不再是顏色**。
> - 顏色/字型/icon 改由 **preset** 決定；`nova` preset = **Lucide icons + Geist 字型**，正合本專案。
> - `-d` 會強制 `--template=next`，桌面 Vite 專案**不要用 `-d`**。

```powershell
pnpm dlx shadcn@latest init --template vite --base radix -p nova -y
```

`init` 會自動：建立 `components.json`、寫入 Tailwind v4 的 `@theme` / `@custom-variant dark` 變數到 `src/index.css`、建立 `src/lib/utils.ts`（含 `cn()`），並安裝 `lucide-react`、`radix-ui`、`@fontsource-variable/geist`、`tw-animate-css` 等依賴。

加入元件：

```powershell
pnpm dlx shadcn@latest add button menubar separator -y
```

元件生成於 `src/components/ui/`，可直接修改原始碼。

---

## 6. Lucide Icons

`nova` preset 已安裝 `lucide-react`。用法：

```tsx
import { Menu, Settings } from "lucide-react";

<Button variant="ghost" size="icon">
  <Menu className="h-4 w-4" />
</Button>;
```

---

## 7. 自訂標題列 + menubar（decorations: false）

### 7.1 視窗設定 `src-tauri/tauri.conf.json`

```jsonc
"app": {
  "windows": [
    {
      "title": "Template-Proj-Tauri-Menu",
      "width": 1024,
      "height": 720,
      "minWidth": 640,
      "minHeight": 480,
      "decorations": false,   // 關閉原生標題列，改用自訂
      "transparent": false,
      "resizable": true
    }
  ]
}
```

### 7.2 開啟視窗控制權限 `src-tauri/capabilities/default.json`

`decorations: false` 後，最小化/最大化/關閉/拖曳都由前端 JS 呼叫，需在 capabilities 明確授權：

```jsonc
"permissions": [
  "core:default",
  "opener:default",
  "core:window:allow-start-dragging",
  "core:window:allow-minimize",
  "core:window:allow-maximize",
  "core:window:allow-unmaximize",
  "core:window:allow-toggle-maximize",
  "core:window:allow-close",
  "core:window:allow-is-maximized"
]
```

### 7.3 元件

- `src/components/layout/window-controls.tsx`：最小化/最大化還原/關閉鈕，
  用 `getCurrentWindow()`（`@tauri-apps/api/window`）+ lucide icons，
  以 `appWindow.onResized` 同步最大化狀態切換圖示。
- `src/components/layout/title-bar.tsx`：左側自訂 App 選單（shadcn `Menubar`：檔案/編輯/檢視），
  中段為拖曳區，右側嵌入 `WindowControls`。
- **拖曳**：可拖曳區塊加 `data-tauri-drag-region`；互動元素（選單、按鈕）不加該屬性，點擊才不會被當成拖曳。

`App.tsx` 以 `flex h-screen flex-col` 包住 `<TitleBar />` 與 `<main>`。

---

## 8. 建議目錄結構

```
src/
├── components/
│   ├── ui/            # shadcn 生成（可改原始碼，勿大改檔名）
│   └── layout/        # title-bar.tsx、window-controls.tsx…
├── lib/
│   └── utils.ts       # cn()
├── main.tsx           # import "./index.css"
├── App.tsx
└── index.css          # @import "tailwindcss"; + theme tokens
src-tauri/
├── src/               # Rust commands（greet 範例）
├── capabilities/      # v2 權限設定（取代 v1 allowlist）
└── tauri.conf.json    # decorations: false
```

> **Tauri IPC 慣例**：未來 `invoke` 集中封裝於 `src/lib/tauri.ts`，回傳採 Result type
> `{ data: T; error: null } | { data: null; error: Error }`。

---

## 9. 開發工作流

```powershell
pnpm tauri dev      # 開發（前端 HMR + Rust 熱重編）
pnpm tauri build    # 打包安裝檔（.msi / .exe）
pnpm dlx shadcn@latest add <component> -y   # 隨需加元件
```

---

## 10. 常見地雷

1. **shadcn 元件報 `Cannot find module '@/...'`**
   → `vite.config.ts` 的 `resolve.alias` 與 `tsconfig.json` 的 `paths` 兩邊都要設，缺一不可。

2. **Tailwind 樣式沒生效**
   → 入口 CSS 須為 `@import "tailwindcss";`（v4 寫法），且被 `main.tsx` import；不要沿用 v3 的 `@tailwind base/components/utilities`。

3. **視窗控制鈕點了沒反應 / 報權限錯誤**
   → `capabilities/default.json` 缺對應的 `core:window:allow-*`（見 7.2）。

4. **自訂標題列無法拖曳視窗**
   → 拖曳區缺 `data-tauri-drag-region`，或缺 `core:window:allow-start-dragging` 權限。

5. **pnpm 10 安裝後 esbuild 未生效**
   → build script 被預設擋下。於 `package.json` 加
   `"pnpm": { "onlyBuiltDependencies": ["esbuild"] }` 後重新 `pnpm install`。

6. **`pnpm create tauri-app` 報 `not a terminal`**
   → 目錄非空時 CLI 想互動詢問。**勿用 `--force`（會刪檔）**；改用空目錄，或備份既有檔後再 scaffold。

7. **Rust 編譯失敗找不到 linker**
   → 未裝 MSVC C++ Build Tools，回到第 1 節。

---

## 11. 建置順序總覽（TL;DR）

```text
1. pnpm create tauri-app@latest <name> --template react-ts --manager pnpm --tauri-version 2
2. pnpm add tailwindcss @tailwindcss/vite
3. 改 vite.config.ts（plugin + alias + Tauri server）
4. src/index.css → @import "tailwindcss";  + main.tsx import
5. tsconfig.json 加 baseUrl + paths
6. pnpm dlx shadcn@latest init --template vite --base radix -p nova -y
7. pnpm dlx shadcn@latest add button menubar separator -y
8. tauri.conf.json → decorations:false；capabilities 加 window 權限
9. 建 layout/title-bar.tsx、layout/window-controls.tsx，接進 App.tsx
10. pnpm tauri dev
```
