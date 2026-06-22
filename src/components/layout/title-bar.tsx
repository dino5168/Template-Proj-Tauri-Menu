import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  Menubar,
  MenubarMenu,
  MenubarTrigger,
  MenubarContent,
  MenubarItem,
  MenubarSeparator,
  MenubarShortcut,
} from "@/components/ui/menubar";
import { WindowControls } from "@/components/layout/window-controls";

/**
 * 自訂標題列：左側 App 選單（自訂 menubar），中段可拖曳區，右側視窗控制鈕。
 *
 * - 整條 bar 預設可拖曳（data-tauri-drag-region）；互動元素（選單、按鈕）
 *   因不帶該屬性故不會觸發拖曳。
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

      {/* 左：App 選單（自訂，非原生 OS 選單） */}
      <Menubar className="h-auto gap-0 border-0 bg-transparent p-0 shadow-none">
        <MenubarMenu>
          <MenubarTrigger className="px-2 py-1 text-sm font-normal">
            檔案
          </MenubarTrigger>
          <MenubarContent>
            <MenubarItem>
              開新檔案 <MenubarShortcut>Ctrl+N</MenubarShortcut>
            </MenubarItem>
            <MenubarItem>
              開啟… <MenubarShortcut>Ctrl+O</MenubarShortcut>
            </MenubarItem>
            <MenubarSeparator />
            <MenubarItem onClick={() => void getCurrentWindow().close()}>
              結束 <MenubarShortcut>Alt+F4</MenubarShortcut>
            </MenubarItem>
          </MenubarContent>
        </MenubarMenu>

        <MenubarMenu>
          <MenubarTrigger className="px-2 py-1 text-sm font-normal">
            編輯
          </MenubarTrigger>
          <MenubarContent>
            <MenubarItem>
              復原 <MenubarShortcut>Ctrl+Z</MenubarShortcut>
            </MenubarItem>
            <MenubarItem>
              取消復原 <MenubarShortcut>Ctrl+Y</MenubarShortcut>
            </MenubarItem>
          </MenubarContent>
        </MenubarMenu>

        <MenubarMenu>
          <MenubarTrigger className="px-2 py-1 text-sm font-normal">
            檢視
          </MenubarTrigger>
          <MenubarContent>
            <MenubarItem>重新整理</MenubarItem>
            <MenubarItem>全螢幕</MenubarItem>
          </MenubarContent>
        </MenubarMenu>
      </Menubar>

      {/* 中：拖曳區（佔滿剩餘空間） */}
      <div data-tauri-drag-region className="h-full flex-1" />

      {/* 右：視窗控制鈕 */}
      <WindowControls />
    </header>
  );
}
