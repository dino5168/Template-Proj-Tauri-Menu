# 執行計畫：資料庫表格瀏覽器（SQLite）

> 目標：選單新增「資料庫 → 管理 → 資料庫表格」，開啟一個左 List（資料表名稱）／右 Table（Schema / 資料切換）的瀏覽器。
> 後端用 Rust `rusqlite`（bundled）連 `<dataRoot>/LearnEnglish.db`，啟動時自動建立 DB 與 `test` 表。

## 決策（已與使用者確認）

- **DB 驅動**：`rusqlite` + `bundled` feature（內嵌 SQLite，免外部安裝），自寫 `#[tauri::command]`，回 `Result<T, String>`，與 `list_dir` / `read_markdown` 同模式。**不**用 tauri-plugin-sql。
- **右側 Table**：上方 tab 切換『結構 / 資料』——結構走 `PRAGMA table_info`，資料走 `SELECT * LIMIT N`。
- **DB 位置**：`<resolveDataRoot()>/LearnEnglish.db`（與「設定 → 資料目錄」同目錄）。
- **UI**：左側 List 用既有元件刻（Button/div + ScrollArea 模式），右側用 shadcn 官方 `table`（`pnpm dlx shadcn@latest add table -y`），不自造輪子。

## 架構評估結論

現有 data-driven menu / view-store / ResizablePanel / tauri.ts Result 封裝**全可重用**，三層巢狀選單由 `app-menubar.tsx` 遞迴渲染原生支援。唯一缺口是 `components/ui/table.tsx`，以 shadcn add 補齊即符合慣例。

---

## 原子化設計分層

```
ui (原子)        : components/ui/table.tsx (shadcn add)
分子             : components/database/table-list.tsx     (左：資料表清單)
                   components/database/table-detail.tsx   (右：tab + Schema/Data 兩種 Table)
殼 (有機體)      : components/database/database-view.tsx  (工具列 + Resizable 分割，仿 DocBrowser)
邏輯層           : lib/tauri.ts                            (3 個 IPC 封裝)
                   lib/db-store.ts (選用，狀態極簡可內聚於 view，先不建)
後端             : src-tauri/src/lib.rs                    (rusqlite + 3 command)
接線             : config/menu.ts, lib/menu-actions.ts, lib/view-store.ts, App.tsx
```

---

## Step 1 — Rust 後端（`src-tauri/`）

### 1.1 Cargo 依賴（`src-tauri/Cargo.toml`）
```toml
rusqlite = { version = "0.32", features = ["bundled"] }
```
> `bundled` 編譯時內嵌 SQLite C 原始碼，無需系統安裝；首次 build 較久。

### 1.2 `src-tauri/src/lib.rs` 新增

DB 路徑由前端傳入（前端已有 `resolveDataRoot()`），後端只負責「給定 db 檔路徑 → 開／建／查」，維持與既有 command 一致的「路徑由前端決定」原則。

```rust
use rusqlite::Connection;

/// 開啟（不存在則建立）DB，並確保 demo 用的 `test` 表存在。
/// db_path 由前端組好（<dataRoot>/LearnEnglish.db）傳入。
#[tauri::command]
fn db_init(db_path: String) -> Result<(), String> {
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS test (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );",
    ).map_err(|e| e.to_string())?;
    Ok(())
}

/// 列出 DB 內所有使用者資料表名稱（排除 sqlite_ 內部表）。
#[tauri::command]
fn db_list_tables(db_path: String) -> Result<Vec<String>, String> {
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| r.get::<_, String>(0))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(rows)
}

/// 表的欄位結構（PRAGMA table_info）。
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct ColumnInfo {
    name: String,
    type_name: String,   // PRAGMA 的 "type"
    not_null: bool,
    pk: bool,
    default_value: Option<String>,
}

#[tauri::command]
fn db_table_schema(db_path: String, table: String) -> Result<Vec<ColumnInfo>, String> {
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
    // PRAGMA 不支援參數綁定 → 白名單驗證表名（防注入）
    if !is_valid_ident(&table) { return Err("非法表名".into()); }
    let mut stmt = conn
        .prepare(&format!("PRAGMA table_info(\"{table}\")"))
        .map_err(|e| e.to_string())?;
    let cols = stmt
        .query_map([], |r| {
            Ok(ColumnInfo {
                name: r.get(1)?,
                type_name: r.get(2)?,
                not_null: r.get::<_, i64>(3)? != 0,
                default_value: r.get(4)?,
                pk: r.get::<_, i64>(5)? != 0,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(cols)
}

/// 表的資料列（前 N 筆）。回傳欄名 + 字串化儲存格（避免動態型別序列化複雜度）。
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct TableRows {
    columns: Vec<String>,
    rows: Vec<Vec<Option<String>>>,
}

#[tauri::command]
fn db_table_rows(db_path: String, table: String, limit: u32) -> Result<TableRows, String> {
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
    if !is_valid_ident(&table) { return Err("非法表名".into()); }
    let mut stmt = conn
        .prepare(&format!("SELECT * FROM \"{table}\" LIMIT ?1"))
        .map_err(|e| e.to_string())?;
    let columns: Vec<String> = stmt.column_names().iter().map(|s| s.to_string()).collect();
    let col_count = columns.len();
    let rows = stmt
        .query_map([limit], |r| {
            let mut row = Vec::with_capacity(col_count);
            for i in 0..col_count {
                // 任意型別 → 顯示用字串
                let v: rusqlite::types::Value = r.get(i)?;
                row.push(value_to_string(v));
            }
            Ok(row)
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(TableRows { columns, rows })
}
```
輔助函式：
```rust
/// 只允許英數與底線的識別字（PRAGMA / table 名無法參數綁定，用白名單防注入）。
fn is_valid_ident(s: &str) -> bool {
    !s.is_empty() && s.chars().all(|c| c.is_ascii_alphanumeric() || c == '_')
}

fn value_to_string(v: rusqlite::types::Value) -> Option<String> {
    use rusqlite::types::Value::*;
    match v {
        Null => None,
        Integer(i) => Some(i.to_string()),
        Real(f) => Some(f.to_string()),
        Text(s) => Some(s),
        Blob(b) => Some(format!("<blob {} bytes>", b.len())),
    }
}
```

### 1.3 註冊 command（`invoke_handler`）
`generate_handler![... , db_init, db_list_tables, db_table_schema, db_table_rows]`

### 1.4 權限
不需新增 capability（rusqlite 是本地檔案 IO，非 plugin/window 操作）。`cargo check` 驗證。

> ⚠️ rusqlite 連線（`Connection`）非 `Send` 友善、每個 command 開新連線即可（DB 小、無高頻查詢，YAGNI 不引入連線池 / state 管理）。

---

## Step 2 — 前端 IPC 封裝（`src/lib/tauri.ts`）

對齊 Rust camelCase，新增介面與 4 個函式（全走 Result）：
```ts
export interface ColumnInfo {
  name: string; typeName: string; notNull: boolean; pk: boolean;
  defaultValue: string | null;
}
export interface TableRows { columns: string[]; rows: (string | null)[][]; }

export async function dbInit(dbPath: string): Promise<Result<void>> { /* invoke("db_init", { dbPath }) */ }
export async function dbListTables(dbPath: string): Promise<Result<string[]>> { /* db_list_tables */ }
export async function dbTableSchema(dbPath: string, table: string): Promise<Result<ColumnInfo[]>> { /* db_table_schema */ }
export async function dbTableRows(dbPath: string, table: string, limit: number): Promise<Result<TableRows>> { /* db_table_rows */ }
```
> 仿既有 `listDir` 的 try/catch + `toError()` 樣板。`DB_FILE_NAME = "LearnEnglish.db"` 常數也放這。

DB 路徑組合：前端用 `resolveDataRoot()` 取目錄，再以 `joinPath`（現於 menu-actions，可抽到 `lib/path.ts` 共用或在 view 內就地組）拼 `LearnEnglish.db`。
- **建議**：把 `joinPath` 從 `menu-actions.ts` 抽到 `src/lib/path.ts` 共用，避免重複。

---

## Step 3 — UI 元件（`src/components/database/`，原子化）

### 3.1 `components/ui/table.tsx`
`pnpm dlx shadcn@latest add table -y` 生成（Table/TableHeader/TableBody/TableRow/TableHead/TableCell）。

### 3.2 `table-list.tsx`（分子，左 Panel）
- props：`tables: string[]`、`selected: string | null`、`onSelect(name)`。
- presentational：垂直清單，每筆一個可點 row（用 `Button variant="ghost"` 或帶 `bg-accent` 的選取態），icon 用 lucide `Table2` / `Database`。
- 仿 `file-tree.tsx` 的選取樣式慣例（selected 加 `bg-accent`）。

### 3.3 `table-detail.tsx`（分子，右 Panel）
- props：`dbPath: string`、`table: string | null`。
- 內部 tab state：`"schema" | "data"`（極簡，`useState` 即可，不引入 tabs 元件；用兩個 Button 當切換，或 `pnpm dlx shadcn add tabs`——**建議加 shadcn `tabs`** 保持一致觀感）。
- 切到某 table / 某 tab 時 `useEffect` 呼叫 `dbTableSchema` 或 `dbTableRows`，用 `<Table>` 渲染。
- schema 表頭：欄名 / 型別 / PK / NotNull / 預設值。
- data 表頭：動態 `columns`，`null` 顯示為淡色「NULL」。
- loading / error / 空表 狀態處理。

### 3.4 `database-view.tsx`（有機體＝殼，仿 `doc-browser.tsx`）
- 工具列：`返回`（`setView("home")`）+ 顯示 DB 路徑 + `重新整理`（重抓 table 清單）。
- `ResizablePanelGroup`：左 `defaultSize={25}` `<TableList>`、`ResizableHandle`、右 `defaultSize={75}` `<TableDetail>`。
- 掛載流程（`useEffect`）：
  1. `resolveDataRoot()` → `dbPath = join(root, "LearnEnglish.db")`。
  2. `dbInit(dbPath)`（建 DB + `test` 表）。
  3. `dbListTables(dbPath)` → setState。
  4. 預設選第一張表。
- 狀態：`dbPath / tables / selected / error`。

---

## Step 4 — 接線（4 處）

### 4.1 `src/lib/view-store.ts`
`View` union 加 `"database"`。

### 4.2 `src/config/menu.ts`
`MenuActionId` 加 `"database.tables"`；import `Database`（已 import）+ `Wrench`/`Table2`（管理 / 表格 icon）。在 **「設定」群組之前** 插入：
```ts
{
  label: "資料庫",
  icon: Database,
  items: [
    {
      kind: "submenu",
      label: "管理",
      icon: Wrench,
      items: [
        { kind: "item", label: "資料庫表格", action: "database.tables", icon: Table2 },
      ],
    },
  ],
},
```
> 三層：群組「資料庫」→ submenu「管理」→ item「資料庫表格」。`app-menubar.tsx` 遞迴渲染原生支援，**不需動元件**。

### 4.3 `src/lib/menu-actions.ts`
`menuActions` 補：`"database.tables": () => setView("database"),`
（`Record<MenuActionId,...>` 完整性會逼你補，否則 TS 報錯。）

### 4.4 `src/App.tsx`
`useView()` 分支加 `case "database": return <DatabaseView />;`（或對應的條件渲染寫法，比照現有 markdown/html/editor/youtube 分支）。

---

## Step 5 — `tauri dev` HMR 注意

DB 寫到 `<dataRoot>`，dev 預設 `<專案根>/data/`。若 `data/` 在 Vite 監看範圍內，寫 DB 可能觸發 HMR 整頁重載（見根 CLAUDE.md 已知小事）。
→ **檢查 `vite.config.ts` `server.watch.ignored` 是否含 `data/**`，未含則加入**（與 `docs/**`、`htmls/**` 並列）。

---

## Step 6 — 驗證

```powershell
# 後端
cargo check                 # 在 src-tauri/：驗 rusqlite 編譯 + command 註冊
# 前端型別
pnpm build                  # tsc 型別檢查（MenuActionId 完整性、camelCase 對齊）
# 整合
pnpm tauri dev              # 選單 資料庫→管理→資料庫表格 → 應見 test 表，右側可切結構/資料
```
驗收：
- [ ] 選單三層可展開、點「資料庫表格」切到 database view。
- [ ] `<dataRoot>/LearnEnglish.db` 被建立，含 `test` 表。
- [ ] 左 List 列出 `test`；右側「結構」tab 顯示 id/name/created_at 欄位資訊。
- [ ] 「資料」tab 顯示資料列（空表顯示空狀態）。
- [ ] 切換深/淺色主題樣式正常。

---

## 影響檔案清單

| 檔 | 動作 |
|---|---|
| `src-tauri/Cargo.toml` | 加 `rusqlite` (bundled) |
| `src-tauri/src/lib.rs` | +4 command + 2 struct + 2 輔助函式 + 註冊 |
| `src/lib/tauri.ts` | +2 介面 +4 IPC 封裝 + `DB_FILE_NAME` |
| `src/lib/path.ts` | （新）抽 `joinPath` 共用（選用但建議） |
| `src/lib/view-store.ts` | `View` +`"database"` |
| `src/config/menu.ts` | +`MenuActionId` + 資料庫群組（設定之前）|
| `src/lib/menu-actions.ts` | +handler |
| `src/App.tsx` | +database 分支 |
| `src/components/ui/table.tsx` | shadcn add |
| `src/components/ui/tabs.tsx` | shadcn add（結構/資料切換）|
| `src/components/database/database-view.tsx` | （新）殼 |
| `src/components/database/table-list.tsx` | （新）左 List |
| `src/components/database/table-detail.tsx` | （新）右 Table + tab |
| `vite.config.ts` | 確認 `data/**` 在 watch ignored |

## 範疇外（YAGNI，不做）

- 不做新增/編輯/刪除資料列（純唯讀瀏覽）。
- 不做連線池 / DB state 管理（每 command 開新連線）。
- 不做多 DB 切換、SQL 自由查詢。
- `test` 表僅 demo 結構，不塞種子資料（除非後續要求）。
