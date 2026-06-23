import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import { Crepe } from "@milkdown/crepe";
import { callCommand } from "@milkdown/kit/utils";
import type { CmdKey } from "@milkdown/kit/core";
import {
  createCodeBlockCommand,
  insertHrCommand,
  toggleEmphasisCommand,
  toggleInlineCodeCommand,
  toggleStrongCommand,
  turnIntoTextCommand,
  wrapInBlockquoteCommand,
  wrapInBulletListCommand,
  wrapInHeadingCommand,
  wrapInOrderedListCommand,
} from "@milkdown/kit/preset/commonmark";
import { toggleStrikethroughCommand } from "@milkdown/kit/preset/gfm";

// Crepe 自帶主題：common 為結構樣式，frame 提供 .milkdown 上的 --crepe-color-* 變數，
// 顏色變數在 index.css 被重新對應到專案的 shadcn tokens，故會自動跟隨明暗主題。
import "@milkdown/crepe/theme/common/style.css";
import "@milkdown/crepe/theme/frame.css";

/** 工具列可觸發的編輯指令識別碼（與 milkdown 指令解耦，讓工具列保持 presentational）。 */
export type EditorCommandId =
  | "bold"
  | "italic"
  | "strike"
  | "inlineCode"
  | "h1"
  | "h2"
  | "h3"
  | "paragraph"
  | "bulletList"
  | "orderedList"
  | "blockquote"
  | "codeBlock"
  | "hr";

/** 對外暴露的命令式 API（由父層持 ref 呼叫）。 */
export interface MarkdownEditorHandle {
  /** 對目前選取套用一個編輯指令。 */
  run: (id: EditorCommandId) => void;
  /** 取得目前內容的 Markdown 字串。 */
  getMarkdown: () => string;
}

interface MarkdownEditorProps {
  /** 初始 Markdown 內容。 */
  defaultValue?: string;
}

/**
 * EditorCommandId → milkdown 指令的對照表。
 *
 * 用 dict dispatch 取代散落的 switch，新增按鈕只需在此補一筆 + 在工具列 config 加項目。
 * 值為一個吃 Crepe 的函式，內部以 `editor.action(callCommand(...))` 執行。
 */
const commandRunners: Record<EditorCommandId, (crepe: Crepe) => void> = {
  bold: (c) => action(c, toggleStrongCommand.key),
  italic: (c) => action(c, toggleEmphasisCommand.key),
  strike: (c) => action(c, toggleStrikethroughCommand.key),
  inlineCode: (c) => action(c, toggleInlineCodeCommand.key),
  h1: (c) => action(c, wrapInHeadingCommand.key, 1),
  h2: (c) => action(c, wrapInHeadingCommand.key, 2),
  h3: (c) => action(c, wrapInHeadingCommand.key, 3),
  paragraph: (c) => action(c, turnIntoTextCommand.key),
  bulletList: (c) => action(c, wrapInBulletListCommand.key),
  orderedList: (c) => action(c, wrapInOrderedListCommand.key),
  blockquote: (c) => action(c, wrapInBlockquoteCommand.key),
  codeBlock: (c) => action(c, createCodeBlockCommand.key),
  hr: (c) => action(c, insertHrCommand.key),
};

/** 包一層 editor.action(callCommand(...))，並把焦點還給編輯器。 */
function action<T>(crepe: Crepe, key: CmdKey<T>, payload?: T): void {
  crepe.editor.action(callCommand(key, payload));
}

/**
 * Obsidian 式 Live Preview 的 Markdown 編輯器（封裝 milkdown Crepe）。
 *
 * 在單一面板邊打字邊原地渲染；清單 / Tab 縮排 / Enter 自動延續清單等鍵盤行為由 Crepe（ProseMirror）內建。
 * 父層透過 ref 取得 {@link MarkdownEditorHandle} 來下工具列指令或取出 Markdown。
 */
export const MarkdownEditor = forwardRef<MarkdownEditorHandle, MarkdownEditorProps>(
  function MarkdownEditor({ defaultValue = "" }, ref) {
    const rootRef = useRef<HTMLDivElement>(null);
    const crepeRef = useRef<Crepe | null>(null);

    useImperativeHandle(ref, () => ({
      run: (id) => {
        const crepe = crepeRef.current;
        if (crepe) commandRunners[id](crepe);
      },
      getMarkdown: () => crepeRef.current?.getMarkdown() ?? "",
    }));

    useEffect(() => {
      const root = rootRef.current;
      if (!root) return;
      const crepe = new Crepe({ root, defaultValue });
      crepeRef.current = crepe;
      const created = crepe.create();
      return () => {
        crepeRef.current = null;
        // 等 create() resolve 後再 destroy，避免 StrictMode 雙掛時銷毀尚未建好的實例。
        void created.then(() => crepe.destroy());
      };
      // defaultValue 僅作為初始內容，之後不重建編輯器（避免清掉使用者輸入）。
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return <div ref={rootRef} className="h-full" />;
  },
);
