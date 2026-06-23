# 實作計畫：開新檔案（Obsidian 式 Live Preview Markdown 編輯器）

> 來源任務：`docs/Tasks/NewFile.md`
> 對應選單項目（已存在於 `src/config/menu.ts`）：
> `{ kind: "item", label: "開新檔案", action: "file.new", icon: FilePlus, shortcut: "Ctrl+N" }`

---

## 1. 目標

使用者點選「檔案 → 開新檔案」(`file.new`) 後，主視圖切換到一個**可即時編輯的 Markdown 編輯器**，體驗類似 Obsidian 的 **Live Preview**：在同一個面板邊打字邊原地渲染（標題、清單、粗斜體、程式碼塊等即時呈現），游標附近視情況顯示原始語法標記。

## 2. 使用者已確認的決策

| 項目 | 決策 | 影響 |
| --- | --- | --- |
| 版面 | **Live Preview（單面板即時渲染）** | 不能用 `textarea` + 右側預覽分割；需 WYSIWYG / ProseMirror 類編輯器 |
| 存檔 | **先做純編輯，暫不存檔** | 本次**不**新增 Rust `write_file` command；內容存記憶體 |
| 編輯體驗 | **工具列快捷鈕** + **Tab / 自動清單等鍵盤輔助** | 需要可程式化下指令的編輯器（非純文字框） |

> 「單面板即時渲染」+「工具列下格式指令」+「自動清單」三者共同決定：底層必須是一個**結構化（document-model）編輯器**，純 `textarea` 無法原地渲染，故排除沿用 `MarkdownPanel` 做分割預覽的方案。

## 3. 技術選型：編輯器函式庫

### 推薦：Milkdown（`@milkdown/crepe` 預設）

- 基於 **ProseMirror**，`Crepe` 預設開箱即是 **Obsidian 式 Live Preview**（WYSIWYG 並在游標附近顯示 Markdown 標記）。
- 內建 **選取工具列**、**清單/Tab 縮排/Enter 自動延續清單**、程式碼塊、表格、GFM。→ 直接滿足決策 #3 大部分需求。
- Markdown 雙向轉換（getMarkdown / 由字串初始化），符合「Markdown 文件」語意。
- TypeScript 原生型別，`@milkdown/react` 提供 React 綁定，契合 React 19 + 嚴格 TS。

**取捨/風險**：

- 體積較大（ProseMirror 生態多個套件）。
- 自帶主題 CSS，需與 Tailwind v4 + shadcn 的明暗色變數整合（見 §6）。
- Crepe 已內建工具列；若要「自訂工具列」需評估是用 Crepe 內建還是關閉內建改用我們自己的（見 §7）。

### 替代方案（記錄取捨，預設不採用）

| 方案 | 優點 | 不採用原因 |
| --- | --- | --- |
| **CodeMirror 6 + 自訂 decorations** | 最貼近 Obsidian「原始碼+原地渲染」、可控性最高、體積較輕 | 原地渲染的 decoration 邏輯要自己寫，工作量最大 |
| **TipTap** | ProseMirror WYSIWYG、生態大 | Markdown 非原生（需 `tiptap-markdown`），偏「所見即所得」而非顯示語法標記，較不像 Obsidian Live Preview |
| **textarea + react-markdown 分割** | 最簡單、可重用既有 `MarkdownPanel` | **與決策 #1 衝突**（非單面板原地渲染），已排除 |

> 若後續希望更貼近「原始碼模式可見」，再評估切換到 CodeMirror 6 方案；介面層（view 切換、薄殼、工具列）設計成與底層編輯器解耦，降低替換成本。

## 4. 架構整合（沿用既有模式）

完全沿用 CLAUDE.md 的三個既有模式，**不另起爐灶**：

1. **Data-driven menu**：`file.new` 的 `MenuActionId` 與 config 項目皆已存在，只需補 handler。
2. **view-store 視圖切換**：新增一個 `View = "editor"`，用 `setView("editor")` 進入。
3. **薄殼 + 內容元件**：仿 `markdown-view`（薄殼）/ `markdown-panel`（內容）拆兩層，方便日後替換底層編輯器。

## 5. 檔案變更清單

### 修改

| 檔案 | 變更 |
| --- | --- |
| `src/lib/view-store.ts` | `View` union 加入 `"editor"`：`"home" \| "markdown" \| "html" \| "editor"` |
| `src/lib/menu-actions.ts` | `"file.new"` handler 由 TODO 改為 `() => setView("editor")` |
| `src/App.tsx` | `useView()` 分支新增 `view === "editor" ? <MarkdownEditorView /> : …` |
| `src/index.css` | `@import` Crepe 主題 CSS，並把主題色橋接到既有明暗 CSS 變數（§6） |
| `package.json` | 新增 milkdown 相依（§8）；如需 build script 則補 `pnpm.onlyBuiltDependencies` |

### 新增

| 檔案 | 角色 |
| --- | --- |
| `src/components/editor/markdown-editor-view.tsx` | **薄殼**：工具列容器 + 編輯器容器版面（仿 `markdown-view.tsx`） |
| `src/components/editor/markdown-editor.tsx` | 封裝 Milkdown `Crepe` 實例（建立/銷毀、初始內容、`getMarkdown()`、明暗主題） |
| `src/components/editor/editor-toolbar.tsx` | 自訂工具列：粗體/斜體/標題/清單/連結/程式碼等，呼叫編輯器指令（§7） |
| `src/lib/editor-store.ts`（選用） | 若需在工具列與編輯器間共享當前文件字串/指令，極輕量 store（仿 `view-store.ts` 的 `useSyncExternalStore`） |

> **不**修改 `src-tauri/`（無存檔、無新 IPC、無新 capability）。本次純前端。

## 6. 樣式整合（Tailwind v4 + 明暗主題）

- Crepe 提供主題 CSS（如 `@milkdown/crepe/theme/common/style.css` 與某一 theme）。於 `src/index.css` `@import`。
- 明暗切換沿用既有 `theme.ts`（切 `<html>.dark`）。需把 Crepe 主題變數對應到專案的 `--background` / `--foreground` / `--border` 等 CSS 變數，或在 `.dark` 下覆寫 Crepe 變數，確保與標題列/選單一致。
- 編輯器容器外層用既有 utility（`h-full overflow-auto bg-background text-foreground`）。內文渲染若可行，沿用 `prose dark:prose-invert` 風格基調以與 `MarkdownPanel` 視覺一致。

## 7. 工具列與鍵盤輔助對應（決策 #3）

- **Tab 縮排 / Enter 自動延續清單 / 清單**：ProseMirror（Crepe）內建，**免自寫**。驗收時確認行為符合預期即可。
- **工具列快捷鈕**：兩條路線，實作時擇一——
  - (A) **沿用 Crepe 內建選取工具列**：最省事，但樣式/項目受其約束。
  - (B) **自訂 `editor-toolbar.tsx`**：透過 Milkdown 指令 API（如 `editor.action(callCommand(toggleStrongCommand.key))` 之類）對當前選取套用格式。控制力高、可用 Lucide icon 與專案風格一致。
  - **建議**：以 (B) 自訂工具列為主（符合任務「工具列快捷鈕」與專案 icon 風格），保留 Crepe 內建清單/鍵盤行為。
- 工具列按鈕清單（初版）：粗體、斜體、刪除線、`H1/H2/H3`、無序清單、有序清單、待辦清單、引用、行內程式碼 / 程式碼塊、連結、分隔線。

## 8. 相依套件與 pnpm 注意事項

預計新增（實作時以實際 API 對版本微調）：

```
@milkdown/crepe        # Obsidian 式 Live Preview 預設（含主題）
@milkdown/kit          # core/preset/plugin 整合包（依 Crepe 需求）
@milkdown/react        # React 綁定
```

- 一律 `pnpm` 安裝。
- 依 CLAUDE.md：pnpm 10 會擋 build script；若任一新套件需 postinstall，於 `package.json` 的 `pnpm.onlyBuiltDependencies` 放行。
- 安裝後跑 `pnpm build`（tsc + vite）驗證型別與 import。

## 9. 分階段實作步驟

1. **接線（無編輯器）**：`view-store` 加 `"editor"`、`menu-actions` 接 `setView("editor")`、`App.tsx` 分支先渲染 placeholder。確認點「開新檔案」可切換到空白編輯視圖。
2. **裝編輯器**：安裝 milkdown，`markdown-editor.tsx` 掛載 Crepe，給一段初始 Markdown，確認可原地編輯/渲染。
3. **明暗主題整合**：`index.css` 匯入主題並橋接變數，切換深/淺色驗證。
4. **薄殼 + 自訂工具列**：`markdown-editor-view.tsx` 組版面，`editor-toolbar.tsx` 接格式指令。
5. **鍵盤輔助驗收**：Tab 縮排、Enter 自動清單、待辦清單勾選等。
6. **收尾**：docstring（Google 風格）、移除 placeholder、`pnpm build` 與 `cargo check`（後者僅確認未誤動 Rust）。

## 10. 非本次範圍 / 未來延伸

- **存檔（決策：暫不做）**。未來要加時的明確路徑：
  - Rust 新增 `write_file(path, contents)` command（`std::fs::write`），註冊於 `invoke_handler`。
  - 前端經 `src/lib/tauri.ts` 封裝為 Result type（仿 `readMarkdown`）。
  - 用 `plugin-dialog` 的 save dialog 選存檔路徑；標題列顯示未存檔 `*` 狀態（dirty flag）。
  - 視需要在 `Ctrl+S` 註冊實際快捷鍵（目前 menu shortcut 僅顯示用）。
- 開啟既有檔到編輯器編輯（與 `file.open` / DocBrowser 串接）。
- 圖片貼上 / 相對資源處理（沿用 `convertFileSrc` 思路）。

## 11. 驗收標準

- 「檔案 → 開新檔案」切換到編輯視圖（取代首頁/文件瀏覽器）。
- 在單一面板邊打字邊即時渲染 Markdown（標題、粗斜體、清單、程式碼塊）。
- 工具列按鈕能對選取套用格式。
- Tab 縮排與 Enter 自動延續清單可運作。
- 明暗主題切換時編輯器配色一致、無 FOUC。
- `pnpm build` 型別/建置通過；`cargo check` 不受影響。

## 12. 主要風險

- Crepe 主題與 Tailwind v4/shadcn 變數整合需調校（最可能耗時處）。
- 自訂工具列呼叫 Milkdown 指令 API 的版本差異（不同 milkdown 版本指令匯出路徑略有不同），實作時對照當版文件。
- 套件體積增加；屬可接受範圍。

