(async function () {
  'use strict';

  // Guard against double injection
  if (window.__aegisInitialized) return;
  window.__aegisInitialized = true;

  // ---- EULA Gate ----
  let eulaAccepted = false;
  try {
    const result = await chrome.storage.sync.get(['eulaAccepted']);
    eulaAccepted = result.eulaAccepted;
  } catch (e) {
    console.warn('[Aegis] Failed to read EULA state:', e);
    // Treat storage read failure as "not accepted" (safe default)
  }

  if (eulaAccepted !== true) {
    const eulaDialog = new EulaDialog();
    eulaDialog.show({
      onAccept: () => {
        initializeExtension();
      },
      onDecline: () => {
        // Extension remains idle on this page load
      }
    });
    return;
  }

  initializeExtension();

  async function initializeExtension() {
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

    // Icon Mapping for Gmail Labels in AI Mode
    const ICON_MAPPING = {
      'credit-card': ['發票', '收據', '帳單', '付款', 'invoice', 'receipt', 'bill', 'payment', 'finance', '銀行', 'bank', 'credit', 'pay'],
      'shopping-cart': ['訂單', '購物', 'order', 'shopping', 'store', '買', '蝦皮', 'momo', 'pchome', 'amazon'],
      'package': ['出貨', '包裹', '運送', '物流', 'shipping', 'delivery', 'package', 'tracking'],
      'calendar': ['會議', '行程', '預約', '活動', 'meeting', 'calendar', 'event', 'appointment', 'schedule'],
      'alert-triangle': ['警告', '警示', '重要', 'urgent', 'alert', 'important', 'warning'],
      'heart': ['喜歡', '最愛', 'favorite', 'heart', 'love', 'family', '家庭'],
      'check-circle': ['完成', '確認', 'done', 'confirmed', 'success'],
      'image': ['照片', '圖片', '相簿', 'photo', 'image', 'picture', 'album'],
      'bar-chart': ['報表', '分析', '統計', 'report', 'analytics', 'stats', 'chart'],
      'shield': ['安全', '資安', '密碼', 'security', 'password', 'login', '登入', '驗證'],
      'phone': ['聯絡', '電話', '客服', 'contact', 'support', 'call', 'phone'],
      'globe': ['網路', '網站', '網域', 'network', 'web', 'domain', 'internet'],
      'video': ['影片', 'youtube', 'video', 'media', 'zoom', 'meet'],
      'coffee': ['休閒', '休息', 'break', 'coffee', 'cafe', 'tea'],
      'gift': ['促銷', '優惠', '折扣', '廣告', 'promo', 'discount', 'offer', 'sale', 'gift', 'free'],
      'trash': ['垃圾', 'spam', 'trash', 'junk'],
      'book': ['學習', '課程', '學校', 'education', 'course', 'school', 'learn', 'study', 'class'],
      'send': ['飛機', '旅行', '航班', 'travel', 'flight', 'trip'],
      'mail': ['信件', '郵件', 'mail', 'newsletter', '電子報'],
      'paperclip': ['附件', '檔案', 'attachment', 'file'],
      'briefcase': ['工作', '公司', '業務', 'work', 'job', 'business', 'company'],
      'user': ['個人', '朋友', 'personal', 'friend'],
      'star': ['星號', '特殊', 'star', 'special'],
      'folder': ['其他', 'other', 'misc']
    };

    const LABEL_COLORS = {
      'credit-card': { color: '#00897b', bgColor: '#e0f2f1' },
      'shopping-cart': { color: '#e65100', bgColor: '#ffe0b2' },
      'package': { color: '#8d6e63', bgColor: '#efebe9' },
      'calendar': { color: '#1e88e5', bgColor: '#e3f2fd' },
      'alert-triangle': { color: '#d32f2f', bgColor: '#ffebee' },
      'heart': { color: '#c2185b', bgColor: '#fce4ec' },
      'check-circle': { color: '#388e3c', bgColor: '#e8f5e9' },
      'image': { color: '#7b1fa2', bgColor: '#f3e5f5' },
      'bar-chart': { color: '#303f9f', bgColor: '#e8eaf6' },
      'shield': { color: '#0288d1', bgColor: '#e1f5fe' },
      'phone': { color: '#0097a7', bgColor: '#e0f7fa' },
      'globe': { color: '#388e3c', bgColor: '#e8f5e9' },
      'video': { color: '#d32f2f', bgColor: '#ffebee' },
      'coffee': { color: '#5d4037', bgColor: '#efebe9' },
      'gift': { color: '#c2185b', bgColor: '#fce4ec' },
      'trash': { color: '#616161', bgColor: '#f5f5f5' },
      'book': { color: '#512da8', bgColor: '#ede7f6' },
      'send': { color: '#0288d1', bgColor: '#e1f5fe' },
      'mail': { color: '#1976d2', bgColor: '#e3f2fd' },
      'paperclip': { color: '#455a64', bgColor: '#eceff1' },
      'briefcase': { color: '#f57c00', bgColor: '#ffe0b2' },
      'user': { color: '#7b1fa2', bgColor: '#f3e5f5' },
      'star': { color: '#fbc02d', bgColor: '#fff9c4' },
      'folder': { color: '#616161', bgColor: '#f5f5f5' },
      'tag': { color: '#1976d2', bgColor: '#e3f2fd' }
    };

    function getIconForLabel(labelName) {
      if (!labelName) return 'tag';
      const lower = labelName.toLowerCase();
      for (const [icon, keywords] of Object.entries(ICON_MAPPING)) {
        if (keywords.some(kw => lower.includes(kw))) {
          return icon;
        }
      }
      return 'tag';
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

    // Helper to update scan stats
    function updateStats(classifiedCount, scannedCount = 0) {
      chrome.storage.local.get(['aegis_stats'], (res) => {
        let st = res.aegis_stats || { classified: 0, scanned: 0 };
        st.classified = (st.classified || 0) + classifiedCount;
        st.scanned = (st.scanned || 0) + scannedCount;
        chrome.storage.local.set({ aegis_stats: st });
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
                availableCategories: labels.map(l => l.name)
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
                    // Create dynamic category from the AI classified Gmail label
                    const mappedIcon = getIconForLabel(res.category);
                    const colors = LABEL_COLORS[mappedIcon] || LABEL_COLORS['tag'];
                    email.category = {
                      name: res.category,
                      emoji: mappedIcon,
                      color: colors.color,
                      bgColor: colors.bgColor,
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
          const classifiedCount = emails.filter(e => e.category && e.category.id !== 'tag').length;
          updateStats(classifiedCount, 0);

        } else if (settings.analysisMode === 'nano') {
          // Nano AI mode — uses Gmail labels for classification (same as AI mode)
          console.log('[Aegis] Nano AI mode active, processing', emails.length, 'emails');

          // Initial categorization using keywords as fallback (overridden by Nano AI results)
          emails.forEach(email => {
            const text = `${email.subject} ${email.sender} ${email.senderEmail}`;
            email.category = EmailAnalyzer.categorizeByKeywords(text, categories, labels.map(l => l.name));
          });

          try {
            const availability = await NanoAnalyzer.checkAvailability();
            if (availability !== 'available') {
              console.warn('[Aegis] Gemini Nano not available (' + availability + '), falling back to local analysis');
              renderCurrentState(false);
              const classifiedCount = emails.filter(e => e.category && e.category.id !== 'tag').length;
              updateStats(classifiedCount, 0);
            } else {
              const batchData = emails.map((email, index) => ({
                id: index,
                subject: email.subject,
                sender: email.sender,
                senderEmail: email.senderEmail
              }));

              const nanoResult = await NanoAnalyzer.batchAnalyze(batchData, labels.map(l => l.name));

              if (nanoResult && Array.isArray(nanoResult.results)) {
                nanoResult.results.forEach(res => {
                  const email = emails[res.id];
                  if (email) {
                    // Always create dynamic category from Gmail label (same as AI mode)
                    const mappedIcon = getIconForLabel(res.category);
                    const colors = LABEL_COLORS[mappedIcon] || LABEL_COLORS['tag'];
                    email.category = {
                      name: res.category,
                      emoji: mappedIcon,
                      color: colors.color,
                      bgColor: colors.bgColor,
                      id: 'ai-label-' + res.category
                    };
                  }
                });
              }

              renderCurrentState(false);
              const classifiedCount = emails.filter(e => e.category && e.category.id !== 'tag').length;
              updateStats(classifiedCount, 0);
            }
          } catch (err) {
            console.warn('[Aegis] Nano batch analysis error, falling back to local:', err);
            renderCurrentState(false);
            const classifiedCount = emails.filter(e => e.category && e.category.id !== 'tag').length;
            updateStats(classifiedCount, 0);
          }
        } else {
          // Local analysis only
          emails.forEach(email => {
            const text = `${email.subject} ${email.sender} ${email.senderEmail}`;
            email.category = EmailAnalyzer.categorizeByKeywords(text, categories, labels.map(l => l.name));
          });
          renderCurrentState(false);
          const classifiedCount = emails.filter(e => e.category && e.category.id !== 'tag').length;
          updateStats(classifiedCount, 0);
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
            const labels = platform.getLabels();
            const aiResult = await new Promise((resolve) => {
              chrome.runtime.sendMessage({
                type: 'AI_ANALYZE',
                emailData,
                availableCategories: labels.map(l => l.name)
              }, (response) => {
                resolve(response || {});
              });
            });

            if (aiResult && !aiResult.error) {
              const localAnalysis = EmailAnalyzer.analyzeEmailDetail(emailData, settings.categories || [], whitelist);

              let matchedCategory = (settings.categories || []).find(c => c.name === aiResult.category);
              let finalCategory;
              if (matchedCategory) {
                finalCategory = Object.assign({}, matchedCategory);
              } else if (aiResult.category) {
                const mappedIcon = getIconForLabel(aiResult.category);
                const colors = LABEL_COLORS[mappedIcon] || LABEL_COLORS['tag'];
                finalCategory = {
                  name: aiResult.category,
                  emoji: mappedIcon,
                  color: colors.color,
                  bgColor: colors.bgColor,
                  id: 'ai-label-' + aiResult.category
                };
              } else {
                finalCategory = localAnalysis.category;
              }

              analysis = {
                ...localAnalysis,
                category: finalCategory,
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
        } else if (settings.analysisMode === 'nano') {
          try {
            const nanoResult = await NanoAnalyzer.analyzeEmail(emailData);
            const localAnalysis = EmailAnalyzer.analyzeEmailDetail(emailData, settings.categories || [], whitelist);

            let finalCategory;
            if (nanoResult.category) {
              // Always create dynamic category from Gmail label (same as AI mode)
              const mappedIcon = getIconForLabel(nanoResult.category);
              const colors = LABEL_COLORS[mappedIcon] || LABEL_COLORS['tag'];
              finalCategory = {
                name: nanoResult.category,
                emoji: mappedIcon,
                color: colors.color,
                bgColor: colors.bgColor,
                id: 'ai-label-' + nanoResult.category
              };
            } else {
              finalCategory = localAnalysis.category;
            }

            analysis = {
              ...localAnalysis,
              category: finalCategory,
              tags: nanoResult.tags || localAnalysis.tags,
              safetyScore: typeof nanoResult.safetyScore === 'number' ? nanoResult.safetyScore : localAnalysis.safetyScore,
              issues: [...(nanoResult.issues || []), ...localAnalysis.issues].slice(0, 5)
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
          } catch (e) {
            console.warn('[Aegis] Nano single analysis error, falling back to local:', e);
            analysis = EmailAnalyzer.analyzeEmailDetail(emailData, settings.categories || [], whitelist);
          }
        } else {
          analysis = EmailAnalyzer.analyzeEmailDetail(emailData, settings.categories || [], whitelist);
        }

        emailPopup.show(analysis);
        updateStats(0, 1);

        // Submit email domain feedback (fire-and-forget, never blocks the user)
        if (emailData.senderEmail && emailData.senderEmail.includes('@')) {
          try {
            const senderDomain = emailData.senderEmail.split('@')[1].toLowerCase();
            const urlDomains = [...new Set(
              (emailData.links || [])
                .map(link => { try { return new URL(link).hostname.replace(/^www\./, ''); } catch { return null; } })
                .filter(Boolean)
            )];
            if (urlDomains.length > 0) {
              chrome.runtime.sendMessage({
                type: 'SUBMIT_EMAIL_FEEDBACK',
                senderDomain,
                urlDomains,
                companyName: emailData.sender || undefined,
              });
            }
          } catch (e) {
            // Feedback failure must never surface to the user
          }
        }
      } catch (err) {
        console.error('[Aegis] Email analysis error:', err);
      }
    }

    // Detect if viewing an email detail (Gmail URL has hash with message ID)
    function isEmailDetailView() {
      const hash = window.location.hash;
      // Gmail email detail: #inbox/FMfcgz..., #sent/FMfcgz..., #search/query/FMfcgz...
      // Allows nested paths like #label/Phishing/FMfcgz...
      return /^#.*\/[A-Za-z0-9]{10,}/.test(hash);
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

    // Cleanup Nano AI session on page unload
    window.addEventListener('beforeunload', () => {
      if (typeof NanoAnalyzer !== 'undefined' && NanoAnalyzer.destroy) {
        NanoAnalyzer.destroy();
      }
    });
  }

})();
