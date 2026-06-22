import { convertFileSrc } from "@tauri-apps/api/core";

interface HtmlPanelProps {
  /** 目前選取的 HTML 檔絕對路徑；null 表示尚未選檔。 */
  path: string | null;
}

/**
 * 右側預覽：以 iframe 透過 asset protocol 直接載入 HTML 檔。
 *
 * 相對 CSS/圖片/連結由 webview 依檔案原位自動解析，無需手動處理。
 * sandbox 允許 same-origin 與 scripts（互動頁面可執行 JS）。
 */
export function HtmlPanel({ path }: HtmlPanelProps) {
  if (!path) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        從左側選擇一個 HTML 檔
      </div>
    );
  }

  return (
    <iframe
      // key 確保切換檔案時重新載入
      key={path}
      src={convertFileSrc(path)}
      title="HTML preview"
      className="h-full w-full border-0 bg-white"
      sandbox="allow-same-origin allow-scripts"
    />
  );
}
