import { getCurrentWindow } from "@tauri-apps/api/window";
import { open, save } from "@tauri-apps/plugin-dialog";
import type { MenuActionId } from "@/config/menu";
import { toggleTheme } from "@/lib/theme";
import { setView } from "@/lib/view-store";
import {
  NEW_DOC_TEMPLATE,
  getActiveEditor,
  getCurrentPath,
  newDocument,
  openDocument,
  setCurrentPath,
} from "@/lib/editor-store";
import { getWorkdir, setWorkdir } from "@/lib/workdir-store";
import { getDataRoot, setDataRoot } from "@/lib/data-root-store";
import { MARKDOWN_EXTS, readMarkdown, writeFile } from "@/lib/tauri";

/** Windows 不合法的檔名字元（含控制字元）。 */
// eslint-disable-next-line no-control-regex
const ILLEGAL_FILENAME = /[\x00-\x1f\\/:*?"<>|]/g;

/**
 * 由 Markdown 內容推導預設檔名（取第一個 H1 標題）。
 *
 * @param md - 文件的 Markdown 字串。
 * @returns 清洗後的檔名（不含副檔名）；無標題或清洗後為空時回 "未命名"。
 */
function defaultFilename(md: string): string {
  const match = md.match(/^\s*#\s+(.+?)\s*#*\s*$/m);
  const title = match?.[1].replace(ILLEGAL_FILENAME, "").replace(/\s+/g, " ").trim();
  return title || "未命名";
}

/**
 * 把檔名接到目錄後面，組成存檔對話框的預設完整路徑。
 *
 * 分隔符依目錄既有字元推斷（Windows 路徑含 `\`），避免為了 join 走 IPC／權限。
 *
 * @param dir - 工作目錄絕對路徑（來自 OS 選資料夾器）。
 * @param name - 含副檔名的檔名。
 */
function joinPath(dir: string, name: string): string {
  const sep = dir.includes("\\") ? "\\" : "/";
  return `${dir.replace(/[\\/]+$/, "")}${sep}${name}`;
}

/**
 * 開啟既有 Markdown 檔到編輯器：選檔 → 讀檔 → 注入 editor-store → 切視圖。
 *
 * 使用者取消對話框或讀檔失敗時，靜默結束、不切視圖。
 */
async function openFile(): Promise<void> {
  const path = await open({
    multiple: false,
    directory: false,
    defaultPath: getWorkdir() ?? undefined, // 從工作目錄起始
    filters: [{ name: "Markdown", extensions: MARKDOWN_EXTS }],
  });
  if (typeof path !== "string") return; // 使用者取消

  const { data, error } = await readMarkdown(path);
  if (error) {
    console.error("開啟檔案失敗：", error);
    return;
  }

  openDocument(data, path);
  setView("editor");
}

/**
 * 另存新檔：一律跳 save dialog 讓使用者輸入檔名，寫檔成功後回填路徑。
 *
 * 預設檔名取 H1 標題（無則「未命名」）。不在 editor 視圖或使用者取消時，靜默結束。
 */
async function saveAsActiveEditor(): Promise<void> {
  const getMarkdown = getActiveEditor();
  if (!getMarkdown) return; // 不在編輯器視圖

  const md = getMarkdown();
  // 預設檔名取 H1 標題；有工作目錄則以其為起始路徑。
  const name = `${defaultFilename(md)}.md`;
  const dir = getWorkdir();
  const path = await save({
    defaultPath: dir ? joinPath(dir, name) : name,
    filters: [{ name: "Markdown", extensions: ["md", "markdown"] }],
  });
  if (path === null) return; // 使用者取消

  const { error } = await writeFile(path, md);
  if (error) {
    console.error("儲存檔案失敗：", error);
    return;
  }
  setCurrentPath(path); // 之後「儲存檔案」即覆蓋此檔
}

/**
 * 選取並持久化工作目錄（「設定 → 環境設定」）。
 *
 * 之後編輯器的開檔／存檔對話框會以此為預設起始位置（見 workdir-store）。
 * 使用者取消時不變更現有設定。
 */
async function pickWorkdir(): Promise<void> {
  const dir = await open({
    directory: true,
    multiple: false,
    defaultPath: getWorkdir() ?? undefined,
  });
  if (typeof dir !== "string") return; // 使用者取消
  setWorkdir(dir);
}

/**
 * 選取並持久化應用資料根目錄（「設定 → 資料目錄」）。
 *
 * app 產生物（字幕、未來錄音等）會寫到此目錄下的功能子資料夾。未自訂時
 * 系統退回預設（見 data-root-store）。使用者取消時不變更現有設定。
 */
async function pickDataRoot(): Promise<void> {
  const dir = await open({
    directory: true,
    multiple: false,
    defaultPath: getDataRoot() ?? undefined,
  });
  if (typeof dir !== "string") return; // 使用者取消
  setDataRoot(dir);
}

/**
 * 儲存當前編輯器內容。
 *
 * - 已知來源路徑（開啟既有檔或曾另存）→ 直接覆蓋，不跳對話框。
 * - 無路徑（新檔）→ 委派 {@link saveAsActiveEditor} 走另存對話框。
 * 不在 editor 視圖（無作用中編輯器）時靜默結束。
 */
async function saveActiveEditor(): Promise<void> {
  const getMarkdown = getActiveEditor();
  if (!getMarkdown) return; // 不在編輯器視圖

  // 無來源路徑（新檔）→ 與「另存新檔」同一條原始碼。
  const existing = getCurrentPath();
  if (!existing) {
    await saveAsActiveEditor();
    return;
  }

  // 開啟既有檔：直接覆蓋原路徑。
  const { error } = await writeFile(existing, getMarkdown());
  if (error) console.error("儲存檔案失敗：", error);
}

/**
 * action id → handler 對照表。
 *
 * 用 dict dispatch 取代散落的 if-else / inline onClick，
 * 新增行為只需在此補一筆。未實作者先留 no-op 或 TODO。
 */
export const menuActions: Record<MenuActionId, () => void> = {
  "file.new": () => {
    newDocument(NEW_DOC_TEMPLATE);
    setView("editor");
  },
  "file.open": () => void openFile(),
  "file.save": () => void saveActiveEditor(),
  "file.saveAs": () => void saveAsActiveEditor(),
  "file.exit": () => void getCurrentWindow().close(),
  "edit.undo": () => document.execCommand("undo"),
  "edit.redo": () => document.execCommand("redo"),
  "view.refresh": () => window.location.reload(),
  "view.fullscreen": () =>
    void getCurrentWindow()
      .isFullscreen()
      .then((on) => getCurrentWindow().setFullscreen(!on)),
  "view.theme": () => toggleTheme(),
  "doc.markdown": () => setView("markdown"),
  "doc.html": () => setView("html"),
  "learning.youtube": () => setView("youtube"),
  "settings.workdir": () => void pickWorkdir(),
  "settings.dataRoot": () => void pickDataRoot(),
};
