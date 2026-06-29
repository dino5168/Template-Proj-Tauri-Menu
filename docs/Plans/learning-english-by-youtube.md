
# 任務
 D:\MyProject\Template-Proj-Tauri-Menu\src\config\menu.ts
 ```
 ....
 {
    label: "設定",
    icon: Settings,
    items: [
      { kind: "item", label: "環境設定", action: "settings.workdir", icon: FolderCog },
    ],
  },
 ```
 在 menu.ts 設定前面加入一個 menu。
 
 label : "學習"
 submenu : Youtube
 
# 功能描述

上方 Youtbue Url 輸入 。確定之後 Youtube Player。
左側 Panel 顯示 Youtube Player。
右側 Panel 顯示字幕 ( 目前先不實做、保留未來實作)
採原子化設計、然後組成 的方式設計。

# 執行
將執行計畫先輸出到 Tasks\imp-youtube-player.md。
如果功能不清楚詢問使用者。







