# 執行計畫：HTML 文件瀏覽器（FileTree + 預覽 + 可調分割）

對應 `src/config/menu.ts` 的 `{ kind: "item", label: "HTML", action: "doc.html", icon: Code }`。
本計畫由 `docs/plan-markdown.md` 改寫，**大量重用** 既有 Markdown viewer 的基礎建設。

## 功能需求

1. 左側 LeftPanel：FileTree 顯示根目錄下的資料夾與 **.html / .htm** 檔。
2. 右側 RightPanel：顯示 HTML 文件（渲染後的網頁）。
3. 根目錄**預設**指向 docs（沿用 `default_docs_dir`）。
4. 點 FileTree：資料夾 → 展開/收合；HTML 檔 → 右側 panel 顯示。
5. LeftPanel / RightPanel 中間有 splitter bar，可拖曳調整左右寬度。

## 已確認決策（沿用 Markdown viewer）

| 項目 | 決定 |
|------|------|
| 進入方式 | 主視窗內切換視圖（`view-store` 加 `"html"`） |
| 根目錄 | 可選資料夾，預設帶入 docs（`default_docs_dir` + plugin-dialog） |
| 載入策略 | 一次載入整棵樹（量小 OK，日後再懶載入） |

---

## 與 Markdown viewer 的差異（核心）

| 面向 | Markdown | HTML |
|------|----------|------|
| 右側渲染 | 讀內容 → react-markdown 解析 | **iframe**，src = `convertFileSrc(path)` |
| 相對資源（CSS/img/連結） | 手動 `resolvePath` + `convertFileSrc` | **webview 自動解析**（檔案在磁碟原位載入） |
| 需要 read command | `read_markdown` | **不需要**（iframe 直接載入檔案） |
| 套件 | react-markdown / gfm / highlight | **無新增**（原生 iframe） |

> 結論：HTML viewer **比 Markdown 更簡單**——不需讀檔內容、不需解析相對路徑、不需額外套件，靠 asset protocol（已啟用）+ iframe 即可。

---

## 重用既有資產（無需重做）

- `asset protocol`（`tauri.conf.json` 已啟用 + `protocol-asset` feature + scope `["**"]`）
- `tauri-plugin-dialog` + `dialog:allow-open`（已加）
- `default_docs_dir` Rust command（已實作）
- `FileTree` 元件（已是泛型，接 `FileNode` 樹，icon 用 FileText——HTML 也可沿用，或換 icon，見待確認③）
- `ResizablePanelGroup` 版面、`view-store`、`lib/tauri.ts` 的 Result 型別與封裝模式

---

## 變更項目

### 1. Rust：泛化 `list_dir`（`src-tauri/src/lib.rs`）
目前 `list_dir` 寫死過濾 `.md`。改為接受副檔名清單，Markdown / HTML 共用：

```rust
/// 是否符合指定副檔名清單（不分大小寫）。
fn has_ext(path: &Path, exts: &[String]) -> bool {
    match path.extension().and_then(|e| e.to_str()) {
        Some(ext) => {
            let ext = ext.to_lowercase();
            exts.iter().any(|e| e == &ext)
        }
        None => false,
    }
}

fn build_tree(path: &Path, exts: &[String]) -> std::io::Result<FileNode> {
    // ...同原本，過濾條件改成 child.is_dir() || has_ext(&child, exts)
    // 遞迴傳入 exts
}

/// 讀取目錄樹（只含資料夾與指定副檔名檔案）。
#[tauri::command]
fn list_dir(root: String, exts: Vec<String>) -> Result<FileNode, String> {
    let path = Path::new(&root);
    if !path.is_dir() {
        return Err(format!("不是有效的資料夾：{root}"));
    }
    build_tree(path, &exts).map_err(|e| e.to_string())
}
```

> `read_markdown`、`default_docs_dir`、handler 註冊維持不變；**不需** `read_html`。

### 2. 前端 IPC（`src/lib/tauri.ts`）
`listDir` 加 `exts` 參數；新增副檔名常數：

```ts
export const MARKDOWN_EXTS = ["md", "markdown"];
export const HTML_EXTS = ["html", "htm"];

export async function listDir(
  root: string,
  exts: string[],
): Promise<Result<FileNode>> {
  try {
    return { data: await invoke<FileNode>("list_dir", { root, exts }), error: null };
  } catch (e) {
    return { data: null, error: toError(e) };
  }
}
```
> 連帶更新 `markdown-view.tsx` 的呼叫：`listDir(dir, MARKDOWN_EXTS)`。

### 3. 視圖切換（`src/lib/view-store.ts`）
```ts
export type View = "home" | "markdown" | "html";
```

### 4. 新元件 `src/components/html/`
- **`html-panel.tsx`**：iframe 預覽。
  ```tsx
  import { convertFileSrc } from "@tauri-apps/api/core";

  export function HtmlPanel({ path }: { path: string | null }) {
    if (!path) {
      return (
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          從左側選擇一個 HTML 檔
        </div>
      );
    }
    return (
      <iframe
        src={convertFileSrc(path)}
        title="HTML preview"
        className="h-full w-full border-0 bg-white"
        sandbox="allow-same-origin"   // 預設不允許 scripts，見待確認②
      />
    );
  }
  ```
- **`html-view.tsx`**：複製 `markdown-view.tsx` 改三處——
  1. `listDir(dir, HTML_EXTS)`
  2. 右側改放 `<HtmlPanel path={selectedPath} />`（HTML 不需 onNavigate；iframe 內部連結由 webview 處理）
  3. 返回鈕 `setView("home")` 不變

  其餘（工具列、開啟資料夾、ResizablePanelGroup、FileTree）與 markdown-view 幾乎相同。
  > 若想避免兩份 view 重複，可抽一個共用 `<DocBrowser exts=... renderPreview=... />`，見待確認④。

### 5. 接線
- `App.tsx`：`view === "html" ? <HtmlView /> : ...`
- `menu-actions.ts`：`"doc.html": () => setView("html")`

---

## 實作步驟

1. Rust：`list_dir` 泛化（加 `exts`、`has_ext`、`build_tree` 傳參），`cargo check`。
2. `lib/tauri.ts`：`listDir(root, exts)` + 常數；更新 markdown-view 呼叫。
3. `view-store.ts`：View 加 `"html"`。
4. 建 `components/html/html-panel.tsx`、`html-view.tsx`。
5. `App.tsx` 接 `HtmlView`；`menu-actions.ts` 接 `doc.html`。
6. `pnpm build` + `cargo check`；`pnpm tauri dev` 目視（點「文件 → HTML」選 .html 檔）。

---

## 待確認 / 風險

- **① `list_dir` 泛化 vs 新命令**：建議泛化（DRY，需順手改 markdown 呼叫）。若不想動既有 markdown，改加 `list_dir_ext` 亦可。
- **② iframe sandbox 等級**：
  - `allow-same-origin`（建議預設）：能載入相對 CSS/圖片，但**停用 JS**——純文件預覽、最安全。
  - 加 `allow-scripts`：HTML 內 JS 可執行（互動頁面需要），但風險較高。是否需要？
- **③ FileTree icon**：HTML 檔沿用 `FileText`，或改用 `Code` / `FileCode` 區隔？（FileTree 目前 icon 寫死，泛化需加參數。）
- **④ 是否抽共用 DocBrowser**：markdown-view 與 html-view 結構高度重疊。先各自獨立（簡單），或一開始就抽共用元件（少重複，多一層抽象）。建議先獨立，待第三種文件出現再抽（YAGNI）。

## YAGNI 延伸

- iframe 內外部連結改走系統瀏覽器（攔截 `target=_blank`）。
- HTML 內容安全：若來源不可信，加 DOMPurify + 內嵌渲染取代 iframe。
- 與 Markdown viewer 統一成單一「文件瀏覽器」含格式切換。
