// ---- URL Categories helpers ----

let _urlCategoriesCache = null;

async function loadUrlCategories() {
  if (_urlCategoriesCache) return _urlCategoriesCache;
  try {
    const url = chrome.runtime.getURL('src/data/url-categories.json');
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    _urlCategoriesCache = await res.json();
    return _urlCategoriesCache;
  } catch (e) {
    console.error('[Aegis] Failed to load URL categories:', e);
    return null;
  }
}

function categorizeUrlByDomain(url, categoriesData) {
  if (!categoriesData || !url) return null;
  try {
    const u = new URL(url);
    const hostname = u.hostname.replace(/^www\./, '');

    // Check excluded domains first
    for (const excl of (categoriesData.excludedDomains || [])) {
      if (excl.includes('://') && url.startsWith(excl)) return null;
      if (!excl.includes('://') && (hostname === excl || hostname.endsWith('.' + excl))) return null;
    }

    // Try exact hostname match, then parent domains
    for (const cat of categoriesData.categories) {
      for (const domain of cat.domains) {
        if (domain.includes('/')) {
          // Path-based match
          const pathDomain = hostname + u.pathname;
          if (pathDomain.startsWith(domain)) return cat.id;
        } else if (hostname === domain || hostname.endsWith('.' + domain)) {
          return cat.id;
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}

// ---- URL Tracking via webNavigation ----

const URL_HISTORY_KEY = 'aegis_url_history';
const URL_TRACKER_SETTINGS_KEY = 'aegis_url_tracker_settings';

function getDateKeyBg(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

async function trackUrlView(url, title) {
  if (!url || url.startsWith('chrome://') || url.startsWith('chrome-extension://') || url.startsWith('about:') || url.startsWith('data:')) {
    return;
  }

  const categoriesData = await loadUrlCategories();
  if (!categoriesData) return;

  let hostname;
  try {
    hostname = new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return;
  }

  // Skip excluded
  for (const excl of (categoriesData.excludedDomains || [])) {
    if (excl.includes('://') && url.startsWith(excl)) return;
    if (!excl.includes('://') && (hostname === excl || hostname.endsWith('.' + excl))) return;
  }

  const categoryId = categorizeUrlByDomain(url, categoriesData) || 'uncategorized';
  const dateKey = getDateKeyBg(new Date());
  const storageKey = `${URL_HISTORY_KEY}_${dateKey}`;

  return new Promise((resolve) => {
    chrome.storage.local.get([storageKey], (result) => {
      const dayData = result[storageKey] || { views: [], totalCount: 0 };
      dayData.views.push({
        url,
        domain: hostname,
        title: (title || '').slice(0, 100),
        category: categoryId,
        timestamp: Date.now()
      });
      dayData.totalCount = dayData.views.length;
      chrome.storage.local.set({ [storageKey]: dayData }, () => resolve(categoryId));
    });
  });
}

// Track completed navigations (top-level frames only)
if (chrome.webNavigation) {
  chrome.webNavigation.onCompleted.addListener(async (details) => {
    if (details.frameId !== 0) return; // top-level only
    try {
      const tab = await chrome.tabs.get(details.tabId);
      if (tab && tab.url) {
        await trackUrlView(tab.url, tab.title || '');
      }
    } catch {
      // tab may have closed
    }
  });
}

// ---- Whitelist helpers ----

async function loadBundledWhitelist() {
  try {
    const url = chrome.runtime.getURL('src/data/service-whitelist.json');
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    console.error('[Aegis] Failed to load bundled whitelist:', e);
    return null;
  }
}

async function getWhitelistFromStorage() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['whitelistData', 'whitelistLastUpdated'], (result) => {
      resolve({ data: result.whitelistData || null, lastUpdated: result.whitelistLastUpdated || null });
    });
  });
}

async function saveWhitelistToStorage(data) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ whitelistData: data, whitelistLastUpdated: Date.now() }, resolve);
  });
}

async function fetchWhitelistFromUrl(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}

async function autoRefreshWhitelist() {
  try {
    const { whitelistUrl } = await new Promise(r => chrome.storage.sync.get(['whitelistUrl'], r));
    if (!whitelistUrl) return;
    const data = await fetchWhitelistFromUrl(whitelistUrl);
    await saveWhitelistToStorage(data);
    console.log('[Aegis] Whitelist auto-refreshed from', whitelistUrl);
  } catch (e) {
    console.error('[Aegis] Auto-refresh whitelist failed:', e);
  }
}

// Alarm handlers
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'aegis-whitelist-update') {
    autoRefreshWhitelist();
  }
  if (alarm.name === 'aegis-url-history-cleanup') {
    cleanupOldUrlHistory();
  }
});

async function cleanupOldUrlHistory() {
  const MAX_DAYS = 30;
  const now = new Date();
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - MAX_DAYS);
  const cutoffKey = getDateKeyBg(cutoff);

  chrome.storage.local.get(null, (all) => {
    const keysToRemove = [];
    for (const key of Object.keys(all)) {
      if (key.startsWith(URL_HISTORY_KEY + '_')) {
        const dateStr = key.replace(URL_HISTORY_KEY + '_', '');
        if (dateStr < cutoffKey) {
          keysToRemove.push(key);
        }
      }
    }
    if (keysToRemove.length > 0) {
      chrome.storage.local.remove(keysToRemove, () => {
        console.log('[Aegis] Cleaned up', keysToRemove.length, 'old URL history entries');
      });
    }
  });
}

// ---- Default settings ----

const DEFAULT_SETTINGS = {
  analysisMode: 'local',
  analysisDebug: false,
  aiSettings: {
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '',
    model: 'gpt-5-nano-2025-08-07'
  },
  categories: [
    { id: 'work', name: '工作', emoji: 'briefcase', color: '#4285f4', bgColor: '#e8f0fe', keywords: ['meeting', '會議', 'project', '專案', 'deadline', 'invoice', '發票', 'report', '報告'] },
    { id: 'shopping', name: '購物', emoji: 'shopping-cart', color: '#ff6d00', bgColor: '#fff3e0', keywords: ['order', '訂單', 'shipping', '出貨', 'receipt', 'purchase', 'delivery', '配送'] },
    { id: 'finance', name: '財務', emoji: 'credit-card', color: '#00897b', bgColor: '#e0f2f1', keywords: ['payment', '付款', 'bank', '銀行', 'transfer', '帳單', 'bill', 'credit', 'invoice'] },
    { id: 'social', name: '社交', emoji: 'user', color: '#9c27b0', bgColor: '#f3e5f5', keywords: ['invitation', '邀請', 'follow', 'friend', 'connect', 'linkedin', 'facebook'] },
    { id: 'promotions', name: '促銷', emoji: 'tag', color: '#e91e63', bgColor: '#fce4ec', keywords: ['sale', '特價', 'discount', '折扣', 'offer', '優惠', 'promo', 'newsletter'] },
    { id: 'security', name: '安全', emoji: 'lock', color: '#f44336', bgColor: '#ffebee', keywords: ['verify', '驗證', 'password', '密碼', 'secure', 'unauthorized', 'breach', 'phishing'] },
    { id: 'notifications', name: '通知', emoji: 'clock', color: '#607d8b', bgColor: '#eceff1', keywords: ['notification', '通知', 'alert', 'update', 'reminder', 'otp', 'confirm'] }
  ]
};

chrome.runtime.onInstalled.addListener(async () => {
  const existing = await chrome.storage.sync.get(null);
  const merged = {};

  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    if (!(key in existing)) {
      merged[key] = value;
    }
  }

  if (Object.keys(merged).length > 0) {
    await chrome.storage.sync.set(merged);
  }

  // Seed bundled whitelist if not yet cached
  const { data } = await getWhitelistFromStorage();
  if (!data) {
    const bundled = await loadBundledWhitelist();
    if (bundled) await saveWhitelistToStorage(bundled);
  }

  // Schedule weekly whitelist refresh
  chrome.alarms.create('aegis-whitelist-update', { periodInMinutes: 10080 });

  // Schedule daily URL history cleanup (every 24h)
  chrome.alarms.create('aegis-url-history-cleanup', { periodInMinutes: 1440 });
});

function buildUserMessage(emailData) {
  return `Subject: ${emailData.subject}
From: ${emailData.sender} <${emailData.senderEmail}>

Body:
${(emailData.body || '').slice(0, 1000)}

Links:
${(emailData.links || []).slice(0, 10).join('\n')}`;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_WHITELIST') {
    getWhitelistFromStorage().then(async ({ data }) => {
      if (data) {
        sendResponse({ whitelist: data });
      } else {
        const bundled = await loadBundledWhitelist();
        if (bundled) await saveWhitelistToStorage(bundled);
        sendResponse({ whitelist: bundled });
      }
    });
    return true;
  }

  if (message.type === 'FETCH_WHITELIST') {
    const { url } = message;
    if (!url) {
      sendResponse({ success: false, error: '未設定白名單 URL' });
      return true;
    }
    fetchWhitelistFromUrl(url)
      .then(async (data) => {
        await saveWhitelistToStorage(data);
        sendResponse({ success: true, serviceCount: data.services ? data.services.length : 0 });
      })
      .catch(e => sendResponse({ success: false, error: e.message }));
    return true;
  }

  if (message.type === 'GET_WHITELIST_STATUS') {
    getWhitelistFromStorage().then(({ data, lastUpdated }) => {
      sendResponse({
        lastUpdated,
        serviceCount: data && data.services ? data.services.length : 0,
        shortUrlCount: data && data.shortUrlServices ? data.shortUrlServices.length : 0
      });
    });
    return true;
  }

  if (message.type === 'RESOLVE_SHORT_URL') {
    const { url } = message;
    // Follow redirect in service worker and return final URL
    fetch(url, { method: 'HEAD', redirect: 'follow' })
      .then(res => sendResponse({ resolvedUrl: res.url }))
      .catch(() => {
        // Fallback to GET if HEAD is blocked
        fetch(url, { method: 'GET', redirect: 'follow' })
          .then(res => sendResponse({ resolvedUrl: res.url }))
          .catch(() => sendResponse({ resolvedUrl: url }));
      });
    return true;
  }

  if (message.type === 'GET_SETTINGS') {
    chrome.storage.sync.get(null, (result) => {
      sendResponse(Object.assign({}, DEFAULT_SETTINGS, result));
    });
    return true;
  }

  if (message.type === 'AI_ANALYZE') {
    chrome.storage.sync.get(null, (result) => {
      const settings = Object.assign({}, DEFAULT_SETTINGS, result);

      const promptContent = buildUserMessage(message.emailData);
      console.log('========== [Aegis] AI Prompt ==========');
      const categoryListStr = message.availableCategories ? message.availableCategories.join(', ') : 'no specific categories';
      const batchSystemPrompt = `You are a fast email categorization assistant. Analyze the email sender and subject, and respond with ONLY valid JSON in this exact format: { "category": "category name" }. You MUST choose the most appropriate category strictly from this list: [${categoryListStr}]. Do not invent new categories.`;

      console.log('System: ' + batchSystemPrompt);
      console.log('User:\n' + promptContent);
      console.log('=======================================');

      fetch(settings.aiSettings.baseUrl + '/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + settings.aiSettings.apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: settings.aiSettings.model,
          messages: [
            {
              role: 'system',
              content: batchSystemPrompt
            },
            {
              role: 'user',
              content: promptContent
            }
          ],
          max_completion_tokens: 3000
        })
      })
        .then((res) => res.text())
        .then((rawText) => {
          console.log('\n\n========== [Aegis] RAW HTTP RESPONSE ==========');
          console.log(rawText);
          console.log('===============================================\n\n');

          let data;
          try {
            data = JSON.parse(rawText);
          } catch (e) {
            console.error('[Aegis] RAW Response is not valid JSON!');
            return sendResponse({ error: 'API returned non-JSON response' });
          }

          if (data.error) {
            console.error('[Aegis] API Error Response:', data.error);
            return sendResponse({ error: data.error.message || 'API Error' });
          }
          if (!data.choices || !data.choices[0] || !data.choices[0].message) {
            console.error('[Aegis] Unexpected API format:', data);
            return sendResponse({ error: 'Unexpected API response format' });
          }

          const content = data.choices[0].message.content;
          console.log('========== [Aegis] AI Content ==========');
          console.log(content);
          console.log('========================================');

          try {
            // Bulletproof JSON extraction: find the first { and last }
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
              throw new Error('No JSON object found in response');
            }
            const result = JSON.parse(jsonMatch[0]);
            sendResponse(result);
          } catch (e) {
            console.error('[Aegis] Invalid JSON Content:', content, e);
            sendResponse({ error: 'Invalid JSON from AI' });
          }
        })
        .catch((error) => {
          console.error('[Aegis] Fetch error:', error);
          sendResponse({ error: error.message });
        });
    });
    return true;
  }

  if (message.type === 'AI_BATCH_ANALYZE') {
    chrome.storage.sync.get(null, (result) => {
      const settings = Object.assign({}, DEFAULT_SETTINGS, result);

      const promptContent = JSON.stringify(message.batchData, null, 2);
      const categoryListStr = message.availableCategories ? message.availableCategories.join(', ') : 'no specific categories';
      const batchSystemPrompt = `You are a fast email categorization assistant. Analyze the following list of emails (provided as a JSON array). Respond with ONLY a valid JSON object containing a "results" array. Format: { "results": [ { "id": ID_NUMBER, "category": "category name" } ] }. You MUST map every id from the input to an output. You MUST choose the most appropriate category strictly from this list: [${categoryListStr}]. Do not invent new categories.`;

      console.log('System: ' + batchSystemPrompt);
      console.log('User:\n' + promptContent);
      console.log('=======================================');

      fetch(settings.aiSettings.baseUrl + '/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + settings.aiSettings.apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: settings.aiSettings.model,
          messages: [
            {
              role: 'system',
              content: batchSystemPrompt
            },
            {
              role: 'user',
              content: promptContent
            }
          ],
          max_completion_tokens: 3000
        })
      })
        .then((res) => res.text())
        .then((rawText) => {
          console.log('\n\n========== [Aegis] BATCH RAW HTTP RESPONSE ==========');
          console.log(rawText);
          console.log('===============================================\n\n');

          let data;
          try {
            data = JSON.parse(rawText);
          } catch (e) {
            console.error('[Aegis] BATCH RAW Response is not valid JSON!');
            return sendResponse({ error: 'API returned non-JSON response' });
          }

          if (data.error) {
            console.error('[Aegis] API Error Response:', data.error);
            return sendResponse({ error: data.error.message || 'API Error' });
          }
          if (!data.choices || !data.choices[0] || !data.choices[0].message) {
            console.error('[Aegis] Unexpected API format:', data);
            return sendResponse({ error: 'Unexpected API response format' });
          }

          const content = data.choices[0].message.content;

          try {
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (!jsonMatch) throw new Error('No JSON object found in response');
            const result = JSON.parse(jsonMatch[0]);
            sendResponse(result);
          } catch (e) {
            console.error('[Aegis] Invalid JSON Content:', content, e);
            sendResponse({ error: 'Invalid JSON from AI' });
          }
        })
        .catch((error) => {
          console.error('[Aegis] Fetch error:', error);
          sendResponse({ error: error.message });
        });
    });
    return true;
  }

  if (message.type === 'TEST_AI_API') {
    const { baseUrl, apiKey, model } = message.settings;
    fetch(baseUrl + '/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: model,
        messages: [{ role: 'user', content: 'hi' }],
        max_completion_tokens: 10
      })
    })
      .then(res => res.text())
      .then(rawText => {
        // Always return the exact, unparsed string for debugging realistic payload formatting
        sendResponse({ success: true, message: rawText });
      })
      .catch(e => sendResponse({ success: false, error: e.message }));
    return true;
  }
  if (message.type === 'FETCH_AI_MODELS') {
    const { baseUrl, apiKey } = message.settings;
    if (!baseUrl || !apiKey) {
      sendResponse({ success: false, error: '缺少 Base URL 或 API Key' });
      return true;
    }

    let fetchUrl = baseUrl.replace(/\/chat\/completions\/?$/, '');
    let headers = {
      'Content-Type': 'application/json'
    };

    if (baseUrl.includes('generative')) {
      // Gemini format (e.g. GET /v1beta/models?key=API_KEY)
      fetchUrl = fetchUrl + '/models?key=' + apiKey;
    } else {
      // Standard OpenAI compatible
      fetchUrl = fetchUrl + '/models';
      headers['Authorization'] = 'Bearer ' + apiKey;
    }

    fetch(fetchUrl, { method: 'GET', headers })
      .then(res => {
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        return res.json();
      })
      .then(data => {
        let models = [];
        if (data.data && Array.isArray(data.data)) { // OpenAI
          models = data.data.map(m => m.id);
        } else if (data.models && Array.isArray(data.models)) { // Gemini
          models = data.models.map(m => m.name.replace('models/', ''));
        } else {
          return sendResponse({ success: false, error: '無法解析模型清單格式' });
        }
        sendResponse({ success: true, models: models.sort() });
      })
      .catch(e => {
        console.error('[Aegis] FETCH_MODELS error:', e);
        sendResponse({ success: false, error: e.message });
      });

    return true;
  }

  if (message.type === 'SAVE_SETTINGS') {
    chrome.storage.sync.set(message.settings, () => {
      sendResponse({ ok: true });
    });
    return true;
  }

  if (message.type === 'GET_URL_CATEGORIES') {
    loadUrlCategories().then((data) => {
      sendResponse({ data });
    });
    return true;
  }

  if (message.type === 'TRACK_URL') {
    trackUrlView(message.url, message.title || '').then((categoryId) => {
      sendResponse({ categoryId: categoryId || 'uncategorized' });
    });
    return true;
  }

  if (message.type === 'CATEGORIZE_URL') {
    loadUrlCategories().then((data) => {
      const catId = categorizeUrlByDomain(message.url, data);
      sendResponse({ categoryId: catId });
    });
    return true;
  }
});
