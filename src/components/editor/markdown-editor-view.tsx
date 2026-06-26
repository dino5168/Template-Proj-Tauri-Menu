import { useEffect, useRef } from "react";
import { EditorToolbar } from "@/components/editor/editor-toolbar";
import {
  MarkdownEditor,
  type MarkdownEditorHandle,
} from "@/components/editor/markdown-editor";
import {
  clearActiveEditor,
  setActiveEditor,
  useEditorDocument,
} from "@/lib/editor-store";

/**
 * 編輯器主視圖：頂部格式工具列 + Obsidian 式 Live Preview 編輯器。
 *
 * 為 view-store 的 "editor" 視圖，由 `file.new`（新檔模板）/ `file.open`（既有檔）
 * 經 editor-store 注入內容。換檔靠 `key={docId}` 強制 `MarkdownEditor` remount，
 * 而非改 `defaultValue`（後者被刻意設計成不重建編輯器，見 markdown-editor.tsx）。
 */
export function MarkdownEditorView() {
  const editorRef = useRef<MarkdownEditorHandle>(null);
  const { content, docId } = useEditorDocument();

  // 把編輯器的取值函式註冊到 editor-store，供選單 file.save 取出當前內容。
  // 註冊一次即可：換檔只 remount 子層 MarkdownEditor，本視圖與 editorRef 不變，
  // getMarkdown 閉包動態讀取 editorRef.current，故始終指向最新實例。
  useEffect(() => {
    const getMarkdown = () => editorRef.current?.getMarkdown() ?? "";
    setActiveEditor(getMarkdown);
    return () => clearActiveEditor(getMarkdown);
  }, []);

  return (
    <div className="flex h-full flex-col">
      <EditorToolbar onCommand={(id) => editorRef.current?.run(id)} />
      <div className="min-h-0 flex-1 overflow-auto">
        <MarkdownEditor key={docId} ref={editorRef} defaultValue={content} />
      </div>
    </div>
  );
}
