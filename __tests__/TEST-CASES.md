# 測試案例清單

## EmailAnalyzer 測試案例

### 分類測試 (categorizeByKeywords)

| 測試案例 | 輸入 | 預期輸出 |
|---------|------|---------|
| 工作郵件 | "Project deadline meeting" | category.id = 'work' |
| 財務郵件 | "Invoice payment due" | category.id = 'finance' |
| 未匹配 | "Random text" | category.id = 'other' |
| 中文關鍵字 | "明天的會議專案" | category.id = 'work' |
| 多關鍵字 | "meeting project deadline invoice" | category.id = 'work' (3 vs 1) |

### 寄件人分析測試

| 測試案例 | 寄件人郵件 | 預期結果 |
|---------|-----------|---------|
| 缺少郵件 | "" | 扣 20 分，issues 包含 "無電子郵件地址" |
| 臨時郵件 | "user@tempmail.com" | 扣 30 分，flags 包含 "suspicious_domain" |
| 公開郵件 | "user@gmail.com" | flags 包含 "public_email" |
| 大量數字 | "user123456@example.com" | 扣 10 分，issues 包含 "含大量數字" |
| 可疑 TLD | "user@example.xyz" | 扣 15 分，issues 包含 "可疑網域後綴" |
| 自動生成 | "abcdefghijklmnop@example.com" | 扣 5 分，issues 包含 "自動生成" |

### 內容分析測試

| 測試案例 | 主旨/內容 | 預期結果 |
|---------|----------|---------|
| 英文釣魚 | "URGENT: Verify your account immediately" | 扣分，issues 包含 "可疑關鍵字" |
| 中文釣魚 | "緊急：立即驗證您的帳號" | 扣分，issues 包含 "可疑關鍵字" |
| 全大寫 | "URGENT ACTION REQUIRED NOW" | 扣 10 分，issues 包含 "全大寫" |
| CJK 文字 | "重要通知 IMPORTANT" | 不扣分（只計算英文） |

### 連結分析測試

| 測試案例 | 寄件人 | 連結 | 預期結果 |
|---------|-------|------|---------|
| HTTP 連結 | user@example.com | http://example.com | 扣分，issues 包含 "不安全的 HTTP" |
| IP 位址 | user@example.com | https://192.168.1.1 | 扣分，issues 包含 "可疑連結" |
| 可疑 TLD | user@example.com | https://malicious.xyz | 扣分 |
| 白名單 | noreply@github.com | https://github.com/user/repo | 高分，issues 包含 "白名單驗證" |
| 非白名單 | noreply@github.com | https://evil-site.com | 扣分，issues 包含 "不屬於" |
| 偽冒 | noreply@fake.com | https://amazon.com (內容提及 Amazon) | 扣分，issues 包含 "偽冒" |

### 綜合場景測試

| 場景 | 描述 | 預期分數 | 預期等級 |
|-----|------|---------|---------|
| 合法郵件 | GitHub 官方通知，正確域名 | ≥ 95 | safe |
| 釣魚郵件 | 臨時郵件 + 釣魚關鍵字 + HTTP + 可疑 TLD | < 40 | danger |
| 個人郵件 | Gmail 寄件，無可疑內容 | ≥ 80 | safe/caution |

## WhitelistManager 測試案例

### 域名提取測試

| 輸入 | 預期輸出 |
|-----|---------|
| "mail.google.com" | "google.com" |
| "accounts.google.com" | "google.com" |
| "example.co.jp" | "example.co.jp" |
| "mail.example.com.tw" | "example.com.tw" |
| "example.com" | "example.com" |
| "" | "" |
| "localhost" | "localhost" |

### 服務匹配測試

| 寄件人郵件 | 預期服務 |
|-----------|---------|
| "user@github.com" | GitHub |
| "noreply@mail.google.com" | Google |
| "order@amazon.co.jp" | Amazon |
| "user@unknown-service.com" | null |
| "invalid-email" | null |

### 關鍵字服務查找測試

| 郵件內容 | 預期服務 |
|---------|---------|
| "Your GitHub pull request was merged" | [GitHub] |
| "Amazon AWS order shipment" | [Amazon] |
| "GITHUB REPOSITORY" | [GitHub] (大小寫不敏感) |
| "random text" | [] |

### 域名驗證測試

| 域名 | 服務 | 預期結果 |
|-----|------|---------|
| "github.com" | GitHub | true |
| "api.github.com" | GitHub | true |
| "raw.githubusercontent.com" | GitHub | true |
| "evil-github.com" | GitHub | false |
| "github.com.evil.com" | GitHub | false |

### 公開/可疑域名測試

| 域名 | isPublicEmail | isSuspicious |
|-----|--------------|-------------|
| "gmail.com" | true | false |
| "yahoo.com" | true | false |
| "tempmail.com" | false | true |
| "10minutemail.com" | false | true |
| "company.com" | false | false |

## AIAnalyzer 測試案例

### API 整合測試

| 測試案例 | Mock 回應 | 預期結果 |
|---------|----------|---------|
| 成功分析 | 有效 JSON | 返回解析結果 |
| API 錯誤 | status 500 | 拋出錯誤 |
| 空回應 | content = "" | 拋出 "Empty response" |
| 無效 JSON | "This is not JSON" | 拋出 "No JSON found" |
| 含額外文字 | "Here is: {...}" | 成功提取 JSON |

### 請求內容測試

| 測試項目 | 驗證內容 |
|---------|---------|
| 白名單資訊 | 包含 "Known trusted services" |
| 公開郵件 | 包含 "Public email domains" |
| 可疑域名 | 包含 "suspicious/temporary email" |
| 內容截斷 | body 限制 1000 字元 |
| 連結限制 | links 限制 10 個 |

## 安全評分計算驗證

### 扣分規則測試

| 規則 | 扣分 | 上限 | 測試覆蓋 |
|-----|------|------|---------|
| 缺少郵件地址 | -20 | -20 | ✓ |
| 臨時郵件服務 | -30 | -30 | ✓ |
| 本地部分含數字 (≥4) | -10 | -10 | ✓ |
| 可疑 TLD | -15 | -15 | ✓ |
| 自動生成地址 (≥12) | -5 | -5 | ✓ |
| 釣魚關鍵字 | -10 × 數量 | -30 | ✓ |
| 全大寫文字 (>30%) | -10 | -10 | ✓ |
| HTTP 連結 | -5 × 數量 | -15 | ✓ |
| 可疑連結 | -15 × 數量 | -30 | ✓ |
| 非白名單連結 | -15 × 數量 | -30 | ✓ |
| 潛在偽冒 | -25 × 數量 | -40 | ✓ |

### 分數範圍測試

| 場景 | 計算 | 最終分數 |
|-----|------|---------|
| 完美郵件 | 100 - 0 | 100 |
| 輕微問題 | 100 - 15 | 85 |
| 多個問題 | 100 - 65 | 35 |
| 超過扣分 | 100 - 150 | 0 (下限) |

### 安全等級測試

| 分數範圍 | 等級 | 顏色 |
|---------|------|------|
| 80-100 | safe | #1a7f37 |
| 50-79 | caution | #9a6700 |
| 0-49 | danger | #cf222e |

## 邊界條件測試

### 空值/null 測試

| 函數 | 輸入 | 預期行為 |
|-----|------|---------|
| categorizeByKeywords | "" | 返回 'other' |
| analyzeEmailDetail | { senderEmail: "" } | 扣 20 分 |
| extractBaseDomain | "" | 返回 "" |
| findServiceBySenderDomain | "" | 返回 null |
| isDomainInService | "", service | 返回 false |

### 特殊字元測試

| 測試項目 | 輸入 | 預期行為 |
|---------|------|---------|
| CJK 字元 | "重要通知" | 正確處理，不誤判大寫 |
| 混合語言 | "Meeting 會議" | 正確分類 |
| 特殊符號 | "Re: [URGENT]" | 正確提取關鍵字 |

## 效能測試建議

| 測試項目 | 目標 |
|---------|------|
| 單一郵件分析 | < 100ms |
| 100 封郵件列表分析 | < 1s |
| 白名單初始化 | < 50ms |
| AI API 呼叫 | < 3s (含網路) |

## 測試覆蓋率目標

| 指標 | 目標 | 當前 |
|-----|------|------|
| 語句覆蓋率 | > 80% | - |
| 分支覆蓋率 | > 75% | - |
| 函數覆蓋率 | > 80% | - |
| 行覆蓋率 | > 80% | - |
