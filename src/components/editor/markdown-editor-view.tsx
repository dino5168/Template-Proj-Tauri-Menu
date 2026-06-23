import { useRef } from "react";
import { EditorToolbar } from "@/components/editor/editor-toolbar";
import {
  MarkdownEditor,
  type MarkdownEditorHandle,
} from "@/components/editor/markdown-editor";

/** 新檔的初始內容，提供一點 Live Preview 的即視感。 */
const INITIAL_DOC = `# 未命名文件

開始撰寫你的 **Markdown**。

- 邊打字邊即時渲染
- 按 Tab 縮排清單、Enter 自動延續清單
- 上方工具列可套用格式
`;

/**
 * 「開新檔案」主視圖：頂部格式工具列 + Obsidian 式 Live Preview 編輯器。
 *
 * 為 view-store 的 "editor" 視圖；目前為純編輯（內容存記憶體，尚未提供存檔）。
 */
export function MarkdownEditorView() {
  const editorRef = useRef<MarkdownEditorHandle>(null);

  return (
    <div className="flex h-full flex-col">
      <EditorToolbar onCommand={(id) => editorRef.current?.run(id)} />
      <div className="min-h-0 flex-1 overflow-auto">
        <MarkdownEditor ref={editorRef} defaultValue={INITIAL_DOC} />
      </div>
    </div>
  );
}
