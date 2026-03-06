# Aegis Mail Unit Tests

完整的郵件判斷邏輯測試套件，涵蓋所有分析模組。

## 安裝測試環境

```bash
npm install
```

## 執行測試

```bash
# 執行所有測試
npm test

# 監視模式（開發時使用）
npm run test:watch

# 產生覆蓋率報告
npm run test:coverage
```

## 測試結構

```
__tests__/
├── setup.js                    # Jest 設定與 Chrome API mocks
├── fixtures/
│   └── test-whitelist.js       # 測試用白名單資料
├── email-analyzer.test.js      # 郵件分析核心邏輯測試
├── whitelist-manager.test.js   # 白名單管理測試
└── ai-analyzer.test.js         # AI 分析整合測試
```

## 測試涵蓋範圍

### EmailAnalyzer (email-analyzer.test.js)

#### 關鍵字分類測試
- ✓ 工作相關郵件分類
- ✓ 財務相關郵件分類
- ✓ 未匹配關鍵字的預設分類
- ✓ 中文關鍵字支援
- ✓ 多關鍵字匹配優先級

#### 寄件人分析測試
- ✓ 缺少郵件地址檢測
- ✓ 臨時/拋棄式郵件服務檢測
- ✓ 公開個人郵件服務標記
- ✓ 本地部分含大量數字檢測
- ✓ 可疑 TLD 檢測
- ✓ 自動生成郵件地址檢測

#### 內容分析測試
- ✓ 釣魚關鍵字檢測（英文）
- ✓ 釣魚關鍵字檢測（中文）
- ✓ 全大寫文字檢測
- ✓ CJK 文字不被誤判為大寫

#### 連結分析測試
- ✓ HTTP 不安全連結檢測
- ✓ IP 位址連結檢測
- ✓ 可疑 TLD 連結檢測
- ✓ 白名單服務連結驗證
- ✓ 非白名單連結檢測（已知服務）
- ✓ 潛在偽冒檢測（關鍵字匹配但寄件人不符）

#### 綜合場景測試
- ✓ 合法郵件高分數
- ✓ 明顯釣魚郵件低分數
- ✓ 個人郵件謹慎處理

#### 郵件列表分析測試
- ✓ 按分類分組郵件
- ✓ 空列表處理

### WhitelistManager (whitelist-manager.test.js)

#### 域名提取測試
- ✓ 子域名提取基礎域名
- ✓ 特殊 TLD 處理（.co.jp, .com.tw）
- ✓ 簡單域名處理
- ✓ 空值或無效輸入處理

#### 服務匹配測試
- ✓ 精確寄件人域名匹配
- ✓ 子域名匹配
- ✓ 特殊 TLD 域名處理
- ✓ 未知域名返回 null
- ✓ 無效郵件處理

#### 關鍵字服務查找測試
- ✓ 關鍵字匹配服務
- ✓ 多服務匹配
- ✓ 大小寫不敏感
- ✓ 無匹配返回空陣列
- ✓ 空輸入處理

#### 域名驗證測試
- ✓ 精確服務域名匹配
- ✓ 子域名匹配
- ✓ 基礎域名匹配
- ✓ 不相關域名不匹配
- ✓ null 輸入處理

#### 公開郵件域名測試
- ✓ 檢測公開郵件域名
- ✓ 子域名匹配
- ✓ 企業域名不匹配
- ✓ 空輸入處理

#### 可疑域名測試
- ✓ 檢測可疑域名
- ✓ 子域名匹配
- ✓ 合法域名不匹配
- ✓ 空輸入處理

#### 短網址服務測試
- ✓ 檢測已知短網址服務
- ✓ 一般 URL 不匹配
- ✓ 無效 URL 處理

### AIAnalyzer (ai-analyzer.test.js)

#### AI 分析測試
- ✓ 成功分析郵件
- ✓ API 錯誤處理
- ✓ 空回應處理
- ✓ 無效 JSON 處理
- ✓ 從回應中提取 JSON
- ✓ 請求包含白名單資訊
- ✓ 長郵件內容截斷
- ✓ 連結數量限制

## 測試資料

測試使用 `fixtures/test-whitelist.js` 中的模擬白名單資料，包含：

- 4 個測試服務（Google, GitHub, Amazon, PayPal）
- 8 個公開郵件域名
- 6 個可疑域名
- 5 個短網址服務

## 安全評分邏輯驗證

測試確保以下扣分規則正確執行：

| 問題類型 | 扣分 | 測試覆蓋 |
|---------|------|---------|
| 缺少郵件地址 | -20 | ✓ |
| 臨時郵件服務 | -30 | ✓ |
| 本地部分含大量數字 | -10 | ✓ |
| 可疑 TLD | -15 | ✓ |
| 自動生成地址 | -5 | ✓ |
| 釣魚關鍵字 | -10 每個（上限 -30） | ✓ |
| 全大寫文字 | -10 | ✓ |
| HTTP 連結 | -5 每個（上限 -15） | ✓ |
| 可疑連結 | -15 每個（上限 -30） | ✓ |
| 非白名單連結 | -15 每個（上限 -30） | ✓ |
| 潛在偽冒 | -25 每個（上限 -40） | ✓ |

## 持續整合

測試可整合至 CI/CD 流程：

```yaml
# .github/workflows/test.yml 範例
name: Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm install
      - run: npm test
      - run: npm run test:coverage
```

## 除錯測試

啟用詳細輸出：

```bash
# 執行特定測試檔案
npx jest __tests__/email-analyzer.test.js

# 執行特定測試案例
npx jest -t "should detect phishing keywords"

# 顯示詳細錯誤
npx jest --verbose
```

## 新增測試

遵循現有測試結構：

```javascript
describe('ModuleName - functionName', () => {
  test('should handle specific case', () => {
    const result = ModuleName.functionName(input);
    expect(result).toBe(expected);
  });
});
```

## 注意事項

- 測試在 jsdom 環境中執行，模擬瀏覽器 API
- Chrome Extension APIs 已被 mock
- 測試不需要實際的 Chrome 瀏覽器
- AI 測試使用 mock fetch，不會發送真實 API 請求
