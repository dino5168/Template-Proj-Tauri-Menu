# 任務 

D:\MyProject\Template-Proj-Tauri-Menu\src\config\menu.ts

```
label: "設定",
    icon: Settings,
    ...
```

在 設定前面的 menu 新增 

label : 資料庫
submenu : 管理  -> submenu 資料庫表格
# 功能說明

1. 使用 rust 連結 sqllite 資料庫。 資料庫檔案 放在 設定->資料目錄 相同目錄下。 DataBase Name : LearnEnglish。

# 執行
建立 sqllite 資料庫。新增一個 test 資料表格 。
menu -> submenu -> submenu。評估目前的架構是否可以實作?
資料庫表格 : 左邊 Panel 使用 List 。右邊的 Panel 使用 Table UI 顯示 資料庫表格的資訊 。
如果任務不清楚需問使用者確認功能。
有現有的 UI 使用現有的不要自己造輪子。
採用原子化設計原則。
將執行計畫輸出到 Tasks\imp-db-table.md。