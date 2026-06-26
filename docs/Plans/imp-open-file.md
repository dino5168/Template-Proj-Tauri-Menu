# 實作計畫：開啟檔案（開啟既有 Markdown 到編輯器）

> 來源任務：`docs/Tasks/open-file.md`（實際路徑 `docs/Plans/open-file.md` 內的任務描述）
> 對應選單項目（已存在於 `src/config/menu.ts`）：
> `{ kind: "item", label: "開啟…", action: "file.open", icon: FolderOpen, shortcut: "Ctrl+O" }`
> 相依既有功能：開新檔案編輯器（`docs/Plans/imp-plan-newfile.md`）、儲存檔案（`docs/Plans/Save-file.md`）。

---

## 1. 目標

使用者點「檔案 → 開啟…」(`file.open`)：

1. 跳系統**檔案選取對話框**（限 Markdown 副檔名）。
2. 選定檔案 → 讀取內容 → 載入到**既有的 Live Preview 編輯器**（重用 `file.new` 的 `MarkdownEditorView`，**不另造編輯器**）。
3. 使用者編修後，用**既有「儲存檔案」**(`file.save`) 存回——理想上直接覆蓋原檔（已知路徑），不必再選路徑。

> 一句話：`file.open` = 選檔 + 讀檔 + 把內容與路徑灌進 editor 視圖；編輯與存檔完全重用既有兩條功能。

## 2. 現況與核心難點

| 現況 | 影響 |
| --- | --- |
| `file.open` handler 為 `// TODO`（`menu-actions.ts`） | 需實作選檔 + 讀檔 + 切視圖 |
| `MarkdownEditorView` 寫死 `defaultValue={INITIAL_DOC}` 常數 | 開檔內容無處可進；需把「要開的文件」灌進編輯器 |
| `MarkdownEditor` 的 effect deps 故意為空，**不因 `defaultValue` 變更而重建** | 已在 editor 視圖時再開新檔，光改 prop **不會**更新內容；需以 `key` 強制 remount |
| `editor-store.ts` 目前只存「`getMarkdown` 橋接」 | 需擴充為「編輯器文件來源」：持有 content / path / docId |
| `readMarkdown(path)`（`tauri.ts`）、`dialog:allow-open`（capabilities）、`open()`（plugin-dialog）皆已存在 | 讀檔與選檔**無需新增**後端 command 或權限 |

**核心難點 = 把「開啟的文件」送進一個「不隨 prop 重建」的編輯器，且要能在已處於 editor 視圖時換檔。**
解法：用 **editor-store 持有當前文件（content + path + 單調遞增 docId）**，`MarkdownEditorView` 訂閱之，並以 `key={docId}` 強制 `MarkdownEditor` remount 載入新內容。

## 3. 設計決策

| 項目 | 決策 | 理由 |
| --- | --- | --- |
| 編輯器 | **重用 `MarkdownEditorView` / `MarkdownEditor`** | 任務明示「不要重複造輪子」 |
| 選檔 | `plugin-dialog` 的 `open({ filters: md })`，單選 | 與 `DocBrowser.pickFolder` 同套件；`dialog:allow-open` 已具備 |
| 讀檔 | 重用 `readMarkdown(path)`（Result type） | 已存在，無需新後端 |
| 內容注入 | editor-store 持文件 + `key={docId}` 強制 remount | 繞過「editor 不隨 defaultValue 重建」的刻意設計，且不破壞該設計 |
| 開檔後存檔 | editor-store 記住 `path`；**`file.save` 有 path 時直接覆蓋、無 path 時走 save dialog** | 自然串接「開啟→編修→儲存」；屬 `Save-file.md` §9 既列的延伸，非重造 |
| `file.new` | 改為也經 editor-store（path=null、給新檔模板） | 與開檔走同一條注入路徑，邏輯統一 |

## 4. 架構整合（沿用既有模式，不另起爐灶）

1. **Data-driven menu**：`file.open` 的型別與 config 項目已存在，只補 handler。
2. **editor-store 橋接**（`view-store` 風格的 `useSyncExternalStore`）：由「只存 getMarkdown」擴充為「編輯器狀態中樞」（文件來源 + getMarkdown 註冊 + 當前路徑）。
3. **IPC 封裝**：選檔走 `plugin-dialog`、讀檔走既有 `readMarkdown`，皆經 `tauri.ts` 慣例，不在元件散落 raw invoke。
4. **儲存**：重用 `file.save`，僅擴充「有已知路徑就覆蓋」。

## 5. 檔案變更清單

### 修改

| 檔案 | 變更 |
| --- | --- |
| `src/lib/editor-store.ts` | 擴充：新增「當前文件」狀態 `{ content, path, docId }` + `openDocument(content, path)` / `newDocument(template)` / `setCurrentPath(path)` / `useEditorDocument()`（`useSyncExternalStore`）。保留既有 `setActiveEditor` / `getActiveEditor` / `clearActiveEditor` |
| `src/lib/menu-actions.ts` | `file.open`：選檔 → `readMarkdown` → `openDocument(content, path)` → `setView("editor")`；`file.new`：改為 `newDocument(NEW_DOC_TEMPLATE)` + `setView("editor")`；`file.save`：有 `path` 直接 `writeFile(path)`、無則維持 save dialog（成功後 `setCurrentPath`） |
| `src/components/editor/markdown-editor-view.tsx` | 改用 `useEditorDocument()` 取得 `{ content, docId }`，把 `content` 當 `defaultValue`、`docId` 當 `MarkdownEditor` 的 `key`（強制換檔 remount）。`INITIAL_DOC` 模板移為 `newDocument` 的預設來源（常數可移到 store 或保留於此 export 給 menu-actions 用） |

### 不新增 / 不更動

- **不新增 Rust command**：讀檔 `read_markdown`、寫檔 `write_file` 皆已存在。
- **不改 capabilities**：`dialog:allow-open` + `dialog:allow-save` 已具備。
- `markdown-editor.tsx` 不需改（已能吃 `defaultValue` 並可被 `key` remount）。

## 6. editor-store 擴充設計

```
狀態：let current = { content: string; path: string | null; docId: number }

openDocument(content, path):   docId++  → 設 { content, path, docId } → notify
newDocument(template):         docId++  → 設 { content: template, path: null, docId } → notify
setCurrentPath(path):          就地更新 path（save-as 後回填），不動 docId/content
useEditorDocument():           useSyncExternalStore → { content, path, docId }
getCurrentPath():              current.path（供 file.save 判斷覆蓋 vs 另存）

（既有）setActiveEditor / getActiveEditor / clearActiveEditor 保留不動
```

- `docId` 單調遞增，作為 `MarkdownEditor` 的 `key`：**每次開檔/開新檔都換 key → 強制 remount** → Crepe 以新 `defaultValue` 重建。重用同一檔再開亦遞增（使用者預期「重新開啟會還原」）。
- `content` 只作初始值（Crepe 之後由內部維護），與 `markdown-editor.tsx`「不隨 defaultValue 重建」的設計相容——換內容靠換 key，不靠改 prop。

## 7. file.open / file.save handler 流程（`menu-actions.ts`）

```
file.open:
  1. path = await open({ filters: [{ name: "Markdown", extensions: MARKDOWN_EXTS }],
                         multiple: false, directory: false });
     path 非 string（取消）→ return。
  2. const { data, error } = await readMarkdown(path);
     error → console.error 提示後 return（不切視圖）。
  3. openDocument(data, path);
  4. setView("editor");

file.save（擴充）:
  1. getMarkdown = getActiveEditor(); 無 → return。
  2. md = getMarkdown();
  3. path = getCurrentPath();
     - path 存在 → await writeFile(path, md)（直接覆蓋，不跳 dialog）。
     - path 為 null → 維持現行 save dialog（H1 預設檔名）；成功後 setCurrentPath(chosenPath)。
```

- `open()`／`save()` 皆來自 `@tauri-apps/plugin-dialog`（已安裝）。
- handler 仍維持 `Record<MenuActionId, () => void>` 形態，async 以 `void asyncFn()` 包裹（同 `file.save` 現行）。

## 8. 分階段實作步驟

1. **editor-store 擴充**：加文件狀態 + `openDocument` / `newDocument` / `setCurrentPath` / `getCurrentPath` / `useEditorDocument`，保留橋接 API。
2. **view 接線**：`markdown-editor-view.tsx` 改用 `useEditorDocument()`，`key={docId}` + `defaultValue={content}`。先用 `newDocument` 驗證 `file.new` 仍正常。
3. **file.open**：實作選檔 + 讀檔 + `openDocument` + `setView`。驗證能開既有 `docs/*.md`。
4. **file.save 覆蓋**：接 `getCurrentPath`，開檔→編修→存檔走直接覆蓋；新檔→存檔走 dialog 並回填 path。
5. **驗證**：`pnpm build`（tsc + vite）＋ `cargo check`（確認未誤動 Rust）。
6. **手動驗收**：見 §10。
7. **收尾**：Google 風格 docstring；更新 `src/components/editor/CLAUDE.md`（開檔/重用、docId remount、覆蓋存檔）與必要時 `src/lib/CLAUDE.md`（editor-store 職責）。

## 9. 非本次範圍 / 未來延伸

- **未存變更保護**：開檔/開新檔/關閉前若有未存編輯，提示確認（dirty flag）。本版不做。
- **與 DocBrowser 串接**：Markdown 瀏覽器「在編輯器開啟此檔」按鈕（共用 `openDocument`）。
- **最近開啟清單**、編碼偵測（目前固定 UTF-8，非 UTF-8 會在 `read_markdown` 回 Err）。
- **真正的 Ctrl+O / Ctrl+S 快捷鍵**（menu shortcut 目前僅顯示用）。

## 10. 驗收標準

- 「檔案 → 開啟…」跳出 Markdown 檔選取對話框；取消則無動作。
- 選定檔案後切到編輯器視圖，內容為該檔內容並可 Live Preview 編修。
- 已在編輯器時再「開啟…」另一檔，內容正確替換（remount 生效，非殘留前一檔）。
- 編修後「儲存檔案」直接覆蓋原檔（不跳另存對話框）；內容與編輯器一致（UTF-8）。
- 讀檔失敗（路徑無效/非 UTF-8）以 Result error 收斂，不 untyped throw、不中斷應用。
- 「開新檔案」仍正常（新檔模板、存檔走 save dialog）。
- `pnpm build` 與 `cargo check` 皆通過。

## 11. 主要風險

- **remount 時機**：`key={docId}` 必須真的觸發 `MarkdownEditor` 卸載→重建；Crepe 的 async `create/destroy` cleanup 已處理，但需驗證快速連續開檔不殘留舊實例。
- **editor-store 雙重職責**：文件來源 + getMarkdown 橋接放同一檔，需註解清楚兩者關係，避免後續誤改。
- **save 的覆蓋語意**：開檔後存檔「直接覆蓋」是刻意行為（符合一般編輯器預期）；需確保 `getCurrentPath` 在離開 editor 視圖/開新檔後正確歸零，避免存錯檔。
- 編碼：非 UTF-8 檔讀取會失敗（既有 `read_markdown` 限制），本版以錯誤提示處理，不擴充編碼偵測。
```
