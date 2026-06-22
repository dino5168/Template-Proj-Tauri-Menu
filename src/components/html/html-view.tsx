import { FileCode } from "lucide-react";
import { DocBrowser } from "@/components/doc/doc-browser";
import { HtmlPanel } from "@/components/html/html-panel";
import { HTML_EXTS } from "@/lib/tauri";

/** HTML 瀏覽器：DocBrowser + HtmlPanel 預覽，預設目錄 htmls。 */
export function HtmlView() {
  return (
    <DocBrowser
      exts={HTML_EXTS}
      defaultSubdir="htmls"
      fileIcon={FileCode}
      renderPreview={(path) => <HtmlPanel path={path} />}
    />
  );
}
