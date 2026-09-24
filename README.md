# 廟管家 TempleFlow

智慧宮廟服務平台的 GitHub Pages 展示原型。以澎湖溫王宮為示範情境，尚未獲宮廟正式營運接入。

## 開啟網站

1. 在 GitHub 儲存庫的 **Settings → Pages** 中，將 Source 設為 **Deploy from a branch**。
2. 選擇 **main**、**/(root)**，按 **Save**。
3. 等待 Pages 建置完成，開啟 https://yungling00.github.io/TempleFlow/ 。
4. LINE Developers 的 LIFF Endpoint URL 填上述 HTTPS 網址（包含結尾斜線）；LIFF Size 選 Full，Scopes 選 openid、profile。

## 已實作

- 信眾端：問事預約、點燈登記、志工報名、進香團申請及叫號展示。
- 管理端展示：各項登記統計、當日叫號、近期紀錄、Excel 可開啟的 UTF-8 CSV 匯出。
- 響應式網頁、基本表單驗證與匯出表格公式字元防護。

## 展示版限制

資料只存在使用者目前瀏覽器的 localStorage，跨裝置不會同步；展示後台未設登入，任何使用該裝置的人都可能檢視資料。請勿輸入真實個資、真實預約或付款資訊。頁面不會連接 LINE、LINE OA、Supabase 或 OpenAI；無通知、實際廟方名額、付款、燈位分配、AI 客服、Excel 雙向匯入、乞龜或 GPS 定位功能。

## 正式版整合方向

建立受驗證的後端 API 與 PostgreSQL 資料庫。由後端驗證 LINE ID token，對每次請求執行使用者授權及 temple_id 隔離；管理員與志工權限分開。將預約和燈位編號改為資料庫交易式分配，管理資料不可直接暴露於公開前端。再串接 LINE OA 推播、Excel 匯入衝突檢查及必要的付款服務。API 金鑰僅放後端環境變數，不能寫進 GitHub Pages。

此專案的 index.html 可直接部署，無需 npm 或建置步驟。
