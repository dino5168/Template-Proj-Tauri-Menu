# 規劃：Menubar 選單外部化（data-driven menu）

## 目標

把 `src/components/layout/title-bar.tsx` 內寫死的 `檔案 / 編輯 / 檢視…` JSX，
抽成**型別化設定檔**驅動。讓「新增選單項目」變成改一份 config，而非改 JSX。

**設計原則**
- 結構與行為分離：config 只描述「長什麼樣」，行為用 **action id** 指向 dispatch table（dict dispatch，非 inline function）。
- 全程 TypeScript strict，**禁用 `any`**；discriminated union 表達 item 類型。
- 用 **TS 設定檔**（非純 JSON）以保型別安全與 IDE 補全；若日後要 runtime 載入或 i18n，再降級為 JSON + action id（見「延伸」）。

---

## 檔案結構（新增 3 檔，改 1 檔）

```
src/
├── config/
│   └── menu.ts            # 選單結構設定（label / shortcut / separator / submenu / actionId）
├── lib/
│   └── menu-actions.ts    # action id → handler 的 dispatch table
├── components/layout/
│   ├── app-menubar.tsx    # 通用元件：config → shadcn Menubar JSX（遞迴支援 submenu）
│   └── title-bar.tsx      # 改為 <AppMenubar config={menuConfig} />（變精簡）
```

---

## 1. 型別與設定 `src/config/menu.ts`

```ts
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
  shortcut?: string; // 僅顯示用；實際快捷鍵註冊見「延伸」
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
  items: MenuEntry[];
}

export type MenuEntry = MenuActionItem | MenuSeparator | MenuSubmenu;

/** 頂層選單（檔案 / 編輯 / 檢視…）。 */
export interface MenuGroup {
  label: string;
  items: MenuEntry[];
}

export const menuConfig: MenuGroup[] = [
  {
    label: "檔案",
    items: [
      { kind: "item", label: "開新檔案", action: "file.new", shortcut: "Ctrl+N" },
      { kind: "item", label: "開啟…", action: "file.open", shortcut: "Ctrl+O" },
      { kind: "separator" },
      { kind: "item", label: "結束", action: "file.exit", shortcut: "Alt+F4" },
    ],
  },
  {
    label: "編輯",
    items: [
      { kind: "item", label: "復原", action: "edit.undo", shortcut: "Ctrl+Z" },
      { kind: "item", label: "取消復原", action: "edit.redo", shortcut: "Ctrl+Y" },
    ],
  },
  {
    label: "檢視",
    items: [
      { kind: "item", label: "重新整理", action: "view.refresh" },
      { kind: "item", label: "全螢幕", action: "view.fullscreen" },
    ],
  },
];
```

---

## 2. 行為 dispatch table `src/lib/menu-actions.ts`

```ts
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { MenuActionId } from "@/config/menu";

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
};
```

> `Record<MenuActionId, () => void>` 確保 **config 用到的每個 action 都必須有實作**（漏一個 TS 直接報錯）。
> 視窗全螢幕需在 `capabilities/default.json` 補 `core:window:allow-set-fullscreen`、`core:window:allow-is-fullscreen`。

---

## 3. 通用渲染元件 `src/components/layout/app-menubar.tsx`

```tsx
import {
  Menubar,
  MenubarMenu,
  MenubarTrigger,
  MenubarContent,
  MenubarItem,
  MenubarSeparator,
  MenubarShortcut,
  MenubarSub,
  MenubarSubTrigger,
  MenubarSubContent,
} from "@/components/ui/menubar";
import type { MenuEntry, MenuGroup } from "@/config/menu";
import { menuActions } from "@/lib/menu-actions";

interface AppMenubarProps {
  config: MenuGroup[];
}

/** 依 config 動態渲染自訂 menubar；遞迴支援巢狀 submenu。 */
export function AppMenubar({ config }: AppMenubarProps) {
  return (
    <Menubar className="h-auto gap-0 border-0 bg-transparent p-0 shadow-none">
      {config.map((group) => (
        <MenubarMenu key={group.label}>
          <MenubarTrigger className="px-2 py-1 text-sm font-normal">
            {group.label}
          </MenubarTrigger>
          <MenubarContent>
            {group.items.map((entry, i) => (
              <MenuEntryNode key={entryKey(entry, i)} entry={entry} />
            ))}
          </MenubarContent>
        </MenubarMenu>
      ))}
    </Menubar>
  );
}

function MenuEntryNode({ entry }: { entry: MenuEntry }) {
  switch (entry.kind) {
    case "separator":
      return <MenubarSeparator />;
    case "submenu":
      return (
        <MenubarSub>
          <MenubarSubTrigger>{entry.label}</MenubarSubTrigger>
          <MenubarSubContent>
            {entry.items.map((child, i) => (
              <MenuEntryNode key={entryKey(child, i)} entry={child} />
            ))}
          </MenubarSubContent>
        </MenubarSub>
      );
    case "item":
      return (
        <MenubarItem
          disabled={entry.disabled}
          onClick={() => menuActions[entry.action]()}
        >
          {entry.label}
          {entry.shortcut && <MenubarShortcut>{entry.shortcut}</MenubarShortcut>}
        </MenubarItem>
      );
  }
}

/** separator 無 label，用 index 補 key。 */
function entryKey(entry: MenuEntry, index: number): string {
  return entry.kind === "separator" ? `sep-${index}` : entry.label;
}
```

---

## 4. 精簡後的 `title-bar.tsx`

```tsx
import { AppMenubar } from "@/components/layout/app-menubar";
import { WindowControls } from "@/components/layout/window-controls";
import { menuConfig } from "@/config/menu";

export function TitleBar() {
  return (
    <header
      data-tauri-drag-region
      className="flex h-9 shrink-0 select-none items-center justify-between border-b bg-background pl-2"
    >
      <img
        src="/deepseek-icon.svg"
        alt="Company logo"
        data-tauri-drag-region
        className="mr-1 h-4 w-4 shrink-0"
        draggable={false}
      />

      <AppMenubar config={menuConfig} />

      <div data-tauri-drag-region className="h-full flex-1" />

      <WindowControls />
    </header>
  );
}
```

選單 JSX 從 ~50 行縮成 1 行 `<AppMenubar />`，新增/調整選單只動 `config/menu.ts` + `lib/menu-actions.ts`。

---

## 遷移步驟

1. 建 `src/config/menu.ts`（型別 + `menuConfig`）。
2. 建 `src/lib/menu-actions.ts`（dispatch table；先把現有 `結束` 邏輯搬入 `file.exit`）。
3. 建 `src/components/layout/app-menubar.tsx`。
4. 改 `title-bar.tsx` 用 `<AppMenubar />`，移除原本 menu 區塊與 `@/components/ui/menubar`、`getCurrentWindow` 的 import。
5. `pnpm build` 驗證型別與編譯。
6. `pnpm tauri dev` 目視確認選單與行為一致。

---

## 延伸（YAGNI，需要再做）

- **真正的鍵盤快捷鍵**：目前 `shortcut` 只是顯示文字。要真的綁定，於 app 層加 `keydown` 監聽，或用 `@tauri-apps/plugin-global-shortcut`（系統級）。建議在 config 由 `shortcut` 衍生對照，避免兩處不同步。
- **i18n**：把 `label` 改為翻譯 key（如 `"menu.file"`），渲染時 `t(label)`。此時 config 可進一步降為純 JSON（只剩 string key + action id），交由 runtime 載入。
- **動態啟用/停用**：`disabled` 改為 `() => boolean` 或由 app state 計算（例：無開啟檔案時停用「儲存」）。屆時 `AppMenubar` 接收 state 或用 selector。
- **右鍵選單共用**：同一份 config/actions 可餵給 shadcn `ContextMenu`，達成選單定義單一來源。
```
