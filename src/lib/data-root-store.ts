/**
 * 應用資料根目錄設定（持久化於 localStorage）。
 *
 * 「設定 → 資料目錄」(`settings.dataRoot`) 選定的資料夾，作為 app 產生物
 * （字幕、未來錄音等）的家，底下依功能分子資料夾（`subtitles/` …）。
 *
 * 與編輯器 `workdir`（使用者文件位置，見 workdir-store）**語意不同、刻意分開**：
 * data root 是「app 寫出去的東西放哪」，workdir 是「使用者文件在哪」。
 * 未自訂時退回 Rust 解析的預設（release＝.exe 同層 `data/`、dev＝專案根 `data/`）。
 */

import { defaultDataRoot } from "@/lib/tauri";

const STORAGE_KEY = "dataRoot";

let override: string | null = localStorage.getItem(STORAGE_KEY);

/** 取得使用者自訂的資料根目錄；未自訂回 null（呼叫 {@link resolveDataRoot} 取實際路徑）。 */
export function getDataRoot(): string | null {
  return override;
}

/** 設定並持久化資料根目錄（傳 null 清除，回退預設）。 */
export function setDataRoot(dir: string | null): void {
  override = dir;
  if (dir) localStorage.setItem(STORAGE_KEY, dir);
  else localStorage.removeItem(STORAGE_KEY);
}

/**
 * 解析實際要用的資料根目錄：有自訂用自訂，否則取 Rust 預設。
 *
 * @returns 資料根絕對路徑；連預設都取不到（罕見）時回 null。
 */
export async function resolveDataRoot(): Promise<string | null> {
  if (override) return override;
  const { data } = await defaultDataRoot();
  return data;
}
