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

/** 影片資料夾的內容與 metadata（對應 Rust VideoInfo，camelCase）。 */
export interface VideoInfo {
  id: string;
  url: string;
  title: string | null;
  channel: string | null;
  duration: number | null;
  uploadDate: string | null;
  folderPath: string;
  subtitlePath: string | null;
  thumbnailPath: string | null;
  audioPath: string | null;
}

/**
 * 在 `<dataRoot>/videos/<id>/` 準備影片資料（字幕 en.srt、封面 cover.jpg、info.json）。
 *
 * 已快取則跳過 yt-dlp。無字幕時 `subtitlePath` 為 null（非 error）；找不到 yt-dlp 等
 * 才以 error 回傳。需 PATH 上的 yt-dlp 與 ffmpeg。
 */
export async function prepareVideo(
  url: string,
  videoId: string,
  dataRoot: string,
): Promise<Result<VideoInfo>> {
  try {
    return {
      data: await invoke<VideoInfo>("prepare_video", { url, videoId, dataRoot }),
      error: null,
    };
  } catch (e) {
    return { data: null, error: toError(e) };
  }
}

/**
 * 下載影片音訊為 `<dataRoot>/videos/<id>/audio.mp3`，回傳絕對路徑（已下載則直接回）。
 *
 * 由「下載音訊」鈕觸發（非每次換片自動）。需 PATH 上的 yt-dlp 與 ffmpeg。
 */
export async function downloadAudio(
  url: string,
  videoId: string,
  dataRoot: string,
): Promise<Result<string>> {
  try {
    return {
      data: await invoke<string>("download_audio", { url, videoId, dataRoot }),
      error: null,
    };
  } catch (e) {
    return { data: null, error: toError(e) };
  }
}

/** 寫入/更新一筆影片記錄到 `videos` 表（不存在則建表；以 id upsert）。 */
export async function videosUpsert(
  dbPath: string,
  video: VideoInfo,
): Promise<Result<void>> {
  try {
    return { data: await invoke<void>("videos_upsert", { dbPath, video }), error: null };
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
