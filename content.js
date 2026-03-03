(async function() {
  'use strict';

  // Guard against double injection
  if (window.__aegisInitialized) return;
  window.__aegisInitialized = true;

  // Initialize platform
  const platform = new GmailPlatform();
  if (!platform.isMatchingPage(window.location.href)) return;

  const analysisPanel = new AnalysisPanel(platform);
  const emailPopup = new EmailPopup();

  let settings = null;

  // Load settings from background
  async function getSettings() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, (response) => {
        resolve(response || {});
      });
    });
  }

  // Analyze email list and show panel
  async function runAnalysis() {
    try {
      settings = await getSettings();
      const emails = platform.getUnreadEmails();
      const labels = platform.getLabels();

      const groups = EmailAnalyzer.analyzeEmailList(
        emails,
        labels.map(l => l.name),
        settings.categories || []
      );

      analysisPanel.show(groups, labels);
    } catch (err) {
      console.error('[Aegis] Analysis error:', err);
    }
  }

  // Analyze open email and show popup
  async function analyzeOpenEmail() {
    try {
      const emailData = platform.getEmailDetail();
      if (!emailData || !emailData.subject) return;

      settings = settings || await getSettings();

      let analysis;

      if (settings.analysisMode === 'ai' && settings.aiSettings && settings.aiSettings.apiKey) {
        try {
          const aiResult = await new Promise((resolve) => {
            chrome.runtime.sendMessage({ type: 'AI_ANALYZE', emailData }, (response) => {
              resolve(response || {});
            });
          });

          if (aiResult && !aiResult.error) {
            const localAnalysis = EmailAnalyzer.analyzeEmailDetail(emailData, settings.categories || []);
            analysis = {
              ...localAnalysis,
              category: aiResult.category ? { name: aiResult.category, emoji: '🤖', color: '#4285f4', bgColor: '#e8f0fe' } : localAnalysis.category,
              tags: aiResult.tags || localAnalysis.tags,
              safetyScore: typeof aiResult.safetyScore === 'number' ? aiResult.safetyScore : localAnalysis.safetyScore,
              issues: [...(aiResult.issues || []), ...localAnalysis.issues].slice(0, 5)
            };
            // Recalculate safety level/color based on merged score
            if (analysis.safetyScore >= 80) {
              analysis.safetyLevel = 'safe';
              analysis.safetyColor = '#1a7f37';
            } else if (analysis.safetyScore >= 50) {
              analysis.safetyLevel = 'caution';
              analysis.safetyColor = '#9a6700';
            } else {
              analysis.safetyLevel = 'danger';
              analysis.safetyColor = '#cf222e';
            }
          } else {
            analysis = EmailAnalyzer.analyzeEmailDetail(emailData, settings.categories || []);
          }
        } catch (e) {
          analysis = EmailAnalyzer.analyzeEmailDetail(emailData, settings.categories || []);
        }
      } else {
        analysis = EmailAnalyzer.analyzeEmailDetail(emailData, settings.categories || []);
      }

      emailPopup.show(analysis);
    } catch (err) {
      console.error('[Aegis] Email analysis error:', err);
    }
  }

  // Detect if viewing an email detail (Gmail URL has hash with message ID)
  function isEmailDetailView() {
    const hash = window.location.hash;
    // Gmail email detail: #inbox/FMfcgz..., #sent/FMfcgz..., #search/query/FMfcgz...
    return /^#[^/]+\/[A-Za-z0-9]{10,}/.test(hash);
  }

  // Handle navigation changes
  let lastHash = window.location.hash;
  let emailAnalysisTimeout = null;

  platform.observeNavigate(() => {
    const currentHash = window.location.hash;
    if (currentHash === lastHash) return;
    lastHash = currentHash;

    clearTimeout(emailAnalysisTimeout);
    emailAnalysisTimeout = setTimeout(() => {
      if (isEmailDetailView()) {
        emailPopup.hide && emailPopup.hide();
        analyzeOpenEmail();
      } else {
        emailPopup.hide && emailPopup.hide();
      }
    }, 800);
  });

  // Listen for messages from popup
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'PING') {
      sendResponse({ status: 'alive' });
    } else if (message.type === 'ANALYZE') {
      runAnalysis();
      sendResponse({ status: 'ok' });
    }
    return true;
  });

  // Check initial state on load
  if (isEmailDetailView()) {
    setTimeout(analyzeOpenEmail, 1200);
  }

})();
