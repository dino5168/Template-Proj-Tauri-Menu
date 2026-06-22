# 執行計畫：Markdown 文件瀏覽器（FileTree + 預覽 + 可調分割）

依據 `docs/Plans/fn-menu-makdown.md` 的功能需求。

## 功能需求（原始）

1. 左側 LeftPanel：FileTree 顯示根目錄下的資料夾與檔案。
2. 右側 RightPanel：顯示 markdown 文件。
3. markdown 根目錄**預設**指向 `D:\MyProject\Template-Proj-Tauri-Menu\docs`。
4. 點 FileTree：資料夾 → 展開/收合；markdown 檔 → 右側 panel 顯示。
5. LeftPanel / RightPanel 中間有 splitter bar，可拖曳調整左右寬度。

## 已確認決策（與使用者）

| 項目 | 決定 |
|------|------|
| 進入方式 | **主視窗內切換視圖**（保留標題列/選單，切換 `<main>` 內容） |
| 根目錄 | **可選資料夾**：提供「開啟資料夾」，預設帶入 `docs`；發佈後路徑可由使用者重選 |
| 渲染功能 | **完整**：GFM（表格/任務清單/刪除線）+ 程式碼 highlight + 圖片與相對連結 |

---

## 架構總覽

```
menu「文件 → Markdown」
        │ doc.markdown action
        ▼
  view-store.setView("markdown")          ← 模組級 store（useSyncExternalStore）
        │
        ▼
  App 依 view 切換 <main> → <MarkdownView/>
        │
        ▼
  <MarkdownView>
   ├─ ResizablePanelGroup（shadcn resizable = react-resizable-panels）
   │   ├─ LeftPanel  : <FileTree/>      ← 由 Rust list_dir 取樹
   │   ├─ ResizableHandle (splitter)
   │   └─ RightPanel : <MarkdownPanel/> ← 由 Rust read_markdown 取內容後 react-markdown 渲染
   └─ 工具列：開啟資料夾（plugin-dialog）/ 目前根目錄

IPC（src/lib/tauri.ts，回傳 Result type）
   list_dir(root)      → FileNode 樹
   read_markdown(path) → string
```

---

## 相依套件

**前端**
```powershell
pnpm add react-markdown remark-gfm rehype-highlight highlight.js
pnpm add @tauri-apps/plugin-dialog        # 選資料夾
pnpm dlx shadcn@latest add resizable -y    # splitter（react-resizable-panels）
```

**Rust（`src-tauri`）**
```powershell
cargo add tauri-plugin-dialog
# list_dir / read_markdown 用 std::fs 即可，無需額外 crate
```

> 為何 fs 用**自訂 Rust command** 而非 `plugin-fs`：根目錄是使用者執行期任選的任意路徑，`plugin-fs` 的 scope 是靜態 glob，難涵蓋任意路徑；自訂 command 由 Rust 全權控制、回傳型別化資料，且符合本專案 IPC 慣例。

---

## 後端：Rust commands（`src-tauri/src/lib.rs`）

```rust
use std::path::Path;
use serde::Serialize;

#[derive(Serialize)]
struct FileNode {
    name: String,
    path: String,            // 絕對路徑，前端點擊時回傳給 read_markdown
    is_dir: bool,
    children: Option<Vec<FileNode>>, // dir 才有；file 為 None
}

/// 遞迴讀取目錄樹。只保留資料夾與 .md 檔，資料夾在前、依名稱排序。
#[tauri::command]
fn list_dir(root: String) -> Result<FileNode, String> {
    fn build(path: &Path) -> Result<FileNode, String> {
        // 讀 entries → 過濾（dir 或 .md）→ 排序（dir 優先, 名稱）→ 遞迴
        // 錯誤一律 map_err 成 String 回傳
        todo!()
    }
    build(Path::new(&root)).map_err(|e| e.to_string())
}

/// 讀取單一 markdown 檔內容（UTF-8）。
#[tauri::command]
fn read_markdown(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}
```

註冊：
```rust
tauri::Builder::default()
    .plugin(tauri_plugin_opener::init())
    .plugin(tauri_plugin_dialog::init())
    .invoke_handler(tauri::generate_handler![greet, list_dir, read_markdown])
    // ...
```

> **路徑過濾**：預設樹只顯示資料夾 + `.md`（純 markdown 瀏覽器）。若要顯示所有檔案（非 md 不可開），把過濾條件放寬即可——列為「待確認 ①」。

---

## 設定變更

### `src-tauri/tauri.conf.json` — 啟用 asset protocol（顯示本機圖片）
```jsonc
"app": {
  "security": {
    "csp": null,
    "assetProtocol": {
      "enable": true,
      "scope": ["**"]        // 任意根目錄 → 需較寬 scope；見下方安全註
    }
  }
}
```

### `src-tauri/capabilities/default.json` — 權限
```jsonc
"permissions": [
  // ...既有...
  "dialog:allow-open",
  "core:asset:default"
]
```

> **安全註**：`assetProtocol.scope: ["**"]` 等於允許 webview 透過 asset 協議讀任意檔。對「本機文件瀏覽器」可接受；若要收斂，改方案 B（圖片走 Rust command 轉 base64 data URI，完全不開 asset protocol）——列為「待確認 ②」。

---

## 前端模組

### 1. 視圖切換 `src/lib/view-store.ts`
模組級 store（不引入狀態管理套件），供 menu action 寫、App 讀：
```ts
import { useSyncExternalStore } from "react";

export type View = "home" | "markdown";
let current: View = "home";
const listeners = new Set<() => void>();

export function setView(v: View): void {
  current = v;
  listeners.forEach((l) => l());
}
export function useView(): View {
  return useSyncExternalStore(
    (cb) => (listeners.add(cb), () => listeners.delete(cb)),
    () => current,
  );
}
```

### 2. IPC 封裝 `src/lib/tauri.ts`（Result type，依 CLAUDE.md 慣例）
```ts
import { invoke } from "@tauri-apps/api/core";

export interface FileNode {
  name: string;
  path: string;
  isDir: boolean;
  children?: FileNode[];
}
type Result<T> = { data: T; error: null } | { data: null; error: Error };

export async function listDir(root: string): Promise<Result<FileNode>> {
  try {
    return { data: await invoke<FileNode>("list_dir", { root }), error: null };
  } catch (e) {
    return { data: null, error: e instanceof Error ? e : new Error(String(e)) };
  }
}
export async function readMarkdown(path: string): Promise<Result<string>> { /* 同上 */ }
```
> 注意 Rust `is_dir`（snake）↔ 前端 `isDir`（camel）：Tauri 預設不轉換，故 Rust struct 加 `#[serde(rename_all = "camelCase")]`，或前端型別用 snake。計畫採 Rust 端 `camelCase`。

### 3. 元件（`src/components/markdown/`）
- **`markdown-view.tsx`**：頁面容器。工具列（開啟資料夾鈕 + 顯示目前根）+ `ResizablePanelGroup`。
  - 狀態：`root`（預設由 Rust 提供或先以 `view.theme` 同模式硬帶 docs，見待確認③）、`tree`、`selectedPath`。
  - 「開啟資料夾」：`@tauri-apps/plugin-dialog` 的 `open({ directory: true })` → 設 root → `listDir`。
- **`file-tree.tsx`**：遞迴渲染 `FileNode`。資料夾用本地 `expanded` state 控展開（icon `Folder`/`FolderOpen` + `ChevronRight`）；md 檔點擊 → `onSelect(path)`。selected 高亮。
- **`markdown-panel.tsx`**：收到 `path` → `readMarkdown` → `react-markdown`（`remark-gfm` + `rehype-highlight`）。
  - 圖片：自訂 `img` component，相對 src → `convertFileSrc(resolveRelative(currentFileDir, src))`（`@tauri-apps/api/core` 的 `convertFileSrc`）。
  - 相對 `.md` 連結：自訂 `a` component，攔截相對連結 → 改呼叫 `onSelect`（樹內導航）而非開瀏覽器。
  - highlight：import 一個 highlight.js theme CSS（如 `highlight.js/styles/github.css` / dark 版二選一，配合主題）。

### 4. 接線 `App.tsx`
```tsx
const view = useView();
// <main> 內：view === "markdown" ? <MarkdownView/> : <既有首頁/>
```
（提供返回首頁的方式：標題列加返回鈕，或文件選單再加一個「首頁」action。）

### 5. menu action `src/lib/menu-actions.ts`
```ts
import { setView } from "@/lib/view-store";
// ...
"doc.markdown": () => setView("markdown"),
```
（`doc.html` 視需要比照，本計畫聚焦 markdown。）

---

## 實作步驟（建議順序）

1. 後端：加 `tauri-plugin-dialog`、實作 `list_dir` / `read_markdown`、註冊 handler（Rust struct 用 `camelCase`）。
2. 前端裝套件：react-markdown / remark-gfm / rehype-highlight / highlight.js / plugin-dialog；`shadcn add resizable`。
3. 設定：`tauri.conf.json` assetProtocol、`capabilities` 加 `dialog:allow-open` + `core:asset:default`。
4. 建 `lib/view-store.ts`、`lib/tauri.ts`。
5. 建 `components/markdown/`：file-tree → markdown-panel → markdown-view。
6. `App.tsx` 接 `useView` 切換；menu action 接 `setView("markdown")`。
7. `pnpm build` 驗證型別；`cargo check` 驗證 commands/權限；`pnpm tauri dev` 目視（含圖片/表格/highlight/拖曳分割）。

---

## 待確認 / 風險

- **① FileTree 顯示範圍**：只顯示資料夾 + `.md`（建議），或顯示所有檔案（非 md 不可開）？
- **② 圖片方案**：asset protocol（`scope: ["**"]`，較寬）vs Rust 轉 base64 data URI（較嚴、無需開 asset）。建議前者，簡單。
- **③ 預設根目錄取得**：硬帶開發機絕對路徑 `D:\...\docs`（發佈即失效）→ 建議改為「啟動時嘗試相對於 app 的 `docs`，找不到就空白等使用者選」。需確認預設行為。
- **④ 大型目錄效能**：目前一次遞迴載入整棵樹（docs 量小 OK）；若日後目錄龐大，改為展開時懶載入子層。

## YAGNI 延伸（需要再做）

- 檔案變更即時刷新（`tauri-plugin-fs` watch / notify）。
- 文件搜尋、目錄內全文檢索。
- Markdown 內 `[[wikilink]]`、目錄大綱（TOC）、Mermaid 圖。
- `doc.html` 比照做一個 HTML 預覽（iframe sandbox 或 sanitize 後 render）。
