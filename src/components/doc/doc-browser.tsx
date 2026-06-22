import { useEffect, useState, type ReactNode } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { ArrowLeft, FolderOpen, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { FileTree } from "@/components/doc/file-tree";
import { defaultDir, listDir, type FileNode } from "@/lib/tauri";
import { setView } from "@/lib/view-store";

interface DocBrowserProps {
  /** 過濾的副檔名（如 MARKDOWN_EXTS / HTML_EXTS）。 */
  exts: string[];
  /** 啟動時嘗試自動載入的預設目錄名（如 "docs" / "htmls"）。 */
  defaultSubdir: string;
  /** 檔案樹的檔案圖示。 */
  fileIcon?: LucideIcon;
  /** 渲染右側預覽；navigate 供樹內導航（HTML 可忽略）。 */
  renderPreview: (path: string | null, navigate: (p: string) => void) => ReactNode;
}

/**
 * 共用文件瀏覽器：工具列 + 可調分割（FileTree | 預覽）。
 *
 * Markdown / HTML viewer 皆以此為殼，差異只在 exts / 預設目錄 / icon / 預覽渲染。
 */
export function DocBrowser({
  exts,
  defaultSubdir,
  fileIcon,
  renderPreview,
}: DocBrowserProps) {
  const [root, setRoot] = useState<string | null>(null);
  const [tree, setTree] = useState<FileNode | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 啟動時嘗試載入預設目錄
  useEffect(() => {
    let cancelled = false;
    void defaultDir(defaultSubdir).then((dir) => {
      if (!cancelled && dir) void loadRoot(dir);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultSubdir]);

  async function loadRoot(dir: string): Promise<void> {
    const res = await listDir(dir, exts);
    if (res.error) {
      setError(res.error.message);
      setTree(null);
      return;
    }
    setError(null);
    setRoot(dir);
    setTree(res.data);
    setSelectedPath(null);
  }

  async function pickFolder(): Promise<void> {
    const picked = await open({ directory: true, multiple: false });
    if (typeof picked === "string") void loadRoot(picked);
  }

  return (
    <div className="flex h-full flex-col">
      {/* 工具列 */}
      <div className="flex shrink-0 items-center gap-2 border-b px-3 py-1.5">
        <Button variant="ghost" size="sm" onClick={() => setView("home")}>
          <ArrowLeft className="size-4" />
          返回
        </Button>
        <Button variant="outline" size="sm" onClick={() => void pickFolder()}>
          <FolderOpen className="size-4" />
          開啟資料夾
        </Button>
        <span className="truncate text-xs text-muted-foreground" title={root ?? ""}>
          {root ?? "未選擇資料夾"}
        </span>
      </div>

      {/* 主體 */}
      <div className="min-h-0 flex-1">
        <ResizablePanelGroup orientation="horizontal">
          <ResizablePanel defaultSize={25} minSize={15}>
            <div className="h-full overflow-auto">
              {tree ? (
                <FileTree
                  root={tree}
                  selectedPath={selectedPath}
                  onSelect={setSelectedPath}
                  fileIcon={fileIcon}
                />
              ) : (
                <p className="p-3 text-sm text-muted-foreground">
                  {error ?? "請點「開啟資料夾」選擇根目錄"}
                </p>
              )}
            </div>
          </ResizablePanel>

          <ResizableHandle withHandle />

          <ResizablePanel defaultSize={75} minSize={30}>
            {renderPreview(selectedPath, setSelectedPath)}
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  );
}
