// Ping content script; if no response, inject all scripts then wait for them to settle.
async function ensureContentScript(tab) {
  const alive = await chrome.tabs.sendMessage(tab.id, { type: 'PING' }).catch(() => null);
  if (alive) return;

  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: [
      'src/analytics/tracker.js',
      'src/analysis/whitelist-manager.js',
      'src/analysis/email-analyzer.js',
      'src/analysis/ai-analyzer.js',
      'src/platforms/base-platform.js',
      'src/platforms/gmail-platform.js',
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
  const statusIndicator = document.getElementById('statusIndicator');
  const statusText = document.getElementById('statusText');
  const modeBadge = document.getElementById('modeBadge');

  // Check if current tab is Gmail
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const isGmail = tab && tab.url && tab.url.includes('mail.google.com');

  if (isGmail) {
    statusIndicator.className = 'status-indicator active';
    statusText.textContent = 'Gmail 已偵測';
    analyzeBtn.disabled = false;
  } else {
    statusIndicator.className = 'status-indicator inactive';
    statusText.textContent = '請前往 Gmail';
    analyzeBtn.disabled = true;
  }

  // Show current mode
  chrome.storage.sync.get(['analysisMode'], (result) => {
    if (result.analysisMode === 'ai') {
      modeBadge.textContent = 'AI 模式';
      modeBadge.className = 'mode-badge ai-mode';
    } else {
      modeBadge.textContent = '本地模式';
      modeBadge.className = 'mode-badge';
    }
  });

  analyzeBtn.addEventListener('click', async () => {
    analyzeBtn.disabled = true;
    analyzeBtn.textContent = '⏳ 分類中...';

    try {
      await ensureContentScript(tab);
      await chrome.tabs.sendMessage(tab.id, { type: 'ANALYZE' });
      // Instantly close the popup to let the user see the in-page analysis panel
      window.close();
    } catch (e) {
      console.error('[Aegis] Failed to send analyze message:', e);
      analyzeBtn.disabled = false;
      analyzeBtn.textContent = '📊 分類郵件';
      statusText.textContent = '注入失敗，請重新整理 Gmail';
    }
  });

  settingsBtn.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
    window.close();
  });
});
