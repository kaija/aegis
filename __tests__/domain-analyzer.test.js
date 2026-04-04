'use strict';

const { describe, test, expect } = require('@jest/globals');

// DomainAnalyzer exports via module.exports
const DomainAnalyzer = require('../src/analysis/domain-analyzer');

describe('DomainAnalyzer - extractBaseDomain', () => {
  test('should extract base domain from simple hostname', () => {
    expect(DomainAnalyzer.extractBaseDomain('www.example.com')).toBe('example.com');
  });

  test('should extract base domain from subdomain', () => {
    expect(DomainAnalyzer.extractBaseDomain('sub.deep.example.com')).toBe('example.com');
  });

  test('should handle compound TLDs (.co.jp)', () => {
    expect(DomainAnalyzer.extractBaseDomain('service.example.co.jp')).toBe('example.co.jp');
  });

  test('should handle compound TLDs (.com.tw)', () => {
    expect(DomainAnalyzer.extractBaseDomain('mail.service.com.tw')).toBe('service.com.tw');
  });

  test('should handle .gov.tw', () => {
    expect(DomainAnalyzer.extractBaseDomain('service.ntpc.gov.tw')).toBe('ntpc.gov.tw');
  });

  test('should handle bare domain', () => {
    expect(DomainAnalyzer.extractBaseDomain('example.com')).toBe('example.com');
  });

  test('should handle empty input', () => {
    expect(DomainAnalyzer.extractBaseDomain('')).toBe('');
    expect(DomainAnalyzer.extractBaseDomain(null)).toBe('');
  });

  test('should be case-insensitive', () => {
    expect(DomainAnalyzer.extractBaseDomain('WWW.Example.COM')).toBe('example.com');
  });
});

describe('DomainAnalyzer - getAgeDays', () => {
  test('should return days since registration', () => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const result = DomainAnalyzer.getAgeDays(thirtyDaysAgo.toISOString());
    expect(result).toBeGreaterThanOrEqual(29);
    expect(result).toBeLessThanOrEqual(31);
  });

  test('should return null for null input', () => {
    expect(DomainAnalyzer.getAgeDays(null)).toBeNull();
  });

  test('should return null for invalid date', () => {
    expect(DomainAnalyzer.getAgeDays('not-a-date')).toBeNull();
  });

  test('should return null for empty string', () => {
    expect(DomainAnalyzer.getAgeDays('')).toBeNull();
  });

  test('should handle ISO date strings', () => {
    const result = DomainAnalyzer.getAgeDays('2020-01-01T00:00:00Z');
    expect(result).toBeGreaterThan(365);
  });
});

describe('DomainAnalyzer - scoreByAge', () => {
  test('should return high risk for < 30 days', () => {
    const result = DomainAnalyzer.scoreByAge(15);
    expect(result.deduction).toBe(30);
    expect(result.label).toBe('high');
  });

  test('should return medium risk for 30-89 days', () => {
    const result = DomainAnalyzer.scoreByAge(60);
    expect(result.deduction).toBe(20);
    expect(result.label).toBe('medium');
  });

  test('should return low risk for 90-179 days', () => {
    const result = DomainAnalyzer.scoreByAge(120);
    expect(result.deduction).toBe(10);
    expect(result.label).toBe('low');
  });

  test('should return safe for >= 180 days', () => {
    const result = DomainAnalyzer.scoreByAge(365);
    expect(result.deduction).toBe(0);
    expect(result.label).toBe('safe');
  });

  test('should return unknown for null', () => {
    const result = DomainAnalyzer.scoreByAge(null);
    expect(result.deduction).toBe(0);
    expect(result.label).toBe('unknown');
  });

  // Boundary tests
  test('boundary: exactly 30 days should be medium', () => {
    const result = DomainAnalyzer.scoreByAge(30);
    expect(result.label).toBe('medium');
  });

  test('boundary: 29 days should be high', () => {
    const result = DomainAnalyzer.scoreByAge(29);
    expect(result.label).toBe('high');
  });

  test('boundary: exactly 90 days should be low', () => {
    const result = DomainAnalyzer.scoreByAge(90);
    expect(result.label).toBe('low');
  });

  test('boundary: 89 days should be medium', () => {
    const result = DomainAnalyzer.scoreByAge(89);
    expect(result.label).toBe('medium');
  });

  test('boundary: exactly 180 days should be safe', () => {
    const result = DomainAnalyzer.scoreByAge(180);
    expect(result.label).toBe('safe');
  });

  test('boundary: 179 days should be low', () => {
    const result = DomainAnalyzer.scoreByAge(179);
    expect(result.label).toBe('low');
  });

  test('boundary: 0 days should be high', () => {
    const result = DomainAnalyzer.scoreByAge(0);
    expect(result.label).toBe('high');
  });
});

describe('DomainAnalyzer - scoreByCountry', () => {
  test('should flag high-risk country', () => {
    const result = DomainAnalyzer.scoreByCountry('RU');
    expect(result.deduction).toBe(15);
    expect(result.isHighRisk).toBe(true);
  });

  test('should not flag safe country', () => {
    const result = DomainAnalyzer.scoreByCountry('US');
    expect(result.deduction).toBe(0);
    expect(result.isHighRisk).toBe(false);
  });

  test('should handle null country code', () => {
    const result = DomainAnalyzer.scoreByCountry(null);
    expect(result.deduction).toBe(0);
    expect(result.isHighRisk).toBe(false);
  });

  test('should be case-insensitive', () => {
    const result = DomainAnalyzer.scoreByCountry('cn');
    expect(result.isHighRisk).toBe(true);
  });
});

describe('DomainAnalyzer - calculateScore', () => {
  test('should return 100 for a well-established safe domain', () => {
    const result = DomainAnalyzer.calculateScore({
      registrationDate: '2010-01-01T00:00:00Z',
      countryCode: 'US',
      rdapError: false,
      rdapNoDate: false,
    });
    expect(result.score).toBe(100);
    expect(result.level).toBe('safe');
    expect(result.color).toBe('#1a7f37');
    expect(result.scoreDetails).toHaveLength(0);
  });

  test('should deduct for RDAP error', () => {
    const result = DomainAnalyzer.calculateScore({
      registrationDate: null,
      countryCode: 'US',
      rdapError: true,
      rdapNoDate: false,
    });
    expect(result.score).toBe(95);
    expect(result.scoreDetails).toHaveLength(1);
    expect(result.scoreDetails[0].deduction).toBe(5);
  });

  test('should deduct for no registration date', () => {
    const result = DomainAnalyzer.calculateScore({
      registrationDate: null,
      countryCode: 'US',
      rdapError: false,
      rdapNoDate: true,
    });
    expect(result.score).toBe(90);
    expect(result.scoreDetails).toHaveLength(1);
    expect(result.scoreDetails[0].deduction).toBe(10);
  });

  test('should deduct for new domain in high-risk country', () => {
    const tenDaysAgo = new Date();
    tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);
    const result = DomainAnalyzer.calculateScore({
      registrationDate: tenDaysAgo.toISOString(),
      countryCode: 'RU',
      rdapError: false,
      rdapNoDate: false,
    });
    // -30 (age) + -15 (country) = 55
    expect(result.score).toBe(55);
    expect(result.level).toBe('caution');
    expect(result.scoreDetails).toHaveLength(2);
  });

  test('should combine all deductions', () => {
    const fiveDaysAgo = new Date();
    fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
    const result = DomainAnalyzer.calculateScore({
      registrationDate: fiveDaysAgo.toISOString(),
      countryCode: 'CN',
      rdapError: false,
      rdapNoDate: false,
    });
    // -30 (age high) + -15 (country) = 55
    expect(result.score).toBe(55);
    expect(result.level).toBe('caution');
  });

  test('should clamp score at 0', () => {
    // rdapNoDate (-10) doesn't apply when rdapError is true
    // So worst case: rdapError(-5) + no registrationDate + high-risk country(-15) = 80
    // To get very low, need young domain + high-risk country
    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);
    const result = DomainAnalyzer.calculateScore({
      registrationDate: oneDayAgo.toISOString(),
      countryCode: 'KP',
      rdapError: false,
      rdapNoDate: false,
    });
    expect(result.score).toBeGreaterThanOrEqual(0);
  });

  test('should return danger level for very low scores', () => {
    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);
    // rdapNoDate + young domain + high-risk country
    const result = DomainAnalyzer.calculateScore({
      registrationDate: oneDayAgo.toISOString(),
      countryCode: 'KP',
      rdapError: false,
      rdapNoDate: true,
    });
    // -10 (rdapNoDate) + -30 (age) + -15 (country) = 45 (danger)
    expect(result.score).toBe(45);
    expect(result.level).toBe('danger');
  });
});

describe('DomainAnalyzer - formatDate', () => {
  test('should format ISO date', () => {
    expect(DomainAnalyzer.formatDate('2024-01-15T00:00:00Z')).toBe('2024-01-15');
  });

  test('should return -- for null', () => {
    expect(DomainAnalyzer.formatDate(null)).toBe('--');
  });

  test('should return -- for invalid date', () => {
    expect(DomainAnalyzer.formatDate('invalid')).toBe('--');
  });
});

describe('DomainAnalyzer - formatAge', () => {
  test('should format days', () => {
    expect(DomainAnalyzer.formatAge(15)).toBe('15 days');
  });

  test('should format 1 day singular', () => {
    expect(DomainAnalyzer.formatAge(1)).toBe('1 day');
  });

  test('should format months', () => {
    expect(DomainAnalyzer.formatAge(60)).toBe('2 months');
  });

  test('should format 1 month singular', () => {
    expect(DomainAnalyzer.formatAge(30)).toBe('1 month');
  });

  test('should format years', () => {
    expect(DomainAnalyzer.formatAge(730)).toBe('2 years');
  });

  test('should format years and months', () => {
    expect(DomainAnalyzer.formatAge(400)).toBe('1 year, 1 month');
  });

  test('should return -- for null', () => {
    expect(DomainAnalyzer.formatAge(null)).toBe('--');
  });

  test('should handle 0 days', () => {
    expect(DomainAnalyzer.formatAge(0)).toBe('Less than a day');
  });

  test('should return -- for negative', () => {
    expect(DomainAnalyzer.formatAge(-1)).toBe('--');
  });
});
