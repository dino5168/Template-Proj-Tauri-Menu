import { useEffect, useState } from "react";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { TableList } from "@/components/database/table-list";
import { TableDetail } from "@/components/database/table-detail";
import { resolveDataRoot } from "@/lib/data-root-store";
import { joinPath } from "@/lib/path";
import { setView } from "@/lib/view-store";
import { DB_FILE_NAME, dbInit, dbListTables } from "@/lib/tauri";

/**
 * 資料庫表格瀏覽器：工具列 + 可調分割（資料表清單 | 結構/資料）。
 *
 * 掛載時解析 data root → 組 DB 路徑 → 建 DB（含 demo `test` 表）→ 列出資料表，
 * 並預設選取第一張。仿 DocBrowser 的殼結構。
 */
export function DatabaseView() {
  const [dbPath, setDbPath] = useState<string | null>(null);
  const [tables, setTables] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 初始化：解析路徑 → 建 DB → 列表。
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const root = await resolveDataRoot();
      if (cancelled) return;
      if (!root) {
        setError("無法解析資料目錄，請先於「設定 → 資料目錄」指定。");
        return;
      }
      const path = joinPath(root, DB_FILE_NAME);
      setDbPath(path);

      const init = await dbInit(path);
      if (cancelled) return;
      if (init.error) {
        setError(`建立資料庫失敗：${init.error.message}`);
        return;
      }
      await refreshTables(path, cancelled);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** 重抓資料表清單；保留現有選取（若仍存在），否則選第一張。 */
  async function refreshTables(path: string, cancelled = false): Promise<void> {
    const res = await dbListTables(path);
    if (cancelled) return;
    if (res.error) {
      setError(res.error.message);
      return;
    }
    setError(null);
    setTables(res.data);
    setSelected((prev) =>
      prev && res.data.includes(prev) ? prev : (res.data[0] ?? null),
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* 工具列 */}
      <div className="flex shrink-0 items-center gap-2 border-b px-3 py-1.5">
        <Button variant="ghost" size="sm" onClick={() => setView("home")}>
          <ArrowLeft className="size-4" />
          返回
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={!dbPath}
          onClick={() => dbPath && void refreshTables(dbPath)}
        >
          <RefreshCw className="size-4" />
          重新整理
        </Button>
        <span className="truncate text-xs text-muted-foreground" title={dbPath ?? ""}>
          {dbPath ?? "初始化中…"}
        </span>
      </div>

      {/* 主體 */}
      <div className="min-h-0 flex-1">
        {error ? (
          <p className="p-3 text-sm text-destructive">{error}</p>
        ) : (
          <ResizablePanelGroup orientation="horizontal">
            <ResizablePanel defaultSize={25} minSize={15}>
              <div className="h-full overflow-auto">
                <TableList tables={tables} selected={selected} onSelect={setSelected} />
              </div>
            </ResizablePanel>

            <ResizableHandle withHandle />

            <ResizablePanel defaultSize={75} minSize={30}>
              {dbPath && <TableDetail dbPath={dbPath} table={selected} />}
            </ResizablePanel>
          </ResizablePanelGroup>
        )}
      </div>
    </div>
  );
}
