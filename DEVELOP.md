# Aegis — Developer Guide

> 本文件說明 extension 的完整運作流程、資料結構、擴充方式，供 AI coding 工具快速上手延續開發。

---

## 目錄

1. [專案概覽](#1-專案概覽)
2. [檔案結構與職責](#2-檔案結構與職責)
3. [啟動流程](#3-啟動流程)
4. [訊息傳遞架構](#4-訊息傳遞架構)
5. [郵件選取流程](#5-郵件選取流程)
6. [分析郵件流程](#6-分析郵件流程)
7. [操作郵件流程（刪除 / 移至標籤）](#7-操作郵件流程)
8. [開信自動分析流程](#8-開信自動分析流程)
9. [Settings Schema](#9-settings-schema)
10. [Gmail DOM 速查](#10-gmail-dom-速查)
11. [多語系擴充](#11-多語系擴充)
12. [新增平台（Yahoo / Outlook）](#12-新增平台)
13. [新增分析分類](#13-新增分析分類)
14. [本地開發指令](#14-本地開發指令)
15. [已知限制與注意事項](#15-已知限制與注意事項)

---

## 1. 專案概覽

**Aegis** 是 Chrome Extension（Manifest V3），注入 Gmail 頁面，提供：

- 右側滑入面板：將收件匣郵件依分類顯示，支援未讀/全部切換
- 本地關鍵字規則分析（預設，不需 API）
- 可選 OpenAI-compatible API 分析（需 API Key）
- 開信自動彈出安全分析卡片（安全分數 + 分類 + 可疑連結）
- DOM 操作：勾選 → 刪除 / 移至標籤

**不需要 Gmail OAuth**，所有郵件操作都透過模擬 DOM 事件完成。

---

## 2. 檔案結構與職責

```
aegis/
├── manifest.json               # MV3 設定：permissions、content_scripts 載入順序
├── background.js               # Service Worker：settings 初始化、AI API proxy
├── content.js                  # 主協調器：注入後的入口，串聯所有模組
│
├── popup.html / popup.js / popup.css     # 點擊 extension icon 出現的小視窗
├── options.html / options.js / options.css  # 設定頁（分析模式、分類關鍵字）
│
├── src/
│   ├── platforms/
│   │   ├── base-platform.js    # 抽象介面（所有平台必須實作的方法）
│   │   └── gmail-platform.js   # Gmail DOM adapter（含 GMAIL_ACTIONS i18n 設定）
│   ├── analysis/
│   │   ├── email-analyzer.js   # 本地規則引擎（關鍵字分類 + 安全評分）
│   │   └── ai-analyzer.js      # OpenAI-compatible API 呼叫
│   └── ui/
│       ├── analysis-panel.js   # 右側面板元件
│       └── email-popup.js      # 開信彈出卡片元件
│
├── styles/content.css          # 所有注入 UI 的樣式（prefixed #aegis- / .aegis-）
├── public/icons/               # icon16/32/48/128.png
├── Makefile                    # 打包指令
└── DEVELOP.md                  # 本文件
```

### Content Scripts 載入順序（manifest.json 定義，順序不可更動）

```
email-analyzer.js   →  ai-analyzer.js   →  base-platform.js
→  gmail-platform.js  →  analysis-panel.js  →  email-popup.js
→  content.js
```

每個檔案將自身 export 掛在 `window` 上（`window.EmailAnalyzer`、`window.GmailPlatform` 等），`content.js` 直接使用全域變數。

---

## 3. 啟動流程

### 首次安裝

```
chrome.runtime.onInstalled
  → background.js 讀取 chrome.storage.sync
  → 若無設定，寫入 DEFAULT_SETTINGS（7 個預設分類 + local 模式）
```

### 使用者打開 Gmail（新分頁）

```
Chrome 自動注入 content scripts（依 manifest 順序）
  → content.js IIFE 執行
  → 檢查 window.__aegisInitialized（防止重複注入）
  → new GmailPlatform()
  → platform.isMatchingPage() 確認是 Gmail
  → platform.observeNavigate() 監聽 SPA 路由變化
  → 若目前是開信頁（URL hash 符合），延遲 1.2s 執行 analyzeOpenEmail()
```

### 使用者打開已存在的 Gmail 分頁後點擊 extension icon

```
popup.js 執行
  → chrome.tabs.sendMessage(tab.id, { type: 'PING' })
  → 若無回應（content script 未注入）：
      chrome.scripting.executeScript() 動態注入所有 scripts
      chrome.scripting.insertCSS() 注入 content.css
      等待 300ms 讓腳本初始化
  → 再次 sendMessage { type: 'ANALYZE' }
```

---

## 4. 訊息傳遞架構

```
┌─────────────┐   PING / ANALYZE      ┌──────────────┐
│  popup.js   │ ─────────────────────▶ │  content.js  │
│             │ ◀───────────────────── │              │
└─────────────┘   { status: 'alive' }  └──────┬───────┘
                   { status: 'ok' }           │
                                              │ GET_SETTINGS
                                              │ AI_ANALYZE
                                              ▼
                                     ┌──────────────────┐
                                     │  background.js   │
                                     │  (Service Worker)│
                                     └──────────────────┘
```

| 訊息 type | 方向 | 說明 |
|-----------|------|------|
| `PING` | popup → content | 確認 content script 是否存活 |
| `ANALYZE` | popup → content | 觸發郵件列表分析並顯示面板 |
| `GET_SETTINGS` | content → background | 取得 chrome.storage.sync 設定 |
| `AI_ANALYZE` | content → background | 轉發給 AI API（避免 CORS） |
| `SAVE_SETTINGS` | options → background | 儲存設定 |

---

## 5. 郵件選取流程

### 使用者點擊「📊 分析郵件」

```
popup.js
  → ensureContentScript(tab)        # PING → 必要時動態注入
  → sendMessage({ type: 'ANALYZE' })

content.js: runAnalysis(unreadOnly = true)
  → getSettings()                   # 從 background 取 settings
  → platform.getEmails(unreadOnly)  # 從 Gmail DOM 抓郵件列表
  → EmailAnalyzer.analyzeEmailList()
  → analysisPanel.show(groups, labels, { filter, onFilterChange })
```

### `platform.getEmails(unreadOnly)`（gmail-platform.js:57）

| unreadOnly | CSS Selector | 說明 |
|------------|-------------|------|
| `true`（預設） | `tr.zA.zE` | 僅未讀（`.zE` = unread class） |
| `false` | `tr.zA` | 全部郵件（已讀 `.yO` + 未讀 `.zE`） |

每筆 email 物件結構：
```javascript
{
  row,          // DOM element <tr>，操作時使用
  subject,      // string
  sender,       // string（顯示名稱）
  senderEmail,  // string（email 地址）
  isUnread,     // boolean
  id,           // string（唯一識別，用於 panel item dataset）
}
```

### Panel 未讀 / 全部切換

```
使用者點擊 panel header「未讀」/「全部」按鈕
  → analysis-panel.js: filter btn click handler
  → this._onFilterChange(filter)        # callback 回 content.js
  → content.js: runAnalysis(filter === 'unread')
  → panel 重新 render（hide → show）
```

---

## 6. 分析郵件流程

### 本地模式（`email-analyzer.js`）

```
EmailAnalyzer.analyzeEmailList(emails, userLabels, categories)
  for each email:
    text = subject + sender + senderEmail
    categorizeByKeywords(text, categories)
      → 對每個 category 的 keywords[] 計算 match 數
      → 取最高分的 category
      → 若都不符合 → { id: 'other', name: '其他', ... }
  → 回傳 Map<categoryId, { category, emails[] }>
```

### AI 模式（`ai-analyzer.js` + `background.js`）

```
content.js
  → sendMessage({ type: 'AI_ANALYZE', emailData })
  → background.js 接收
      → fetch POST {aiSettings.baseUrl}/chat/completions
      → system prompt: 要求回傳 JSON { category, tags[], safetyScore, issues[] }
      → user message: Subject + From + Body[:1000] + Links
      → 解析回應 JSON
  → content.js 收到結果
      → 與本地 analyzeEmailDetail() 結果合併
      → 以 AI safetyScore 為主，issues 合併取前 5 筆
```

### 安全評分邏輯（`analyzeEmailDetail`，email-analyzer.js:90）

| 檢查項目 | 扣分 | 上限 |
|---------|------|------|
| 無寄件人 email | -20 | — |
| 可疑 TLD（.xyz .top .click …） | -15 | — |
| 寄件人地址含大量數字 | -10 | — |
| Phishing 關鍵字命中 | -10/個 | -30 |
| 主旨全大寫比例 > 30% | -10 | — |
| HTTP 連結（非 HTTPS） | -5/個 | -15 |
| 可疑域名連結 | -15/個 | -30 |

| 分數範圍 | 等級 | 顏色 |
|---------|------|------|
| 80–100 | safe（安全） | `#1a7f37` |
| 50–79 | caution（注意） | `#9a6700` |
| 0–49 | danger（危險） | `#cf222e` |

---

## 7. 操作郵件流程

### 勾選郵件

Panel 中的 checkbox（`.aegis-email-checkbox`）是 Aegis 自己的 UI 元素，與 Gmail DOM 分離。勾選只影響 Aegis panel 的選取狀態，Gmail DOM 的 `row` reference 存在 `item._emailRow` 上。

### 刪除郵件

```
使用者勾選 email items → 點擊「🗑 刪除」

analysis-panel.js:
  selectedItems = 已勾選的 .aegis-email-item[]
  rows = selectedItems.map(item => item._emailRow)
  await platform.deleteEmails(rows)

gmail-platform.js: deleteEmails(rows)
  → _uncheckAll()                              # 清除使用者原先的勾選，避免誤刪
  → _selectRows(rows)
      for each row:
        row.scrollIntoView()                    # 確保 Gmail 渲染此 row
        dispatchEvent('mouseenter', 'mouseover') # 觸發 hover，讓 checkbox 出現
        sleep(80ms)
        checkbox = row.querySelector('[role="checkbox"]')
        dispatch mousedown → mouseup → click    # 完整事件序列觸發 Gmail 內部 listener
        sleep(120ms)
      sleep(300ms)  # 等待 toolbar 出現

  → _waitForElement(GMAIL_ACTIONS.trash selectors, 3000ms)
      每 100ms 輪詢，找到即點擊

  → fallback: keyboard shortcut '#' (Shift+3)

analysis-panel.js:
  selectedItems.forEach(item => item.remove())  # 從 panel 移除（不等 Gmail 回應）
  更新 count badge；若 group 空則移除 group
```

### 移至標籤

```
使用者勾選 → 點擊「移至標籤 ▼」

analysis-panel.js: _showLabelPicker()
  顯示 dropdown（從 platform.getLabels() 取得標籤列表）
  使用者選擇標籤

gmail-platform.js: moveToLabel(rows, labelName)
  → _uncheckAll()                              # 清除使用者原先的勾選，避免誤移
  → _selectRows(rows)                          # 同刪除流程
  → _waitForElement(GMAIL_ACTIONS.moveTo, 3000ms)
  → moveBtn.click()
  → _waitForElement(['[role="menuitem"]', ...], 2000ms,
      predicate: el.textContent === labelName) # 輪詢直到找到標籤選項
  → menuItem.click()
```

---

## 8. 開信自動分析流程

```
Gmail SPA 路由變化（hash change 或 title 改變）
  → platform.observeNavigate() callback 觸發
  → content.js: debounce 800ms
  → isEmailDetailView() 判斷（regex: /^#[^/]+\/[A-Za-z0-9]{10,}/）
  → analyzeOpenEmail()
      platform.getEmailDetail()
        subject: h2.hP
        sender:  .gD[name], .gD[email]
        body:    .a3s.aiL（前 2000 字）
        links:   .a3s.aiL a[href]（排除 mailto:，最多 20 條）
      → 本地或 AI 分析
      → emailPopup.show(analysis)
```

EmailPopup 元素為 `#aegis-email-popup`，fixed 定位於右上角，可拖曳移動（header mousedown → document mousemove）。

---

## 9. Settings Schema

儲存於 `chrome.storage.sync`，由 `background.js` 的 `DEFAULT_SETTINGS` 定義：

```javascript
{
  analysisMode: 'local' | 'ai',
  aiSettings: {
    baseUrl: 'https://api.openai.com/v1',  // 可換成任何相容端點
    apiKey:  '',
    model:   'gpt-4o-mini',
  },
  categories: [
    {
      id:       string,    // 唯一 key，用於 Map 索引
      name:     string,    // 顯示名稱（中文）
      emoji:    string,    // panel 顯示
      color:    string,    // hex，文字/邊框色
      bgColor:  string,    // hex，背景色
      keywords: string[],  // 比對關鍵字（大小寫不敏感）
    },
    // … 7 個預設分類
  ]
}
```

---

## 10. Gmail DOM 速查

> Gmail 會不定期更新 class names，若選取器失效需在此更新。

| 用途 | Selector |
|------|---------|
| 未讀郵件列 | `tr.zA.zE` |
| 所有郵件列 | `tr.zA` |
| 已讀郵件列 | `tr.zA.yO` |
| 主旨（列表） | `tr span.bog` |
| 寄件人名稱 | `tr span.zF` |
| 寄件人 email | `tr span[email]`（取 `email` attribute） |
| 郵件 checkbox | `tr [role="checkbox"]` |
| 開信主旨 | `h2.hP` |
| 開信寄件人 | `.gD`（`name` / `email` attribute） |
| 開信內文 | `.a3s.aiL` |
| 內文連結 | `.a3s.aiL a[href]` |

---

## 11. 多語系擴充

Gmail toolbar 按鈕的 `data-tooltip` 依介面語言不同而不同。`GMAIL_ACTIONS`（`gmail-platform.js` 頂部）集中管理所有語系：

```javascript
const GMAIL_ACTIONS = {
  trash: {
    tooltips: ['Move to Trash', '移至垃圾桶', '刪除'/* 在此新增 */],
    ariaLabels: ['Move to Trash', '移至垃圾桶', '刪除'/* 在此新增 */],
    tooltipContains: ['Trash', '垃圾', '刪除', /* 子字串 fallback */],
    acts: ['10'],
    classes: ['.bkJ'],
  },
  moveTo: { /* 同結構 */ },
};
```

新增語系步驟：
1. 在 Gmail 目標語系介面，DevTools 找到刪除/移至標籤按鈕的 `data-tooltip` 值
2. 加入對應 action 的 `tooltips[]` 陣列
3. 若不確定，加入 `tooltipContains[]`（子字串比對，精準度較低但容錯高）

`_buildActionSelectors(action)` 會依序產生：完整 tooltip → aria-label → act attr → class → 子字串 tooltip。

---

## 12. 新增平台

（例如 Yahoo Mail、Outlook）

1. 在 `src/platforms/` 新增 `yahoo-platform.js`
2. 繼承 `BasePlatform`，實作所有抽象方法
3. 在 `manifest.json` 的 `content_scripts.matches` 加入新 URL pattern
4. 在 `content.js` 依 URL 選擇平台：

```javascript
const platform = window.location.href.includes('yahoo.com')
  ? new YahooPlatform()
  : new GmailPlatform();
```

5. 在 `manifest.json` content_scripts 的 js 載入順序中加入新平台檔案

---

## 13. 新增分析分類

**Options UI 方式（使用者）：** 開啟設定頁 → 展開分類 → 新增關鍵字 → 儲存。

**程式碼方式（開發者）：** 在 `background.js` 的 `DEFAULT_SETTINGS.categories[]` 加入：

```javascript
{
  id: 'travel',           // 唯一，不可與現有重複
  name: '旅遊',
  emoji: '✈️',
  color: '#0288d1',
  bgColor: '#e1f5fe',
  keywords: ['flight', '機票', 'hotel', '飯店', 'booking', '訂房', 'airbnb'],
}
```

若需修改安全評分的 phishing 關鍵字，編輯 `email-analyzer.js` 頂部的 `PHISHING_KEYWORDS[]`。

---

## 14. 本地開發指令

```bash
make dev    # 將 source 複製到 dist/（排除 Makefile、CLAUDE.md、.git 等）
make zip    # 打包 dist/aegis-{version}.zip（上架 Chrome Web Store 用）
make crx    # 打包 .crx（自行散佈用，首次執行會產生 aegis.pem）
make clean  # 刪除 dist/
make info   # 顯示版本、Chrome 路徑等資訊
```

**載入步驟：**
1. `make dev`
2. Chrome → `chrome://extensions` → 開啟開發者模式
3. 「載入未封裝項目」→ 選 `dist/`
4. 修改程式碼後：`make dev` → extensions 頁面按 🔄 重新整理

**版本號：** 修改以下兩處，`make zip` / `make info` 會自動讀取：

1. `manifest.json` → `"version"` 欄位
2. `popup.html` → `<div class="footer-version" id="versionText">v{X.Y.Z}</div>`

```bash
# 範例：升版到 1.6.0
# 1. manifest.json
"version": "1.6.0"

# 2. popup.html
<div class="footer-version" id="versionText">v1.6.0</div>
```

> popup.js 會在執行時從 `chrome.runtime.getManifest().version` 動態覆寫 `#versionText`，
> 但 popup.html 的靜態值作為 fallback，兩處應保持一致。

---

## 15. 已知限制與注意事項

**Gmail DOM 操作的根本限制**

Gmail 是複雜的 SPA，DOM 操作非官方支援，以下情況可能導致失敗：

- **Checkbox 不回應**：Gmail 可能需要 hover 才渲染 checkbox DOM 節點。`_selectRows()` 已發送 `mouseenter`/`mouseover` 事件，但部分情況下 Gmail 的 Virtual DOM 可能仍未渲染。
- **Toolbar 遲遲不出現**：`_waitForElement()` 最多等 3 秒，超時則嘗試鍵盤快捷鍵 `#`。
- **Gmail UI 更新**：若 class names 改變，更新 `GMAIL_ACTIONS` 和 `getEmails()` 的 selectors。

**已知的 Gmail class 不穩定點**

| 功能 | 已知 class | 備注 |
|------|-----------|------|
| 刪除按鈕 | `.bkJ`、`[act="10"]` | 可能隨版本更新 |
| Checkbox | `[role="checkbox"]`（較穩定） | `role` 屬性比 class 穩定 |
| 已讀/未讀 | `.yO` / `.zE` | 目前穩定 |

**Content Script 注入時機**

若 Gmail 分頁在 extension 安裝前就已開啟，Chrome 不會自動注入 content scripts。`popup.js` 的 `ensureContentScript()` 已處理此情況（PING → 動態注入）。

**`chrome.storage.sync` 容量限制**

單一 item 上限 8KB，總計 100KB。若分類關鍵字過多，考慮改用 `chrome.storage.local`（5MB）。

**AI 模式的 CORS**

AI API 呼叫必須透過 `background.js`（Service Worker）轉發，content script 直接 fetch 會被 CORS 擋住。
