'use strict';

const EmailAnalyzer = (() => {

  const PHISHING_KEYWORDS = [
    'urgent', 'verify your account', 'click here immediately', 'suspended',
    'confirm your', 'wire transfer', 'you have won', 'lottery', 'prize',
    'verify immediately', 'account blocked', 'account suspended',
    '帳號', '緊急', '立即', '點擊', '確認', '凍結', '驗證您的'
  ];

  const SUSPICIOUS_TLDS = ['.xyz', '.top', '.click', '.loan', '.work', '.date', '.win', '.bid', '.stream'];

  const FREE_EMAIL_DOMAINS = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'live.com', '163.com', 'qq.com'];

  function categorizeByKeywords(text, categories, userLabels) {
    const lowerText = text.toLowerCase();
    let bestCategory = null;
    let bestScore = 0;

    for (const cat of categories) {
      let score = 0;
      for (const kw of cat.keywords) {
        if (lowerText.includes(kw.toLowerCase())) {
          score++;
        }
      }
      if (score > bestScore) {
        bestScore = score;
        bestCategory = cat;
      }
    }

    if (!bestCategory) {
      return { id: 'other', name: '其他', emoji: '📂', color: '#757575', bgColor: '#f5f5f5', keywords: [] };
    }

    return bestCategory;
  }

  function analyzeEmailList(emails, userLabels, categories) {
    const groups = new Map();

    for (const email of emails) {
      const text = `${email.subject} ${email.sender} ${email.senderEmail}`;
      const category = categorizeByKeywords(text, categories, userLabels);

      if (!groups.has(category.id)) {
        groups.set(category.id, { category, emails: [] });
      }
      groups.get(category.id).emails.push(email);
    }

    return groups;
  }

  function analyzeSender(sender, senderEmail) {
    let deductions = 0;
    const issues = [];

    if (!senderEmail) {
      deductions += 20;
      issues.push('發件人無電子郵件地址');
      return { deductions, issues };
    }

    const domain = senderEmail.split('@')[1] || '';

    // Check suspicious patterns in email
    if (/\d{4,}/.test(senderEmail.split('@')[0])) {
      deductions += 10;
      issues.push('發件人郵件地址含大量數字');
    }

    // Check suspicious TLD
    for (const tld of SUSPICIOUS_TLDS) {
      if (domain.endsWith(tld)) {
        deductions += 15;
        issues.push(`可疑網域後綴: ${tld}`);
        break;
      }
    }

    // Random-looking local part (many mixed chars)
    if (/^[a-z0-9]{12,}$/.test(senderEmail.split('@')[0])) {
      deductions += 5;
      issues.push('發件人地址看起來像自動生成');
    }

    return { deductions, issues };
  }

  function analyzeContent(subject, body) {
    let deductions = 0;
    const issues = [];
    const fullText = `${subject} ${body}`.toLowerCase();

    let phishingHits = 0;
    for (const kw of PHISHING_KEYWORDS) {
      if (fullText.includes(kw.toLowerCase())) {
        phishingHits++;
      }
    }

    if (phishingHits > 0) {
      const penalty = Math.min(phishingHits * 10, 30);
      deductions += penalty;
      issues.push(`內容含 ${phishingHits} 個可疑關鍵字`);
    }

    // Check ALL CAPS ratio
    const words = subject.split(/\s+/).filter(w => w.length > 2);
    if (words.length > 0) {
      const capsWords = words.filter(w => w === w.toUpperCase() && /[A-Z]/.test(w));
      if (capsWords.length / words.length > 0.3) {
        deductions += 10;
        issues.push('主旨含大量全大寫文字');
      }
    }

    return { deductions, issues };
  }

  function analyzeLinks(links) {
    let deductions = 0;
    const issues = [];
    const linkResults = [];

    let httpCount = 0;
    let suspiciousCount = 0;

    for (const link of links) {
      let isSuspicious = false;
      const reasons = [];

      try {
        const url = new URL(link);

        // HTTP check
        if (url.protocol === 'http:') {
          httpCount++;
          reasons.push('使用不安全的 HTTP');
        }

        // IP address domain
        if (/^\d+\.\d+\.\d+\.\d+$/.test(url.hostname)) {
          isSuspicious = true;
          reasons.push('使用 IP 位址而非網域名稱');
        }

        // Very long domain
        if (url.hostname.length > 50) {
          isSuspicious = true;
          reasons.push('網域名稱異常長');
        }

        // Multiple hyphens
        if ((url.hostname.match(/-/g) || []).length > 2) {
          isSuspicious = true;
          reasons.push('網域包含多個連字符');
        }

        // Suspicious TLD
        for (const tld of SUSPICIOUS_TLDS) {
          if (url.hostname.endsWith(tld)) {
            isSuspicious = true;
            reasons.push(`可疑網域後綴: ${tld}`);
            break;
          }
        }

      } catch (e) {
        isSuspicious = true;
        reasons.push('無效的 URL 格式');
      }

      if (reasons.length > 0 || isSuspicious) {
        suspiciousCount++;
      }

      linkResults.push({ url: link, isSuspicious: isSuspicious || reasons.length > 0, reason: reasons.join(', ') });
    }

    if (httpCount > 0) {
      deductions += Math.min(httpCount * 5, 15);
      issues.push(`${httpCount} 個連結使用不安全的 HTTP`);
    }

    if (suspiciousCount > 0) {
      deductions += Math.min(suspiciousCount * 15, 30);
      issues.push(`${suspiciousCount} 個可疑連結`);
    }

    return { deductions, issues, linkResults };
  }

  function extractTags(text, categories) {
    const lowerText = text.toLowerCase();
    const foundKeywords = [];

    for (const cat of categories) {
      for (const kw of cat.keywords) {
        if (lowerText.includes(kw.toLowerCase()) && !foundKeywords.includes(kw)) {
          foundKeywords.push(kw);
        }
      }
    }

    return foundKeywords.slice(0, 5);
  }

  function analyzeEmailDetail(emailData, categories) {
    const { subject = '', sender = '', senderEmail = '', body = '', links = [] } = emailData;

    const category = categorizeByKeywords(
      `${subject} ${sender} ${senderEmail} ${body.slice(0, 500)}`,
      categories,
      []
    );

    let safetyScore = 100;
    const allIssues = [];

    const senderAnalysis = analyzeSender(sender, senderEmail);
    safetyScore -= senderAnalysis.deductions;
    allIssues.push(...senderAnalysis.issues);

    const contentAnalysis = analyzeContent(subject, body);
    safetyScore -= contentAnalysis.deductions;
    allIssues.push(...contentAnalysis.issues);

    const linkAnalysis = analyzeLinks(links);
    safetyScore -= linkAnalysis.deductions;
    allIssues.push(...linkAnalysis.issues);

    safetyScore = Math.max(0, Math.min(100, safetyScore));

    let safetyLevel, safetyColor;
    if (safetyScore >= 80) {
      safetyLevel = 'safe';
      safetyColor = '#1a7f37';
    } else if (safetyScore >= 50) {
      safetyLevel = 'caution';
      safetyColor = '#9a6700';
    } else {
      safetyLevel = 'danger';
      safetyColor = '#cf222e';
    }

    const tags = extractTags(`${subject} ${body.slice(0, 200)}`, categories);

    return {
      category,
      tags,
      safetyScore,
      safetyLevel,
      safetyColor,
      issues: allIssues,
      linkResults: linkAnalysis.linkResults
    };
  }

  return { categorizeByKeywords, analyzeEmailList, analyzeEmailDetail };
})();

window.EmailAnalyzer = EmailAnalyzer;
