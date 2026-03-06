(async function () {
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

  // Initialize whitelist (non-blocking)
  WhitelistManager.init().catch(e => console.warn('[Aegis] WhitelistManager init:', e));

  // Resolve known short URLs via background service worker
  async function resolveShortUrls(links) {
    const resolved = [];
    for (const link of links) {
      if (WhitelistManager.isKnownShortUrl(link)) {
        const resolvedUrl = await new Promise((resolve) => {
          chrome.runtime.sendMessage({ type: 'RESOLVE_SHORT_URL', url: link }, (res) => {
            if (chrome.runtime.lastError || !res) { resolve(link); return; }
            resolve(res.resolvedUrl || link);
          });
        });
        resolved.push(resolvedUrl);
      } else {
        resolved.push(link);
      }
    }
    return resolved;
  }

  // Load settings from background
  async function getSettings() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, (response) => {
        const result = response || {};
        window.__aegisDebug = !!result.analysisDebug;
        resolve(result);
      });
    });
  }

  // Analyze email list and show panel
  // unreadOnly: true = 未讀, false = 全部
  async function runAnalysis(unreadOnly = true) {
    try {
      settings = await getSettings();
      const emails = platform.getEmails(unreadOnly);
      const labels = platform.getLabels();

      // Show temporary loading state
      analysisPanel.show(new Map(), labels, {
        filter: unreadOnly ? 'unread' : 'all',
        onFilterChange: (filter) => runAnalysis(filter === 'unread'),
        isLoading: true // Enable new loading UI
      });
      const headerStats = document.querySelector('.aegis-header-stats');
      if (headerStats) headerStats.innerHTML = '✨ <span>AI 分析中...</span>';

      // Determine categories to use
      const categories = settings.categories || [];

      console.log('[Aegis] runAnalysis mode:', settings.analysisMode, 'emails found:', emails.length);
      console.log('[Aegis] has apiKey:', !!(settings.aiSettings && settings.aiSettings.apiKey));

      const renderCurrentState = (isLoading) => {
        const groups = new Map();
        for (const email of emails) {
          // Only show emails that have a category assigned (local or AI)
          if (email.category && email.category.id) {
            if (!groups.has(email.category.id)) {
              groups.set(email.category.id, { category: email.category, emails: [] });
            }
            groups.get(email.category.id).emails.push(email);
          }
        }
        analysisPanel.show(groups, labels, {
          filter: unreadOnly ? 'unread' : 'all',
          onFilterChange: (filter) => runAnalysis(filter === 'unread'),
          isLoading: isLoading
        });
      };

      // Process emails
      if (settings.analysisMode === 'ai' && settings.aiSettings && settings.aiSettings.apiKey) {
        console.log('[Aegis] AI mode active, processing', emails.length, 'emails');

        // Fallback initial categorization for all emails
        emails.forEach(email => {
          const text = `${email.subject} ${email.sender} ${email.senderEmail}`;
          email.category = EmailAnalyzer.categorizeByKeywords(text, categories, labels.map(l => l.name));
        });

        // Split into chunks (batches of 10) and process all in parallel
        const chunkSize = 10;
        const chunks = [];
        for (let i = 0; i < emails.length; i += chunkSize) {
          chunks.push(emails.slice(i, i + chunkSize));
        }

        console.log('[Aegis] Processing', chunks.length, 'batches in parallel');

        // Process all batches in parallel
        const batchPromises = chunks.map((chunk, chunkIndex) => {
          const batchData = chunk.map((email, index) => ({
            id: chunkIndex * chunkSize + index, // Global index across all emails
            subject: email.subject,
            sender: email.sender,
            senderEmail: email.senderEmail
          }));

          return new Promise((resolve) => {
            chrome.runtime.sendMessage({
              type: 'AI_BATCH_ANALYZE',
              batchData,
              availableCategories: categories.map(c => c.name)
              }, (response) => {
                if (chrome.runtime.lastError) {
                  console.error('[Aegis] sendMessage error:', chrome.runtime.lastError);
                  resolve({ error: true, chunkIndex });
                } else {
                  resolve({ ...response, chunkIndex });
                }
              });
          });
        });

        // Wait for all batches to complete
        const results = await Promise.all(batchPromises);
        console.log('[Aegis] All AI batches completed:', results.length);

        // Apply results from all batches
        results.forEach((aiResult) => {
          if (aiResult && !aiResult.error && Array.isArray(aiResult.results)) {
            aiResult.results.forEach(res => {
              const email = emails[res.id]; // Use global index
              if (email) {
                // Try to match with user's configured settings categories first for custom colors/emojis
                const matchedCategory = categories.find(c => c.name === res.category);
                if (matchedCategory) {
                  email.category = Object.assign({}, matchedCategory);
                } else {
                  // Create a dynamic category from the Gmail label name
                  email.category = {
                    name: res.category,
                    emoji: '🏷️',
                    color: '#4285f4',
                    bgColor: '#e8f0fe',
                    id: 'ai-label-' + res.category
                  };
                }
              }
            });
          } else if (aiResult && aiResult.error) {
            console.error('[Aegis] AI Batch Error for chunk', aiResult.chunkIndex);
          }
        });

        // Final render after all chunks
        renderCurrentState(false);

      } else {
        // Local analysis only
        emails.forEach(email => {
          const text = `${email.subject} ${email.sender} ${email.senderEmail}`;
          email.category = EmailAnalyzer.categorizeByKeywords(text, categories, labels.map(l => l.name));
        });
        renderCurrentState(false);
      }
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

      // Resolve short URLs before analysis
      emailData.links = await resolveShortUrls(emailData.links || []);
      const whitelist = WhitelistManager.getWhitelist();

      if (settings.analysisMode === 'ai' && settings.aiSettings && settings.aiSettings.apiKey) {
        try {
          const categories = settings.categories || [];
          const aiResult = await new Promise((resolve) => {
            chrome.runtime.sendMessage({ 
              type: 'AI_ANALYZE', 
              emailData,
              availableCategories: categories.map(c => c.name)
            }, (response) => {
              resolve(response || {});
            });
          });

          if (aiResult && !aiResult.error) {
            const localAnalysis = EmailAnalyzer.analyzeEmailDetail(emailData, settings.categories || [], whitelist);
            analysis = {
              ...localAnalysis,
              category: aiResult.category ? { name: aiResult.category, emoji: '🤖', color: '#4285f4', bgColor: '#e8f0fe' } : localAnalysis.category,
              tags: aiResult.tags || localAnalysis.tags,
              safetyScore: typeof aiResult.safetyScore === 'number' ? aiResult.safetyScore : localAnalysis.safetyScore,
              issues: [...(aiResult.issues || []), ...localAnalysis.issues].slice(0, 5)
            };
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
            analysis = EmailAnalyzer.analyzeEmailDetail(emailData, settings.categories || [], whitelist);
          }
        } catch (e) {
          analysis = EmailAnalyzer.analyzeEmailDetail(emailData, settings.categories || [], whitelist);
        }
      } else {
        analysis = EmailAnalyzer.analyzeEmailDetail(emailData, settings.categories || [], whitelist);
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

  // Listen for storage changes (category updates from options page)
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'sync' && changes.categories) {
      console.log('[Aegis] Categories updated, reloading settings');
      settings = null; // Clear cached settings
      
      // If analysis panel is visible, refresh it
      if (analysisPanel && analysisPanel.isVisible && analysisPanel.isVisible()) {
        const currentFilter = analysisPanel.getCurrentFilter ? analysisPanel.getCurrentFilter() : 'unread';
        runAnalysis(currentFilter === 'unread');
      }
    }
  });

  // Check initial state on load
  if (isEmailDetailView()) {
    setTimeout(analyzeOpenEmail, 1200);
  }

})();
