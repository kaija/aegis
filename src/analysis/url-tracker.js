/**
 * URL Tracker Module
 * Tracks page views by category, stores history in chrome.storage.local
 * Provides analytics data for trend charts and category breakdowns
 */
const UrlTracker = (() => {
  const STORAGE_KEY = 'aegis_url_history';
  const CATEGORIES_KEY = 'aegis_url_categories';
  const SETTINGS_KEY = 'aegis_url_tracker_settings';
  const USER_LABELS_KEY = 'aegis_url_user_labels';
  const MAX_HISTORY_DAYS = 30;

  let _sortedLookup = null; // sorted by domain length desc for longest-match-first
  let _categories = null;   // full category list
  let _excludedDomains = null;
  let _settings = null;

  /**
   * Initialize the tracker - load category mapping and settings
   */
  async function init() {
    try {
      const data = await _loadCategories();
      if (data) {
        _categories = data.categories || [];
        _excludedDomains = new Set(data.excludedDomains || []);
        _buildSortedLookup();
      }
      _settings = await _loadSettings();

      // Merge user labels into lookup (user labels are highest priority, added at front)
      const userLabels = await _loadUserLabels();
      if (_sortedLookup) {
        const userEntries = Object.entries(userLabels).map(([domain, categoryId]) => ({
          domain, categoryId, hasPath: domain.includes('/')
        }));
        // User labels go first (highest priority), sorted longest first among themselves
        userEntries.sort((a, b) => b.domain.length - a.domain.length);
        _sortedLookup = [...userEntries, ..._sortedLookup];
      }
    } catch (e) {
      console.warn('[Aegis URL Tracker] Init failed:', e);
    }
  }

  function _buildSortedLookup() {
    const entries = [];
    for (const cat of _categories) {
      for (const domain of cat.domains) {
        entries.push({ domain, categoryId: cat.id, hasPath: domain.includes('/') });
      }
    }
    // Sort by domain length descending — longer (more specific) matches win
    entries.sort((a, b) => b.domain.length - a.domain.length);
    _sortedLookup = entries;
  }

  async function _loadCategories() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'GET_URL_CATEGORIES' }, (response) => {
        resolve(response ? response.data : null);
      });
    });
  }

  async function _loadSettings() {
    return new Promise((resolve) => {
      chrome.storage.local.get([SETTINGS_KEY], (result) => {
        resolve(result[SETTINGS_KEY] || { feedbackEnabled: false });
      });
    });
  }

  async function _loadUserLabels() {
    return new Promise((resolve) => {
      chrome.storage.local.get([USER_LABELS_KEY], (result) => {
        resolve(result[USER_LABELS_KEY] || {});
      });
    });
  }

  /**
   * Extract base domain from a URL
   */
  function _extractDomain(url) {
    try {
      const u = new URL(url);
      return u.hostname.replace(/^www\./, '');
    } catch {
      return null;
    }
  }

  /**
   * Check if URL should be excluded from tracking
   */
  function _isExcluded(url) {
    if (!url) return true;
    if (!_excludedDomains) return false;

    // Check protocol-based exclusions
    for (const excl of _excludedDomains) {
      if (excl.includes('://') && url.startsWith(excl)) return true;
    }

    const domain = _extractDomain(url);
    if (!domain) return true;

    // Check domain exclusions (short URLs, localhost, etc.)
    for (const excl of _excludedDomains) {
      if (!excl.includes('://') && (domain === excl || domain.endsWith('.' + excl))) return true;
    }

    return false;
  }

  /**
   * Categorize a URL by matching against sorted lookup (longest match first).
   * e.g. gemini.google.com → "ai" (not "search" from google.com)
   */
  function categorizeUrl(url) {
    if (_isExcluded(url)) return null;
    if (!_sortedLookup) return null;

    const domain = _extractDomain(url);
    if (!domain) return null;

    let pathname = '';
    try {
      pathname = new URL(url).pathname;
    } catch {
      // ignore
    }

    for (const entry of _sortedLookup) {
      if (entry.hasPath) {
        const pathDomain = domain + pathname;
        if (pathDomain.startsWith(entry.domain)) return entry.categoryId;
      } else if (domain === entry.domain || domain.endsWith('.' + entry.domain)) {
        return entry.categoryId;
      }
    }

    return null;
  }

  /**
   * Record a page view
   */
  async function trackPageView(url, title) {
    if (_isExcluded(url)) return null;

    const domain = _extractDomain(url);
    const categoryId = categorizeUrl(url);
    const dateKey = _getDateKey(new Date());

    const entry = {
      url,
      domain,
      title: (title || '').slice(0, 100),
      category: categoryId || 'uncategorized',
      timestamp: Date.now()
    };

    await _appendToHistory(dateKey, entry);

    return {
      categoryId: entry.category,
      isUncategorized: !categoryId,
      domain
    };
  }

  async function _appendToHistory(dateKey, entry) {
    const storageKey = `${STORAGE_KEY}_${dateKey}`;
    return new Promise((resolve) => {
      chrome.storage.local.get([storageKey], (result) => {
        const dayData = result[storageKey] || { views: [], totalCount: 0 };
        dayData.views.push(entry);
        dayData.totalCount = dayData.views.length;
        chrome.storage.local.set({ [storageKey]: dayData }, resolve);
      });
    });
  }

  function _getDateKey(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  /**
   * Get daily view counts for the past N days
   * Returns array of { date, count, dayOfWeek }
   */
  async function getDailyViews(days = 8) {
    const result = [];
    const now = new Date();

    const keys = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateKey = _getDateKey(d);
      keys.push({
        storageKey: `${STORAGE_KEY}_${dateKey}`,
        date: dateKey,
        dayOfWeek: d.getDay()
      });
    }

    const storageKeys = keys.map(k => k.storageKey);
    const data = await new Promise((resolve) => {
      chrome.storage.local.get(storageKeys, resolve);
    });

    for (const k of keys) {
      const dayData = data[k.storageKey];
      result.push({
        date: k.date,
        count: dayData ? dayData.totalCount : 0,
        dayOfWeek: k.dayOfWeek
      });
    }

    return result;
  }

  /**
   * Get category breakdown for a date range
   * Returns array of { categoryId, name, emoji, color, bgColor, count }
   */
  async function getCategoryBreakdown(days = 8) {
    const now = new Date();
    const keys = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      keys.push(`${STORAGE_KEY}_${_getDateKey(d)}`);
    }

    const data = await new Promise((resolve) => {
      chrome.storage.local.get(keys, resolve);
    });

    const counts = {};
    for (const key of keys) {
      const dayData = data[key];
      if (!dayData || !dayData.views) continue;
      for (const v of dayData.views) {
        counts[v.category] = (counts[v.category] || 0) + 1;
      }
    }

    const breakdown = [];
    for (const [catId, count] of Object.entries(counts)) {
      const cat = _categories ? _categories.find(c => c.id === catId) : null;
      breakdown.push({
        categoryId: catId,
        name: cat ? cat.name : (catId === 'uncategorized' ? 'Uncategorized' : catId),
        emoji: cat ? cat.emoji : '❓',
        color: cat ? cat.color : '#9e9e9e',
        bgColor: cat ? cat.bgColor : '#f5f5f5',
        count
      });
    }

    // Sort by count descending
    breakdown.sort((a, b) => b.count - a.count);
    return breakdown;
  }

  /**
   * Predict today's page view count based on same-weekday historical average
   */
  async function predictToday() {
    const now = new Date();
    const todayDow = now.getDay();
    const todayKey = `${STORAGE_KEY}_${_getDateKey(now)}`;

    // Get current today count
    const todayData = await new Promise((resolve) => {
      chrome.storage.local.get([todayKey], resolve);
    });
    const currentCount = todayData[todayKey] ? todayData[todayKey].totalCount : 0;

    // Gather same-weekday data from past 4 weeks
    const sameDayCounts = [];
    for (let w = 1; w <= 4; w++) {
      const d = new Date(now);
      d.setDate(d.getDate() - (w * 7));
      const key = `${STORAGE_KEY}_${_getDateKey(d)}`;
      const data = await new Promise((resolve) => {
        chrome.storage.local.get([key], resolve);
      });
      if (data[key]) {
        sameDayCounts.push(data[key].totalCount);
      }
    }

    let predicted = currentCount;
    if (sameDayCounts.length > 0) {
      const avg = sameDayCounts.reduce((a, b) => a + b, 0) / sameDayCounts.length;
      // Weight: historical average with current pace
      const hoursElapsed = now.getHours() + now.getMinutes() / 60;
      const hoursInDay = 24;
      if (hoursElapsed > 1) {
        const paceProjection = (currentCount / hoursElapsed) * hoursInDay;
        predicted = Math.round((avg * 0.4) + (paceProjection * 0.6));
      } else {
        predicted = Math.round(avg);
      }
    }

    return {
      current: currentCount,
      predicted: Math.max(predicted, currentCount),
      historicalAvg: sameDayCounts.length > 0
        ? Math.round(sameDayCounts.reduce((a, b) => a + b, 0) / sameDayCounts.length)
        : 0,
      sampleWeeks: sameDayCounts.length
    };
  }

  /**
   * Save a user label for a domain -> category mapping
   */
  async function saveUserLabel(domain, categoryId) {
    const labels = await _loadUserLabels();
    labels[domain] = categoryId;
    // Update in-memory lookup: remove old entry for this domain, insert new one
    if (_sortedLookup) {
      _sortedLookup = _sortedLookup.filter(e => e.domain !== domain);
      // Insert at correct position (sorted by length desc)
      const entry = { domain, categoryId, hasPath: domain.includes('/') };
      const idx = _sortedLookup.findIndex(e => e.domain.length <= domain.length);
      if (idx === -1) {
        _sortedLookup.push(entry);
      } else {
        _sortedLookup.splice(idx, 0, entry);
      }
    }
    return new Promise((resolve) => {
      chrome.storage.local.set({ [USER_LABELS_KEY]: labels }, resolve);
    });
  }

  /**
   * Export all user labels as JSON
   */
  async function exportUserLabels() {
    return _loadUserLabels();
  }

  /**
   * Export full history for date range
   */
  async function exportHistory(days = 30) {
    const now = new Date();
    const keys = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      keys.push(`${STORAGE_KEY}_${_getDateKey(d)}`);
    }

    const data = await new Promise((resolve) => {
      chrome.storage.local.get(keys, resolve);
    });

    const allViews = [];
    for (const key of keys) {
      if (data[key] && data[key].views) {
        allViews.push(...data[key].views);
      }
    }
    return allViews;
  }

  /**
   * Get settings
   */
  function getSettings() {
    return _settings || { feedbackEnabled: false };
  }

  /**
   * Update settings
   */
  async function updateSettings(newSettings) {
    _settings = Object.assign(_settings || {}, newSettings);
    return new Promise((resolve) => {
      chrome.storage.local.set({ [SETTINGS_KEY]: _settings }, resolve);
    });
  }

  /**
   * Get all available categories for feedback dropdown
   */
  function getCategories() {
    return (_categories || []).map(c => ({
      id: c.id,
      name: c.name,
      emoji: c.emoji
    }));
  }

  /**
   * Clean up old history data beyond MAX_HISTORY_DAYS
   */
  async function cleanup() {
    const now = new Date();
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() - MAX_HISTORY_DAYS);

    // Get all keys and remove old ones
    return new Promise((resolve) => {
      chrome.storage.local.get(null, (all) => {
        const keysToRemove = [];
        for (const key of Object.keys(all)) {
          if (key.startsWith(STORAGE_KEY + '_')) {
            const dateStr = key.replace(STORAGE_KEY + '_', '');
            if (dateStr < _getDateKey(cutoff)) {
              keysToRemove.push(key);
            }
          }
        }
        if (keysToRemove.length > 0) {
          chrome.storage.local.remove(keysToRemove, resolve);
        } else {
          resolve();
        }
      });
    });
  }

  return {
    init,
    categorizeUrl,
    trackPageView,
    getDailyViews,
    getCategoryBreakdown,
    predictToday,
    saveUserLabel,
    exportUserLabels,
    exportHistory,
    getSettings,
    updateSettings,
    getCategories,
    cleanup
  };
})();

if (typeof window !== 'undefined') {
  window.UrlTracker = UrlTracker;
}
