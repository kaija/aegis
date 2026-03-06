'use strict';

const { describe, test, expect, beforeEach } = require('@jest/globals');
const fs = require('fs');
const path = require('path');

// Load modules
const emailAnalyzerCode = fs.readFileSync(path.join(__dirname, '../src/analysis/email-analyzer.js'), 'utf8');
eval(emailAnalyzerCode);

const testWhitelist = require('./fixtures/test-whitelist');

describe('EmailAnalyzer - categorizeByKeywords', () => {
  const categories = [
    { id: 'work', name: '工作', emoji: '💼', keywords: ['meeting', 'project', 'deadline', '會議', '專案'] },
    { id: 'finance', name: '財務', emoji: '💰', keywords: ['invoice', 'payment', 'bank', '帳單', '付款'] },
    { id: 'social', name: '社交', emoji: '👥', keywords: ['invitation', 'event', 'party', '邀請', '活動'] }
  ];

  test('should categorize email with work keywords', () => {
    const result = EmailAnalyzer.categorizeByKeywords('Project deadline meeting', categories, []);
    expect(result.id).toBe('work');
    expect(result.name).toBe('工作');
  });

  test('should categorize email with finance keywords', () => {
    const result = EmailAnalyzer.categorizeByKeywords('Invoice payment due', categories, []);
    expect(result.id).toBe('finance');
  });

  test('should return "other" for unmatched keywords', () => {
    const result = EmailAnalyzer.categorizeByKeywords('Random text without keywords', categories, []);
    expect(result.id).toBe('other');
    expect(result.name).toBe('其他');
  });

  test('should handle Chinese keywords', () => {
    const result = EmailAnalyzer.categorizeByKeywords('明天的會議專案', categories, []);
    expect(result.id).toBe('work');
  });

  test('should choose category with highest keyword match count', () => {
    const result = EmailAnalyzer.categorizeByKeywords('meeting project deadline invoice', categories, []);
    expect(result.id).toBe('work'); // 3 matches vs 1 match
  });
});

describe('EmailAnalyzer - analyzeEmailDetail', () => {
  const categories = [
    { id: 'notification', name: '通知', emoji: '🔔', keywords: ['notification', 'alert', 'update'] }
  ];

  beforeEach(() => {
    // Disable debug output during tests
    global.window.__aegisDebug = false;
  });

  describe('Sender Analysis', () => {
    test('should detect missing email address', () => {
      const result = EmailAnalyzer.analyzeEmailDetail(
        { subject: 'Test', sender: 'John Doe', senderEmail: '', body: '', links: [] },
        categories,
        testWhitelist
      );
      expect(result.safetyScore).toBeLessThan(100);
      expect(result.issues.some(i => i.includes('無電子郵件地址'))).toBe(true);
    });

    test('should detect suspicious temporary email domain', () => {
      const result = EmailAnalyzer.analyzeEmailDetail(
        { subject: 'Test', sender: 'User', senderEmail: 'user@tempmail.com', body: '', links: [] },
        categories,
        testWhitelist
      );
      expect(result.safetyScore).toBeLessThanOrEqual(70);
      expect(result.issues.some(i => i.includes('臨時/拋棄式郵件'))).toBe(true);
      expect(result.flags).toContain('suspicious_domain');
    });

    test('should flag public email domains', () => {
      const result = EmailAnalyzer.analyzeEmailDetail(
        { subject: 'Test', sender: 'User', senderEmail: 'user@gmail.com', body: '', links: [] },
        categories,
        testWhitelist
      );
      expect(result.flags).toContain('public_email');
    });

    test('should detect email with many digits in local part', () => {
      const result = EmailAnalyzer.analyzeEmailDetail(
        { subject: 'Test', sender: 'User', senderEmail: 'user123456@example.com', body: '', links: [] },
        categories,
        testWhitelist
      );
      expect(result.safetyScore).toBeLessThan(100);
      expect(result.issues.some(i => i.includes('含大量數字'))).toBe(true);
    });

    test('should detect suspicious TLD', () => {
      const result = EmailAnalyzer.analyzeEmailDetail(
        { subject: 'Test', sender: 'User', senderEmail: 'user@example.xyz', body: '', links: [] },
        categories,
        testWhitelist
      );
      expect(result.safetyScore).toBeLessThan(100);
      expect(result.issues.some(i => i.includes('可疑網域後綴'))).toBe(true);
    });

    test('should detect auto-generated email addresses', () => {
      const result = EmailAnalyzer.analyzeEmailDetail(
        { subject: 'Test', sender: 'User', senderEmail: 'abcdefghijklmnop@example.com', body: '', links: [] },
        categories,
        testWhitelist
      );
      expect(result.safetyScore).toBeLessThan(100);
      expect(result.issues.some(i => i.includes('自動生成'))).toBe(true);
    });
  });

  describe('Content Analysis', () => {
    test('should detect phishing keywords', () => {
      const result = EmailAnalyzer.analyzeEmailDetail(
        { 
          subject: 'URGENT: Verify your account immediately', 
          sender: 'Admin', 
          senderEmail: 'admin@example.com', 
          body: 'Click here immediately to verify your account or it will be suspended',
          links: []
        },
        categories,
        testWhitelist
      );
      expect(result.safetyScore).toBeLessThan(80);
      expect(result.issues.some(i => i.includes('可疑關鍵字'))).toBe(true);
    });

    test('should detect Chinese phishing keywords', () => {
      const result = EmailAnalyzer.analyzeEmailDetail(
        { 
          subject: '緊急：立即驗證您的帳號', 
          sender: 'Admin', 
          senderEmail: 'admin@example.com', 
          body: '您的帳號已被凍結，請立即點擊確認',
          links: []
        },
        categories,
        testWhitelist
      );
      expect(result.safetyScore).toBeLessThan(80);
    });
  });

  describe('Link Analysis', () => {
    test('should detect HTTP links', () => {
      const result = EmailAnalyzer.analyzeEmailDetail(
        { 
          subject: 'Test', 
          sender: 'User', 
          senderEmail: 'user@example.com', 
          body: 'Check this',
          links: ['http://example.com/page']
        },
        categories,
        testWhitelist
      );
      expect(result.safetyScore).toBeLessThan(100);
      expect(result.issues.some(i => i.includes('不安全的 HTTP'))).toBe(true);
    });

    test('should detect IP address links', () => {
      const result = EmailAnalyzer.analyzeEmailDetail(
        { 
          subject: 'Test', 
          sender: 'User', 
          senderEmail: 'user@example.com', 
          body: 'Visit',
          links: ['https://192.168.1.1/login']
        },
        categories,
        testWhitelist
      );
      expect(result.safetyScore).toBeLessThan(100);
      expect(result.issues.some(i => i.includes('可疑連結'))).toBe(true);
    });

    test('should detect suspicious TLD in links', () => {
      const result = EmailAnalyzer.analyzeEmailDetail(
        { 
          subject: 'Test', 
          sender: 'User', 
          senderEmail: 'user@example.com', 
          body: 'Click',
          links: ['https://malicious.xyz/phishing']
        },
        categories,
        testWhitelist
      );
      expect(result.safetyScore).toBeLessThan(100);
    });

    test('should whitelist legitimate service links', () => {
      const result = EmailAnalyzer.analyzeEmailDetail(
        { 
          subject: 'GitHub Notification', 
          sender: 'GitHub', 
          senderEmail: 'noreply@github.com', 
          body: 'New pull request',
          links: ['https://github.com/user/repo/pull/123']
        },
        categories,
        testWhitelist
      );
      expect(result.safetyScore).toBeGreaterThanOrEqual(95);
      expect(result.issues.some(i => i.includes('白名單驗證'))).toBe(true);
    });

    test('should detect off-whitelist links from known service', () => {
      const result = EmailAnalyzer.analyzeEmailDetail(
        { 
          subject: 'GitHub Notification', 
          sender: 'GitHub', 
          senderEmail: 'noreply@github.com', 
          body: 'Click here',
          links: ['https://evil-site.com/fake-github']
        },
        categories,
        testWhitelist
      );
      expect(result.safetyScore).toBeLessThanOrEqual(85);
      expect(result.issues.some(i => i.includes('不屬於'))).toBe(true);
    });

    test('should detect potential spoofing (keyword match but wrong sender)', () => {
      const result = EmailAnalyzer.analyzeEmailDetail(
        { 
          subject: 'Your Amazon order has shipped', 
          sender: 'Shipping', 
          senderEmail: 'noreply@fake-shop.com', 
          body: 'Your Amazon order #123 has been shipped',
          links: ['https://amazon.com/track/123']
        },
        categories,
        testWhitelist
      );
      expect(result.safetyScore).toBeLessThanOrEqual(75);
      expect(result.issues.some(i => i.includes('偽冒'))).toBe(true);
    });
  });

  describe('Combined Scenarios', () => {
    test('should handle legitimate email with high score', () => {
      const result = EmailAnalyzer.analyzeEmailDetail(
        { 
          subject: 'Your GitHub pull request was merged', 
          sender: 'GitHub', 
          senderEmail: 'notifications@github.com', 
          body: 'Pull request #42 in user/repo was merged',
          links: ['https://github.com/user/repo/pull/42']
        },
        categories,
        testWhitelist
      );
      expect(result.safetyScore).toBeGreaterThanOrEqual(95);
      expect(result.safetyLevel).toBe('safe');
    });

    test('should handle obvious phishing with low score', () => {
      const result = EmailAnalyzer.analyzeEmailDetail(
        { 
          subject: 'URGENT: Verify your account NOW', 
          sender: 'Security', 
          senderEmail: 'admin12345@tempmail.com', 
          body: 'Your account will be suspended. Click here immediately to verify',
          links: ['http://192.168.1.1/verify', 'https://evil.xyz/login']
        },
        categories,
        testWhitelist
      );
      expect(result.safetyScore).toBeLessThan(40);
      expect(result.safetyLevel).toBe('danger');
    });

    test('should handle personal email with caution', () => {
      const result = EmailAnalyzer.analyzeEmailDetail(
        { 
          subject: 'Meeting tomorrow', 
          sender: 'John Doe', 
          senderEmail: 'john.doe@gmail.com', 
          body: 'Let\'s meet at 3pm',
          links: []
        },
        categories,
        testWhitelist
      );
      expect(result.safetyScore).toBeGreaterThanOrEqual(80);
      expect(result.flags).toContain('public_email');
    });
  });
});

describe('EmailAnalyzer - analyzeEmailList', () => {
  const categories = [
    { id: 'work', name: '工作', emoji: '💼', keywords: ['meeting', 'project'] },
    { id: 'finance', name: '財務', emoji: '💰', keywords: ['invoice', 'payment'] }
  ];

  test('should group emails by category', () => {
    const emails = [
      { id: '1', subject: 'Project meeting', sender: 'Boss', senderEmail: 'boss@company.com' },
      { id: '2', subject: 'Invoice #123', sender: 'Accounting', senderEmail: 'acc@company.com' },
      { id: '3', subject: 'Project update', sender: 'Team', senderEmail: 'team@company.com' }
    ];

    const result = EmailAnalyzer.analyzeEmailList(emails, [], categories);
    
    expect(result.has('work')).toBe(true);
    expect(result.has('finance')).toBe(true);
    expect(result.get('work').emails.length).toBe(2);
    expect(result.get('finance').emails.length).toBe(1);
  });

  test('should handle empty email list', () => {
    const result = EmailAnalyzer.analyzeEmailList([], [], categories);
    expect(result.size).toBe(0);
  });
});
