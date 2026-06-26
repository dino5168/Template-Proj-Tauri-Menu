# Git 協作管理規範（Branch + PR Workflow）

> 適用本專案多人協作。核心觀念：**Claude Code 只是編輯器/助手，協作完全由 git 負責**。
> 兩人都用 Claude Code 改碼 = 兩人都用 VS Code 改碼，管理方式相同。
> 環境：Windows + PowerShell + `pnpm` + `gh` CLI。

---

## 0. 鐵則

1. **絕不兩人同時直接在 `main` 上工作。** 每人各開 feature branch。
2. `main` 永遠維持「已審查、可運作」狀態，只透過 PR 合併進去。
3. 小步快跑：commit 切細、PR 切小 → 衝突面積最小。
4. 開工前先同步遠端（`git fetch` + rebase），收工前 push。

---

## 1. 標準流程（每個功能一條分支）

### 1-1. 從最新 main 拉分支

```powershell
git switch main
git pull --ff-only origin main      # 先把本地 main 同步到遠端
git switch -c feat/<功能名>          # 例：feat/settings-menu
```

> 分支命名慣例：`feat/xxx`（功能）、`fix/xxx`（修 bug）、`docs/xxx`（文件）、`refactor/xxx`。

### 1-2. 改碼 → 驗證 → commit

```powershell
# ...改碼（可請 Claude Code 協助）...

pnpm build          # 前端：tsc 型別檢查 + vite build（最快驗證 TS/import）
cargo check         # 在 src-tauri/：驗證 Rust commands + capabilities 權限字串

git add <檔案>       # 只加相關檔，避免把無關雜訊混進 commit
git commit -m "簡述這次改了什麼與為什麼"
```

> **commit 訊息**：第一行祈使句簡述（≤50 字），需要時空一行寫細節。一個 commit 只做一件事。

### 1-3. push 並開 PR

```powershell
git push -u origin feat/<功能名>     # 第一次推，-u 建立追蹤關係
gh pr create --fill                  # 用 commit 內容自動填 PR 標題/說明
# 或手動指定：
gh pr create --title "標題" --body "說明"
```

### 1-4. 審查 → 合併

- 在 GitHub 上由另一人 review、approve。
- 合併方式建議 **Squash and merge**（把分支多個 commit 壓成一個進 main，歷史乾淨）。
- 合併後刪遠端分支，本地清理：

```powershell
git switch main
git pull --ff-only origin main
git branch -d feat/<功能名>          # 刪本地分支
git fetch --prune                    # 清掉已被刪的遠端追蹤分支
```

---

## 2. 同步與衝突處理

### 2-1. 把自己的分支跟上最新 main（rebase）

當別人的 PR 先合進 `main`，你要把自己的分支墊到最新 main 之上：

```powershell
git switch feat/<功能名>
git fetch origin
git rebase origin/main
```

- **無衝突** → 自動完成，接著 `git push --force-with-lease`（rebase 改寫歷史，需 force；`--force-with-lease` 較安全，遠端有別人新 commit 時會擋下）。
- **有衝突** → 見下。

### 2-2. 解衝突

只有「兩人改到同一檔的相鄰區塊」才會衝突。改不同檔、或同檔不同段落，git 自動合併。

```powershell
# rebase 中斷並列出衝突檔
# 1. 打開衝突檔，處理 <<<<<<< ======= >>>>>>> 標記，挑選/合併要保留的內容
# 2. 標記解決：
git add <衝突檔>
# 3. 繼續：
git rebase --continue
# （想放棄整個 rebase 回到原狀：git rebase --abort）
```

> **可直接請 Claude Code 協助**：「幫我解 git rebase 的衝突」——它會讀衝突檔、判斷兩邊意圖、幫你合。但它**看不到對方的改動**，要先 `git fetch` 把對方的東西拉進來才有得比對。

### 2-3. 每天的習慣

- **開工前**：`git fetch origin` → `git rebase origin/main`（讓分支始終貼著最新 main）。
- **收工前**：commit + push，別把改動只留在本機。

---

## 3. 暫存與救援

```powershell
git stash                    # 暫存未完成的改動（切分支前用）
git stash pop                # 取回

git restore <檔>             # 丟棄某檔未 commit 的改動
git restore --staged <檔>    # 把 add 過的取消暫存（保留改動）

git reflog                   # 找回「不小心 reset/rebase 丟掉」的 commit
git reset --hard <commit>    # ⚠️ 危險：丟棄改動回到指定 commit，動手前先確認
```

---

## 4. gh CLI 速查

```powershell
gh auth login                # 登入（互動式，選 GitHub.com / HTTPS / 瀏覽器授權）
gh auth status               # 看登入狀態

gh pr create --fill          # 從 commit 開 PR
gh pr list                   # 列出 PR
gh pr view [<編號>] --web     # 在瀏覽器開 PR
gh pr checkout <編號>         # 切到某個 PR 的分支（review 別人的 PR）
gh pr merge <編號> --squash --delete-branch   # 合併並刪分支
```

> 安裝：`winget install --id GitHub.cli -e`。裝完**需重開終端**讓 PATH 生效，否則暫時用完整路徑 `& "C:\Program Files\GitHub CLI\gh.exe"`。

---

## 5. 常見情境對照

| 情境 | 做法 |
| --- | --- |
| 我和同事都動了原始碼 | 各開 feature branch，各自 PR；git 合併，衝突才需手解 |
| 我直接在 main 上改了還沒 commit | `git switch -c feat/xxx`（未 commit 改動會跟著到新分支）→ commit |
| 同事的 PR 先合了，我的分支落後 | `git fetch` → `git rebase origin/main` → `git push --force-with-lease` |
| 改到一半要切去處理別的事 | `git stash` → 切分支 → 回來 `git stash pop` |
| 不小心 reset 丟了 commit | `git reflog` 找回 commit hash → `git switch -c rescue <hash>` |
| commit 訊息打錯（還沒 push） | `git commit --amend -m "新訊息"` |

---

## 6. 不該做的事

- ❌ 兩人同時直接 push `main`。
- ❌ 對「已 push 且別人可能基於它工作」的分支 `git push --force`（要用 `--force-with-lease`，或乾脆別 force 公共分支）。
- ❌ 一個 commit 塞一堆無關改動（功能 + 格式 + 重新命名混在一起）。
- ❌ 把 secret／`.env`／大型產物 commit 進 repo（`.gitignore` 該擋的要擋）。
