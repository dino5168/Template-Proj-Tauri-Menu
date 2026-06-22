import { useState } from "react";
import {
  ChevronRight,
  Folder,
  FolderOpen,
  FileText,
  type LucideIcon,
} from "lucide-react";
import type { FileNode } from "@/lib/tauri";
import { cn } from "@/lib/utils";

interface FileTreeProps {
  /** 根節點（含 children）。 */
  root: FileNode;
  /** 目前選取的檔案路徑（高亮用）。 */
  selectedPath: string | null;
  /** 點擊檔案時回呼其絕對路徑。 */
  onSelect: (path: string) => void;
  /** 檔案項目的圖示；預設 FileText。 */
  fileIcon?: LucideIcon;
}

/** 檔案樹：資料夾可展開/收合，檔案可點擊。 */
export function FileTree({
  root,
  selectedPath,
  onSelect,
  fileIcon = FileText,
}: FileTreeProps) {
  return (
    <ul className="py-1 text-sm">
      {(root.children ?? []).map((child) => (
        <TreeNode
          key={child.path}
          node={child}
          depth={0}
          selectedPath={selectedPath}
          onSelect={onSelect}
          fileIcon={fileIcon}
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
  fileIcon: LucideIcon;
}

function TreeNode({ node, depth, selectedPath, onSelect, fileIcon }: TreeNodeProps) {
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
                fileIcon={fileIcon}
              />
            ))}
          </ul>
        )}
      </li>
    );
  }

  const FileIcon = fileIcon;
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
        <FileIcon className="size-4 shrink-0 text-muted-foreground" />
        <span className="truncate">{node.name}</span>
      </button>
    </li>
  );
}
