# 廟管家 TempleFlow

LINE LIFF 宮廟服務測試版。前端靜態網站，Vercel Node API 驗證 LINE 身分與管理員權限；試算表可透過 **Google Apps Script** 儲存資料，再用 Excel 開啟匯出的 CSV。以澎湖溫王宮為設計情境，尚未成為宮廟正式服務。

## 已完成

- 問事預約、點燈登記、志工報名、進香申請；LINE 登入後查看自己的申請。
- 指定 LINE 管理員審核、今日叫號、CSV 名冊匯出與審核狀態 CSV 匯入。
- 點燈付款方式紀錄為 **LINE Pay／未付款**。目前**沒有 LINE Pay 付款連結、扣款或付款確認**，請勿宣稱付款完成。
- 試算表自動建立 `appointments`、`lights`、`volunteers`、`pilgrimages`、`settings` 工作表；僅供單一示範宮廟使用。

## 你提供的 Apps Script 網址

`https://script.google.com/macros/s/AKfycbyzZhjlCrckOlN8srQ3K5DeT3rnTlONeKN0jo1Vsb67H_JEb5HLoYncfFMjD7yw8_g5/exec`

目前從未登入的環境讀取這個網址會跳轉至 Google 登入，故它**尚無法作為 Vercel 後端的公開資料代理**；程式也無法得知現有 Apps Script 的資料格式。須在該 Apps Script 專案中檢查原始碼，將 [apps-script/Code.gs](apps-script/Code.gs) 的協定部署為新的版本，並設定部署存取權為 **任何人**。只有伺服器持有的共用密鑰可執行資料操作，靜態網頁不能取得密鑰。

## Apps Script 設定

1. 建立專用 Google 試算表；複製網址中的試算表 ID。不要和其他專案共用原本的工作表。
2. 在 Apps Script 編輯器檢查既有程式，將本儲存庫 `apps-script/Code.gs` 用於**專門的 TempleFlow 部署**；若原本腳本服務其他網站，請另建 Apps Script 專案，避免覆蓋其功能。
3. 專案設定 → **指令碼屬性**：`TEMPLEFLOW_SHEET_ID` 填試算表 ID；`TEMPLEFLOW_SHARED_SECRET` 填長度至少 32 字元的隨機字串，且在 Vercel 設定完全相同的值。不要把密鑰提交到 GitHub 或貼到對話。
4. 部署 → 新部署 → 網頁應用程式；**執行身分：我**、**存取權：任何人**。之後修改程式須建立新部署版本。開啟 `/exec` 時應看到 JSON `{"ok":true,"service":"TempleFlow Apps Script","ready":true}`，不能跳到 Google 登入頁。若部署取得新 URL，Vercel 的 `APPS_SCRIPT_URL` 也要同步更新。

## 網站與 API 部署

從 GitHub 將此儲存庫匯入 Vercel，Framework Preset 選 Other；設定以下環境變數後部署：

| 名稱 | 值 |
|---|---|
| `LINE_CHANNEL_ID` | LIFF 所屬 LINE Login Channel ID，例如 `2011717805`；以 LINE Developers 畫面為準 |
| `APPS_SCRIPT_URL` | 上述已正確部署、可公開讀到 JSON 的 `/exec` 網址 |
| `APPS_SCRIPT_SHARED_SECRET` | 與 Apps Script 指令碼屬性相同的私密隨機字串 |
| `ADMIN_LINE_USER_IDS` | 管理員的 LINE user ID（`U` 開頭），多人用逗號分隔 |
| `ALLOWED_ORIGIN` | 若網頁在 GitHub Pages：`https://yungling00.github.io`；整站在 Vercel 則可省略 |

最簡單的部署是整站使用 Vercel 網址，`config.js` 保持空字串，並把 LINE Developers 的 LIFF Endpoint URL 改成 Vercel 首頁 HTTPS 網址（含結尾斜線）。若繼續用 GitHub Pages 當前端，將 `config.js` 的 `TEMPLEFLOW_API_BASE` 改成實際 Vercel 網址；GitHub Pages 自己不能執行 `/api`。

開啟 Vercel `/api/health` 確認 `ready:true`，再從 LINE 開啟 LIFF，送出一筆測試資料，看試算表是否出現。`ready:true` 只檢查設定是否存在，不代表 Apps Script 寫入已成功。

## 另一種試算表後端

若不採用 Apps Script，也可使用原本的 Google Sheets API 服務帳號模式：**不要設定** `APPS_SCRIPT_URL`，改填 `GOOGLE_SHEET_ID`、`GOOGLE_SERVICE_ACCOUNT_JSON`，把服務帳號設為試算表編輯者。兩種模式擇一。服務帳號 JSON 僅存 Vercel 環境變數。

## 本機測試

Node.js 20+：`npm test`。用 `node --env-file=.env server.js` 可在本機啟動測試網站。LIFF Endpoint 必須是 HTTPS，因此本機瀏覽器不能直接完成正式 LINE 登入。

## 上線限制

這是測試版，尚待宮廟確認服務時間、個資告知與管理權限。不提供正式付款、LINE OA 推播、AI 解籤、燈位分配、QR 簽到或武轎定位。Google Sheets 適用原型及低量使用，大量使用或多宮廟隔離應遷移至交易式資料庫。
