# src/components/editor/ — Markdown 編輯器（開新檔案 / 開啟檔案 / Live Preview）

> editor 視圖的主畫面：`file.new`（新檔模板）與 `file.open`（開既有檔）皆切到此。Obsidian 式 Live Preview，底層為 **milkdown Crepe**（ProseMirror）。設計見 `docs/Plans/imp-plan-newfile.md`、`docs/Plans/imp-open-file.md`、`docs/Plans/Save-file.md`。

## 檔案與資料流

```
markdown-editor-view.tsx  殼：EditorToolbar + MarkdownEditor，持 ref
   ├─ editor-toolbar.tsx   presentational：data-driven 按鈕 → onCommand(id)
   └─ markdown-editor.tsx  封裝 Crepe；forwardRef 暴露 { run(id), getMarkdown() }
```

工具列點擊 → `view` 透過 ref 呼叫 `editor.run(id)` → `markdown-editor.tsx` 的 `commandRunners[id]` → `crepe.editor.action(callCommand(key, payload))`。

## 加一個格式按鈕（兩步）

1. `markdown-editor.tsx`：在 `EditorCommandId` union 加 id，並在 `commandRunners` 補一筆（用 `action(c, someCommand.key, payload?)`）。指令 key 來自 `@milkdown/kit/preset/commonmark`（或 `/preset/gfm`，Crepe 兩者皆註冊）。
2. `editor-toolbar.tsx`：在 `toolbar` config 陣列加 `{ kind: "btn", id, icon, label }`。
- **漏第 1 步會被 TS 擋下**（`Record<EditorCommandId, ...>` 要求完整），同 menu-actions 的安全網。

## 必守的眉角

- **指令 key 的匯入路徑版本敏感**：用 `@milkdown/kit/preset/commonmark` / `/gfm` 與 `@milkdown/kit/utils` 的 `callCommand`。升級 milkdown 後若編譯錯，先對照當版匯出。
- **工具列按鈕用 `onMouseDown` + `preventDefault()`**：避免按鈕搶走焦點導致編輯器選取消失（格式會套不到選取）。
- **StrictMode 雙掛**：Crepe 的 `create()`/`destroy()` 是 async，cleanup 必須 `created.then(() => crepe.destroy())`，不可直接 destroy 半建好的實例。
- **編輯器不因 `defaultValue` 變更而重建**（effect deps 故意空陣列），否則會清掉使用者輸入。`defaultValue` 僅初始內容。**換檔（開新檔/開既有檔）靠 `key={docId}` 強制 remount**，不靠改 `defaultValue`。
- 清單 / Tab 縮排 / Enter 自動延續清單**由 Crepe（ProseMirror）內建**，不要自己寫。

## 主題

- Crepe 自帶 `theme/common`（結構）+ `theme/frame`（變數），於 `markdown-editor.tsx` import。
- **明暗跟隨**靠 `src/index.css` 的 `.milkdown.milkdown { --crepe-color-*: var(--shadcn-token) }`：把 Crepe 顏色變數重新對應到專案 tokens。**不載入 Crepe 的 dark 主題**。用雙 class 提升 specificity 以勝過 frame.css，不依賴載入順序。

## editor-store（`src/lib/editor-store.ts`）— 文件來源 + 存檔橋接

此 store 是 editor 視圖的狀態中樞，兩個職責：

1. **文件來源**：`file.new` → `newDocument(模板)`、`file.open` → `openDocument(內容, 路徑)`，兩者遞增 `docId` 後 `setView("editor")`。`markdown-editor-view.tsx` 以 `useEditorDocument()` 訂閱，`content` 當 `defaultValue`、`docId` 當 `MarkdownEditor` 的 `key`（換值即 remount 載入新內容）。
2. **取值橋接**：`markdown-editor-view.tsx` 於 `useEffect` 把 `getMarkdown` 註冊進 store（卸載時清除）；menu action 與編輯器 ref 解耦，故 `file.save` 由 `getActiveEditor()` 取值，不直接持 ref。內容**留在 Crepe 內部**（非 React 狀態），store 只存「取值函式參考」不存字串，避免每次鍵入重渲染。

## 開啟 / 儲存（file.open / file.save）

- **開啟**：`file.open` 用 `plugin-dialog` 的 `open()` 選 Markdown 檔 → `readMarkdown` 讀內容 → `openDocument(內容, 路徑)` → 切 editor 視圖。重用同一編輯器，不另造。
- **儲存**：`file.save` 取當前內容後——
  - 有來源路徑（開既有檔）→ **直接 `writeFile` 覆蓋**，不跳對話框。
  - 無路徑（新檔）→ save dialog，預設檔名取首個 H1（無則「未命名」），成功後 `setCurrentPath` 回填路徑、之後再存即覆蓋。
- `getCurrentPath()` 是「覆蓋 vs 另存」的判斷依據；換新檔（`newDocument`）會把 path 歸 null。後端 `write_file` / `read_markdown` 見 `src-tauri/CLAUDE.md`，前端封裝見 `src/lib/tauri.ts`。設計見 `docs/Plans/imp-open-file.md`、`docs/Plans/Save-file.md`。
