// ---- GA4 Analytics Tracker (inline for service worker compatibility) ----
var AegisTracker = (() => {
  const MEASUREMENT_ID = 'G-QR7JYT0RCX';
  const API_SECRET = '__GA_API_SECRET__'; // Replaced at build time by Makefile
  const GA_ENDPOINT = 'https://www.google-analytics.com/mp/collect';
  const CLIENT_ID_KEY = 'aegis_ga_client_id';
  const SESSION_ID_KEY = 'aegis_ga_session_id';
  const SESSION_START_KEY = 'aegis_ga_session_start';
  const SESSION_TIMEOUT_MS = 30 * 60 * 1000;
  let _clientId = null, _sessionId = null, _sessionStart = null, _apiSecret = API_SECRET;

  async function init() {
    try {
      const data = await new Promise(r => chrome.storage.local.get([CLIENT_ID_KEY, SESSION_ID_KEY, SESSION_START_KEY], r));
      _clientId = data[CLIENT_ID_KEY] || _genId();
      if (!data[CLIENT_ID_KEY]) await new Promise(r => chrome.storage.local.set({ [CLIENT_ID_KEY]: _clientId }, r));
      const now = Date.now();
      _sessionStart = data[SESSION_START_KEY] || 0;
      _sessionId = data[SESSION_ID_KEY] || null;
      if (!_sessionId || (now - _sessionStart) > SESSION_TIMEOUT_MS) {
        _sessionId = String(now); _sessionStart = now;
        await new Promise(r => chrome.storage.local.set({ [SESSION_ID_KEY]: _sessionId, [SESSION_START_KEY]: _sessionStart }, r));
      }
    } catch (e) {
      _clientId = _clientId || _genId();
      _sessionId = _sessionId || String(Date.now());
    }
  }

  async function sendEvent(name, params = {}) {
    if (!_apiSecret || _apiSecret === '__GA_API_SECRET__') return;
    if (!_clientId) await init();
    const url = `${GA_ENDPOINT}?measurement_id=${MEASUREMENT_ID}&api_secret=${_apiSecret}`;
    try {
      await fetch(url, { method: 'POST', body: JSON.stringify({
        client_id: _clientId,
        events: [{ name, params: { session_id: _sessionId, engagement_time_msec: '100', ...params } }]
      })});
    } catch (e) { /* analytics must never break the extension */ }
  }

  function _genId() { const a = new Uint8Array(16); crypto.getRandomValues(a); return Array.from(a, b => b.toString(16).padStart(2, '0')).join(''); }

  return {
    init,
    sendEvent,
    trackInstall: (v) => sendEvent('extension_install', { extension_version: v }),
    trackClassification: (mode, n, c) => sendEvent('email_classified', { analysis_mode: mode, email_count: String(n), category_count: String(c) }),
    trackSecurityScan: (score, level) => sendEvent('security_scan', { safety_score: String(score), safety_level: level }),
    trackDomainAnalysis: (domain, score, level) => sendEvent('domain_analysis', { domain, domain_score: String(score), domain_level: level }),
    trackUrlPageView: (cat) => sendEvent('url_page_view', { url_category: cat || 'uncategorized' }),
    trackCategoryAction: (action, cat) => sendEvent('category_action', { action_type: action, category_id: cat }),
    trackSettingsChange: (setting, val) => sendEvent('settings_change', { setting_name: setting, setting_value: String(val) }),
  };
})();

// ---- Aegis API feedback ----

const AEGIS_API_BASE_URL = 'https://aegis.penrose.services';

function _getExtensionVersion() {
  return chrome.runtime.getManifest().version;
}

async function _submitFeedback(path, body) {
  try {
    await fetch(`${AEGIS_API_BASE_URL}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Extension-Version': _getExtensionVersion(),
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    console.warn('[Aegis] Feedback submission failed:', e.message);
  }
}

async function _isFeedbackAllowed() {
  const { eulaAccepted, dataFeedbackEnabled } = await new Promise((resolve) =>
    chrome.storage.sync.get(['eulaAccepted', 'dataFeedbackEnabled'], resolve)
  );
  return eulaAccepted === true && dataFeedbackEnabled === true;
}

async function submitUrlCategoryFeedback(url, suggestedCategory, currentCategory) {
  if (!(await _isFeedbackAllowed())) return;
  _submitFeedback('/feedback/url-category', { url, suggestedCategory, currentCategory });
}

async function submitEmailDomainFeedback(senderDomain, urlDomains, companyName) {
  if (!senderDomain || !urlDomains || urlDomains.length === 0) return;
  if (!(await _isFeedbackAllowed())) return;
  const body = { senderDomain, urlDomains };
  if (companyName) body.companyName = companyName;
  _submitFeedback('/feedback/sender-mapping', body);
}

// ---- URL Categories helpers ----

let _urlCategoriesCache = null;

async function loadUrlCategories() {
  if (_urlCategoriesCache) return _urlCategoriesCache;
  try {
    // Prefer synced data from API over bundled file
    const synced = await new Promise(resolve => {
      chrome.storage.local.get(['aegis_url_categories_synced'], (result) => {
        resolve(result.aegis_url_categories_synced || null);
      });
    });
    if (synced && Array.isArray(synced.categories)) {
      _urlCategoriesCache = synced;
      _sortedDomainLookup = null;
      return _urlCategoriesCache;
    }

    // Fallback to bundled file
    const url = chrome.runtime.getURL('src/data/url-categories.json');
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    _urlCategoriesCache = await res.json();
    _sortedDomainLookup = null;
    return _urlCategoriesCache;
  } catch (e) {
    console.error('[Aegis] Failed to load URL categories:', e);
    return null;
  }
}

// Pre-built sorted lookup: built once per categories load, longest domain first
let _sortedDomainLookup = null;

async function _buildSortedLookup(categoriesData) {
  if (_sortedDomainLookup) return _sortedDomainLookup;
  const entries = [];
  for (const cat of categoriesData.categories) {
    for (const domain of cat.domains) {
      entries.push({ domain, categoryId: cat.id, hasPath: domain.includes('/') });
    }
  }

  // Add user labels (override built-in mappings for same domain)
  try {
    const result = await new Promise(r =>
      chrome.storage.local.get(['aegis_url_user_labels'], r)
    );
    const userLabels = result.aegis_url_user_labels || {};
    const userDomains = new Set(Object.keys(userLabels));

    // Remove built-in entries for domains that have user overrides
    const filtered = entries.filter(e => !userDomains.has(e.domain));

    // Add user label entries
    for (const [domain, categoryId] of Object.entries(userLabels)) {
      filtered.push({ domain, categoryId, hasPath: domain.includes('/') });
    }

    // Sort by domain length descending — longer (more specific) matches first
    filtered.sort((a, b) => b.domain.length - a.domain.length);
    _sortedDomainLookup = filtered;
  } catch {
    entries.sort((a, b) => b.domain.length - a.domain.length);
    _sortedDomainLookup = entries;
  }
  return _sortedDomainLookup;
}

async function categorizeUrlByDomain(url, categoriesData) {
  if (!categoriesData || !url) return null;
  try {
    const u = new URL(url);
    const hostname = u.hostname.replace(/^www\./, '');

    // Check excluded domains first
    for (const excl of (categoriesData.excludedDomains || [])) {
      if (excl.includes('://') && url.startsWith(excl)) return null;
      if (!excl.includes('://') && (hostname === excl || hostname.endsWith('.' + excl))) return null;
    }

    const lookup = await _buildSortedLookup(categoriesData);

    // Longest match first: gemini.google.com matches "ai" before google.com matches "search"
    for (const entry of lookup) {
      if (entry.hasPath) {
        const pathDomain = hostname + u.pathname;
        if (pathDomain.startsWith(entry.domain)) return entry.categoryId;
      } else if (hostname === entry.domain || hostname.endsWith('.' + entry.domain)) {
        return entry.categoryId;
      }
    }
    return null;
  } catch {
    return null;
  }
}

// ---- Domain Security Analysis ----

const DOMAIN_CACHE_KEY = 'aegis_domain_cache';
const DOMAIN_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

async function getDomainCache() {
  return new Promise((resolve) => {
    chrome.storage.local.get([DOMAIN_CACHE_KEY], (result) => {
      resolve(result[DOMAIN_CACHE_KEY] || {});
    });
  });
}

async function setDomainCache(cache) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [DOMAIN_CACHE_KEY]: cache }, resolve);
  });
}

function evictExpiredDomainCache(cache) {
  const now = Date.now();
  for (const domain of Object.keys(cache)) {
    if (now - (cache[domain].cachedAt || 0) > DOMAIN_CACHE_TTL_MS) {
      delete cache[domain];
    }
  }
  return cache;
}

async function fetchRdapData(domain) {
  // Try multiple RDAP sources for reliability
  const tld = domain.split('.').pop();
  const rdapUrls = [];

  // Direct registrar RDAP servers (faster, no redirect)
  if (['com', 'net'].includes(tld)) {
    rdapUrls.push(`https://rdap.verisign.com/${tld}/v1/domain/${domain}`);
  } else if (tld === 'org') {
    rdapUrls.push(`https://rdap.org/domain/${domain}`);
  } else if (['tw', 'jp', 'uk', 'au', 'de', 'fr'].includes(tld)) {
    rdapUrls.push(`https://rdap.org/domain/${domain}`);
  }
  // Fallback: rdap.org (redirect service)
  rdapUrls.push(`https://rdap.org/domain/${domain}`);

  for (const url of rdapUrls) {
    try {
      const res = await fetch(url, {
        redirect: 'follow',
        signal: AbortSignal.timeout(10000)
      });
      if (!res.ok) continue;
      const data = await res.json();

      let registrationDate = null;
      if (Array.isArray(data.events)) {
        const regEvent = data.events.find(e => e.eventAction === 'registration');
        if (regEvent && regEvent.eventDate) {
          registrationDate = regEvent.eventDate;
        }
      }

      let registrant = null;
      if (Array.isArray(data.entities)) {
        const regEntity = data.entities.find(e =>
          Array.isArray(e.roles) && e.roles.includes('registrant')
        );
        if (regEntity && Array.isArray(regEntity.vcardArray)) {
          const vcard = regEntity.vcardArray[1] || [];
          const fnEntry = vcard.find(prop => prop[0] === 'fn');
          if (fnEntry) registrant = fnEntry[3] || null;
          if (registrant && /redacted|privacy|protected/i.test(registrant)) {
            registrant = 'Redacted for Privacy';
          }
        }
      }

      return {
        registrationDate,
        registrant,
        rdapError: false,
        rdapNoDate: registrationDate === null
      };
    } catch (e) {
      console.warn('[Aegis] RDAP fetch failed for', domain, 'via', url, ':', e.message);
      // Try next URL
    }
  }

  return { registrationDate: null, registrant: null, rdapError: true, rdapNoDate: false };
}

async function resolveDomainIp(domain) {
  try {
    const res = await fetch(
      `https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=A`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const aRecord = (data.Answer || []).find(r => r.type === 1);
    return aRecord ? aRecord.data : null;
  } catch (e) {
    console.warn('[Aegis] DNS resolution failed for', domain, ':', e.message);
    return null;
  }
}

async function fetchIpGeodata(ip) {
  if (!ip) return { country: null, countryCode: null };
  try {
    const res = await fetch(
      `http://ip-api.com/json/${ip}?fields=status,country,countryCode`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) return { country: null, countryCode: null };
    const data = await res.json();
    if (data.status !== 'success') return { country: null, countryCode: null };
    return { country: data.country || null, countryCode: data.countryCode || null };
  } catch (e) {
    console.warn('[Aegis] ip-api.com lookup failed for', ip, ':', e.message);
    return { country: null, countryCode: null };
  }
}

// Private scoring helpers (duplicated from domain-analyzer.js for service worker context)
const _HIGH_RISK_COUNTRIES = [
  'CN', 'RU', 'KP', 'IR', 'NG', 'UA', 'RO', 'BG', 'VN', 'PK',
  'ID', 'BR', 'EG', 'GH', 'IN', 'TZ', 'KE', 'MA', 'BY', 'MD'
];

const _SCORE_DEDUCTIONS = {
  AGE_HIGH_RISK: 30,
  AGE_MEDIUM_RISK: 20,
  AGE_LOW_RISK: 10,
  HIGH_RISK_COUNTRY: 15,
  RDAP_UNAVAILABLE: 5,
  NO_REG_DATE: 10,
};

function _extractBaseDomainBg(hostname) {
  if (!hostname) return '';
  const parts = hostname.toLowerCase().split('.');
  if (parts.length < 2) return hostname.toLowerCase();
  if (parts.length >= 3 && parts[parts.length - 2].length <= 3 &&
      ['co', 'com', 'net', 'org', 'gov', 'edu', 'ac'].includes(parts[parts.length - 2])) {
    return parts.slice(-3).join('.');
  }
  return parts.slice(-2).join('.');
}

function _calculateDomainScore({ registrationDate, countryCode, rdapError, rdapNoDate }) {
  let score = 100;
  const scoreDetails = [];

  if (rdapError) {
    score -= _SCORE_DEDUCTIONS.RDAP_UNAVAILABLE;
    scoreDetails.push({ reason: 'RDAP lookup unavailable', deduction: _SCORE_DEDUCTIONS.RDAP_UNAVAILABLE });
  } else if (rdapNoDate) {
    score -= _SCORE_DEDUCTIONS.NO_REG_DATE;
    scoreDetails.push({ reason: 'No registration date found', deduction: _SCORE_DEDUCTIONS.NO_REG_DATE });
  }

  if (registrationDate) {
    try {
      const regDate = new Date(registrationDate);
      if (!isNaN(regDate.getTime())) {
        const ageDays = Math.floor((Date.now() - regDate.getTime()) / (1000 * 60 * 60 * 24));
        let deduction = 0, label = 'safe';
        if (ageDays < 30) { deduction = _SCORE_DEDUCTIONS.AGE_HIGH_RISK; label = 'high'; }
        else if (ageDays < 90) { deduction = _SCORE_DEDUCTIONS.AGE_MEDIUM_RISK; label = 'medium'; }
        else if (ageDays < 180) { deduction = _SCORE_DEDUCTIONS.AGE_LOW_RISK; label = 'low'; }
        if (deduction > 0) {
          score -= deduction;
          scoreDetails.push({ reason: `Domain age: ${ageDays} days (${label} risk)`, deduction });
        }
      }
    } catch { /* ignore parse error */ }
  }

  if (countryCode && _HIGH_RISK_COUNTRIES.includes(countryCode.toUpperCase())) {
    score -= _SCORE_DEDUCTIONS.HIGH_RISK_COUNTRY;
    scoreDetails.push({ reason: `Server hosted in high-risk region (${countryCode})`, deduction: _SCORE_DEDUCTIONS.HIGH_RISK_COUNTRY });
  }

  score = Math.max(0, Math.min(100, score));

  let level;
  if (score >= 80) level = 'safe';
  else if (score >= 50) level = 'caution';
  else level = 'danger';

  return { score, level, scoreDetails };
}

async function updateDomainBadge(tabId, score) {
  if (typeof score !== 'number') return;
  let color;
  if (score >= 80) color = '#1a7f37';
  else if (score >= 50) color = '#9a6700';
  else color = '#cf222e';
  try {
    await chrome.action.setBadgeBackgroundColor({ color, tabId });
    await chrome.action.setBadgeText({ text: String(score), tabId });
  } catch (e) {
    console.warn('[Aegis] Badge update failed:', e.message);
  }
}

async function clearDomainBadge(tabId) {
  try {
    await chrome.action.setBadgeText({ text: '', tabId });
  } catch { /* tab may have closed */ }
}

async function analyzeDomain(url, tabId) {
  if (!url || url.startsWith('chrome') || url.startsWith('about:') || url.startsWith('data:')) {
    return null;
  }

  let hostname;
  try {
    hostname = new URL(url).hostname;
  } catch {
    return null;
  }

  if (hostname === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(hostname) || hostname.endsWith('.local')) {
    return null;
  }

  const baseDomain = _extractBaseDomainBg(hostname);

  const cache = await getDomainCache();
  evictExpiredDomainCache(cache);

  if (cache[baseDomain]) {
    await updateDomainBadge(tabId, cache[baseDomain].score);
    return cache[baseDomain];
  }

  const rdapData = await fetchRdapData(baseDomain);
  const serverIp = await resolveDomainIp(baseDomain);
  const geoData = await fetchIpGeodata(serverIp);

  const scoreResult = _calculateDomainScore({
    registrationDate: rdapData.registrationDate,
    countryCode: geoData.countryCode,
    rdapError: rdapData.rdapError,
    rdapNoDate: rdapData.rdapNoDate,
  });

  const entry = {
    domain: baseDomain,
    registrationDate: rdapData.registrationDate,
    registrant: rdapData.registrant,
    serverIp,
    country: geoData.country,
    countryCode: geoData.countryCode,
    score: scoreResult.score,
    level: scoreResult.level,
    scoreDetails: scoreResult.scoreDetails,
    rdapError: rdapData.rdapError,
    cachedAt: Date.now(),
  };

  cache[baseDomain] = entry;
  await setDomainCache(cache);
  await updateDomainBadge(tabId, entry.score);

  // Track domain analysis event
  AegisTracker.trackDomainAnalysis(baseDomain, entry.score, entry.level);

  return entry;
}

// ---- URL Tracking via webNavigation ----

const URL_HISTORY_KEY = 'aegis_url_history';
const URL_TRACKER_SETTINGS_KEY = 'aegis_url_tracker_settings';

/**
 * Detect if a hostname is a local/non-web address (localhost, IP, .local, etc.)
 */
function _isLocalAccess(hostname) {
  if (!hostname) return false;
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '[::1]') return true;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) return true;  // IPv4
  if (hostname.startsWith('[') || hostname.includes(':')) return true;  // IPv6
  if (hostname.endsWith('.local') || hostname.endsWith('.localhost')) return true;
  // Single-word hostnames (no dots) are typically local network names
  if (!hostname.includes('.')) return true;
  return false;
}

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

  const categoryId = _isLocalAccess(hostname)
    ? 'local-access'
    : ((await categorizeUrlByDomain(url, categoriesData)) || 'uncategorized');
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
      chrome.storage.local.set({ [storageKey]: dayData }, () => {
        AegisTracker.trackUrlPageView(categoryId);
        resolve(categoryId);
      });
    });
  });
}

// Track completed navigations (top-level frames only)
if (chrome.webNavigation) {
  chrome.webNavigation.onCompleted.addListener(async (details) => {
    if (details.frameId !== 0) return; // top-level only
    try {
      const tab = await chrome.tabs.get(details.tabId);
      if (!tab || !tab.url) return;

      const categoryId = await trackUrlView(tab.url, tab.title || '');

      // If uncategorized and feedback mode is ON, inject the feedback widget
      if (categoryId === 'uncategorized') {
        const settings = await new Promise(r =>
          chrome.storage.local.get([URL_TRACKER_SETTINGS_KEY], r)
        );
        const trackerSettings = settings[URL_TRACKER_SETTINGS_KEY] || {};

        if (trackerSettings.feedbackEnabled) {
          await injectFeedbackWidget(tab);
        }
      }
    } catch {
      // tab may have closed
    }
  });

  // Domain security analysis: runs on every completed top-level navigation
  chrome.webNavigation.onCompleted.addListener(async (details) => {
    if (details.frameId !== 0) return;
    try {
      const tab = await chrome.tabs.get(details.tabId);
      if (!tab || !tab.url) return;

      const url = tab.url;
      if (
        url.includes('mail.google.com') ||
        url.includes('outlook.live.com') ||
        url.includes('outlook.office.com') ||
        url.includes('outlook.office365.com')
      ) {
        await clearDomainBadge(details.tabId);
        return;
      }

      analyzeDomain(url, details.tabId).catch(e => {
        console.warn('[Aegis] Domain analysis error:', e.message);
      });
    } catch {
      // tab may have closed
    }
  });
}

async function injectFeedbackWidget(tab) {
  try {
    // Skip chrome:// and extension pages
    if (!tab.url || tab.url.startsWith('chrome') || tab.url.startsWith('about:')) return;

    const categoriesData = await loadUrlCategories();
    if (!categoriesData) return;

    let hostname;
    try {
      hostname = new URL(tab.url).hostname.replace(/^www\./, '');
    } catch {
      return;
    }

    const categoryList = categoriesData.categories.map(c => ({
      id: c.id,
      name: c.name,
      emoji: c.emoji
    }));

    // Inject data globals then the widget script
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (cats, domain, url) => {
        window.__aegisFeedbackCategories = cats;
        window.__aegisFeedbackDomain = domain;
        window.__aegisFeedbackUrl = url;
      },
      args: [categoryList, hostname, tab.url]
    });

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['src/ui/url-feedback.js']
    });
  } catch (e) {
    // Injection may fail on restricted pages — that's OK
    console.warn('[Aegis] Could not inject feedback widget:', e.message);
  }
}

// ---- Active Time Tracking ----
// Tracks how long the user actively views each page (tab focused + user active).
// Stores per-day time data in aegis_url_time_{date} keyed by domain+category.

const URL_TIME_KEY = 'aegis_url_time';
const TIME_FLUSH_INTERVAL = 15000; // flush accumulated time every 15s

let _activeSession = null;  // { tabId, url, domain, category, startTime }
let _isUserActive = true;   // idle API state
let _isWindowFocused = true;

function _startSession(tabId, url) {
  if (!url || url.startsWith('chrome://') || url.startsWith('chrome-extension://') || url.startsWith('about:') || url.startsWith('data:')) {
    _activeSession = null;
    return;
  }

  let hostname;
  try {
    hostname = new URL(url).hostname.replace(/^www\./, '');
  } catch {
    _activeSession = null;
    return;
  }

  _activeSession = {
    tabId,
    url,
    domain: hostname,
    category: null, // resolved lazily on flush
    startTime: Date.now()
  };
}

async function _flushSession() {
  if (!_activeSession) return;
  if (!_isUserActive || !_isWindowFocused) return;

  const now = Date.now();
  const elapsed = now - _activeSession.startTime;
  if (elapsed < 1000) return; // ignore sub-second

  // Resolve category if not yet done
  if (!_activeSession.category || _activeSession.category === 'null') {
    if (_isLocalAccess(_activeSession.domain)) {
      _activeSession.category = 'local-access';
    } else {
      const categoriesData = await loadUrlCategories();
      if (!_activeSession) return; // session may have been cleared during await
      if (categoriesData) {
        _activeSession.category = (await categorizeUrlByDomain(_activeSession.url, categoriesData)) || 'uncategorized';
      } else {
        _activeSession.category = 'uncategorized';
      }
    }
  }

  if (!_activeSession) return; // session may have been cleared during await

  const dateKey = getDateKeyBg(new Date());
  const storageKey = `${URL_TIME_KEY}_${dateKey}`;

  await new Promise((resolve) => {
    chrome.storage.local.get([storageKey], (result) => {
      const dayTime = result[storageKey] || { domains: {}, categories: {}, totalMs: 0 };

      // Accumulate by domain
      if (!_activeSession) { resolve(); return; } // guard inside callback
      if (!dayTime.domains[_activeSession.domain]) {
        dayTime.domains[_activeSession.domain] = { ms: 0, category: _activeSession.category };
      }
      dayTime.domains[_activeSession.domain].ms += elapsed;
      dayTime.domains[_activeSession.domain].category = _activeSession.category;

      // Accumulate by category
      if (!dayTime.categories[_activeSession.category]) {
        dayTime.categories[_activeSession.category] = 0;
      }
      dayTime.categories[_activeSession.category] += elapsed;

      dayTime.totalMs += elapsed;

      chrome.storage.local.set({ [storageKey]: dayTime }, resolve);
    });
  });

  // Reset start time for next interval
  _activeSession.startTime = now;
}

async function _endSession() {
  await _flushSession();
  _activeSession = null;
}

// When active tab changes
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  await _flushSession();
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (tab && tab.url) {
      _startSession(activeInfo.tabId, tab.url);
    } else {
      _activeSession = null;
    }
  } catch {
    _activeSession = null;
  }
});

// When tab URL changes (SPA navigations, user navigates within tab)
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.url && _activeSession && _activeSession.tabId === tabId) {
    await _flushSession();
    _startSession(tabId, changeInfo.url);
  }
});

// When window focus changes
chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    // All windows lost focus
    await _flushSession();
    _isWindowFocused = false;
  } else {
    _isWindowFocused = true;
    // Re-start session for current active tab in this window
    try {
      const [tab] = await chrome.tabs.query({ active: true, windowId });
      if (tab && tab.url) {
        _startSession(tab.id, tab.url);
      }
    } catch {
      // ignore
    }
  }
});

// Idle detection: user idle (screen off, locked, AFK)
chrome.idle.setDetectionInterval(60); // 60 seconds
chrome.idle.onStateChanged.addListener(async (newState) => {
  if (newState === 'active') {
    _isUserActive = true;
    // Resume tracking current tab
    try {
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (tab && tab.url) {
        _startSession(tab.id, tab.url);
      }
    } catch {
      // ignore
    }
  } else {
    // 'idle' or 'locked'
    await _flushSession();
    _isUserActive = false;
    _activeSession = null;
  }
});

// Periodic flush using alarm (service worker may suspend, so use alarm)
chrome.alarms.create('aegis-time-flush', { periodInMinutes: 0.25 }); // every 15s

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

// ---- URL Categories Sync ----

const URL_CATEGORIES_SYNC_KEY = 'aegis_url_categories_last_sync';

async function syncUrlCategories() {
  try {
    const res = await fetch(`${AEGIS_API_BASE_URL}/lists/url-categories/full`, {
      method: 'GET',
      headers: { 'X-Extension-Version': _getExtensionVersion() },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data || !Array.isArray(data.categories)) throw new Error('Invalid response format');

    // Cache the synced data in local storage
    await new Promise(resolve => {
      chrome.storage.local.set({
        aegis_url_categories_synced: data,
        [URL_CATEGORIES_SYNC_KEY]: Date.now(),
      }, resolve);
    });

    // Invalidate the in-memory URL categories cache so next navigation uses fresh data
    _urlCategoriesCache = null;
    _sortedDomainLookup = null;

    console.log('[Aegis] URL categories synced:', data.categories.length, 'categories');
    const totalDomains = data.categories.reduce((sum, c) => sum + (c.domains ? c.domains.length : 0), 0);
    return { success: true, categoryCount: data.categories.length, totalDomains, updatedAt: data.updatedAt };
  } catch (e) {
    console.error('[Aegis] URL categories sync failed:', e);
    return { success: false, error: e.message };
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
  if (alarm.name === 'aegis-time-flush') {
    _flushSession();
  }
  if (alarm.name === 'aegis-url-categories-sync') {
    syncUrlCategories();
  }
  if (alarm.name === 'aegis-domain-cache-cleanup') {
    getDomainCache().then(cache => {
      setDomainCache(evictExpiredDomainCache(cache));
    });
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
      if (key.startsWith(URL_HISTORY_KEY + '_') || key.startsWith(URL_TIME_KEY + '_')) {
        const prefix = key.startsWith(URL_HISTORY_KEY) ? URL_HISTORY_KEY + '_' : URL_TIME_KEY + '_';
        const dateStr = key.replace(prefix, '');
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

// ---- Migration: reclassify localhost/IP time data as 'local-access' ----

async function _migrateLocalAccessTimeData() {
  chrome.storage.local.get(null, (all) => {
    const updates = {};
    for (const key of Object.keys(all)) {
      if (!key.startsWith('aegis_url_time_')) continue;
      const dayData = all[key];
      if (!dayData || !dayData.domains) continue;

      let changed = false;
      for (const [domain, info] of Object.entries(dayData.domains)) {
        if (_isLocalAccess(domain) && info.category !== 'local-access') {
          const oldCat = info.category || 'uncategorized';
          const ms = info.ms || 0;

          // Move ms from old category to local-access
          if (dayData.categories && dayData.categories[oldCat]) {
            dayData.categories[oldCat] -= ms;
            if (dayData.categories[oldCat] <= 0) delete dayData.categories[oldCat];
          }
          if (!dayData.categories) dayData.categories = {};
          dayData.categories['local-access'] = (dayData.categories['local-access'] || 0) + ms;

          info.category = 'local-access';
          changed = true;
        }
      }

      // Also clean up 'null' category key
      if (dayData.categories && dayData.categories['null']) {
        const nullMs = dayData.categories['null'];
        delete dayData.categories['null'];
        dayData.categories['uncategorized'] = (dayData.categories['uncategorized'] || 0) + nullMs;
        changed = true;
      }

      if (changed) updates[key] = dayData;
    }

    if (Object.keys(updates).length > 0) {
      chrome.storage.local.set(updates, () => {
        console.log('[Aegis] Migrated', Object.keys(updates).length, 'days of time data for local-access');
      });
    }
  });
}

// ---- Default settings ----

const DEFAULT_SETTINGS = {
  eulaAccepted: false,
  dataFeedbackEnabled: false,
  analysisMode: 'local',
  analysisDebug: false,
  aiSettings: {
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '',
    model: 'gpt-5-nano-2025-08-07'
  },
  categories: [
    { id: 'work', name: chrome.i18n.getMessage('catWork') || 'Work', emoji: 'briefcase', color: '#4285f4', bgColor: '#e8f0fe', keywords: ['meeting', '會議', 'project', '專案', 'deadline', 'invoice', '發票', 'report', '報告'] },
    { id: 'shopping', name: chrome.i18n.getMessage('catShopping') || 'Shopping', emoji: 'shopping-cart', color: '#ff6d00', bgColor: '#fff3e0', keywords: ['order', '訂單', 'shipping', '出貨', 'receipt', 'purchase', 'delivery', '配送'] },
    { id: 'finance', name: chrome.i18n.getMessage('catFinance') || 'Finance', emoji: 'credit-card', color: '#00897b', bgColor: '#e0f2f1', keywords: ['payment', '付款', 'bank', '銀行', 'transfer', '帳單', 'bill', 'credit', 'invoice'] },
    { id: 'social', name: chrome.i18n.getMessage('catSocial') || 'Social', emoji: 'user', color: '#9c27b0', bgColor: '#f3e5f5', keywords: ['invitation', '邀請', 'follow', 'friend', 'connect', 'linkedin', 'facebook'] },
    { id: 'promotions', name: chrome.i18n.getMessage('catPromotions') || 'Promotions', emoji: 'tag', color: '#e91e63', bgColor: '#fce4ec', keywords: ['sale', '特價', 'discount', '折扣', 'offer', '優惠', 'promo', 'newsletter'] },
    { id: 'security', name: chrome.i18n.getMessage('catSecurity') || 'Security', emoji: 'lock', color: '#f44336', bgColor: '#ffebee', keywords: ['verify', '驗證', 'password', '密碼', 'secure', 'unauthorized', 'breach', 'phishing'] },
    { id: 'notifications', name: chrome.i18n.getMessage('catNotifications') || 'Notifications', emoji: 'clock', color: '#607d8b', bgColor: '#eceff1', keywords: ['notification', '通知', 'alert', 'update', 'reminder', 'otp', 'confirm'] }
  ]
};

chrome.runtime.onInstalled.addListener(async () => {
  // Initialize GA4 tracker and fire install event
  await AegisTracker.init();
  AegisTracker.trackInstall(_getExtensionVersion());

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

  // Schedule weekly URL categories sync (every 7 days)
  chrome.alarms.create('aegis-url-categories-sync', { periodInMinutes: 10080 });

  // Schedule daily domain cache cleanup
  chrome.alarms.create('aegis-domain-cache-cleanup', { periodInMinutes: 1440 });

  // Clear domain cache on install/update so RDAP data is refreshed
  setDomainCache({});

  // Initial URL categories sync on install/update
  syncUrlCategories();

  // One-time migration: reclassify localhost/IP time data as 'local-access'
  _migrateLocalAccessTimeData();
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
      sendResponse({ success: false, error: chrome.i18n.getMessage('whitelistNotSet') || 'Whitelist URL not set' });
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

  if (message.type === 'OPEN_TAB') {
    chrome.tabs.create({ url: message.url });
    return false;
  }

  if (message.type === 'CHECK_NANO_AVAILABILITY') {
    // Use availability() to check status without triggering a download.
    // create() is only used when the user explicitly triggers download.
    try {
      if (!('LanguageModel' in self)) {
        sendResponse({ status: 'no-api' });
        return true;
      }
      LanguageModel.availability({
        expectedInputLanguages: ['en', 'zh', 'ja'],
        expectedOutputLanguages: ['en']
      }).then(status => {
        // Normalize: 'readily' (older Chrome) → 'available'
        const normalized = status === 'readily' ? 'available' : status;
        // Map Chrome's 'after-download' to our 'downloadable'
        const mapped = normalized === 'after-download' ? 'downloadable' : normalized;
        sendResponse({ status: mapped || 'unavailable' });
      }).catch(() => {
        sendResponse({ status: 'unavailable' });
      });
    } catch (e) {
      sendResponse({ status: 'error', error: e.message });
    }
    return true;
  }

  if (message.type === 'PROBE_NANO_CREATE') {
    // Actually try LanguageModel.create() to verify the model is downloaded
    try {
      if (!('LanguageModel' in self)) {
        sendResponse({ ok: false });
        return true;
      }
      LanguageModel.create({
        expectedInputLanguages: ['en'],
        expectedOutputLanguages: ['en']
      }).then(session => {
        session.destroy();
        sendResponse({ ok: true });
      }).catch(() => {
        sendResponse({ ok: false });
      });
    } catch (e) {
      sendResponse({ ok: false });
    }
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
          const isOffline = error instanceof TypeError && (error.message === 'Failed to fetch' || error.message.includes('network'));
          sendResponse({ error: isOffline ? 'network_offline' : error.message });
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
          const isOffline = error instanceof TypeError && (error.message === 'Failed to fetch' || error.message.includes('network'));
          sendResponse({ error: isOffline ? 'network_offline' : error.message });
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

  if (message.type === 'SUBMIT_EMAIL_FEEDBACK') {
    const { senderDomain, urlDomains, companyName } = message;
    submitEmailDomainFeedback(senderDomain, urlDomains, companyName);
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === 'SAVE_SETTINGS') {
    chrome.storage.sync.set(message.settings, () => {
      // Track settings changes
      if (message.settings.analysisMode) {
        AegisTracker.trackSettingsChange('analysisMode', message.settings.analysisMode);
      }
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

  if (message.type === 'SYNC_URL_CATEGORIES') {
    syncUrlCategories().then((result) => {
      sendResponse(result);
    }).catch((err) => {
      sendResponse({ success: false, error: err.message || 'Unknown error' });
    });
    return true;
  }

  if (message.type === 'GET_URL_CATEGORIES_SYNC_STATUS') {
    chrome.storage.local.get([URL_CATEGORIES_SYNC_KEY, 'aegis_url_categories_synced'], (result) => {
      const lastSync = result[URL_CATEGORIES_SYNC_KEY] || null;
      const synced = result.aegis_url_categories_synced || null;
      let categoryCount = 0;
      let totalDomains = 0;
      if (synced && Array.isArray(synced.categories)) {
        categoryCount = synced.categories.length;
        totalDomains = synced.categories.reduce((sum, c) => sum + (c.domains ? c.domains.length : 0), 0);
      }
      sendResponse({ lastSync, categoryCount, totalDomains });
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
    loadUrlCategories().then(async (data) => {
      const catId = await categorizeUrlByDomain(message.url, data);
      sendResponse({ categoryId: catId });
    });
    return true;
  }

  if (message.type === 'GET_TIME_DATA') {
    // Flush current session first to get latest data
    _flushSession().then(() => {
      const days = message.days || 8;
      const now = new Date();
      const keys = [];
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        keys.push(`${URL_TIME_KEY}_${getDateKeyBg(d)}`);
      }
      chrome.storage.local.get(keys, (data) => {
        const result = {};
        for (const key of keys) {
          const dateStr = key.replace(URL_TIME_KEY + '_', '');
          result[dateStr] = data[key] || { domains: {}, categories: {}, totalMs: 0 };
        }
        sendResponse({ timeData: result });
      });
    });
    return true;
  }

  if (message.type === 'SAVE_URL_LABEL') {
    const { domain, categoryId, url } = message;
    const USER_LABELS_KEY = 'aegis_url_user_labels';
    // Submit feedback to backend (fire-and-forget, only when a specific URL is available)
    if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
      submitUrlCategoryFeedback(url, categoryId, 'uncategorized');
    }
    // Invalidate sorted lookup so future navigations use the new label
    _sortedDomainLookup = null;
    chrome.storage.local.get([USER_LABELS_KEY], (result) => {
      const labels = result[USER_LABELS_KEY] || {};
      labels[domain] = categoryId;
      chrome.storage.local.set({ [USER_LABELS_KEY]: labels }, () => {
        // Re-categorize ALL days' history + time data for this domain (past 30 days)
        const allKeys = [];
        for (let i = 0; i < 30; i++) {
          const d = new Date();
          d.setDate(d.getDate() - i);
          const dk = getDateKeyBg(d);
          allKeys.push(`${URL_HISTORY_KEY}_${dk}`);
          allKeys.push(`${URL_TIME_KEY}_${dk}`);
        }

        chrome.storage.local.get(allKeys, (res) => {
          const updates = {};

          for (const key of allKeys) {
            if (key.startsWith(URL_HISTORY_KEY + '_')) {
              // Update history views
              const dayData = res[key];
              if (dayData && dayData.views) {
                let changed = false;
                for (const view of dayData.views) {
                  if (view.domain === domain && (view.category === 'uncategorized' || !view.category || view.category === 'null')) {
                    view.category = categoryId;
                    changed = true;
                  }
                }
                if (changed) updates[key] = dayData;
              }
            } else if (key.startsWith(URL_TIME_KEY + '_')) {
              // Update time data: move ms from old category to new category
              const timeData = res[key];
              if (timeData && timeData.domains && timeData.domains[domain]) {
                const domainEntry = timeData.domains[domain];
                const oldCat = domainEntry.category || 'uncategorized';
                if (oldCat !== categoryId) {
                  const ms = domainEntry.ms || 0;
                  // Remove from old category
                  const oldKey = oldCat === 'null' ? 'null' : oldCat;
                  if (timeData.categories[oldKey]) {
                    timeData.categories[oldKey] -= ms;
                    if (timeData.categories[oldKey] <= 0) {
                      delete timeData.categories[oldKey];
                    }
                  }
                  // Clean up 'null' key if present
                  if (timeData.categories['null']) {
                    const nullMs = timeData.categories['null'];
                    delete timeData.categories['null'];
                    timeData.categories['uncategorized'] = (timeData.categories['uncategorized'] || 0) + nullMs;
                  }
                  // Add to new category
                  timeData.categories[categoryId] = (timeData.categories[categoryId] || 0) + ms;
                  domainEntry.category = categoryId;
                  updates[key] = timeData;
                }
              }
            }
          }

          if (Object.keys(updates).length > 0) {
            chrome.storage.local.set(updates, () => {
              sendResponse({ ok: true });
            });
          } else {
            sendResponse({ ok: true });
          }
        });
      });
    });
    return true;
  }

  if (message.type === 'DOMAIN_ANALYZE') {
    const { url, tabId } = message;
    analyzeDomain(url, tabId)
      .then(entry => sendResponse({ entry }))
      .catch(e => sendResponse({ entry: null, error: e.message }));
    return true;
  }

  if (message.type === 'GET_DOMAIN_CACHE') {
    const { domain } = message;
    getDomainCache().then(cache => {
      const entry = cache[domain] || null;
      if (entry && Date.now() - entry.cachedAt > DOMAIN_CACHE_TTL_MS) {
        sendResponse({ entry: null });
      } else {
        sendResponse({ entry });
      }
    });
    return true;
  }

  if (message.type === 'GA_TRACK') {
    AegisTracker.sendEvent(message.event, message.params || {});
    sendResponse({ ok: true });
    return true;
  }
});
