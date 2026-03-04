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

  // Extract base domain (TLD + 1 level)
  // e.g., "mail.google.com" -> "google.com", "accounts.google.com" -> "google.com"
  function extractBaseDomain(hostname) {
    if (!hostname) return '';
    const parts = hostname.toLowerCase().split('.');
    if (parts.length < 2) return hostname.toLowerCase();
    // Handle special TLDs like .co.jp, .com.tw
    if (parts.length >= 3 && parts[parts.length - 2].length <= 3 &&
        ['co', 'com', 'net', 'org', 'gov', 'edu', 'ac'].includes(parts[parts.length - 2])) {
      return parts.slice(-3).join('.');
    }
    return parts.slice(-2).join('.');
  }

  // Find services by matching keywords in email content (subject + body)
  function findServicesByKeywords(emailContent) {
    if (!_whitelist || !_whitelist.services || !emailContent) return [];
    const lowerContent = emailContent.toLowerCase();
    return _whitelist.services.filter(s =>
      s.keywords && s.keywords.some(kw => lowerContent.includes(kw.toLowerCase()))
    );
  }

  // Find the service entry whose senderDomains match the given email's domain
  function findServiceBySenderDomain(senderEmail) {
    if (!_whitelist || !_whitelist.services || !senderEmail) return null;
    const domain = (senderEmail.split('@')[1] || '').toLowerCase();
    if (!domain) return null;
    const baseDomain = extractBaseDomain(domain);

    return _whitelist.services.find(s =>
      s.senderDomains.some(d => {
        const sd = d.toLowerCase();
        const senderBase = extractBaseDomain(sd);
        return baseDomain === senderBase || domain === sd || domain.endsWith('.' + sd);
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

  // Check if a domain belongs to a service's base domains (using base domain matching)
  function isDomainInService(hostname, service) {
    if (!hostname || !service) return false;
    const baseDomain = extractBaseDomain(hostname);

    // Check against service's baseDomains
    if (service.baseDomains) {
      const match = service.baseDomains.some(bd => {
        const serviceBase = extractBaseDomain(bd.toLowerCase());
        return baseDomain === serviceBase;
      });
      if (match) return true;
    }

    // Fallback to serviceDomains for backward compatibility
    const h = hostname.toLowerCase();
    return service.serviceDomains.some(sd => {
      const s = sd.toLowerCase();
      const serviceBase = extractBaseDomain(s);
      return baseDomain === serviceBase || h === s || h.endsWith('.' + s);
    });
  }

  return {
    init,
    getWhitelist,
    findServiceBySenderDomain,
    findServicesByKeywords,
    isKnownShortUrl,
    isDomainInService,
    extractBaseDomain
  };
})();

window.WhitelistManager = WhitelistManager;
