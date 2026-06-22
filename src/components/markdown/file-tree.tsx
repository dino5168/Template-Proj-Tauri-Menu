import { useState } from "react";
import { ChevronRight, Folder, FolderOpen, FileText } from "lucide-react";
import type { FileNode } from "@/lib/tauri";
import { cn } from "@/lib/utils";

interface FileTreeProps {
  /** 根節點（含 children）。 */
  root: FileNode;
  /** 目前選取的檔案路徑（高亮用）。 */
  selectedPath: string | null;
  /** 點擊 markdown 檔時回呼其絕對路徑。 */
  onSelect: (path: string) => void;
}

/** 檔案樹：資料夾可展開/收合，markdown 檔可點擊預覽。 */
export function FileTree({ root, selectedPath, onSelect }: FileTreeProps) {
  return (
    <ul className="py-1 text-sm">
      {(root.children ?? []).map((child) => (
        <TreeNode
          key={child.path}
          node={child}
          depth={0}
          selectedPath={selectedPath}
          onSelect={onSelect}
        />
      ))}
    </ul>
  );
}

interface TreeNodeProps {
  node: FileNode;
  depth: number;
  selectedPath: string | null;
  onSelect: (path: string) => void;
}

function TreeNode({ node, depth, selectedPath, onSelect }: TreeNodeProps) {
  const [expanded, setExpanded] = useState(false);
  const isSelected = !node.isDir && node.path === selectedPath;
  // 縮排：每層 12px，基底 8px
  const paddingLeft = depth * 12 + 8;

  if (node.isDir) {
    return (
      <li>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          style={{ paddingLeft }}
          className="flex w-full items-center gap-1 rounded-sm py-1 pr-2 text-left hover:bg-accent hover:text-accent-foreground"
        >
          <ChevronRight
            className={cn(
              "size-3.5 shrink-0 text-muted-foreground transition-transform",
              expanded && "rotate-90",
            )}
          />
          {expanded ? (
            <FolderOpen className="size-4 shrink-0 text-muted-foreground" />
          ) : (
            <Folder className="size-4 shrink-0 text-muted-foreground" />
          )}
          <span className="truncate">{node.name}</span>
        </button>

        {expanded && (
          <ul>
            {(node.children ?? []).map((child) => (
              <TreeNode
                key={child.path}
                node={child}
                depth={depth + 1}
                selectedPath={selectedPath}
                onSelect={onSelect}
              />
            ))}
          </ul>
        )}
      </li>
    );
  }

  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(node.path)}
        style={{ paddingLeft: paddingLeft + 18 }}
        className={cn(
          "flex w-full items-center gap-1 rounded-sm py-1 pr-2 text-left hover:bg-accent hover:text-accent-foreground",
          isSelected && "bg-accent text-accent-foreground",
        )}
      >
        <FileText className="size-4 shrink-0 text-muted-foreground" />
        <span className="truncate">{node.name}</span>
      </button>
    </li>
  );
}
