# 廟管家 TempleFlow

目前的主要流程是：**LINE LIFF → GitHub Pages 網頁 → Apps Script `/exec` → Google 試算表**。表單可直接由 GitHub Pages 發送，不必為收件另外部署 Vercel。

## 已接好的表單

- 問事預約、光明燈／太歲燈／文昌燈登記、志工報名、進香團申請。
- 頁面從 LIFF 取得 LINE ID token；Apps Script 向 LINE 驗證後才寫入試算表。
- 瀏覽器送件後，用隨機收據編號查詢 Apps Script 的寫入結果；**確認寫入後才顯示成功**。若逾時不會自動重送，以免重複登記。
- 點燈付款方式為 LINE Pay，付款狀態為「未付款」；**目前沒有實際付款連結或扣款功能**。
- 「我的申請」僅顯示這台裝置存下的申請收據，尚無跨裝置紀錄查詢。
- 元宵乞龜可填寫姓名、電話、品項、日期及簡短祈願，送出後取得完整編號；同一 LINE 帳號可持編號查詢狀態或回報已還願。回報狀態為「已回報還願，待廟方確認」；指定管理員現場核對後，可在乞龜頁按「確認已還願」，更新試算表 `turtles` 的 `fulfillment_status` 欄。
- 武轎定位僅限 Apps Script 指令碼屬性 `TEMPLEFLOW_ADMIN_LINE_USER_IDS` 指定的 LINE 管理員主動授權定位與分享；前台顯示 OpenStreetMap 地圖、更新時間與手機回報的精度，超過五分鐘未更新會隱藏，管理員也可手動停止。位置不是安全或交通導航依據。
- 抽籤頁提供 12 首**原創示範籤詩**（不是溫王宮正式籤本），不用登入即可隨機抽籤、看白話提醒。若需 AI 解籤，必須將 OpenAI API key 設在 Apps Script 的指令碼屬性 `OPENAI_API_KEY`，並更新網頁應用程式部署版本；前端不存放金鑰。可另設 `OPENAI_MODEL`（預設 `gpt-4.1-mini`）。只送出籤詩、主題與使用者自願輸入的問題，不送姓名或電話；需勾選同意並以 LINE 登入，每帳號最多每小時五次。沒有金鑰時抽籤仍可使用，AI 區會標示尚未啟用。此功能會產生 API 用量費用，請自行在 OpenAI Platform 設定預算。

## 必須完成的 Apps Script 設定

GitHub 前端已在 [config.js](config.js) 填入你提供的 `/exec`：

`https://script.google.com/macros/s/AKfycbyzZhjlCrckOlN8srQ3K5DeT3rnTlONeKN0jo1Vsb67H_JEb5HLoYncfFMjD7yw8_g5/exec`

2026-09-24 已在未登入環境確認舊版 `/exec` 回傳 `ready:true`，但尚未以 LINE 實際送件驗證。本次新增抽籤 AI 後，**必須再次將新版 `Code.gs` 更新到同一個 Apps Script 專案並更新部署版本**；抽籤基本功能可先在 GitHub 網頁使用，AI 解籤需另外設定金鑰。公開存取與部署新版程式碼是兩個獨立步驟。

1. 在 Google 試算表建立**TempleFlow 專用的全新空白檔**，複製網址 `/d/` 與 `/edit` 中間的試算表 ID。不要把舊專案資料表當成新表單資料庫。
2. 開啟這個 `/exec` 對應的 Apps Script 專案。如果它原本服務其他網站，**另建新專案**，不要覆蓋舊程式。將 [apps-script/Code.gs](apps-script/Code.gs) 貼入專用專案。
3. 在「專案設定 → 指令碼屬性」新增 `TEMPLEFLOW_SHEET_ID`（試算表 ID）與 `LINE_CHANNEL_ID`（本 LIFF 所屬的 LINE Login Channel ID，畫面顯示為 `2011717805`，請以 LINE Developers 實際值確認）。如需管理員發布武轎位置，再設 `TEMPLEFLOW_ADMIN_LINE_USER_IDS`，內容是管理員的 LINE 使用者 ID（多位以半形逗號分隔），不可填顯示名稱。**直接從 GitHub 收表單不需要在前端放任何密鑰**。
4. 「部署 → 新部署 → 網頁應用程式」：執行身分選**我**，存取權選**任何人**。修改程式後須更新部署版本。若取得不同的 `/exec` 網址，記得同步修改 `config.js`。
5. 在未登入 Google 的瀏覽器打開 `/exec`，應看到 `{"ok":true,"service":"TempleFlow Apps Script","ready":true}`。若顯示「找不到 doGet」、跳 Google 登入或 `ready:false`，GitHub 頁面的表單會維持停用。更新 `Code.gs` 後要在「管理部署」中建立新版部署，單純儲存並不會更新既有 `/exec`。
6. 啟用 GitHub Pages：Settings → Pages → Deploy from a branch → `main`、`/(root)`。LINE Developers 的 LIFF Endpoint URL 設為 `https://yungling00.github.io/TempleFlow/`。用 LINE 開啟 `https://liff.line.me/2011717805-j1WLn24W`，送一筆**非真實個資**測試，確認 Google 試算表出現一筆紀錄。

## 武轎手機定位

1. 在網頁用管理員的 LINE 帳號登入，進入「武轎定位」，按「顯示我的 LINE 使用者 ID」，複製以 `U` 開頭的完整 ID。將後來新增、值為該 ID 的指令碼屬性**名稱**改為 `TEMPLEFLOW_ADMIN_LINE_USER_IDS`，值維持原樣；原有的 `ADMIN_LINE_USER_IDS` 不必更動。多人可用半形逗號分隔。把更新後的 `Code.gs` 貼回 Apps Script 並在「管理部署」建立新版本，否則原本部署仍會讀取舊名稱。
2. 隨行人員帶著該帳號登入的手機，打開 GitHub Pages 的 HTTPS 網頁，在定位頁按「開始分享這支手機的位置」並允許瀏覽器使用精確定位。網站用 `watchPosition` 偵測移動，每 30 秒再嘗試取得手機位置；Apps Script 驗證 LINE ID token 及管理員身分後把最新經緯度、精度與時間寫進試算表的 `settings` 工作表。
3. 訪客在相同頁面查看地圖；頁面在顯示期間每 30 秒嘗試重新載入，五分鐘沒有新的座標就隱藏定位。管理員按「停止分享」可立即清除公開位置。鎖屏、切換 App、系統省電或網路中斷可能暫停瀏覽器定位，請保持手機頁面開啟並在遶境時有人留意更新時間；需要鎖屏後持續追蹤時應改用原生 App 或專用 GPS 裝置。

## 尚未由 GitHub Pages 直連提供

即時叫號、管理員審核、CSV 雙向匯入與跨裝置申請查詢仍需要受保護的伺服器 API。儲存庫保留 [api/index.js](api/index.js) 與 Vercel 設定，可在之後部署。純 GitHub Pages 版本不會顯示管理後台，叫號頁會標示尚未開放。LINE Pay 也需取得商店串接資訊才能提供真正的付款流程。

## 本機驗證

Node.js 20+：`npm test`。測試涵蓋 LINE 身分與權限 API、試算表寫入、Apps Script 表單寫入與收據回應。LIFF 必須搭配 LINE Developers 設定的 HTTPS Endpoint，不能直接用本機 `localhost` 驗證登入。

> 本專案以澎湖溫王宮作為設計情境，尚未提供該宮廟的正式服務。正式收件前請確認營運授權、實際服務時間及個資告知事項。
