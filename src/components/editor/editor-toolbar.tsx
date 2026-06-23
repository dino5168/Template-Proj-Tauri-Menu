import type { LucideIcon } from "lucide-react";
import {
  Bold,
  Code,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  List,
  ListOrdered,
  Minus,
  Pilcrow,
  Quote,
  SquareCode,
  Strikethrough,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import type { EditorCommandId } from "@/components/editor/markdown-editor";

/** 工具列按鈕（data-driven）；`kind: "sep"` 渲染分隔線。 */
type ToolbarEntry =
  | { kind: "btn"; id: EditorCommandId; icon: LucideIcon; label: string }
  | { kind: "sep" };

/** 工具列項目設定：改這裡即可增刪按鈕（指令對照見 markdown-editor.tsx 的 commandRunners）。 */
const toolbar: ToolbarEntry[] = [
  { kind: "btn", id: "bold", icon: Bold, label: "粗體" },
  { kind: "btn", id: "italic", icon: Italic, label: "斜體" },
  { kind: "btn", id: "strike", icon: Strikethrough, label: "刪除線" },
  { kind: "btn", id: "inlineCode", icon: Code, label: "行內程式碼" },
  { kind: "sep" },
  { kind: "btn", id: "h1", icon: Heading1, label: "標題 1" },
  { kind: "btn", id: "h2", icon: Heading2, label: "標題 2" },
  { kind: "btn", id: "h3", icon: Heading3, label: "標題 3" },
  { kind: "btn", id: "paragraph", icon: Pilcrow, label: "內文" },
  { kind: "sep" },
  { kind: "btn", id: "bulletList", icon: List, label: "項目清單" },
  { kind: "btn", id: "orderedList", icon: ListOrdered, label: "編號清單" },
  { kind: "btn", id: "blockquote", icon: Quote, label: "引用" },
  { kind: "btn", id: "codeBlock", icon: SquareCode, label: "程式碼區塊" },
  { kind: "btn", id: "hr", icon: Minus, label: "分隔線" },
];

interface EditorToolbarProps {
  /** 點擊按鈕時派發對應指令。 */
  onCommand: (id: EditorCommandId) => void;
}

/** 編輯器頂部格式工具列（presentational；指令由父層 onCommand 處理）。 */
export function EditorToolbar({ onCommand }: EditorToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b bg-background p-1.5">
      {toolbar.map((entry, i) =>
        entry.kind === "sep" ? (
          <Separator
            key={`sep-${i}`}
            orientation="vertical"
            className="mx-1 !h-5"
          />
        ) : (
          <Button
            key={entry.id}
            type="button"
            variant="ghost"
            size="icon-sm"
            title={entry.label}
            aria-label={entry.label}
            // 用 onMouseDown + preventDefault 保住編輯器選取（避免按鈕搶走焦點導致選取消失）。
            onMouseDown={(e) => {
              e.preventDefault();
              onCommand(entry.id);
            }}
          >
            <entry.icon />
          </Button>
        ),
      )}
    </div>
  );
}
