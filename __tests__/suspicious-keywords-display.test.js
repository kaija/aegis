'use strict';

/**
 * Test: Suspicious Keywords Display in Email Popup
 * 
 * Verifies that when suspicious keywords are detected in email content,
 * they are displayed in the security popup with color-coded tags.
 */

describe('Suspicious Keywords Display', () => {
  let EmailAnalyzer, EmailPopup;

  beforeEach(() => {
    // Load modules
    require('../src/analysis/email-analyzer.js');
    require('../src/ui/email-popup.js');
    
    EmailAnalyzer = window.EmailAnalyzer;
    EmailPopup = window.EmailPopup;

    // Setup DOM
    document.body.innerHTML = '';
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  test('should return suspicious keywords in analysis result', () => {
    const emailData = {
      subject: 'URGENT: Verify your account immediately',
      sender: 'Security Team',
      senderEmail: 'security@example.com',
      body: 'Click here immediately to confirm your account or it will be suspended.',
      links: []
    };

    const categories = [
      { id: 'other', name: '其他', emoji: '📂', color: '#757575', bgColor: '#f5f5f5', keywords: [] }
    ];

    const result = EmailAnalyzer.analyzeEmailDetail(emailData, categories, null);

    // Should detect suspicious keywords
    expect(result.suspiciousKeywords).toBeDefined();
    expect(Array.isArray(result.suspiciousKeywords)).toBe(true);
    expect(result.suspiciousKeywords.length).toBeGreaterThan(0);
    
    // Should contain expected keywords
    const lowerKeywords = result.suspiciousKeywords.map(k => k.toLowerCase());
    expect(lowerKeywords).toContain('urgent');
    expect(lowerKeywords).toContain('verify your account');
    expect(lowerKeywords).toContain('click here immediately');
    expect(lowerKeywords).toContain('suspended');
    expect(lowerKeywords).toContain('confirm your');
  });

  test('should include keyword count in issues', () => {
    const emailData = {
      subject: 'Urgent action required',
      sender: 'Admin',
      senderEmail: 'admin@test.com',
      body: 'Verify your account now',
      links: []
    };

    const categories = [
      { id: 'other', name: '其他', emoji: '📂', color: '#757575', bgColor: '#f5f5f5', keywords: [] }
    ];

    const result = EmailAnalyzer.analyzeEmailDetail(emailData, categories, null);

    // Should have issue mentioning keyword count
    const keywordIssue = result.issues.find(i => i.includes('個可疑關鍵字'));
    expect(keywordIssue).toBeDefined();
    expect(keywordIssue).toMatch(/內容含 \d+ 個可疑關鍵字/);
  });

  test('should display keywords with color tags in popup', () => {
    const analysis = {
      category: { id: 'other', name: '其他', emoji: '📂', color: '#757575', bgColor: '#f5f5f5' },
      tags: [],
      safetyScore: 60,
      safetyLevel: 'caution',
      safetyColor: '#9a6700',
      issues: ['內容含 3 個可疑關鍵字'],
      linkResults: [],
      suspiciousKeywords: ['urgent', 'verify your account', 'suspended']
    };

    const popup = new EmailPopup();
    popup.show(analysis);

    const popupElement = document.getElementById('aegis-email-popup');
    expect(popupElement).toBeTruthy();

    // Should display the issue with keywords
    const issuesSection = popupElement.querySelector('.aegis-issues-list');
    expect(issuesSection).toBeTruthy();

    const issueItems = issuesSection.querySelectorAll('.aegis-issue-item');
    expect(issueItems.length).toBeGreaterThan(0);

    // Find the keyword issue
    const keywordIssue = Array.from(issueItems).find(item => 
      item.textContent.includes('個可疑關鍵字')
    );
    expect(keywordIssue).toBeTruthy();

    // Should contain colored keyword tags
    const keywordTags = keywordIssue.querySelectorAll('span[style*="background"]');
    expect(keywordTags.length).toBe(3);

    // Verify keywords are displayed
    const displayedKeywords = Array.from(keywordTags).map(tag => tag.textContent);
    expect(displayedKeywords).toContain('urgent');
    expect(displayedKeywords).toContain('verify your account');
    expect(displayedKeywords).toContain('suspended');

    // Verify color styling
    keywordTags.forEach(tag => {
      const style = tag.getAttribute('style');
      expect(style).toMatch(/background:#[0-9a-f]{6}/i);
      expect(style).toMatch(/color:white/i);
    });
  });

  test('should handle Chinese suspicious keywords', () => {
    const emailData = {
      subject: '緊急通知',
      sender: '系統管理員',
      senderEmail: 'admin@test.com',
      body: '您的帳號已被凍結，請立即點擊連結進行驗證您的身份',
      links: []
    };

    const categories = [
      { id: 'other', name: '其他', emoji: '📂', color: '#757575', bgColor: '#f5f5f5', keywords: [] }
    ];

    const result = EmailAnalyzer.analyzeEmailDetail(emailData, categories, null);

    expect(result.suspiciousKeywords).toBeDefined();
    expect(result.suspiciousKeywords.length).toBeGreaterThan(0);

    // Should detect Chinese keywords
    expect(result.suspiciousKeywords).toContain('緊急');
    expect(result.suspiciousKeywords).toContain('帳號');
    expect(result.suspiciousKeywords).toContain('凍結');
    expect(result.suspiciousKeywords).toContain('立即');
    expect(result.suspiciousKeywords).toContain('點擊');
    expect(result.suspiciousKeywords).toContain('驗證您的');
  });

  test('should not display keywords section when no suspicious keywords found', () => {
    const analysis = {
      category: { id: 'other', name: '其他', emoji: '📂', color: '#757575', bgColor: '#f5f5f5' },
      tags: [],
      safetyScore: 95,
      safetyLevel: 'safe',
      safetyColor: '#1a7f37',
      issues: [],
      linkResults: [],
      suspiciousKeywords: []
    };

    const popup = new EmailPopup();
    popup.show(analysis);

    const popupElement = document.getElementById('aegis-email-popup');
    const issuesSection = popupElement.querySelector('.aegis-issues-list');
    
    // Should not have issues section when no issues
    expect(issuesSection).toBeFalsy();
  });

  test('should use different colors for multiple keywords', () => {
    const analysis = {
      category: { id: 'other', name: '其他', emoji: '📂', color: '#757575', bgColor: '#f5f5f5' },
      tags: [],
      safetyScore: 50,
      safetyLevel: 'caution',
      safetyColor: '#9a6700',
      issues: ['內容含 5 個可疑關鍵字'],
      linkResults: [],
      suspiciousKeywords: ['urgent', 'verify your account', 'suspended', 'click here immediately', 'confirm your']
    };

    const popup = new EmailPopup();
    popup.show(analysis);

    const popupElement = document.getElementById('aegis-email-popup');
    const keywordTags = popupElement.querySelectorAll('.aegis-issue-item span[style*="background"]');
    
    expect(keywordTags.length).toBe(5);

    // Collect all background colors
    const colors = Array.from(keywordTags).map(tag => {
      const match = tag.getAttribute('style').match(/background:(#[0-9a-f]{6})/i);
      return match ? match[1].toLowerCase() : null;
    });

    // Should have multiple different colors
    const uniqueColors = new Set(colors);
    expect(uniqueColors.size).toBeGreaterThan(1);
  });
});
