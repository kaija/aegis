#!/bin/bash

# Aegis Mail 測試執行腳本

set -e

echo "🧪 Aegis Mail Unit Tests"
echo "========================"
echo ""

# 檢查 Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js 未安裝"
    echo "請先安裝 Node.js: https://nodejs.org/"
    exit 1
fi

echo "✓ Node.js $(node --version)"

# 檢查 npm
if ! command -v npm &> /dev/null; then
    echo "❌ npm 未安裝"
    exit 1
fi

echo "✓ npm $(npm --version)"
echo ""

# 安裝依賴
if [ ! -d "node_modules" ]; then
    echo "📦 安裝測試依賴..."
    npm install
    echo ""
fi

# 執行測試
echo "🚀 執行測試..."
echo ""

case "${1:-all}" in
    "all")
        npm test
        ;;
    "coverage")
        npm run test:coverage
        echo ""
        echo "📊 覆蓋率報告已產生: coverage/lcov-report/index.html"
        ;;
    "watch")
        npm run test:watch
        ;;
    "analyzer")
        npm run test:analyzer
        ;;
    "whitelist")
        npm run test:whitelist
        ;;
    "ai")
        npm run test:ai
        ;;
    "verbose")
        npm run test:verbose
        ;;
    *)
        echo "用法: $0 [all|coverage|watch|analyzer|whitelist|ai|verbose]"
        exit 1
        ;;
esac

echo ""
echo "✅ 測試完成"
