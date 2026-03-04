'use strict';

const WhitelistManager = (() => {
  let _whitelist = null;

  // Load whitelist from background cache into memory
  async function init() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'GET_WHITELIST' }, (res) => {
        if (chrome.runtime.lastError) {
          console.warn('[Aegis] WhitelistManager init:', chrome.runtime.lastError.message);
          resolve();
          return;
        }
        _whitelist = (res && res.whitelist) ? res.whitelist : null;
        resolve();
      });
    });
  }

  function getWhitelist() {
    return _whitelist;
  }

  // Find the service entry whose senderDomains match the given email's domain
  function findServiceBySenderDomain(senderEmail) {
    if (!_whitelist || !_whitelist.services || !senderEmail) return null;
    const domain = (senderEmail.split('@')[1] || '').toLowerCase();
    if (!domain) return null;
    return _whitelist.services.find(s =>
      s.senderDomains.some(d => {
        const sd = d.toLowerCase();
        return domain === sd || domain.endsWith('.' + sd);
      })
    ) || null;
  }

  // Check if a URL uses a known short URL service
  function isKnownShortUrl(url) {
    if (!_whitelist || !_whitelist.shortUrlServices) return false;
    try {
      const hostname = new URL(url).hostname.toLowerCase();
      return _whitelist.shortUrlServices.includes(hostname);
    } catch {
      return false;
    }
  }

  // Check if a domain belongs to a service's allowed service domains
  function isDomainInService(domain, service) {
    if (!domain || !service) return false;
    const d = domain.toLowerCase();
    return service.serviceDomains.some(sd => {
      const s = sd.toLowerCase();
      return d === s || d.endsWith('.' + s);
    });
  }

  return { init, getWhitelist, findServiceBySenderDomain, isKnownShortUrl, isDomainInService };
})();

window.WhitelistManager = WhitelistManager;
