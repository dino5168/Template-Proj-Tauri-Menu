# src/components/doc/ — 共用文件瀏覽器（Markdown / HTML）

> `DocBrowser` 是 Markdown 與 HTML 兩個 viewer 的**共用殼**。`components/markdown/` 與 `components/html/` 只是注入差異的薄殼，邏輯都在這裡。**新增第三種瀏覽器時重用此殼，勿另起爐灶。**

## 結構

- `doc-browser.tsx`：工具列（返回 / 開啟資料夾 / 顯示根路徑）+ shadcn `resizable` 分割（`FileTree` | 預覽）。狀態：root / tree / selectedPath / error。
- `file-tree.tsx`：泛型檔案樹，資料夾可展開、檔案可點選，吃 `fileIcon` prop。

## 差異以 props 注入（DocBrowserProps）

| prop | Markdown | HTML |
| --- | --- | --- |
| `exts` | `MARKDOWN_EXTS` | `HTML_EXTS` |
| `defaultSubdir` | `"docs"` | `"htmls"` |
| `fileIcon` | `FileText` | `FileCode` |
| `renderPreview` | `<MarkdownPanel>` | `<HtmlPanel>` |

→ 加新 viewer：在 `components/<type>/` 寫一個薄殼 view（仿 `markdown-view.tsx`），把上述四個 prop 餵給 `DocBrowser` 即可。預覽元件自行處理渲染。

## 行為要點

- 啟動時用 `defaultDir(defaultSubdir)` 嘗試自動載入預設目錄（Rust 端解析，見 `src-tauri/CLAUDE.md` 的 `default_dir`）；找不到才要使用者手選。
- `renderPreview(path, navigate)`：`navigate` 供「樹內導航」（Markdown 點相對 .md 連結會用；HTML 用不到可忽略）。
- 檔案路徑都是**絕對路徑**（Rust `list_dir` 回傳）。
- 「返回」鈕呼叫 `setView("home")`。

## 預覽元件慣例（在 markdown/ 與 html/）

- `MarkdownPanel`：react-markdown + remark-gfm + rehype-highlight；相對圖片走 `convertFileSrc`、相對 .md 連結走樹內導航、外部連結走 `openUrl`。
- `HtmlPanel`：iframe + `convertFileSrc`（asset protocol），`sandbox="allow-same-origin allow-scripts"`，`key={path}` 確保換檔重載。
- 兩者皆依賴 asset protocol（設定在 tauri.conf.json，非 capability）。
