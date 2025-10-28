# numbermuu-portfolio (Next.js 重製版)

以 Next.js 14 + Tailwind CSS 重構來自 `numbermuu.com` 的作品集網站，保留原有的頁面結構（Pixilart / Work / Art / Type / About）並修正 GIF 無法播放的問題。專案支援靜態匯出，可直接部署到 GitHub Pages。

## 開發環境

```bash
npm install
npm run dev
```

- 預設啟動在 <http://localhost:3000>
- 所有頁面使用 Tailwind 編排，圖片放在 `public/images/**`
- 若未安裝套件，可先離線開發，待網路可用時再執行 `npm install`

## 站點導覽

| 路徑 | 功能 |
| ---- | ---- |
| `/` | Pixilart 首頁，展示像素插畫與 GIF（已改為原生 `<img>` 以確保動畫正常播放） |
| `/work` | 工作案例清單，維持外部連結與 4:3 排版 |
| `/art` | 插畫瀑布流（匯入 59 張原始作品圖） |
| `/type` | 字體 / 排版作品 |
| `/about` | 聯絡資訊與平台連結 |
| `/admin` | 隱藏後台頁面，不會出現在主選單 |

## 後台（`/admin`）

- 以 localStorage 暫存調整，重新整理即會套用到公開頁面
- 可重新排序、刪除、上傳圖片（自動轉成 data URL）或編輯註解
- 若要將調整寫回專案，於瀏覽器開發者工具複製對應 JSON，再更新 `data/*.js`

## 靜態匯出與 GitHub Pages

1. 設定（僅 GitHub Pages 需要）：
   ```bash
   export NEXT_PUBLIC_BASE_PATH="/你的-repo-name"
   ```
   - 若用自訂網域可略過
2. 建置 + 匯出：
   ```bash
   npm run build
   npm run export
   ```
3. 將 `out/` 目錄內容推送至 `gh-pages` 分支即可

> `next.config.mjs` 已設為 `output: 'export'` 並停用 Next 的影像壓縮，確保 GIF 與 data URL 均能正常輸出。

## 自訂資料

- 所有預設資料位於 `data/`，亦可透過 `/admin` 直接調整
- 靜態圖建議放入 `public/images/**` 後，於資料檔填寫 `/images/...` 路徑以降低 data URL 佔用
- 若要新增其他分類，可複製現有頁面結構並建立新資料檔

## 待辦 / 建議

- 依需要補上字體載入或更貼近原站的 Element 動畫
- 若需多人共用的真正後端，可再串接 CMS（例如 Supabase、Sanity）或撰寫簡易 API

