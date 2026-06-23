# src/components/editor/ — Markdown 編輯器（開新檔案 / Live Preview）

> 「檔案 → 開新檔案」(`file.new` → `setView("editor")`) 的主視圖。Obsidian 式 Live Preview，底層為 **milkdown Crepe**（ProseMirror）。完整設計見 `docs/Plans/imp-plan-newfile.md`。

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
- **編輯器不因 `defaultValue` 變更而重建**（effect deps 故意空陣列），否則會清掉使用者輸入。`defaultValue` 僅初始內容。
- 清單 / Tab 縮排 / Enter 自動延續清單**由 Crepe（ProseMirror）內建**，不要自己寫。

## 主題

- Crepe 自帶 `theme/common`（結構）+ `theme/frame`（變數），於 `markdown-editor.tsx` import。
- **明暗跟隨**靠 `src/index.css` 的 `.milkdown.milkdown { --crepe-color-*: var(--shadcn-token) }`：把 Crepe 顏色變數重新對應到專案 tokens。**不載入 Crepe 的 dark 主題**。用雙 class 提升 specificity 以勝過 frame.css，不依賴載入順序。

## 目前範圍

- **純編輯，不存檔**（內容存記憶體）。`getMarkdown()` 已備好供未來存檔取值。
- 存檔需後端 `write_file` + dialog，路徑見 `docs/Plans/imp-plan-newfile.md` §10。
