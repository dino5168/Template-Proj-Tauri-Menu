import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react(), tailwindcss()],

  // shadcn/ui 路徑別名
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      //
      // 同時忽略文件內容根目錄（docs / htmls）：使用者在編輯器開啟並「儲存檔案」
      // 時會寫入這些目錄，若被 Vite 監看會觸發 HMR 整頁重載，使 in-memory 的
      // view / editor 狀態歸零而「跳回首頁」。這些目錄是內容資料、非原始碼，
      // 本就不需 HMR。（僅影響 `tauri dev`；正式 build 無 watcher、無此問題。）
      ignored: ["**/src-tauri/**", "**/docs/**", "**/htmls/**", "**/data/**"],
    },
  },
}));
