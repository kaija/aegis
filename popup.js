// Ping content script; if no response, inject all scripts then wait for them to settle.
async function ensureContentScript(tab) {
  const alive = await chrome.tabs.sendMessage(tab.id, { type: 'PING' }).catch(() => null);
  if (alive) return;

  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: [
      'src/analysis/whitelist-manager.js',
      'src/analysis/email-analyzer.js',
      'src/analysis/ai-analyzer.js',
      'src/analysis/nano-analyzer.js',
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

  if (isGmail) {
    platformStatus.textContent = 'Gmail';
    platformStatus.style.color = 'var(--primary)';
    analyzeBtn.disabled = false;
  } else if (isOutlook) {
    platformStatus.textContent = 'Outlook';
    platformStatus.style.color = '#0078d4'; // Outlook Blue
    analyzeBtn.disabled = false;
  } else {
    platformStatus.textContent = 'Not Supported';
    platformStatus.style.color = 'var(--text-muted)';
    analyzeBtn.disabled = true;
  }

  // Show current mode
  chrome.storage.sync.get(['analysisMode'], (result) => {
    if (result.analysisMode === 'ai') {
      modeBadge.textContent = 'AI-Powered';
      modeDot.className = 'status-dot';
      modeDot.style.background = 'var(--green)';
    } else if (result.analysisMode === 'nano') {
      modeBadge.textContent = 'Nano AI';
      modeDot.className = 'status-dot';
      modeDot.style.background = 'var(--green)';
    } else {
      modeBadge.textContent = 'Local Mode';
      modeDot.className = 'status-dot inactive';
      modeDot.style.background = 'var(--text-muted)';
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
      <span>CLASSIFYING...</span>
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
        <span>ERROR INJECTING</span>
      `;
    }
  });

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
