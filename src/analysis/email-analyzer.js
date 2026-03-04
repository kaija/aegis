'use strict';

const EmailAnalyzer = (() => {

  // ── Debug helpers ──────────────────────────────────────────────────────────
  const D = {
    active: () => typeof window !== 'undefined' && !!window.__aegisDebug,
    log: (...a) => { if (D.active()) console.log('%c[Aegis]', 'color:#4285f4;font-weight:bold', ...a); },
    group: (label) => { if (D.active()) console.group('%c[Aegis Debug] ' + label, 'color:#4285f4;font-weight:bold'); },
    groupEnd: () => { if (D.active()) console.groupEnd(); },
    table: (data) => { if (D.active()) console.table(data); },
    warn: (...a) => { if (D.active()) console.warn('%c[Aegis]', 'color:#9a6700;font-weight:bold', ...a); }
  };
  // ──────────────────────────────────────────────────────────────────────────

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
    D.group('寄件人分析');
    D.log('寄件人名稱:', sender || '(無)', '| 郵件:', senderEmail || '(無)');

    let deductions = 0;
    const issues = [];
    const checks = [];

    if (!senderEmail) {
      deductions += 20;
      issues.push('發件人無電子郵件地址');
      checks.push({ 規則: '有效郵件地址', 結果: '✗ 缺失', 扣分: -20 });
      D.table(checks);
      D.log('總扣分:', -deductions);
      D.groupEnd();
      return { deductions, issues };
    }

    const localPart = senderEmail.split('@')[0] || '';
    const domain = senderEmail.split('@')[1] || '';
    D.log('本地部分:', localPart, '| 網域:', domain);

    if (/\d{4,}/.test(localPart)) {
      deductions += 10;
      issues.push('發件人郵件地址含大量數字');
      checks.push({ 規則: '本地部分含大量數字 (≥4)', 結果: `✗ 命中: "${localPart}"`, 扣分: -10 });
    } else {
      checks.push({ 規則: '本地部分含大量數字 (≥4)', 結果: '✓ 正常', 扣分: 0 });
    }

    let tldHit = false;
    for (const tld of SUSPICIOUS_TLDS) {
      if (domain.endsWith(tld)) {
        deductions += 15;
        issues.push(`可疑網域後綴: ${tld}`);
        checks.push({ 規則: '可疑 TLD', 結果: `✗ ${tld}`, 扣分: -15 });
        tldHit = true;
        break;
      }
    }
    if (!tldHit) checks.push({ 規則: '可疑 TLD', 結果: '✓ 正常', 扣分: 0 });

    if (/^[a-z0-9]{12,}$/.test(localPart)) {
      deductions += 5;
      issues.push('發件人地址看起來像自動生成');
      checks.push({ 規則: '隨機自動生成 (≥12位英數)', 結果: `✗ 命中: "${localPart}"`, 扣分: -5 });
    } else {
      checks.push({ 規則: '隨機自動生成 (≥12位英數)', 結果: '✓ 正常', 扣分: 0 });
    }

    D.table(checks);
    D.log('總扣分:', -deductions);
    D.groupEnd();
    return { deductions, issues };
  }

  function analyzeContent(subject, body) {
    D.group('內容分析');
    D.log('主旨:', subject || '(空)');
    D.log('內文長度:', body ? body.length : 0, '字元');

    let deductions = 0;
    const issues = [];
    const fullText = `${subject} ${body}`.toLowerCase();

    const hitKeywords = [];
    for (const kw of PHISHING_KEYWORDS) {
      if (fullText.includes(kw.toLowerCase())) hitKeywords.push(kw);
    }

    const phishingHits = hitKeywords.length;
    if (phishingHits > 0) {
      const penalty = Math.min(phishingHits * 10, 30);
      deductions += penalty;
      issues.push(`內容含 ${phishingHits} 個可疑關鍵字`);
      D.warn('釣魚關鍵字命中 ×' + phishingHits + ':', hitKeywords);
      D.log('關鍵字扣分:', -penalty, `(${phishingHits} × 10，上限 -30)`);
    } else {
      D.log('釣魚關鍵字: ✓ 無命中');
    }

    // Only consider tokens that contain at least one Latin letter;
    // judge caps by the Latin letters alone (ignores CJK / digits / symbols).
    const latinWords = subject.split(/\s+/).filter(w => /[a-zA-Z]/.test(w));
    if (latinWords.length > 0) {
      const capsWords = latinWords.filter(w => {
        const latin = w.match(/[a-zA-Z]/g);
        return latin.every(c => c >= 'A' && c <= 'Z');
      });
      const capsRatio = capsWords.length / latinWords.length;
      D.log(`大寫比例: ${capsWords.length}/${latinWords.length} 英文詞 = ${(capsRatio * 100).toFixed(0)}%`, capsRatio > 0.3 ? '✗ 超標 (>30%)' : '✓ 正常');
      if (capsRatio > 0.3) {
        deductions += 10;
        issues.push('主旨含大量全大寫文字');
        D.warn('全大寫扣分: -10');
      }
    }

    D.log('總扣分:', -deductions);
    D.groupEnd();
    return { deductions, issues };
  }

  // Find the whitelist service entry matching a sender email domain
  function _findWhitelistService(senderEmail, whitelist) {
    if (!whitelist || !whitelist.services || !senderEmail) return null;
    const domain = (senderEmail.split('@')[1] || '').toLowerCase();
    if (!domain) return null;
    return whitelist.services.find(s =>
      s.senderDomains.some(d => {
        const sd = d.toLowerCase();
        return domain === sd || domain.endsWith('.' + sd);
      })
    ) || null;
  }

  // Check if a hostname belongs to a service's allowed domains
  function _domainInService(hostname, service) {
    const h = hostname.toLowerCase();
    return service.serviceDomains.some(sd => {
      const s = sd.toLowerCase();
      return h === s || h.endsWith('.' + s);
    });
  }

  function analyzeLinks(links, senderEmail, whitelist) {
    D.group('連結分析');
    D.log('連結數量:', links.length);

    let deductions = 0;
    const issues = [];
    const linkResults = [];

    let httpCount = 0;
    let suspiciousCount = 0;
    let whitelistedCount = 0;
    let offWhitelistCount = 0;

    const matchedService = _findWhitelistService(senderEmail, whitelist);
    if (whitelist) {
      D.log('白名單狀態:', matchedService
        ? `✓ 寄件人網域匹配服務「${matchedService.name}」`
        : '— 無匹配服務（無白名單加成/懲罰）');
    } else {
      D.log('白名單: 未載入');
    }

    const linkDebugRows = [];

    for (const link of links) {
      let isSuspicious = false;
      let isWhitelisted = false;
      let isOffWhitelist = false;
      const reasons = [];
      let linkHostname = '';
      const row = { URL: link.slice(0, 60) + (link.length > 60 ? '…' : ''), 主機: '', 白名單: '', HTTP: '', 結構: '', 結果: '' };

      try {
        const url = new URL(link);
        linkHostname = url.hostname.toLowerCase();
        row.主機 = linkHostname;

        if (url.protocol === 'http:') {
          httpCount++;
          reasons.push('使用不安全的 HTTP');
          row.HTTP = '✗ 不安全';
        } else {
          row.HTTP = '✓';
        }

        if (matchedService) {
          if (_domainInService(linkHostname, matchedService)) {
            isWhitelisted = true;
            whitelistedCount++;
            row.白名單 = `✓ ${matchedService.name}`;
          } else {
            isOffWhitelist = true;
            offWhitelistCount++;
            reasons.push(`非 ${matchedService.name} 官方網域`);
            row.白名單 = `✗ 非 ${matchedService.name} 網域`;
          }
        } else {
          row.白名單 = '—';
        }

        if (!isWhitelisted) {
          const structIssues = [];
          if (/^\d+\.\d+\.\d+\.\d+$/.test(url.hostname)) {
            isSuspicious = true;
            reasons.push('使用 IP 位址而非網域名稱');
            structIssues.push('IP位址');
          }
          for (const tld of SUSPICIOUS_TLDS) {
            if (url.hostname.endsWith(tld)) {
              isSuspicious = true;
              reasons.push(`可疑網域後綴: ${tld}`);
              structIssues.push(`可疑TLD(${tld})`);
              break;
            }
          }
          row.結構 = structIssues.length ? '✗ ' + structIssues.join(', ') : '✓';
        } else {
          row.結構 = '(略過)';
        }

      } catch (e) {
        isSuspicious = true;
        reasons.push('無效的 URL 格式');
        row.主機 = '(解析失敗)';
        row.結構 = '✗ 無效URL';
      }

      if (isSuspicious || isOffWhitelist || reasons.length > 0) suspiciousCount++;

      row.結果 = isWhitelisted ? '✓ 白名單' : (isSuspicious || isOffWhitelist) ? '✗ 可疑' : '✓ 正常';
      linkDebugRows.push(row);

      linkResults.push({
        url: link,
        isSuspicious: (isSuspicious || isOffWhitelist) && !isWhitelisted,
        isWhitelisted,
        isOffWhitelist,
        whitelistService: matchedService ? matchedService.name : null,
        reason: reasons.join(', ')
      });
    }

    if (links.length > 0) D.table(linkDebugRows);

    let httpDeduction = 0, suspiciousDeduction = 0;
    if (httpCount > 0) {
      httpDeduction = Math.min(httpCount * 5, 15);
      deductions += httpDeduction;
      issues.push(`${httpCount} 個連結使用不安全的 HTTP`);
    }

    if (matchedService && offWhitelistCount > 0) {
      suspiciousDeduction = Math.min(offWhitelistCount * 15, 30);
      deductions += suspiciousDeduction;
      issues.push(`${offWhitelistCount} 個連結網域不屬於 ${matchedService.name}（疑似偽冒）`);
    } else if (suspiciousCount > 0) {
      suspiciousDeduction = Math.min(suspiciousCount * 15, 30);
      deductions += suspiciousDeduction;
      issues.push(`${suspiciousCount} 個可疑連結`);
    }

    if (whitelistedCount > 0 && offWhitelistCount === 0) {
      issues.push(`${whitelistedCount} 個連結已通過 ${matchedService.name} 白名單驗證`);
    }

    D.log(`扣分明細 — HTTP: -${httpDeduction}  可疑/偽冒: -${suspiciousDeduction}  總計: -${deductions}`);
    D.groupEnd();
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

  function analyzeEmailDetail(emailData, categories, whitelist) {
    const { subject = '', sender = '', senderEmail = '', body = '', links = [] } = emailData;

    D.group(`══ Aegis 郵件分析 ══  「${subject.slice(0, 50)}${subject.length > 50 ? '…' : ''}」`);
    D.log('寄件人:', `${sender} <${senderEmail}>`);
    D.log('內文長度:', body.length, '字元 | 連結數:', links.length);

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

    const linkAnalysis = analyzeLinks(links, senderEmail, whitelist);
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

    D.group('─ 最終結果');
    D.log(
      '分數計算: 100',
      senderAnalysis.deductions  ? `- ${senderAnalysis.deductions}(寄件人)`  : '',
      contentAnalysis.deductions ? `- ${contentAnalysis.deductions}(內容)`   : '',
      linkAnalysis.deductions    ? `- ${linkAnalysis.deductions}(連結)`      : '',
      `= ${safetyScore}`
    );
    D.log('安全等級:', safetyLevel === 'safe' ? '✓ 安全' : safetyLevel === 'caution' ? '⚠ 注意' : '✗ 危險', `(${safetyScore}分)`);
    D.log('分類:', `${category.emoji} ${category.name}`);
    D.log('標籤:', tags.length ? tags.join(', ') : '(無)');
    if (allIssues.length) {
      D.warn('問題清單:', allIssues);
    } else {
      D.log('問題清單: (無)');
    }
    D.groupEnd();
    D.groupEnd();

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
