import { useSyncExternalStore } from "react";

/**
 * 極輕量的主視圖切換 store（不引入狀態管理套件）。
 *
 * - menu action（非 React）用 setView() 切換。
 * - React 元件用 useView() 訂閱。
 */
export type View = "home" | "markdown" | "html" | "editor" | "youtube" | "database";

let current: View = "home";
const listeners = new Set<() => void>();

/** 切換主視圖並通知訂閱者。 */
export function setView(view: View): void {
  if (view === current) return;
  current = view;
  listeners.forEach((notify) => notify());
}

/** 訂閱當前主視圖。 */
export function useView(): View {
  return useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    () => current,
  );
}
