import { Table2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface TableListProps {
  /** DB 內的資料表名稱清單。 */
  tables: string[];
  /** 目前選取的表名（高亮用）。 */
  selected: string | null;
  /** 點擊某表時回呼其名稱。 */
  onSelect: (name: string) => void;
}

/**
 * 左側資料表清單（presentational）。
 *
 * 仿 file-tree 的選取樣式：hover 與選取態用 `bg-accent`。
 */
export function TableList({ tables, selected, onSelect }: TableListProps) {
  if (tables.length === 0) {
    return <p className="p-3 text-sm text-muted-foreground">此資料庫沒有資料表</p>;
  }

  return (
    <ul className="py-1 text-sm">
      {tables.map((name) => (
        <li key={name}>
          <button
            type="button"
            onClick={() => onSelect(name)}
            className={cn(
              "flex w-full items-center gap-2 rounded-sm px-3 py-1 text-left hover:bg-accent hover:text-accent-foreground",
              name === selected && "bg-accent text-accent-foreground",
            )}
          >
            <Table2 className="size-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{name}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
