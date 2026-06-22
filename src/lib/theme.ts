/**
 * 輕量 theme 管理（light / dark），透過切換 <html> 的 `.dark` class 生效。
 *
 * - 使用者選過則持久化於 localStorage；未選過則跟隨系統 prefers-color-scheme。
 * - 不依賴 React context；menu action 直接呼叫 toggleTheme() 即可。
 */

const STORAGE_KEY = "theme";

type Theme = "light" | "dark";

/** 系統當前偏好的主題。 */
function systemTheme(): Theme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

/** 讀取使用者明確選過的主題；沒有則回傳 null。 */
function storedTheme(): Theme | null {
  const value = localStorage.getItem(STORAGE_KEY);
  return value === "light" || value === "dark" ? value : null;
}

/** 解析實際要套用的主題：使用者選過用其值，否則跟隨系統。 */
export function resolveTheme(): Theme {
  return storedTheme() ?? systemTheme();
}

/** 將主題套用到 DOM（增減 <html> 的 `.dark`）。 */
function apply(theme: Theme): void {
  document.documentElement.classList.toggle("dark", theme === "dark");
}

/** 啟動時套用既有設定；須在 render 前呼叫以避免 FOUC（畫面閃白）。 */
export function initTheme(): void {
  apply(resolveTheme());
}

/** 設定並持久化主題。 */
export function setTheme(theme: Theme): void {
  localStorage.setItem(STORAGE_KEY, theme);
  apply(theme);
}

/** 在 light / dark 間切換。 */
export function toggleTheme(): void {
  setTheme(resolveTheme() === "dark" ? "light" : "dark");
}
