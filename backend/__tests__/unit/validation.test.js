// Unit tests for validation helpers
// Requirements: 3.6, 3.7

import { isValidDomain, sanitizeUrlDomains } from '../../src/lib/validation.js';

describe('isValidDomain', () => {
  it('returns false for empty string', () => {
    expect(isValidDomain('')).toBe(false);
  });

  it('returns false for trailing dot (e.g. "example.com.")', () => {
    expect(isValidDomain('example.com.')).toBe(false);
  });

  it('returns false for domain with spaces (e.g. "exam ple.com")', () => {
    expect(isValidDomain('exam ple.com')).toBe(false);
  });

  it('returns true for valid multi-part domain (e.g. "sub.example.com")', () => {
    expect(isValidDomain('sub.example.com')).toBe(true);
  });

  it('returns false for single label with no dot (e.g. "localhost")', () => {
    expect(isValidDomain('localhost')).toBe(false);
  });

  it('returns false for domain starting with hyphen (e.g. "-example.com")', () => {
    expect(isValidDomain('-example.com')).toBe(false);
  });
});

describe('sanitizeUrlDomains', () => {
  it('caps result at 50 entries when given 51 valid domains', () => {
    const domains = Array.from({ length: 51 }, (_, i) => `domain${i + 1}.com`);
    const result = sanitizeUrlDomains(domains);
    expect(result).toHaveLength(50);
  });

  it('returns only valid domains from a mixed array', () => {
    const input = ['valid.com', 'invalid domain', '', 'also.valid.org', 'bad@domain'];
    const result = sanitizeUrlDomains(input);
    expect(result).toEqual(['valid.com', 'also.valid.org']);
  });

  it('removes duplicates', () => {
    const input = ['example.com', 'example.com', 'other.com'];
    const result = sanitizeUrlDomains(input);
    expect(result).toEqual(['example.com', 'other.com']);
  });
});
