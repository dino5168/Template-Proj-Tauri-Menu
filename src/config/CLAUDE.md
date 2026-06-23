# src/config/ — Data-driven 選單設定

> 選單**不寫死 JSX**，由 `menu.ts` 的型別化結構驅動。這是一個跨三檔的子系統，改任一處要同步。

## 跨檔關係（新增一個選單項目 = 改這兩個檔）

```
config/menu.ts          ──(MenuActionId 型別 + menuConfig 項目)
lib/menu-actions.ts     ──(同名 action 的 handler)
components/layout/app-menubar.tsx  ──(純渲染，通常不動)
```

1. **`menu.ts`**：在 `MenuActionId` union 加新 id（例 `"file.save"`），並在 `menuConfig` 對應位置加 `{ kind: "item", label, action, icon?, shortcut? }`。
2. **`lib/menu-actions.ts`**：在 `menuActions` 物件補上同名 handler。
   - **漏實作會被 TS 擋下**（`Record<MenuActionId, ...>` 要求完整）——這是刻意的安全網。
3. `app-menubar.tsx` 會自動遞迴渲染，不需更動。

## 型別結構（discriminated union）

- `MenuEntry` = `item` | `separator` | `submenu`，`MenuGroup` 為頂層選單。
- `icon?: LucideIcon`、`shortcut?: string` 皆可選。
- **`shortcut` 僅顯示用**——不會真的註冊鍵盤快捷鍵。要真正生效需另外註冊（見 `docs/setup-menu.md` 的「延伸」）。

## 慣例

- 巢狀選單用 `kind: "submenu"` + `items`，渲染端已支援任意深度。
- 不要為了一個選單行為跑去元件寫 inline onClick；一律走 action id → dispatch table。
