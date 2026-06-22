import { getCurrentWindow } from "@tauri-apps/api/window";
import type { MenuActionId } from "@/config/menu";
import { toggleTheme } from "@/lib/theme";

/**
 * action id → handler 對照表。
 *
 * 用 dict dispatch 取代散落的 if-else / inline onClick，
 * 新增行為只需在此補一筆。未實作者先留 no-op 或 TODO。
 */
export const menuActions: Record<MenuActionId, () => void> = {
  "file.new": () => {
    // TODO: 開新檔案
  },
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
  "doc.markdown": () => {
    // TODO: 開啟 / 顯示 Markdown 文件
  },
  "doc.html": () => {
    // TODO: 開啟 / 顯示 HTML 文件
  },
};
