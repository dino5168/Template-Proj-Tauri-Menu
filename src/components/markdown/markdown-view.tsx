import { FileText } from "lucide-react";
import { DocBrowser } from "@/components/doc/doc-browser";
import { MarkdownPanel } from "@/components/markdown/markdown-panel";
import { MARKDOWN_EXTS } from "@/lib/tauri";

/** Markdown 瀏覽器：DocBrowser + MarkdownPanel 預覽，預設目錄 docs。 */
export function MarkdownView() {
  return (
    <DocBrowser
      exts={MARKDOWN_EXTS}
      defaultSubdir="docs"
      fileIcon={FileText}
      renderPreview={(path, navigate) => (
        <MarkdownPanel path={path} onNavigate={navigate} />
      )}
    />
  );
}
