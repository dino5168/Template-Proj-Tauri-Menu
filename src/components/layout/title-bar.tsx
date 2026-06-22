import { AppMenubar } from "@/components/layout/app-menubar";
import { WindowControls } from "@/components/layout/window-controls";
import { menuConfig } from "@/config/menu";

/**
 * 自訂標題列：左側 Logo + App 選單（data-driven），中段可拖曳區，右側視窗控制鈕。
 *
 * - 整條 bar 預設可拖曳（data-tauri-drag-region）；互動元素（選單、按鈕）
 *   因不帶該屬性故不會觸發拖曳。
 * - 選單內容由 src/config/menu.ts 驅動，見 docs/setup-menu.md。
 * - 搭配 tauri.conf.json 的 `decorations: false`。
 */
export function TitleBar() {
  return (
    <header
      data-tauri-drag-region
      className="flex h-9 shrink-0 select-none items-center justify-between border-b bg-background pl-2"
    >
      {/* 左：Logo（換成自家圖示請替換 src，建議放 public/ 或 import） */}
      <img
        src="/deepseek-icon.svg"
        alt="Company logo"
        data-tauri-drag-region
        className="mr-1 h-4 w-4 shrink-0"
        draggable={false}
      />

      {/* 左：App 選單（data-driven，非原生 OS 選單） */}
      <AppMenubar config={menuConfig} />

      {/* 中：拖曳區（佔滿剩餘空間） */}
      <div data-tauri-drag-region className="h-full flex-1" />

      {/* 右：視窗控制鈕 */}
      <WindowControls />
    </header>
  );
}
