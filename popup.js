// Client-side color palette for suggestion chip styling (index-based rotation)
const CHIP_COLORS = [
  { color: '#1565c0', bg: '#e3f2fd' },
  { color: '#2e7d32', bg: '#e8f5e9' },
  { color: '#e65100', bg: '#fff3e0' },
  { color: '#6a1b9a', bg: '#f3e5f5' },
  { color: '#c62828', bg: '#ffebee' },
];

// Render suggestion chips into the container
function renderSuggestionChips(suggestions, container, tab) {
  container.innerHTML = '';
  suggestions.forEach((name, index) => {
    const chip = document.createElement('button');
    chip.className = 'suggestion-chip';
    chip.textContent = name;
    chip.dataset.index = index;

    // Apply color palette rotation
    const palette = CHIP_COLORS[index % CHIP_COLORS.length];
    chip.style.color = palette.color;
    chip.style.backgroundColor = palette.bg;

    chip.addEventListener('click', async () => {
      chip.disabled = true;
      try {
        const response = await chrome.tabs.sendMessage(tab.id, { type: 'CREATE_SUGGESTED_LABEL', name });
        if (response && response.success) {
          chip.classList.add('suggestion-chip-created');
          chip.innerHTML = `✓ ${name}`;
        } else {
          chip.disabled = false;
        }
      } catch (e) {
        console.error('[Aegis] Failed to create suggested label:', e);
        chip.disabled = false;
      }
    });
    container.appendChild(chip);
  });
}

// Visibility gate: show suggestion button only when on email platform with AI capabilities
function shouldShowSuggestionButton(isEmailPlatform, analysisMode, aiSettings) {
  if (!isEmailPlatform) return false;
  if (analysisMode === 'nano') return true;
  if (analysisMode === 'ai' && aiSettings && aiSettings.apiKey) return true;
  return false;
}

// Ping content script; if no response, inject all scripts then wait for them to settle.
async function ensureContentScript(tab) {
  const alive = await chrome.tabs.sendMessage(tab.id, { type: 'PING' }).catch(() => null);
  if (alive) return;

  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: [
      'src/utils/i18n.js',
      'src/analytics/tracker.js',
      'src/analysis/whitelist-manager.js',
      'src/analysis/email-analyzer.js',
      'src/analysis/ai-analyzer.js',
      'src/analysis/nano-analyzer.js',
      'src/analysis/label-suggester.js',
      'src/platforms/base-platform.js',
      'src/platforms/gmail-platform.js',
      'src/platforms/outlook-platform.js',
      'src/ui/analysis-panel.js',
      'src/ui/email-popup.js',
      'content.js',
    ],
  });
  await chrome.scripting.insertCSS({
    target: { tabId: tab.id },
    files: ['styles/content.css'],
  });
  // Give injected scripts a moment to initialise
  await new Promise(r => setTimeout(r, 300));
}

document.addEventListener('DOMContentLoaded', async () => {
  // Apply i18n translations to static HTML elements
  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    el.title = t(el.dataset.i18nTitle);
  });

  const analyzeBtn = document.getElementById('analyzeBtn');
  const settingsBtn = document.getElementById('settingsBtn');
  const platformStatus = document.getElementById('platformStatus');
  const modeBadge = document.getElementById('modeBadge');
  const modeDot = document.getElementById('modeDot');
  const versionText = document.getElementById('versionText');
  const statsClassified = document.getElementById('statsClassified');
  const statsScanned = document.getElementById('statsScanned');

  // Set version
  const manifest = chrome.runtime.getManifest();
  if (versionText) {
    versionText.textContent = `v${manifest.version}`;
  }

  // Load stats from local storage (if any)
  try {
    const localData = await new Promise(r => chrome.storage.local.get(['aegis_stats'], r));
    const stats = localData.aegis_stats || { classified: 0, scanned: 0 };
    if (statsClassified) statsClassified.textContent = stats.classified;
    if (statsScanned) statsScanned.textContent = stats.scanned;
  } catch (e) {
    console.error('Failed to load stats', e);
  }

  // Check if current tab is Gmail or Outlook
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = tab && tab.url ? tab.url : '';
  const isGmail = url.includes('mail.google.com');
  const isOutlook = url.includes('outlook.live.com') || url.includes('outlook.office.com') || url.includes('outlook.office365.com');
  const isEmailPlatform = isGmail || isOutlook;

  const emailPanel = document.getElementById('emailAnalysisPanel');
  const domainPanel = document.getElementById('domainSecurityPanel');

  if (isEmailPlatform) {
    emailPanel.style.display = '';
    domainPanel.style.display = 'none';

    if (isGmail) {
      platformStatus.textContent = t('popupPlatformGmail');
      platformStatus.style.color = 'var(--primary)';
      analyzeBtn.disabled = false;
    } else {
      platformStatus.textContent = t('popupPlatformOutlook');
      platformStatus.style.color = '#0078d4';
      analyzeBtn.disabled = false;
    }
  } else {
    emailPanel.style.display = 'none';
    domainPanel.style.display = '';
    showDomainSecurityInfo(tab, url);
  }

  // Show current mode and apply suggestion button visibility gate
  chrome.storage.sync.get(['analysisMode', 'aiSettings'], (result) => {
    if (result.analysisMode === 'ai') {
      modeBadge.textContent = t('popupModeAi');
      modeDot.className = 'status-dot';
      modeDot.style.background = 'var(--green)';
    } else if (result.analysisMode === 'nano') {
      modeBadge.textContent = t('popupModeNano');
      modeDot.className = 'status-dot';
      modeDot.style.background = 'var(--green)';
    } else {
      modeBadge.textContent = t('popupModeLocal');
      modeDot.className = 'status-dot inactive';
      modeDot.style.background = 'var(--text-muted)';
    }

    // Show/hide suggestion button based on visibility gate
    const suggestBtn = document.getElementById('suggestLabelsBtn');
    if (suggestBtn && shouldShowSuggestionButton(isEmailPlatform, result.analysisMode, result.aiSettings)) {
      suggestBtn.style.display = '';
    }
  });

  analyzeBtn.addEventListener('click', async () => {
    analyzeBtn.disabled = true;
    analyzeBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="animation: aegis-spin 1s linear infinite;">
        <line x1="12" y1="2" x2="12" y2="6"></line>
        <line x1="12" y1="18" x2="12" y2="22"></line>
        <line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line>
        <line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line>
        <line x1="2" y1="12" x2="6" y2="12"></line>
        <line x1="18" y1="12" x2="22" y2="12"></line>
        <line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line>
        <line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line>
      </svg>
      <span>${t('popupClassifying')}</span>
    `;

    try {
      await ensureContentScript(tab);
      await chrome.tabs.sendMessage(tab.id, { type: 'ANALYZE' });

      // Removed fake demo stat increment, stats are now updated accurately by content.js during analysis

      // Instantly close the popup to let the user see the in-page analysis panel
      window.close();
    } catch (e) {
      console.error('[Aegis] Failed to send analyze message:', e);
      analyzeBtn.disabled = true;
      analyzeBtn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
        <span>${t('popupErrorInjecting')}</span>
      `;
    }
  });

  // Suggestion button click handler
  const suggestLabelsBtn = document.getElementById('suggestLabelsBtn');
  if (suggestLabelsBtn) {
    suggestLabelsBtn.addEventListener('click', async () => {
      const suggestionResults = document.getElementById('suggestionResults');
      const suggestionLoading = suggestionResults.querySelector('.suggestion-loading');
      const suggestionChips = document.getElementById('suggestionChips');
      const suggestionEmpty = suggestionResults.querySelector('.suggestion-empty');
      const suggestionError = suggestionResults.querySelector('.suggestion-error');

      // Disable button and show loading state
      suggestLabelsBtn.disabled = true;
      const btnSvg = suggestLabelsBtn.querySelector('svg');
      if (btnSvg) btnSvg.style.animation = 'aegis-spin 1s linear infinite';

      // Show results container with loading state
      suggestionResults.style.display = '';
      suggestionLoading.style.display = '';
      suggestionChips.style.display = 'none';
      suggestionEmpty.style.display = 'none';
      suggestionError.style.display = 'none';

      try {
        await ensureContentScript(tab);
        const response = await chrome.tabs.sendMessage(tab.id, { type: 'SUGGEST_LABELS' });

        // Hide loading
        suggestionLoading.style.display = 'none';

        if (response && response.suggestions && response.suggestions.length > 0) {
          suggestionChips.style.display = '';
          renderSuggestionChips(response.suggestions, suggestionChips, tab);
        } else if (response && response.suggestions && response.suggestions.length === 0) {
          suggestionEmpty.style.display = '';
        } else {
          suggestionError.style.display = '';
        }
      } catch (e) {
        console.error('[Aegis] Failed to get label suggestions:', e);
        suggestionLoading.style.display = 'none';
        suggestionError.style.display = '';
      }

      // Re-enable button
      suggestLabelsBtn.disabled = false;
      if (btnSvg) btnSvg.style.animation = '';
    });
  }

  settingsBtn.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
    window.close();
  });

  const analyticsBtn = document.getElementById('analyticsBtn');
  if (analyticsBtn) {
    analyticsBtn.addEventListener('click', () => {
      chrome.tabs.create({ url: chrome.runtime.getURL('url-analytics.html') });
      window.close();
    });
  }
});

async function showDomainSecurityInfo(tab, url) {
  const domainNameEl = document.getElementById('domainNameDisplay');
  const scoreValueEl = document.getElementById('domainScoreValue');
  const scoreCardEl = document.getElementById('domainScoreCard');
  const regDateEl = document.getElementById('domainRegDate');
  const domainAgeEl = document.getElementById('domainAge');
  const registrantEl = document.getElementById('domainRegistrant');
  const countryEl = document.getElementById('domainCountry');
  const serverIpEl = document.getElementById('domainServerIp');
  const riskFactorsEl = document.getElementById('domainRiskFactors');
  const riskListEl = document.getElementById('domainRiskList');
  const cacheNoteEl = document.getElementById('domainCacheNote');

  let domain;
  try {
    domain = DomainAnalyzer.extractBaseDomain(new URL(url).hostname);
  } catch {
    domainNameEl.textContent = t('domainSecInvalidUrl');
    return;
  }

  if (!domain) {
    domainNameEl.textContent = 'N/A';
    scoreValueEl.textContent = '--';
    return;
  }

  domainNameEl.textContent = domain;
  scoreValueEl.textContent = '...';

  // Try cache first
  let entry = null;
  try {
    const cachedResponse = await chrome.runtime.sendMessage({ type: 'GET_DOMAIN_CACHE', domain });
    entry = cachedResponse && cachedResponse.entry;
  } catch { /* ignore */ }

  if (!entry) {
    // Trigger full analysis
    try {
      const response = await chrome.runtime.sendMessage({ type: 'DOMAIN_ANALYZE', url, tabId: tab.id });
      entry = response && response.entry;
    } catch { /* ignore */ }
  }

  if (!entry) {
    scoreValueEl.textContent = '?';
    domainNameEl.textContent = t('domainSecAnalysisUnavailable', domain);
    return;
  }

  const COLOR_MAP = { safe: '#1a7f37', caution: '#9a6700', danger: '#cf222e' };
  const scoreColor = COLOR_MAP[entry.level] || '#5f6368';

  scoreValueEl.textContent = String(entry.score);
  scoreValueEl.style.color = scoreColor;
  scoreCardEl.style.borderColor = scoreColor;

  // Registration date and age
  if (entry.registrationDate) {
    regDateEl.textContent = DomainAnalyzer.formatDate(entry.registrationDate);
    const ageDays = DomainAnalyzer.getAgeDays(entry.registrationDate);
    domainAgeEl.textContent = ageDays !== null ? DomainAnalyzer.formatAge(ageDays) : '--';
    const ageInfo = DomainAnalyzer.scoreByAge(ageDays);
    if (ageInfo.label === 'high') {
      domainAgeEl.style.color = '#cf222e';
    } else if (ageInfo.label === 'medium') {
      domainAgeEl.style.color = '#9a6700';
    } else if (ageInfo.label === 'low') {
      domainAgeEl.style.color = '#e67e22';
    }
  } else {
    regDateEl.textContent = entry.rdapError ? t('domainSecUnavailable') : t('domainSecNotFound');
    domainAgeEl.textContent = '--';
  }

  // Registrant
  registrantEl.textContent = entry.registrant || t('domainSecUnknown');

  // Country
  if (entry.country) {
    const isHighRisk = DomainAnalyzer.HIGH_RISK_COUNTRIES.includes(entry.countryCode);
    countryEl.textContent = entry.country;
    if (isHighRisk) {
      countryEl.style.color = '#cf222e';
    }
  } else {
    countryEl.textContent = '--';
  }

  // Server IP
  serverIpEl.textContent = entry.serverIp || '--';

  // Risk factors
  if (entry.scoreDetails && entry.scoreDetails.length > 0) {
    riskFactorsEl.style.display = '';
    riskListEl.innerHTML = '';
    for (const detail of entry.scoreDetails) {
      const li = document.createElement('li');
      li.textContent = `${detail.reason} (-${detail.deduction})`;
      riskListEl.appendChild(li);
    }
  }

  // Cache note
  if (entry.cachedAt) {
    const minsAgo = Math.round((Date.now() - entry.cachedAt) / 60000);
    cacheNoteEl.textContent = minsAgo < 2 ? t('domainSecJustAnalyzed') : t('domainSecCachedAgo', minsAgo);
  }
}
