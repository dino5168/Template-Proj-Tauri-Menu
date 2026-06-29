# src/lib/ — 核心邏輯層（IPC / 狀態 / 主題）

> 此目錄是「非 UI 的邏輯」集中地。元件應透過這裡的封裝取用後端與全域狀態，**不要**在元件裡散落 raw `invoke` / 自建 store。

## 各檔職責

| 檔 | 職責 | 關鍵慣例 |
| --- | --- | --- |
| `tauri.ts` | IPC 封裝層 | 所有 Rust command 在此包成 `Result<T>`；元件只 import 這裡的函式 |
| `view-store.ts` | 主視圖切換 | `useSyncExternalStore` 極輕量 store；`setView()`（非 React）/ `useView()`（元件） |
| `theme.ts` | 亮/暗主題 | 切 `<html>.dark` + localStorage；無 React context |
| `menu-actions.ts` | 選單 action dispatch | `Record<MenuActionId, () => void>`；與 `config/menu.ts` 配對（見 `src/config/CLAUDE.md`） |
| `editor-store.ts` | editor 視圖狀態中樞 | 文件來源（`openDocument`/`newDocument`/`useEditorDocument`，`docId` 驅動 remount）+ 存檔取值橋接（`setActiveEditor`/`getActiveEditor`）；細節見 `src/components/editor/CLAUDE.md` |
| `workdir-store.ts` | 工作目錄設定 | localStorage 持久化（`getWorkdir`/`setWorkdir`），由 `settings.workdir` 設定、編輯器開檔／存檔對話框拿來當預設起始路徑；無 UI 訂閱故不走 `useSyncExternalStore` |
| `utils.ts` | `cn()` | className 合併 |

## tauri.ts — IPC 封裝鐵則

- 回傳一律用 Result type：`{ data; error: null } | { data: null; error: Error }`。**不在元件 try/catch raw invoke。**
- 新增後端 command 時，在此加一個對應 async 函式（仿 `listDir` / `readMarkdown`），用 `toError()` 收斂例外。
- 介面型別（如 `FileNode`）對齊 Rust 的 `#[serde(rename_all = "camelCase")]`，**用 camelCase**。
- 常用副檔名清單（`MARKDOWN_EXTS` / `HTML_EXTS`）也放這裡，供 `DocBrowser` 傳給 `listDir`。

## view-store.ts — 加一個視圖怎麼做

1. 擴充 `View` union（如已加入 `"editor"`）。
2. menu action 裡 `setView("xxx")`。
3. `App.tsx` 加對應分支渲染。
- store 故意不引入 zustand 等；保持 `useSyncExternalStore` 模式，**勿換套件**。

## theme.ts 注意

- `initTheme()` 必須在 `main.tsx` render **之前**呼叫，否則閃白（FOUC）。
- 未選過主題時跟隨系統 `prefers-color-scheme`；選過則 localStorage 持久化。
- 任何要跟隨主題的顏色都走 CSS variable（見 `src/index.css`），不要寫死色碼。
