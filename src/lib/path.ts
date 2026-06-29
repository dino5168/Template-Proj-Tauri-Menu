/**
 * 輕量路徑工具（不走 IPC）。
 *
 * 桌面端開／存檔對話框回傳的是 OS 絕對路徑，純字串拼接即可，毋須為了 join
 * 一個檔名而跨 IPC 呼叫 Rust 的 path API。
 */

/**
 * 把檔名接到目錄後面，組成完整路徑。
 *
 * 分隔符依目錄既有字元推斷（Windows 路徑含 `\`），並去除目錄尾端多餘分隔符。
 *
 * @param dir - 目錄絕對路徑（來自 OS 選資料夾器 / data root）。
 * @param name - 要接上的檔名或子路徑。
 * @returns 拼接後的完整路徑。
 */
export function joinPath(dir: string, name: string): string {
  const sep = dir.includes("\\") ? "\\" : "/";
  return `${dir.replace(/[\\/]+$/, "")}${sep}${name}`;
}
