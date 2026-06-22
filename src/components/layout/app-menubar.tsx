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
          <MenubarSubTrigger>
            {entry.icon && <entry.icon />}
            {entry.label}
          </MenubarSubTrigger>
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
          {entry.icon && <entry.icon />}
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
