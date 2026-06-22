import type { LucideIcon } from "lucide-react";
import {
  FilePlus,
  FolderOpen,
  LogOut,
  Undo2,
  Redo2,
  RefreshCw,
  Maximize,
  File,
  SquarePen,
  Eye,
} from "lucide-react";

/** 選單項目的 action 識別碼；對應 menu-actions.ts 的 dispatch table。 */
export type MenuActionId =
  | "file.new"
  | "file.open"
  | "file.exit"
  | "edit.undo"
  | "edit.redo"
  | "view.refresh"
  | "view.fullscreen";

/** 可點擊的一般項目。 */
interface MenuActionItem {
  kind: "item";
  label: string;
  action: MenuActionId;
  icon?: LucideIcon; // 可選；有設定才顯示
  shortcut?: string; // 僅顯示用；實際快捷鍵註冊見 docs/setup-menu.md「延伸」
  disabled?: boolean;
}

/** 分隔線。 */
interface MenuSeparator {
  kind: "separator";
}

/** 巢狀子選單。 */
interface MenuSubmenu {
  kind: "submenu";
  label: string;
  icon?: LucideIcon; // 可選；有設定才顯示
  items: MenuEntry[];
}

export type MenuEntry = MenuActionItem | MenuSeparator | MenuSubmenu;

/** 頂層選單（檔案 / 編輯 / 檢視…）。 */
export interface MenuGroup {
  label: string;
  icon?: LucideIcon; // 可選；有設定才顯示
  items: MenuEntry[];
}

export const menuConfig: MenuGroup[] = [
  {
    label: "檔案",
    icon: File,
    items: [
      { kind: "item", label: "開新檔案", action: "file.new", icon: FilePlus, shortcut: "Ctrl+N" },
      { kind: "item", label: "開啟…", action: "file.open", icon: FolderOpen, shortcut: "Ctrl+O" },
      { kind: "separator" },
      { kind: "item", label: "結束", action: "file.exit", icon: LogOut, shortcut: "Alt+F4" },
    ],
  },
  {
    label: "編輯",
    icon: SquarePen,
    items: [
      { kind: "item", label: "復原", action: "edit.undo", icon: Undo2, shortcut: "Ctrl+Z" },
      { kind: "item", label: "取消復原", action: "edit.redo", icon: Redo2, shortcut: "Ctrl+Y" },
    ],
  },
  {
    label: "檢視",
    icon: Eye,
    items: [
      { kind: "item", label: "重新整理", action: "view.refresh", icon: RefreshCw },
      { kind: "item", label: "全螢幕", action: "view.fullscreen", icon: Maximize },
    ],
  },
];
