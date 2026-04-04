'use strict';

/**
 * Thin i18n wrapper — delegates to chrome.i18n.getMessage for brevity.
 * Falls back to the key name if no translation is found.
 *
 * Usage:
 *   t('panelTitle')               → "Aegis Email Analysis"
 *   t('panelFooterStats', 5, 3)   → "5 unread emails, 3 categories"
 */
window.t = function t(key) {
  var subs = Array.prototype.slice.call(arguments, 1);
  // chrome.i18n.getMessage expects an array of strings for substitutions
  if (subs.length > 0) {
    subs = subs.map(function (s) { return String(s); });
  }
  return chrome.i18n.getMessage(key, subs) || key;
};
