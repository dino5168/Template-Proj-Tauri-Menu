# src/components/layout/ — 自訂標題列 + 視窗控制

> 原生標題列已關（`decorations: false`），整條 bar、最小化/最大化/關閉/拖曳**全由前端負責**。改這裡牽動三處一致性。

## 檔案

- `title-bar.tsx`：版面殼 = Logo + `<AppMenubar>` + 拖曳區 + `<WindowControls>`。
- `window-controls.tsx`：`getCurrentWindow()` 操作視窗；`onResized` 同步最大化/還原圖示。
- `app-menubar.tsx`：把 `config/menu.ts` 遞迴渲染成 shadcn Menubar（資料驅動，見 `src/config/CLAUDE.md`）。

## 三處必須一致（少一個按鈕就靜默失效）

| 處 | 內容 |
| --- | --- |
| `src-tauri/tauri.conf.json` | `decorations: false`、`maximized: true` |
| `src-tauri/capabilities/default.json` | 對應 `core:window:allow-*` 權限 |
| 本目錄元件 | 實際呼叫 `minimize / toggleMaximize / close / isMaximized / onResized` 等 |

→ 新增一個視窗操作（例：固定釘選、全螢幕鈕）時，**先到 capabilities 加權限字串並 `cargo check`**，否則按了沒反應也不報錯。

## 拖曳規則（最容易弄錯）

- 可拖曳的區塊加 `data-tauri-drag-region`（header 本體、Logo、中段填充 div）。
- **互動元素（選單、按鈕、控制鈕）不要加** `data-tauri-drag-region`，否則點擊會變成拖視窗。
- 圖片記得 `draggable={false}`。

## 樣式慣例

- 控制鈕用 `text-muted-foreground` + hover 改 `bg-accent`；關閉鈕 hover 用 `bg-destructive`。
- 標題列 logo（`title-bar.tsx` 的 `<img src="/deepseek-icon.svg">`）與 app icon **互相獨立**——換 app icon 不會換這個，反之亦然。
