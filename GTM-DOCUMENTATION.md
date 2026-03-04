# Aegis Mail — GTM 追蹤設定文件

GTM Container ID: **GTM-5KN9LLV7**

---

## 架構說明

Chrome MV3 的 `extension_pages` CSP 禁止載入任何外部 script（包含 GTM JS），因此改用 **GA4 Measurement Protocol** 從 background service worker 直接發送事件，完全不受 CSP 限制。

```
Gmail content script
  ↓  AegisTracker.xxx()  →  window.dataLayer.push()（本地 debug 用）
  ↓  chrome.runtime.sendMessage(TRACK_EVENT)
background.js
  ↓  POST https://www.google-analytics.com/mp/collect
GA4（可透過 GTM 的 GA4 Configuration Tag 或直接查看 GA4 報表）
```

| 環境 | 發送方式 |
|---|---|
| Gmail 頁面（content script）| `TRACK_EVENT` → background → GA4 MP |
| popup / options | `TRACK_EVENT` → background → GA4 MP |

---

## 事件清單（Data Layer Schema）

### 1. `aegis_category_click` — 郵件分類點擊

使用者點擊分析側欄中的分類標題列時觸發。

| 參數 | 型別 | 說明 | 範例 |
|---|---|---|---|
| `category_id` | string | 分類識別碼 | `"finance"` |
| `category_name` | string | 分類顯示名稱 | `"財務"` |
| `email_count` | number | 該分類下的郵件數 | `12` |

```json
{
  "event": "aegis_category_click",
  "category_id": "finance",
  "category_name": "財務",
  "email_count": 12
}
```

---

### 2. `aegis_analysis_complete` — 分析完成

郵件清單分析結束、側欄最終渲染完成時觸發。

| 參數 | 型別 | 說明 | 範例 |
|---|---|---|---|
| `total_categories` | number | 分類總數 | `4` |
| `total_emails` | number | 分析的郵件總封數 | `27` |
| `analysis_mode` | string | 分析模式 | `"local"` \| `"ai"` |

```json
{
  "event": "aegis_analysis_complete",
  "total_categories": 4,
  "total_emails": 27,
  "analysis_mode": "local"
}
```

---

### 3. `aegis_email_action` — 郵件操作（刪除 / 移至標籤）

使用者對選取郵件執行刪除或移動時觸發。

| 參數 | 型別 | 說明 | 範例 |
|---|---|---|---|
| `action_type` | string | 操作類型 | `"delete"` \| `"move_label"` |
| `email_count` | number | 操作的郵件封數 | `3` |
| `category_id` | string | 來源分類識別碼 | `"promotions"` |
| `category_name` | string | 來源分類名稱 | `"促銷"` |

```json
{
  "event": "aegis_email_action",
  "action_type": "delete",
  "email_count": 3,
  "category_id": "promotions",
  "category_name": "促銷"
}
```

---

### 4. `aegis_email_detail_analyzed` — 單一郵件分析

使用者開啟單封郵件並完成安全分析時觸發。

| 參數 | 型別 | 說明 | 範例 |
|---|---|---|---|
| `analysis_mode` | string | 分析模式 | `"local"` \| `"ai"` |

```json
{
  "event": "aegis_email_detail_analyzed",
  "analysis_mode": "local"
}
```

---

### 5. `aegis_email_safety_result` — 安全判斷結果

與 `aegis_email_detail_analyzed` 同時觸發，記錄安全評分與分類。

| 參數 | 型別 | 說明 | 範例 |
|---|---|---|---|
| `safety_level` | string | 安全等級 | `"safe"` \| `"caution"` \| `"danger"` |
| `safety_score` | number | 安全分數（0–100） | `75` |
| `category_id` | string | 郵件分類識別碼 | `"security"` |
| `category_name` | string | 郵件分類名稱 | `"安全"` |

```json
{
  "event": "aegis_email_safety_result",
  "safety_level": "caution",
  "safety_score": 65,
  "category_id": "security",
  "category_name": "安全"
}
```

---

### 6. `aegis_sender_domain` — 寄件人 TLD 網域

每次分析單封郵件時觸發，記錄寄件人的有效 TLD。

| 參數 | 型別 | 說明 | 範例 |
|---|---|---|---|
| `sender_tld` | string | 寄件人有效 TLD | `"com.tw"` \| `"com"` |
| `is_service_match` | boolean | 是否命中白名單服務 | `true` |
| `service_name` | string \| null | 命中的服務名稱 | `"匯豐台灣"` \| `null` |

```json
{
  "event": "aegis_sender_domain",
  "sender_tld": "com.tw",
  "is_service_match": true,
  "service_name": "匯豐台灣"
}
```

---

### 7. `aegis_unknown_domain` — 無法判斷的網域

寄件人 TLD 或郵件內連結網域不在白名單且無法分類時觸發。每個不明網域各觸發一次。

| 參數 | 型別 | 說明 | 範例 |
|---|---|---|---|
| `domain_type` | string | 來源類型 | `"sender_tld"` \| `"link_domain"` |
| `domain_value` | string | TLD 或網域值 | `"io"` \| `"net"` |

```json
{
  "event": "aegis_unknown_domain",
  "domain_type": "link_domain",
  "domain_value": "io"
}
```

---

## GTM 設定步驟

### 一、建立 Data Layer 變數

在 GTM → **Variables** → New → Data Layer Variable：

| 變數名稱 | Data Layer 變數名稱 |
|---|---|
| `DLV - category_id` | `category_id` |
| `DLV - category_name` | `category_name` |
| `DLV - email_count` | `email_count` |
| `DLV - total_categories` | `total_categories` |
| `DLV - total_emails` | `total_emails` |
| `DLV - analysis_mode` | `analysis_mode` |
| `DLV - action_type` | `action_type` |
| `DLV - safety_level` | `safety_level` |
| `DLV - safety_score` | `safety_score` |
| `DLV - is_service_match` | `is_service_match` |
| `DLV - service_name` | `service_name` |
| `DLV - sender_tld` | `sender_tld` |
| `DLV - domain_type` | `domain_type` |
| `DLV - domain_value` | `domain_value` |

---

### 二、建立 Trigger（觸發條件）

GTM → **Triggers** → New → Custom Event：

| Trigger 名稱 | Event Name | 條件 |
|---|---|---|
| `Aegis - Category Click` | `aegis_category_click` | All Custom Events |
| `Aegis - Analysis Complete` | `aegis_analysis_complete` | All Custom Events |
| `Aegis - Email Action` | `aegis_email_action` | All Custom Events |
| `Aegis - Email Detail Analyzed` | `aegis_email_detail_analyzed` | All Custom Events |
| `Aegis - Email Safety Result` | `aegis_email_safety_result` | All Custom Events |
| `Aegis - Sender Domain` | `aegis_sender_domain` | All Custom Events |
| `Aegis - Unknown Domain` | `aegis_unknown_domain` | All Custom Events |

---

### 三、建立 Tag（GA4 事件標籤）

GTM → **Tags** → New → Google Analytics: GA4 Event：

每個事件建立一個 Tag，以下以 `aegis_email_safety_result` 為例：

**Tag 設定**
- Tag Type: **Google Analytics: GA4 Event**
- Measurement ID: `G-XXXXXXXXXX`（你的 GA4 資源 ID）
- Event Name: `aegis_email_safety_result`

**Event Parameters**

| Parameter Name | Value |
|---|---|
| `safety_level` | `{{DLV - safety_level}}` |
| `safety_score` | `{{DLV - safety_score}}` |
| `category_id` | `{{DLV - category_id}}` |
| `category_name` | `{{DLV - category_name}}` |

**Triggering**: `Aegis - Email Safety Result`

---

完整 Tag 對應表：

| Tag 名稱 | GA4 Event Name | 使用 Trigger | 傳送的 Parameters |
|---|---|---|---|
| `Aegis - Category Click` | `aegis_category_click` | Aegis - Category Click | `category_id`, `category_name`, `email_count` |
| `Aegis - Analysis Complete` | `aegis_analysis_complete` | Aegis - Analysis Complete | `total_categories`, `total_emails`, `analysis_mode` |
| `Aegis - Email Action Delete` | `aegis_email_action` | Aegis - Email Action（`action_type` = `delete`） | `action_type`, `email_count`, `category_id`, `category_name` |
| `Aegis - Email Action Move` | `aegis_email_action` | Aegis - Email Action（`action_type` = `move_label`） | `action_type`, `email_count`, `category_id`, `category_name` |
| `Aegis - Email Detail Analyzed` | `aegis_email_detail_analyzed` | Aegis - Email Detail Analyzed | `analysis_mode` |
| `Aegis - Email Safety Result` | `aegis_email_safety_result` | Aegis - Email Safety Result | `safety_level`, `safety_score`, `category_id`, `category_name` |
| `Aegis - Sender Domain` | `aegis_sender_domain` | Aegis - Sender Domain | `sender_tld`, `is_service_match`, `service_name` |
| `Aegis - Unknown Domain` | `aegis_unknown_domain` | Aegis - Unknown Domain | `domain_type`, `domain_value` |

> **Email Action 分流建議**：在 Email Action Trigger 上加入 Condition：`{{DLV - action_type}} equals delete` 拆成兩個 Trigger，分別套用不同 Tag，以便在 GA4 報表中區分刪除與移動的轉換目標。

---

### 四、GA4 Custom Dimensions 設定

建議在 GA4 → **Configure** → **Custom definitions** 建立以下自訂維度：

| 名稱 | Scope | Parameter |
|---|---|---|
| Analysis Mode | Event | `analysis_mode` |
| Category ID | Event | `category_id` |
| Category Name | Event | `category_name` |
| Safety Level | Event | `safety_level` |
| Action Type | Event | `action_type` |
| Service Name | Event | `service_name` |
| Sender TLD | Event | `sender_tld` |
| Domain Type | Event | `domain_type` |
| Domain Value | Event | `domain_value` |
| Is Service Match | Event | `is_service_match` |

自訂指標：

| 名稱 | Scope | Parameter | 單位 |
|---|---|---|---|
| Email Count | Event | `email_count` | Standard |
| Total Categories | Event | `total_categories` | Standard |
| Total Emails | Event | `total_emails` | Standard |
| Safety Score | Event | `safety_score` | Standard |

---

## 驗證方式

### GTM Preview Mode
1. 開啟 GTM → Preview → 輸入 popup 或 options 頁面 URL（`chrome-extension://...`）
2. 在 Aegis 執行操作
3. 確認 Tag Assistant 顯示各 Tag 正常觸發

### GA4 DebugView
1. 安裝 [Google Analytics Debugger](https://chrome.google.com/webstore/detail/google-analytics-debugger) Chrome 擴充
2. 開啟 GA4 → Reports → DebugView
3. 執行郵件分析操作，確認 events 即時出現

### Console 驗證
在 Gmail 頁面 DevTools Console 輸入：
```javascript
// 查看已排隊的事件
chrome.storage.local.get(['eventQueue'], console.log);

// 查看 popup 頁面的 dataLayer（在 popup DevTools）
// 開啟方式：右鍵點擊 Aegis 圖示 → 審查彈出式視窗
window.dataLayer
```

---

## 注意事項

1. **事件延遲**：Gmail 頁面的 content script 事件**不會即時發送**，而是在使用者**下次開啟 Aegis popup 時**批次推送至 GTM。這是 Gmail CSP（`strict-dynamic` + nonce）的限制，為正常設計行為。

2. **佇列上限**：background 最多保留最近 **200 筆**事件，超出部分自動捨棄舊事件。

3. **Extension ID 差異**：Chrome 擴充功能在不同瀏覽器安裝下 Extension ID 不同，GTM 的 Page URL 條件無法用於篩選，建議用 Custom Event name 作為所有觸發條件。

4. **隱私合規**：所有收集的欄位均為行為指標（分類ID、安全等級、TLD），**不包含郵件內容、寄件人姓名或任何個人識別資訊（PII）**。
