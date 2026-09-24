# 廟管家 TempleFlow

目前的主要流程是：**LINE LIFF → GitHub Pages 網頁 → Apps Script `/exec` → Google 試算表**。表單可直接由 GitHub Pages 發送，不必為收件另外部署 Vercel。

## 已接好的表單

- 問事預約、光明燈／太歲燈／文昌燈登記、志工報名、進香團申請。
- 頁面從 LIFF 取得 LINE ID token；Apps Script 向 LINE 驗證後才寫入試算表。
- 瀏覽器送件後，用隨機收據編號查詢 Apps Script 的寫入結果；**確認寫入後才顯示成功**。若逾時不會自動重送，以免重複登記。
- 點燈付款方式為 LINE Pay，付款狀態為「未付款」；**目前沒有實際付款連結或扣款功能**。
- 「我的申請」僅顯示這台裝置存下的申請收據，尚無跨裝置紀錄查詢。

## 必須完成的 Apps Script 設定

GitHub 前端已在 [config.js](config.js) 填入你提供的 `/exec`：

`https://script.google.com/macros/s/AKfycbyzZhjlCrckOlN8srQ3K5DeT3rnTlONeKN0jo1Vsb67H_JEb5HLoYncfFMjD7yw8_g5/exec`

目前這個網址在未登入環境會跳轉 Google 登入，尚不能公開收件；也無法從網址讀出目前的 Apps Script 原始碼。請完成以下步驟：

1. 在 Google 試算表建立**TempleFlow 專用的全新空白檔**，複製網址 `/d/` 與 `/edit` 中間的試算表 ID。不要把舊專案資料表當成新表單資料庫。
2. 開啟這個 `/exec` 對應的 Apps Script 專案。如果它原本服務其他網站，**另建新專案**，不要覆蓋舊程式。將 [apps-script/Code.gs](apps-script/Code.gs) 貼入專用專案。
3. 在「專案設定 → 指令碼屬性」新增 `TEMPLEFLOW_SHEET_ID`（試算表 ID）與 `LINE_CHANNEL_ID`（本 LIFF 所屬的 LINE Login Channel ID，畫面顯示為 `2011717805`，請以 LINE Developers 實際值確認）。**直接從 GitHub 收表單不需要在前端放任何密鑰**。
4. 「部署 → 新部署 → 網頁應用程式」：執行身分選**我**，存取權選**任何人**。修改程式後須更新部署版本。若取得不同的 `/exec` 網址，記得同步修改 `config.js`。
5. 在未登入 Google 的瀏覽器打開 `/exec`，應看到 `{"ok":true,"service":"TempleFlow Apps Script","ready":true}`。如果跳 Google 登入或 `ready:false`，GitHub 頁面的表單會維持停用。
6. 啟用 GitHub Pages：Settings → Pages → Deploy from a branch → `main`、`/(root)`。LINE Developers 的 LIFF Endpoint URL 設為 `https://yungling00.github.io/TempleFlow/`。用 LINE 開啟 `https://liff.line.me/2011717805-j1WLn24W`，送一筆**非真實個資**測試，確認 Google 試算表出現一筆紀錄。

## 尚未由 GitHub Pages 直連提供

即時叫號、管理員審核、CSV 雙向匯入與跨裝置申請查詢仍需要受保護的伺服器 API。儲存庫保留 [api/index.js](api/index.js) 與 Vercel 設定，可在之後部署。純 GitHub Pages 版本不會顯示管理後台，叫號頁會標示尚未開放。LINE Pay 也需取得商店串接資訊才能提供真正的付款流程。

## 本機驗證

Node.js 20+：`npm test`。測試涵蓋 LINE 身分與權限 API、試算表寫入、Apps Script 表單寫入與收據回應。LIFF 必須搭配 LINE Developers 設定的 HTTPS Endpoint，不能直接用本機 `localhost` 驗證登入。

> 本專案以澎湖溫王宮作為設計情境，尚未提供該宮廟的正式服務。正式收件前請確認營運授權、實際服務時間及個資告知事項。
