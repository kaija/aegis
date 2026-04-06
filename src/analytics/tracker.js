'use strict';

/**
 * GA4 Measurement Protocol Tracker for Chrome Extension
 *
 * Chrome extensions cannot load external scripts (gtag.js) due to CSP.
 * This module sends events via the GA4 Measurement Protocol instead.
 *
 * Setup: Create an API secret in GA4 Admin → Data Streams → Measurement Protocol API secrets
 * then set it via chrome.storage.local { aegis_ga_api_secret: 'your-secret' }
 * or hardcode below after obtaining it.
 */
var AegisTracker = (() => {
  const MEASUREMENT_ID = 'G-QR7JYT0RCX';
  const API_SECRET = '__GA_API_SECRET__'; // Replaced at build time by Makefile
  const GA_ENDPOINT = 'https://www.google-analytics.com/mp/collect';
  const CLIENT_ID_KEY = 'aegis_ga_client_id';
  const SESSION_ID_KEY = 'aegis_ga_session_id';
  const SESSION_START_KEY = 'aegis_ga_session_start';
  const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 min

  let _clientId = null;
  let _sessionId = null;
  let _sessionStart = null;
  let _apiSecret = API_SECRET;

  /**
   * Initialize tracker — load or generate client ID and session
   */
  async function init() {
    try {
      const data = await _storageGet([CLIENT_ID_KEY, SESSION_ID_KEY, SESSION_START_KEY]);

      // Client ID: persistent across sessions
      _clientId = data[CLIENT_ID_KEY] || _generateId();
      if (!data[CLIENT_ID_KEY]) {
        await _storageSet({ [CLIENT_ID_KEY]: _clientId });
      }

      // Session management
      const now = Date.now();
      _sessionStart = data[SESSION_START_KEY] || 0;
      _sessionId = data[SESSION_ID_KEY] || null;

      if (!_sessionId || (now - _sessionStart) > SESSION_TIMEOUT_MS) {
        _sessionId = String(now);
        _sessionStart = now;
        await _storageSet({
          [SESSION_ID_KEY]: _sessionId,
          [SESSION_START_KEY]: _sessionStart,
        });
      }
    } catch (e) {
      console.warn('[Aegis Tracker] Init failed:', e);
      // Fallback: generate ephemeral IDs
      _clientId = _clientId || _generateId();
      _sessionId = _sessionId || String(Date.now());
    }
  }

  /**
   * Send a GA4 event via Measurement Protocol
   * @param {string} name - Event name (e.g. 'page_view', 'email_classified')
   * @param {Object} [params] - Event parameters
   */
  async function sendEvent(name, params = {}) {
    if (!_apiSecret || _apiSecret === '__GA_API_SECRET__') return; // Not injected at build time
    if (!_clientId) await init();

    const payload = {
      client_id: _clientId,
      events: [{
        name,
        params: {
          session_id: _sessionId,
          engagement_time_msec: '100',
          ...params,
        },
      }],
    };

    const url = `${GA_ENDPOINT}?measurement_id=${MEASUREMENT_ID}&api_secret=${_apiSecret}`;

    try {
      await fetch(url, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    } catch (e) {
      // Analytics should never break the extension
      console.warn('[Aegis Tracker] Send failed:', e.message);
    }
  }

  // ---- Convenience event methods ----

  /** Extension installed or updated */
  function trackInstall(version) {
    return sendEvent('extension_install', { extension_version: version });
  }

  /** Email classification completed */
  function trackClassification(mode, emailCount, categoryCount) {
    return sendEvent('email_classified', {
      analysis_mode: mode,
      email_count: String(emailCount),
      category_count: String(categoryCount),
    });
  }

  /** Email security scan completed */
  function trackSecurityScan(safetyScore, safetyLevel) {
    return sendEvent('security_scan', {
      safety_score: String(safetyScore),
      safety_level: safetyLevel,
    });
  }

  /** Domain security analysis */
  function trackDomainAnalysis(domain, score, level) {
    return sendEvent('domain_analysis', {
      domain,
      domain_score: String(score),
      domain_level: level,
    });
  }

  /** URL page view tracked */
  function trackUrlPageView(categoryId) {
    return sendEvent('url_page_view', {
      url_category: categoryId || 'uncategorized',
    });
  }

  /** Category action (panel click, bulk action) */
  function trackCategoryAction(action, categoryId) {
    return sendEvent('category_action', {
      action_type: action,
      category_id: categoryId,
    });
  }

  /** Settings changed */
  function trackSettingsChange(setting, value) {
    return sendEvent('settings_change', {
      setting_name: setting,
      setting_value: String(value),
    });
  }

  // ---- Internal helpers ----

  function _generateId() {
    // Crypto-random client ID in GA4 format
    const arr = new Uint8Array(16);
    crypto.getRandomValues(arr);
    return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('');
  }

  function _storageGet(keys) {
    return new Promise((resolve) => {
      chrome.storage.local.get(keys, resolve);
    });
  }

  function _storageSet(obj) {
    return new Promise((resolve) => {
      chrome.storage.local.set(obj, resolve);
    });
  }

  return {
    init,
    sendEvent,
    trackInstall,
    trackClassification,
    trackSecurityScan,
    trackDomainAnalysis,
    trackUrlPageView,
    trackCategoryAction,
    trackSettingsChange,
  };
})();

if (typeof window !== 'undefined') {
  window.AegisTracker = AegisTracker;
}
