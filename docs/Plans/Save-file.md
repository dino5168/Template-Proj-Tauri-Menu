# 實作計畫：儲存檔案（編輯器存檔）

> 來源任務：`docs/Tasks/save-file.md`
> 前置：開新檔案編輯器已完成（見 `docs/Plans/imp-plan-newfile.md`），目前為**純編輯不存檔**。
> 本計畫補上該文件 §10「非本次範圍」所列的存檔路徑。

---

## 1. 目標

在「檔案」選單新增「**儲存檔案**」項目（`file.save`）。流程：

```
開新檔案 (file.new → editor 視圖) → 編輯 → 儲存檔案 (file.save)
```

按下「儲存檔案」後：

1. 取出編輯器目前的 Markdown 內容。
2. 跳出**系統存檔對話框**（plugin-dialog 的 save dialog），讓使用者**選取存檔路徑**。
3. 預設檔名 = **Markdown 文件的第一個標題（H1）**；無標題時退回 `未命名.md`。
4. 使用者按**確定** → 寫檔；按**取消** → 不寫、不報錯、靜默結束。

## 2. 使用者已確認的決策

| 項目 | 決策 | 影響 |
| --- | --- | --- |
| 觸發方式 | 「檔案」選單新增「儲存檔案」項目 | 走既有 data-driven menu（加 `MenuActionId` + handler） |
| 路徑選擇 | 每次都跳系統存檔對話框讓使用者選 | 用 `plugin-dialog` 的 `save()`；本版**不**記住上次路徑（無「另存」vs「儲存」之分） |
| 預設檔名 | 取文件 H1 標題；無則 `未命名` | 需解析 Markdown 首個 ATX 標題 |
| 取消行為 | 不寫檔、不報錯 | `save()` 回傳 `null` 即直接 return |
| 寫檔後端 | 自訂 Rust `write_file` command | 遵循專案 IPC 慣例（不引入 `plugin-fs`） |

## 3. 核心設計難點：選單 action 如何取得編輯器內容

`menu-actions.ts` 的 dispatch table 是**非 React 的純函式**，與編輯器元件**解耦**（編輯器內容存在 `MarkdownEditor` 的 ref 裡）。`file.save` handler 無法直接拿到 `editorRef.current.getMarkdown()`。

**解法：新增極輕量 `src/lib/editor-store.ts`（仿 `view-store.ts` 模式）**，作為「當前作用中編輯器」的註冊點：

- 編輯器掛載時，把自己的 `getMarkdown` 取值函式**註冊**進 store；卸載時清除。
- `file.save` handler 從 store 取出 `getMarkdown` 來讀內容。
- 不引入 zustand 等套件，維持 `useSyncExternalStore` / 模組級單例的專案慣例。

> 此 store 為「命令式橋接」（imperative bridge），刻意只存一個函式參考而非文件字串本身——避免每次鍵入都更新 React 狀態造成重渲染，與 `markdown-editor.tsx` 現行「內容留在 Crepe 內部」的設計一致。

## 4. 檔案變更清單

### 後端（`src-tauri/`）

| 檔案 | 變更 |
| --- | --- |
| `src/lib.rs` | 新增 `#[tauri::command] fn write_file(path: String, contents: String) -> Result<(), String>`（`std::fs::write`），並加入 `invoke_handler` 的 `generate_handler!` |
| `capabilities/default.json` | `permissions` 加入 `"dialog:allow-save"`（save dialog 的權限字串，與既有 `dialog:allow-open` 並列） |

### 前端

| 檔案 | 變更 |
| --- | --- |
| `src/lib/tauri.ts` | 新增 `writeFile(path, contents): Promise<Result<void>>`（仿 `readMarkdown`，用 `toError()` 收斂例外） |
| `src/lib/editor-store.ts` | **新增**：註冊/取出當前編輯器 `getMarkdown` 的輕量 store（仿 `view-store.ts`） |
| `src/config/menu.ts` | `MenuActionId` 加 `"file.save"`；「檔案」選單加 `{ kind: "item", label: "儲存檔案", action: "file.save", icon: Save, shortcut: "Ctrl+S" }`（icon 由 `lucide-react` 匯入 `Save`） |
| `src/lib/menu-actions.ts` | 新增 `"file.save"` handler（內含取內容 → 解析標題 → save dialog → writeFile，見 §6） |
| `src/components/editor/markdown-editor-view.tsx` | 掛載時把 `editorRef.current.getMarkdown` 註冊進 editor-store，卸載時清除（`useEffect`） |

> `markdown-editor.tsx` **不需改**：已透過 `forwardRef` 暴露 `getMarkdown()`。
> `editor-toolbar.tsx` 維持 presentational，不放存檔按鈕（走選單即可）。

## 5. 後端 `write_file` command

```rust
/// 將 UTF-8 內容寫入指定路徑（覆蓋既有檔）。
#[tauri::command]
fn write_file(path: String, contents: String) -> Result<(), String> {
    std::fs::write(&path, contents).map_err(|e| e.to_string())
}
```

- 回傳 `Result<(), String>`，符合 `src-tauri/CLAUDE.md`「可能失敗用 `Result<T, String>`」慣例。
- 記得加進 `generate_handler![greet, list_dir, read_markdown, default_dir, write_file]`。
- 改完 `capabilities` 與 command 後**務必 `cargo check`**（權限字串／註冊錯誤只在編譯期爆）。

> 路徑由系統 save dialog 產生，已是使用者明示選定的安全路徑，故不需在此額外做目錄白名單；`write` 失敗（權限、唯讀）會以 `Err` 字串回傳前端。

## 6. `file.save` handler 流程（`menu-actions.ts`）

```
1. const getMarkdown = getActiveEditor();        // 來自 editor-store
   若無作用中編輯器（不在 editor 視圖）→ return（或 no-op）。
2. const md = getMarkdown();
3. const title = parseTitle(md);                 // 解析首個 H1，見 §7
   const defaultName = `${title}.md`;             // 無標題退回 "未命名.md"
4. const path = await save({
       defaultPath: defaultName,
       filters: [{ name: "Markdown", extensions: ["md", "markdown"] }],
     });
   若 path === null → 使用者取消 → return（不寫檔）。
5. const { error } = await writeFile(path, md);
   error 時：以非阻斷方式提示（console.error 或既有 toast 機制，若無則最小化處理）。
```

- `save` 由 `@tauri-apps/plugin-dialog` 匯入（前端套件已隨 dialog plugin 安裝，無需新增相依）。
- handler 為 async；dispatch table 型別 `Record<MenuActionId, () => void>` 允許回傳被忽略的 promise（呼叫端 `void` 之）；如需嚴謹可將型別放寬為 `() => void | Promise<void>`（**擇一**，建議維持現狀以 `void asyncFn()` 包裹）。

## 7. 解析預設檔名（H1 標題）

```
parseTitle(md): 取第一個符合 ATX H1 的行 → /^\s*#\s+(.+?)\s*#*\s*$/m 的擷取群組。
- 找到 → trim 後做檔名清洗（移除 Windows 不合法字元 \ / : * ? " < > | 與控制字元，壓縮空白）。
- 找不到或清洗後為空 → "未命名"。
```

- 放在一個小工具函式（可置於 `editor-store.ts` 同檔或 `lib/utils.ts`，視內聚度，建議獨立小函式並附 Google 風格 docstring）。
- 只取 H1，不取 setext 標題（`===` 底線式）以簡化；如需可後續擴充。
- 副檔名固定補 `.md`；若使用者在 dialog 改副檔名以 dialog 結果為準（`save()` 回傳的最終 path）。

## 8. 分階段實作步驟

1. **後端**：`lib.rs` 加 `write_file` + 註冊；`capabilities/default.json` 加 `dialog:allow-save`；`cargo check` 通過。
2. **IPC 封裝**：`tauri.ts` 加 `writeFile`（Result type）。
3. **橋接 store**：新增 `editor-store.ts`（`setActiveEditor` / `getActiveEditor` / clear）；`markdown-editor-view.tsx` 於 `useEffect` 註冊與清除。
4. **選單**：`menu.ts` 加 `file.save` 項目與型別；`menu-actions.ts` 加 handler（含標題解析 + save dialog + writeFile）。
5. **驗證**：`pnpm build`（tsc + vite 型別/建置）＋ `cargo check`。
6. **手動驗收**：依 §10 驗收標準逐項確認。
7. **收尾**：補 Google 風格 docstring；更新 `src/components/editor/CLAUDE.md`「目前範圍」由「純編輯不存檔」改為「可存檔」，並更新 `src-tauri/CLAUDE.md`「未實作缺口」移除 `write_file`。

## 9. 非本次範圍 / 未來延伸

- **dirty flag / 未存標記**：標題列顯示 `*`、關閉前提示存檔。
- **「儲存」vs「另存新檔」**：記住當前檔案路徑，再次存檔直接覆蓋不跳 dialog。
- **真正的 `Ctrl+S` 快捷鍵**：目前 menu `shortcut` 僅顯示用；要生效需另註冊全域快捷（見 `docs/Plans/setup-menu.md` 延伸）。
- **開啟既有檔到編輯器**（串接 `file.open` / DocBrowser）後再存回原路徑。
- 多分頁 / 多編輯器實例時，editor-store 需由「單一作用中」擴充為以 id 管理。

## 10. 驗收標準

- 「檔案 → 儲存檔案」在 editor 視圖下可觸發系統存檔對話框。
- 對話框預設檔名為文件 H1 標題（如 `# 我的筆記` → `我的筆記.md`）；無標題時為 `未命名.md`。
- 按確定後，選定路徑產生 `.md` 檔，內容與編輯器一致（UTF-8）。
- 按取消不產生檔案、不報錯、不中斷應用。
- 寫檔失敗（如唯讀路徑）以 Result error 收斂，不 untyped throw。
- `pnpm build` 與 `cargo check` 皆通過。

## 11. 主要風險

- **橋接 store 的生命週期**：StrictMode 雙掛 / 視圖切換時，註冊與清除順序要正確（離開 editor 視圖後 `getActiveEditor()` 應回 null，避免存到舊內容）。在 `markdown-editor-view.tsx` 的 `useEffect` cleanup 清除即可。
- **權限字串**：`dialog:allow-save` 漏加會「靜默失效」（dialog 不出現、無錯誤）——務必 `cargo check` 後實機測。
- **檔名清洗**：跨平台不合法字元差異；本版以 Windows 規則為準（專案目標平台）。
- **async handler 與 dispatch table 型別**：確保 `Record<MenuActionId, () => void>` 與 async handler 相容（以 `void asyncFn()` 包裹，或放寬回傳型別，二擇一並保持一致）。
