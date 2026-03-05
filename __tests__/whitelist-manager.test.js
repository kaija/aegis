'use strict';

const { describe, test, expect, beforeEach } = require('@jest/globals');
const fs = require('fs');
const path = require('path');

// Load module
const whitelistManagerCode = fs.readFileSync(path.join(__dirname, '../src/analysis/whitelist-manager.js'), 'utf8');
eval(whitelistManagerCode);

const testWhitelist = require('./fixtures/test-whitelist');

describe('WhitelistManager', () => {
  beforeEach(async () => {
    // Mock chrome.runtime.sendMessage to return test whitelist
    global.chrome.runtime.sendMessage.mockImplementation((msg, callback) => {
      if (msg.type === 'GET_WHITELIST') {
        callback({ whitelist: testWhitelist });
      }
    });
    
    await WhitelistManager.init();
  });

  describe('extractBaseDomain', () => {
    test('should extract base domain from subdomain', () => {
      expect(WhitelistManager.extractBaseDomain('mail.google.com')).toBe('google.com');
      expect(WhitelistManager.extractBaseDomain('accounts.google.com')).toBe('google.com');
    });

    test('should handle special TLDs', () => {
      expect(WhitelistManager.extractBaseDomain('example.co.jp')).toBe('example.co.jp');
      expect(WhitelistManager.extractBaseDomain('mail.example.com.tw')).toBe('example.com.tw');
    });

    test('should handle simple domains', () => {
      expect(WhitelistManager.extractBaseDomain('example.com')).toBe('example.com');
    });

    test('should handle empty or invalid input', () => {
      expect(WhitelistManager.extractBaseDomain('')).toBe('');
      expect(WhitelistManager.extractBaseDomain('localhost')).toBe('localhost');
    });
  });

  describe('findServiceBySenderDomain', () => {
    test('should find service by exact sender domain', () => {
      const service = WhitelistManager.findServiceBySenderDomain('user@github.com');
      expect(service).not.toBeNull();
      expect(service.name).toBe('GitHub');
    });

    test('should find service by subdomain', () => {
      const service = WhitelistManager.findServiceBySenderDomain('noreply@mail.google.com');
      expect(service).not.toBeNull();
      expect(service.name).toBe('Google');
    });

    test('should handle special TLD domains', () => {
      const service = WhitelistManager.findServiceBySenderDomain('order@amazon.co.jp');
      expect(service).not.toBeNull();
      expect(service.name).toBe('Amazon');
    });

    test('should return null for unknown domain', () => {
      const service = WhitelistManager.findServiceBySenderDomain('user@unknown-service.com');
      expect(service).toBeNull();
    });

    test('should return null for invalid email', () => {
      expect(WhitelistManager.findServiceBySenderDomain('invalid-email')).toBeNull();
      expect(WhitelistManager.findServiceBySenderDomain('')).toBeNull();
    });
  });

  describe('findServicesByKeywords', () => {
    test('should find services by keyword match', () => {
      const services = WhitelistManager.findServicesByKeywords('Your GitHub pull request was merged');
      expect(services.length).toBeGreaterThan(0);
      expect(services[0].name).toBe('GitHub');
    });

    test('should find multiple services', () => {
      const services = WhitelistManager.findServicesByKeywords('Amazon AWS order shipment');
      expect(services.length).toBeGreaterThan(0);
      expect(services.some(s => s.name === 'Amazon')).toBe(true);
    });

    test('should be case insensitive', () => {
      const services = WhitelistManager.findServicesByKeywords('GITHUB REPOSITORY');
      expect(services.length).toBeGreaterThan(0);
    });

    test('should return empty array for no matches', () => {
      const services = WhitelistManager.findServicesByKeywords('random text without keywords');
      expect(services.length).toBe(0);
    });

    test('should handle empty input', () => {
      expect(WhitelistManager.findServicesByKeywords('')).toEqual([]);
    });
  });

  describe('isDomainInService', () => {
    test('should match exact service domain', () => {
      const service = testWhitelist.services.find(s => s.name === 'GitHub');
      expect(WhitelistManager.isDomainInService('github.com', service)).toBe(true);
    });

    test('should match subdomain', () => {
      const service = testWhitelist.services.find(s => s.name === 'GitHub');
      expect(WhitelistManager.isDomainInService('api.github.com', service)).toBe(true);
    });

    test('should match base domain', () => {
      const service = testWhitelist.services.find(s => s.name === 'GitHub');
      expect(WhitelistManager.isDomainInService('raw.githubusercontent.com', service)).toBe(true);
    });

    test('should not match unrelated domain', () => {
      const service = testWhitelist.services.find(s => s.name === 'GitHub');
      expect(WhitelistManager.isDomainInService('evil-github.com', service)).toBe(false);
      expect(WhitelistManager.isDomainInService('github.com.evil.com', service)).toBe(false);
    });

    test('should handle null inputs', () => {
      const service = testWhitelist.services.find(s => s.name === 'GitHub');
      expect(WhitelistManager.isDomainInService('', service)).toBe(false);
      expect(WhitelistManager.isDomainInService('github.com', null)).toBe(false);
    });
  });

  describe('isPublicEmailDomain', () => {
    test('should detect public email domains', () => {
      expect(WhitelistManager.isPublicEmailDomain('gmail.com')).toBe(true);
      expect(WhitelistManager.isPublicEmailDomain('yahoo.com')).toBe(true);
      expect(WhitelistManager.isPublicEmailDomain('outlook.com')).toBe(true);
    });

    test('should match subdomains of public email services', () => {
      expect(WhitelistManager.isPublicEmailDomain('mail.yahoo.com')).toBe(true);
    });

    test('should not match corporate domains', () => {
      expect(WhitelistManager.isPublicEmailDomain('company.com')).toBe(false);
    });

    test('should handle empty input', () => {
      expect(WhitelistManager.isPublicEmailDomain('')).toBe(false);
    });
  });

  describe('isSuspiciousDomain', () => {
    test('should detect suspicious domains', () => {
      expect(WhitelistManager.isSuspiciousDomain('tempmail.com')).toBe(true);
      expect(WhitelistManager.isSuspiciousDomain('10minutemail.com')).toBe(true);
      expect(WhitelistManager.isSuspiciousDomain('guerrillamail.com')).toBe(true);
    });

    test('should match subdomains of suspicious services', () => {
      expect(WhitelistManager.isSuspiciousDomain('mail.tempmail.com')).toBe(true);
    });

    test('should not match legitimate domains', () => {
      expect(WhitelistManager.isSuspiciousDomain('gmail.com')).toBe(false);
      expect(WhitelistManager.isSuspiciousDomain('company.com')).toBe(false);
    });

    test('should handle empty input', () => {
      expect(WhitelistManager.isSuspiciousDomain('')).toBe(false);
    });
  });

  describe('isKnownShortUrl', () => {
    test('should detect known short URL services', () => {
      expect(WhitelistManager.isKnownShortUrl('https://bit.ly/abc123')).toBe(true);
      expect(WhitelistManager.isKnownShortUrl('https://tinyurl.com/xyz')).toBe(true);
    });

    test('should not match regular URLs', () => {
      expect(WhitelistManager.isKnownShortUrl('https://example.com/page')).toBe(false);
    });

    test('should handle invalid URLs', () => {
      expect(WhitelistManager.isKnownShortUrl('not-a-url')).toBe(false);
    });
  });

  describe('getWhitelist', () => {
    test('should return loaded whitelist', () => {
      const whitelist = WhitelistManager.getWhitelist();
      expect(whitelist).not.toBeNull();
      expect(whitelist.services).toBeDefined();
      expect(whitelist.publicEmailDomains).toBeDefined();
      expect(whitelist.suspiciousDomains).toBeDefined();
    });
  });
});
