# 測試快速開始

## 一鍵執行

```bash
# 安裝並執行測試
npm install && npm test
```

## 常用指令

```bash
npm test                    # 執行所有測試
npm run test:verbose        # 查看詳細輸出
npm run test:watch          # 開發模式（自動重新執行）
```

## 測試特定模組

```bash
npm run test:analyzer       # 郵件分析器
npm run test:whitelist      # 白名單管理
npm run test:ai             # AI 整合
```

## 使用腳本

```bash
./scripts/run-tests.sh all          # 所有測試
./scripts/run-tests.sh coverage     # 含覆蓋率報告
./scripts/run-tests.sh watch        # 監視模式
```

## 測試結果

✅ **65 個測試全部通過**

- EmailAnalyzer: 26 tests
- WhitelistManager: 31 tests  
- AIAnalyzer: 8 tests

## 查看詳細報告

- `TEST-SUMMARY.txt` - 執行摘要
- `TEST-RESULTS.md` - 完整測試報告
- `TESTING.md` - 測試指南
- `TEST-CASES.md` - 測試案例清單

## 測試涵蓋

✅ 關鍵字分類（中英文）  
✅ 安全評分計算  
✅ 釣魚郵件檢測  
✅ 白名單驗證  
✅ 偽冒攻擊檢測  
✅ 邊界條件處理  

## 問題排查

### 測試失敗？

```bash
# 查看詳細錯誤
npm run test:verbose

# 只執行失敗的測試
npx jest --onlyFailures
```

### 需要除錯？

```bash
# 執行特定測試
npx jest -t "test name"

# 查看完整堆疊
npx jest --no-coverage
```

## 新增測試

1. 在 `__tests__/` 建立 `*.test.js` 檔案
2. 使用 `describe` 和 `test` 組織測試
3. 執行 `npm test` 驗證

範例：
```javascript
describe('ModuleName', () => {
  test('should do something', () => {
    const result = ModuleName.function();
    expect(result).toBe(expected);
  });
});
```

## 持續整合

測試可整合至 CI/CD：

```yaml
# GitHub Actions
- run: npm install
- run: npm test
```

---

**需要幫助？** 查看 `TESTING.md` 完整指南
