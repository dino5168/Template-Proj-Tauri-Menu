import { invoke } from "@tauri-apps/api/core";

/** FileTree 節點（對應 Rust FileNode，camelCase）。 */
export interface FileNode {
  name: string;
  path: string;
  isDir: boolean;
  children?: FileNode[];
}

/** 統一的 IPC 回傳型別，避免 untyped throw 散落各處。 */
export type Result<T> =
  | { data: T; error: null }
  | { data: null; error: Error };

function toError(e: unknown): Error {
  return e instanceof Error ? e : new Error(String(e));
}

/** 常用副檔名清單（傳給 listDir 過濾）。 */
export const MARKDOWN_EXTS = ["md", "markdown"];
export const HTML_EXTS = ["html", "htm"];

/** 應用 SQLite 資料庫檔名（置於 data root 下）。 */
export const DB_FILE_NAME = "LearnEnglish.db";

/** 單一欄位結構（對應 Rust ColumnInfo，camelCase）。 */
export interface ColumnInfo {
  name: string;
  typeName: string;
  notNull: boolean;
  pk: boolean;
  defaultValue: string | null;
}

/** 表的資料列（對應 Rust TableRows，camelCase）。 */
export interface TableRows {
  columns: string[];
  rows: (string | null)[][];
}

/** 讀取目錄樹（只含資料夾與符合 exts 的檔案）。 */
export async function listDir(
  root: string,
  exts: string[],
): Promise<Result<FileNode>> {
  try {
    return {
      data: await invoke<FileNode>("list_dir", { root, exts }),
      error: null,
    };
  } catch (e) {
    return { data: null, error: toError(e) };
  }
}

/** 讀取 markdown 檔內容。 */
export async function readMarkdown(path: string): Promise<Result<string>> {
  try {
    return { data: await invoke<string>("read_markdown", { path }), error: null };
  } catch (e) {
    return { data: null, error: toError(e) };
  }
}

/** 將內容寫入指定路徑（覆蓋既有檔）。 */
export async function writeFile(
  path: string,
  contents: string,
): Promise<Result<void>> {
  try {
    return { data: await invoke<void>("write_file", { path, contents }), error: null };
  } catch (e) {
    return { data: null, error: toError(e) };
  }
}

/** 取得名為 name 的預設根目錄（如 "docs" / "htmls"）；找不到回傳空字串。 */
export async function defaultDir(name: string): Promise<string> {
  return invoke<string>("default_dir", { name });
}

/** 取得（並建立）預設應用資料根目錄；供使用者未自訂時取用。 */
export async function defaultDataRoot(): Promise<Result<string>> {
  try {
    return { data: await invoke<string>("default_data_root"), error: null };
  } catch (e) {
    return { data: null, error: toError(e) };
  }
}

/** 讀取任意 UTF-8 文字檔（字幕 srt 等）。 */
export async function readTextFile(path: string): Promise<Result<string>> {
  try {
    return { data: await invoke<string>("read_text_file", { path }), error: null };
  } catch (e) {
    return { data: null, error: toError(e) };
  }
}

/**
 * 確保影片字幕存在於 `<dataRoot>/subtitles/` 並回傳 srt 絕對路徑。
 *
 * 已快取則跳過下載；否則以 yt-dlp 下載（手動優先、無則自動）。影片無英文字幕、
 * 或找不到 yt-dlp 時以 error 回傳。
 */
export async function downloadSubtitle(
  url: string,
  videoId: string,
  dataRoot: string,
  lang: string,
): Promise<Result<string>> {
  try {
    return {
      data: await invoke<string>("download_subtitle", { url, videoId, dataRoot, lang }),
      error: null,
    };
  } catch (e) {
    return { data: null, error: toError(e) };
  }
}

/** 開啟（不存在則建立）DB，並確保 demo 用的 `test` 表存在。 */
export async function dbInit(dbPath: string): Promise<Result<void>> {
  try {
    return { data: await invoke<void>("db_init", { dbPath }), error: null };
  } catch (e) {
    return { data: null, error: toError(e) };
  }
}

/** 列出 DB 內所有使用者資料表名稱。 */
export async function dbListTables(dbPath: string): Promise<Result<string[]>> {
  try {
    return { data: await invoke<string[]>("db_list_tables", { dbPath }), error: null };
  } catch (e) {
    return { data: null, error: toError(e) };
  }
}

/** 取得指定表的欄位結構（PRAGMA table_info）。 */
export async function dbTableSchema(
  dbPath: string,
  table: string,
): Promise<Result<ColumnInfo[]>> {
  try {
    return {
      data: await invoke<ColumnInfo[]>("db_table_schema", { dbPath, table }),
      error: null,
    };
  } catch (e) {
    return { data: null, error: toError(e) };
  }
}

/** 取得指定表的資料列（前 limit 筆）。 */
export async function dbTableRows(
  dbPath: string,
  table: string,
  limit: number,
): Promise<Result<TableRows>> {
  try {
    return {
      data: await invoke<TableRows>("db_table_rows", { dbPath, table, limit }),
      error: null,
    };
  } catch (e) {
    return { data: null, error: toError(e) };
  }
}
