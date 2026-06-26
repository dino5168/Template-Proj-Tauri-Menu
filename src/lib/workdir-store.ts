/**
 * 工作目錄設定（持久化於 localStorage）。
 *
 * 「設定 → 環境設定」(`settings.workdir`) 選定的資料夾，作為編輯器
 * 開檔／存檔對話框的預設起始位置。目前無 UI 訂閱需求，故保持輕量、
 * 不走 `useSyncExternalStore`（與 view-store / editor-store 不同）。
 */

const STORAGE_KEY = "workdir";

let current: string | null = localStorage.getItem(STORAGE_KEY);

/** 取得目前工作目錄；未設定回 null。 */
export function getWorkdir(): string | null {
  return current;
}

/** 設定並持久化工作目錄（傳 null 清除）。 */
export function setWorkdir(dir: string | null): void {
  current = dir;
  if (dir) localStorage.setItem(STORAGE_KEY, dir);
  else localStorage.removeItem(STORAGE_KEY);
}
