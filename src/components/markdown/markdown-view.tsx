import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { ArrowLeft, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { FileTree } from "@/components/markdown/file-tree";
import { MarkdownPanel } from "@/components/markdown/markdown-panel";
import { defaultDocsDir, listDir, type FileNode } from "@/lib/tauri";
import { setView } from "@/lib/view-store";

/** Markdown 瀏覽器主畫面：工具列 + 可調分割（FileTree | 預覽）。 */
export function MarkdownView() {
  const [root, setRoot] = useState<string | null>(null);
  const [tree, setTree] = useState<FileNode | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 啟動時嘗試載入預設 docs 目錄
  useEffect(() => {
    let cancelled = false;
    void defaultDocsDir().then((dir) => {
      if (!cancelled && dir) void loadRoot(dir);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadRoot(dir: string): Promise<void> {
    const res = await listDir(dir);
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
                />
              ) : (
                <p className="p-3 text-sm text-muted-foreground">
                  {error ?? "請點「開啟資料夾」選擇 Markdown 根目錄"}
                </p>
              )}
            </div>
          </ResizablePanel>

          <ResizableHandle withHandle />

          <ResizablePanel defaultSize={75} minSize={30}>
            <MarkdownPanel path={selectedPath} onNavigate={setSelectedPath} />
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  );
}
