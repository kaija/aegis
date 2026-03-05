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

  // Check if domain is public email service
  function _isPublicEmailDomain(domain, whitelist) {
    if (!whitelist || !whitelist.publicEmailDomains || !domain) return false;
    const baseDomain = _extractBaseDomain(domain.toLowerCase());
    return whitelist.publicEmailDomains.some(d => {
      const publicBase = _extractBaseDomain(d.toLowerCase());
      return baseDomain === publicBase;
    });
  }

  // Check if domain is suspicious (temp mail, etc.)
  function _isSuspiciousDomain(domain, whitelist) {
    if (!whitelist || !whitelist.suspiciousDomains || !domain) return false;
    const baseDomain = _extractBaseDomain(domain.toLowerCase());
    return whitelist.suspiciousDomains.some(d => {
      const suspiciousBase = _extractBaseDomain(d.toLowerCase());
      return baseDomain === suspiciousBase;
    });
  }

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

  function analyzeSender(sender, senderEmail, whitelist) {
    D.group('寄件人分析');
    D.log('寄件人名稱:', sender || '(無)', '| 郵件:', senderEmail || '(無)');

    let deductions = 0;
    const issues = [];
    const checks = [];
    const flags = [];

    if (!senderEmail) {
      deductions += 20;
      issues.push('發件人無電子郵件地址');
      checks.push({ 規則: '有效郵件地址', 結果: '✗ 缺失', 扣分: -20 });
      D.table(checks);
      D.log('總扣分:', -deductions);
      D.groupEnd();
      return { deductions, issues, flags };
    }

    const localPart = senderEmail.split('@')[0] || '';
    const domain = senderEmail.split('@')[1] || '';
    D.log('本地部分:', localPart, '| 網域:', domain);

    // Check for suspicious domain (temp mail services)
    if (_isSuspiciousDomain(domain, whitelist)) {
      deductions += 30;
      issues.push('使用臨時/拋棄式郵件服務');
      flags.push('suspicious_domain');
      checks.push({ 規則: '可疑域名（臨時郵件）', 結果: `✗ 命中: "${domain}"`, 扣分: -30 });
      D.warn('⚠ 檢測到臨時郵件服務域名');
    } else {
      checks.push({ 規則: '可疑域名（臨時郵件）', 結果: '✓ 正常', 扣分: 0 });
    }

    // Check for public email domain
    const isPublicEmail = _isPublicEmailDomain(domain, whitelist);
    if (isPublicEmail) {
      flags.push('public_email');
      checks.push({ 規則: '公開個人郵件服務', 結果: `ℹ 個人郵件: "${domain}"`, 扣分: 0 });
      D.log('ℹ 使用公開個人郵件服務（Gmail/Yahoo等）');
    } else {
      checks.push({ 規則: '公開個人郵件服務', 結果: '— 企業/組織郵件', 扣分: 0 });
    }

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
    if (flags.length > 0) D.log('標記:', flags.join(', '));
    D.groupEnd();
    return { deductions, issues, flags };
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

    D.log('總扣分:', -deductions);
    D.groupEnd();
    return { deductions, issues, hitKeywords };
  }

  // Find services by matching keywords in email content
  function _findServicesByKeywords(emailContent, whitelist) {
    if (!whitelist || !whitelist.services || !emailContent) return [];
    const lowerContent = emailContent.toLowerCase();
    return whitelist.services.filter(s =>
      s.keywords && s.keywords.some(kw => lowerContent.includes(kw.toLowerCase()))
    );
  }

  // Extract base domain (TLD + 1 level)
  function _extractBaseDomain(hostname) {
    if (!hostname) return '';
    const parts = hostname.toLowerCase().split('.');
    if (parts.length < 2) return hostname.toLowerCase();
    // Handle special TLDs like .co.jp, .com.tw
    if (parts.length >= 3 && parts[parts.length - 2].length <= 3 &&
        ['co', 'com', 'net', 'org', 'gov', 'edu', 'ac'].includes(parts[parts.length - 2])) {
      return parts.slice(-3).join('.');
    }
    return parts.slice(-2).join('.');
  }

  // Find the whitelist service entry matching a sender email domain
  function _findWhitelistService(senderEmail, whitelist) {
    if (!whitelist || !whitelist.services || !senderEmail) return null;
    const domain = (senderEmail.split('@')[1] || '').toLowerCase();
    if (!domain) return null;
    const baseDomain = _extractBaseDomain(domain);

    return whitelist.services.find(s =>
      s.senderDomains.some(d => {
        const sd = d.toLowerCase();
        const senderBase = _extractBaseDomain(sd);
        return baseDomain === senderBase || domain === sd || domain.endsWith('.' + sd);
      })
    ) || null;
  }

  // Check if a hostname belongs to a service's base domains
  function _domainInService(hostname, service) {
    if (!hostname || !service) return false;
    const baseDomain = _extractBaseDomain(hostname);

    // Check against service's baseDomains
    if (service.baseDomains) {
      const match = service.baseDomains.some(bd => {
        const serviceBase = _extractBaseDomain(bd.toLowerCase());
        return baseDomain === serviceBase;
      });
      if (match) return true;
    }

    // Fallback to serviceDomains for backward compatibility
    const h = hostname.toLowerCase();
    return service.serviceDomains.some(sd => {
      const s = sd.toLowerCase();
      const serviceBase = _extractBaseDomain(s);
      return baseDomain === serviceBase || h === s || h.endsWith('.' + s);
    });
  }

  function analyzeLinks(links, senderEmail, whitelist, emailContent = '') {
    D.group('連結分析');
    D.log('連結數量:', links.length);

    let deductions = 0;
    const issues = [];
    const linkResults = [];

    let httpCount = 0;
    let suspiciousCount = 0;
    let whitelistedCount = 0;
    let offWhitelistCount = 0;

    // First, try to match service by sender domain
    let matchedService = _findWhitelistService(senderEmail, whitelist);

    // If no match by sender, try to match by keywords in email content
    let keywordMatchedServices = [];
    if (!matchedService && emailContent) {
      keywordMatchedServices = _findServicesByKeywords(emailContent, whitelist);
      if (keywordMatchedServices.length > 0) {
        D.log('關鍵字匹配到服務:', keywordMatchedServices.map(s => s.name).join(', '));
      }
    }

    if (whitelist) {
      if (matchedService) {
        D.log('白名單狀態:', `✓ 寄件人網域匹配服務「${matchedService.name}」`);
      } else if (keywordMatchedServices.length > 0) {
        D.log('白名單狀態:', `⚠ 內容關鍵字匹配服務: ${keywordMatchedServices.map(s => s.name).join(', ')}（但寄件人網域不符）`);
      } else {
        D.log('白名單狀態:', '— 無匹配服務（無白名單加成/懲罰）');
      }
    } else {
      D.log('白名單: 未載入');
    }

    const linkDebugRows = [];

    for (const link of links) {
      let isSuspicious = false;
      let isWhitelisted = false;
      let isOffWhitelist = false;
      let isPotentialSpoof = false;
      const reasons = [];
      let linkHostname = '';
      const row = { URL: link.slice(0, 60) + (link.length > 60 ? '…' : ''), 主機: '', 白名單: '', HTTP: '', 結構: '', 結果: '' };

      try {
        const url = new URL(link);
        linkHostname = url.hostname.toLowerCase();
        const linkBaseDomain = _extractBaseDomain(linkHostname);
        row.主機 = linkHostname;

        if (url.protocol === 'http:') {
          httpCount++;
          reasons.push('使用不安全的 HTTP');
          row.HTTP = '✗ 不安全';
        } else {
          row.HTTP = '✓';
        }

        // Check against sender-matched service
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
        }
        // Check against keyword-matched services (potential spoofing)
        else if (keywordMatchedServices.length > 0) {
          let matchedByKeyword = false;
          for (const kwService of keywordMatchedServices) {
            if (_domainInService(linkHostname, kwService)) {
              // Link domain matches keyword-detected service, but sender doesn't
              isPotentialSpoof = true;
              suspiciousCount++;
              reasons.push(`連結指向 ${kwService.name}，但寄件人網域不符（疑似偽冒）`);
              row.白名單 = `⚠ 偽冒 ${kwService.name}?`;
              matchedByKeyword = true;
              break;
            }
          }
          if (!matchedByKeyword) {
            row.白名單 = '— 關鍵字不符';
          }
        } else {
          row.白名單 = '—';
        }

        if (!isWhitelisted && !isPotentialSpoof) {
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

      if (isSuspicious || isOffWhitelist || isPotentialSpoof || reasons.length > 0) suspiciousCount++;

      row.結果 = isWhitelisted ? '✓ 白名單' : isPotentialSpoof ? '✗ 疑似偽冒' : (isSuspicious || isOffWhitelist) ? '✗ 可疑' : '✓ 正常';
      linkDebugRows.push(row);

      linkResults.push({
        url: link,
        isSuspicious: (isSuspicious || isOffWhitelist || isPotentialSpoof) && !isWhitelisted,
        isWhitelisted,
        isOffWhitelist,
        isPotentialSpoof,
        whitelistService: matchedService ? matchedService.name : null,
        reason: reasons.join(', ')
      });
    }

    if (links.length > 0) D.table(linkDebugRows);

    let httpDeduction = 0, suspiciousDeduction = 0, spoofDeduction = 0;
    if (httpCount > 0) {
      httpDeduction = Math.min(httpCount * 5, 15);
      deductions += httpDeduction;
      issues.push(`${httpCount} 個連結使用不安全的 HTTP`);
    }

    // Higher penalty for potential spoofing
    const spoofCount = linkResults.filter(r => r.isPotentialSpoof).length;
    if (spoofCount > 0) {
      spoofDeduction = Math.min(spoofCount * 25, 40);
      deductions += spoofDeduction;
      issues.push(`${spoofCount} 個連結疑似偽冒知名服務（內容提及服務但寄件人與連結網域不符）`);
    }

    if (matchedService && offWhitelistCount > 0) {
      suspiciousDeduction = Math.min(offWhitelistCount * 15, 30);
      deductions += suspiciousDeduction;
      issues.push(`${offWhitelistCount} 個連結網域不屬於 ${matchedService.name}（疑似偽冒）`);
    } else if (suspiciousCount > 0 && spoofCount === 0) {
      suspiciousDeduction = Math.min(suspiciousCount * 15, 30);
      deductions += suspiciousDeduction;
      issues.push(`${suspiciousCount} 個可疑連結`);
    }

    if (whitelistedCount > 0 && offWhitelistCount === 0 && spoofCount === 0) {
      issues.push(`${whitelistedCount} 個連結已通過 ${matchedService.name} 白名單驗證`);
    }

    D.log(`扣分明細 — HTTP: -${httpDeduction}  偽冒: -${spoofDeduction}  可疑: -${suspiciousDeduction}  總計: -${deductions}`);
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

    const emailContent = `${subject} ${body}`;
    const category = categorizeByKeywords(
      `${subject} ${sender} ${senderEmail} ${body.slice(0, 500)}`,
      categories,
      []
    );

    let safetyScore = 100;
    const allIssues = [];
    const allFlags = [];

    const senderAnalysis = analyzeSender(sender, senderEmail, whitelist);
    safetyScore -= senderAnalysis.deductions;
    allIssues.push(...senderAnalysis.issues);
    if (senderAnalysis.flags) allFlags.push(...senderAnalysis.flags);

    const contentAnalysis = analyzeContent(subject, body);
    safetyScore -= contentAnalysis.deductions;
    allIssues.push(...contentAnalysis.issues);

    const linkAnalysis = analyzeLinks(links, senderEmail, whitelist, emailContent);
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
    if (allFlags.length) {
      D.log('特殊標記:', allFlags.join(', '));
    }
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
      flags: allFlags,
      linkResults: linkAnalysis.linkResults,
      suspiciousKeywords: contentAnalysis.hitKeywords || []
    };
  }

  return { categorizeByKeywords, analyzeEmailList, analyzeEmailDetail };
})();

window.EmailAnalyzer = EmailAnalyzer;
