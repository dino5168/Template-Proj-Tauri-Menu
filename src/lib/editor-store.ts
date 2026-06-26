import { useSyncExternalStore } from "react";

/**
 * 編輯器狀態中樞：當前文件來源 + 「作用中編輯器」命令式橋接。
 *
 * 兩個職責放同一檔，因其共同服務「editor 視圖」：
 * 1. **文件來源**：`file.open` / `file.new` 在切到 editor 視圖前，把要載入的內容（與來源路徑）
 *    放進來；`MarkdownEditorView` 訂閱之，以 `docId` 當 key 強制 remount 換檔。
 * 2. **橋接**：編輯器掛載時註冊 `getMarkdown`，供 `file.save` 取出當前內容。
 *
 * 不引入狀態管理套件，維持模組級單例 + `useSyncExternalStore`（同 view-store.ts）。
 */

/** 新檔的初始內容模板（`file.new` 經本 store 注入）。 */
export const NEW_DOC_TEMPLATE = `# 未命名文件

開始撰寫你的 **Markdown**。

- 邊打字邊即時渲染
- 按 Tab 縮排清單、Enter 自動延續清單
- 上方工具列可套用格式
`;

/** 編輯器當前文件來源。 */
export interface EditorDocument {
  /** 初始 Markdown 內容（僅作 Crepe 建立時的初值，之後由編輯器內部維護）。 */
  content: string;
  /** 來源檔案絕對路徑；新檔為 null。 */
  path: string | null;
  /** 單調遞增的文件序號；作為編輯器 key，換值即強制 remount 載入新內容。 */
  docId: number;
}

// ── 文件來源 ──────────────────────────────────────────────

let current: EditorDocument = { content: "", path: null, docId: 0 };
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((l) => l());
}

/** 載入既有檔到編輯器（遞增 docId 以強制 remount）。 */
export function openDocument(content: string, path: string): void {
  current = { content, path, docId: current.docId + 1 };
  notify();
}

/** 以模板開新檔（path=null，遞增 docId 以強制 remount）。 */
export function newDocument(template: string): void {
  current = { content: template, path: null, docId: current.docId + 1 };
  notify();
}

/**
 * 回填當前文件的來源路徑（新檔「另存」成功後呼叫）。
 *
 * 只改 path、不動 content/docId，故**不**通知訂閱者——避免無謂 remount。
 */
export function setCurrentPath(path: string): void {
  current = { ...current, path };
}

/** 取得當前文件來源路徑；新檔為 null。供 `file.save` 判斷「覆蓋 vs 另存」。 */
export function getCurrentPath(): string | null {
  return current.path;
}

/** 訂閱當前文件來源（供 `MarkdownEditorView` 用）。 */
export function useEditorDocument(): EditorDocument {
  return useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    () => current,
  );
}

// ── 作用中編輯器橋接 ───────────────────────────────────────

/** 編輯器對外提供的取值函式：回傳當前 Markdown 字串。 */
type GetMarkdown = () => string;

let active: GetMarkdown | null = null;

/** 註冊當前作用中編輯器的取值函式（編輯器掛載時呼叫）。 */
export function setActiveEditor(getMarkdown: GetMarkdown): void {
  active = getMarkdown;
}

/**
 * 清除註冊（編輯器卸載時呼叫）。
 *
 * 傳入當初註冊的同一個函式，僅在仍為目前作用中者時才清除，
 * 避免 StrictMode 雙掛或視圖切換時誤清掉後者註冊的實例。
 */
export function clearActiveEditor(getMarkdown: GetMarkdown): void {
  if (active === getMarkdown) active = null;
}

/** 取得當前作用中編輯器的取值函式；無作用中編輯器時回 null。 */
export function getActiveEditor(): GetMarkdown | null {
  return active;
}
