import { getCurrentWindow } from "@tauri-apps/api/window";
import type { MenuActionId } from "@/config/menu";
import { toggleTheme } from "@/lib/theme";
import { setView } from "@/lib/view-store";

/**
 * action id → handler 對照表。
 *
 * 用 dict dispatch 取代散落的 if-else / inline onClick，
 * 新增行為只需在此補一筆。未實作者先留 no-op 或 TODO。
 */
export const menuActions: Record<MenuActionId, () => void> = {
  "file.new": () => setView("editor"),
  "file.open": () => {
    // TODO: 開啟檔案
  },
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
  "settings.workdir": () => {
    // TODO: 設定工作目錄（後續接 dialog 選資料夾 + 持久化）
  },
};
