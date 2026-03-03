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

  // Load settings from background
  async function getSettings() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, (response) => {
        resolve(response || {});
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

        // Process in chunks (batches of 10) to reduce API requests
        const chunkSize = 10;
        for (let i = 0; i < emails.length; i += chunkSize) {
          const chunk = emails.slice(i, i + chunkSize);

          // Fallback initial categorization
          chunk.forEach(email => {
            const text = `${email.subject} ${email.sender} ${email.senderEmail}`;
            email.category = EmailAnalyzer.categorizeByKeywords(text, categories, labels.map(l => l.name));
          });

          // Build batch payload
          const batchData = chunk.map((email, index) => ({
            id: index,
            subject: email.subject,
            sender: email.sender,
            senderEmail: email.senderEmail
          }));

          // Try AI Batch
          try {
            const aiResult = await new Promise((resolve) => {
              chrome.runtime.sendMessage({
                type: 'AI_BATCH_ANALYZE',
                batchData,
                availableCategories: labels.map(l => l.name)
              }, (response) => {
                if (chrome.runtime.lastError) {
                  console.error('[Aegis] sendMessage error:', chrome.runtime.lastError);
                  resolve({});
                } else {
                  resolve(response || {});
                }
              });
            });
            console.log('[Aegis] AI Array result:', aiResult);

            if (aiResult && !aiResult.error && Array.isArray(aiResult.results)) {
              aiResult.results.forEach(res => {
                const email = chunk[res.id];
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
            }
          } catch (e) {
            console.error('[Aegis] AI Batch Error:', e);
          }

          // Render progressive updates
          renderCurrentState(true);

          // Small delay between chunks
          if (i + chunkSize < emails.length) {
            await new Promise(r => setTimeout(r, 500));
          }
        }

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
