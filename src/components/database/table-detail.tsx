import { useEffect, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  dbTableRows,
  dbTableSchema,
  type ColumnInfo,
  type TableRows,
} from "@/lib/tauri";

/** 資料 tab 一次抓取的最大列數。 */
const ROW_LIMIT = 200;

interface TableDetailProps {
  /** DB 檔絕對路徑。 */
  dbPath: string;
  /** 目前選取的表名；null 表示尚未選取。 */
  table: string | null;
}

/**
 * 右側資料表檢視：上方 tab 切換「結構 / 資料」。
 *
 * - 結構：PRAGMA table_info 的欄位定義。
 * - 資料：SELECT * LIMIT N 的資料列。
 * 換表或換 tab 時依需求抓取對應資料。
 */
export function TableDetail({ dbPath, table }: TableDetailProps) {
  if (!table) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
        請從左側選擇一張資料表
      </div>
    );
  }

  return (
    <Tabs defaultValue="schema" className="flex h-full flex-col gap-0">
      <div className="shrink-0 border-b px-3 py-1.5">
        <TabsList>
          <TabsTrigger value="schema">結構</TabsTrigger>
          <TabsTrigger value="data">資料</TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="schema" className="min-h-0 flex-1 overflow-auto">
        <SchemaTable dbPath={dbPath} table={table} />
      </TabsContent>
      <TabsContent value="data" className="min-h-0 flex-1 overflow-auto">
        <DataTable dbPath={dbPath} table={table} />
      </TabsContent>
    </Tabs>
  );
}

/** 包裝載入 / 錯誤 / 空狀態的小工具。 */
function StateMessage({ children }: { children: React.ReactNode }) {
  return <p className="p-4 text-sm text-muted-foreground">{children}</p>;
}

/** 結構檢視：欄名 / 型別 / PK / NotNull / 預設值。 */
function SchemaTable({ dbPath, table }: { dbPath: string; table: string }) {
  const [cols, setCols] = useState<ColumnInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setCols(null);
    setError(null);
    void dbTableSchema(dbPath, table).then((res) => {
      if (cancelled) return;
      if (res.error) setError(res.error.message);
      else setCols(res.data);
    });
    return () => {
      cancelled = true;
    };
  }, [dbPath, table]);

  if (error) return <StateMessage>讀取結構失敗：{error}</StateMessage>;
  if (!cols) return <StateMessage>載入中…</StateMessage>;
  if (cols.length === 0) return <StateMessage>此表沒有欄位</StateMessage>;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>欄位</TableHead>
          <TableHead>型別</TableHead>
          <TableHead>PK</TableHead>
          <TableHead>NotNull</TableHead>
          <TableHead>預設值</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {cols.map((c) => (
          <TableRow key={c.name}>
            <TableCell className="font-medium">{c.name}</TableCell>
            <TableCell className="text-muted-foreground">{c.typeName || "—"}</TableCell>
            <TableCell>{c.pk ? "✓" : ""}</TableCell>
            <TableCell>{c.notNull ? "✓" : ""}</TableCell>
            <TableCell className="text-muted-foreground">
              {c.defaultValue ?? <span className="italic opacity-60">NULL</span>}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/** 資料檢視：動態欄頭 + 前 N 筆資料列。 */
function DataTable({ dbPath, table }: { dbPath: string; table: string }) {
  const [data, setData] = useState<TableRows | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);
    void dbTableRows(dbPath, table, ROW_LIMIT).then((res) => {
      if (cancelled) return;
      if (res.error) setError(res.error.message);
      else setData(res.data);
    });
    return () => {
      cancelled = true;
    };
  }, [dbPath, table]);

  if (error) return <StateMessage>讀取資料失敗：{error}</StateMessage>;
  if (!data) return <StateMessage>載入中…</StateMessage>;
  if (data.rows.length === 0) return <StateMessage>此表沒有資料</StateMessage>;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          {data.columns.map((col) => (
            <TableHead key={col}>{col}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.rows.map((row, i) => (
          <TableRow key={i}>
            {row.map((cell, j) => (
              <TableCell key={j}>
                {cell ?? <span className="italic text-muted-foreground opacity-60">NULL</span>}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
