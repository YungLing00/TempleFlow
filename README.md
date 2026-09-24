# 廟管家 TempleFlow

LINE LIFF 宮廟服務測試版。前端是靜態 HTML / JavaScript；後端為 Vercel Node API，Google Sheets 儲存登記紀錄，可匯出 CSV 以 Excel 開啟。此專案以澎湖溫王宮作為設計情境，目前並非溫王宮正式服務。

## 功能

- LINE 登入後填寫問事預約、點燈、志工報名、進香申請，並查看自己的申請與狀態。
- 管理員由 LINE 使用者 ID 白名單授權，可檢視登記、更新審核狀態、操作今日叫號。
- 管理員可匯出 UTF-8 CSV 於 Excel 編輯，再匯入**狀態欄**。匯入不更新姓名、電話或其他欄位；一次至多 100 筆。
- Google Sheets 內自動建立 `appointments`、`lights`、`volunteers`、`pilgrimages`、`settings` 工作表。只供單一示範宮廟使用。

## 部署步驟

1. 在 Google Cloud 建立專案、啟用 **Google Sheets API**、建立**服務帳號**及 JSON 金鑰。不要上傳金鑰到 GitHub。
2. 在 Google Sheets 建立**全新空白試算表**，把服務帳號的 `client_email` 加入共用，授予**編輯者**；網址 `/spreadsheets/d/` 後面的字串是 `GOOGLE_SHEET_ID`。
3. 在 Vercel 從 GitHub 匯入本儲存庫。Framework Preset 選 **Other**，Root Directory 保持預設。設定下列環境變數後部署：

| 名稱 | 值 |
|---|---|
| `GOOGLE_SHEET_ID` | 上述試算表 ID |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | 服務帳號 JSON **完整原文**，貼於 Vercel 環境變數，不要放進程式碼 |
| `LINE_CHANNEL_ID` | `2011717805`（此 LIFF 所屬 LINE Login Channel ID；如不符，以 LINE Developers 畫面為準） |
| `ADMIN_LINE_USER_IDS` | 管理員 LINE user ID，多位以逗號分隔；不能填顯示名稱或 LIFF ID |
| `ALLOWED_ORIGIN` | 如果網頁仍使用 GitHub Pages：`https://yungling00.github.io`；若改用 Vercel 整站部署，可不填 |

4. 最簡單的方式是**整站使用 Vercel 網址**，例如 `https://templeflow-example.vercel.app/`。將 LINE Developers 中這個 LIFF 的 **Endpoint URL** 改成 Vercel HTTPS 網址（含結尾斜線）。這樣 `config.js` 不用修改，前端自動呼叫同網域 `/api`。如果堅持 GitHub Pages 當前端，則把 `config.js` 的 `TEMPLEFLOW_API_BASE` 改成 Vercel 網址，並設定 `ALLOWED_ORIGIN`。
5. 先開啟 `https://你的-vercel-網址/api/health`，確認顯示 `{"ready":true}`；再從 `https://liff.line.me/2011717805-j1WLn24W` 以 LINE 開啟、送出一筆測試申請，檢查 Google Sheet 是否有紀錄。管理員須提供自己的 LINE user ID 加入環境變數，重新部署後才會看到後台。

> `ready:true` 只代表環境變數齊全，**不代表已驗證 Google 授權**；仍需完成一次 LINE 登入及測試寫入。LIFF ID 可公開，服務帳號 JSON 不可公開。

## 本機開發

Node.js 20 以上。將 `.env.example` 複製成 `.env` 後以環境變數載入（Node 原生 `node --env-file=.env server.js`）；或直接 `npm run dev` 在未設定後端的情況檢視畫面。開啟 `http://localhost:3000/`。LINE Developers 的 LIFF Endpoint 必須是 HTTPS，故本機測試登入需透過 HTTPS 測試網域。

## 上線前要處理

- 宮廟需確認服務內容、實際辦事時間、收件權限與個資告知事項。現階段不收款、不分配正式燈位，不提供 AI 解籤、LINE OA 通知、QR 簽到或武轎定位。
- Google Sheets 適合原型與低量營運；大量使用、跨宮廟隔離與同時編號分配應改用交易式資料庫。
- Vercel 函式可能同時初始化工作表；第一次部署先由單人測試一筆後再開放使用。
- 管理員請定期備份試算表並限制共用對象；遺失服務帳號金鑰請立即撤銷並輪替。
