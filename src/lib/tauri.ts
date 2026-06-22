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

/** 取得預設 docs 根目錄；找不到回傳空字串。 */
export async function defaultDocsDir(): Promise<string> {
  return invoke<string>("default_docs_dir");
}
