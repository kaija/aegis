/**
 * Input validation helpers for the Feedback Collection API.
 */

/**
 * Returns true if str is a valid domain name.
 * Accepts alphanumeric chars, hyphens, and dots.
 * Must contain at least one dot; no leading/trailing dots or hyphens.
 * @param {string} str
 * @returns {boolean}
 */
export function isValidDomain(str) {
  if (typeof str !== 'string' || str.length === 0) return false;
  if (str.includes(' ')) return false;
  return /^(?!-)[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)+(?<!-)$/.test(str);
}

/**
 * Returns true if str is a valid http: or https: URL.
 * @param {string} str
 * @returns {boolean}
 */
export function isValidUrl(str) {
  try {
    const { protocol } = new URL(str);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Extracts the hostname from a URL string.
 * @param {string} url
 * @returns {string}
 */
export function extractDomain(url) {
  return new URL(url).hostname;
}

/**
 * Filters an array of domain strings to only valid domains,
 * deduplicates, and caps the result at 50 entries.
 * @param {string[]} arr
 * @returns {string[]}
 */
export function sanitizeUrlDomains(arr) {
  if (!Array.isArray(arr)) return [];
  const seen = new Set();
  const result = [];
  for (const entry of arr) {
    if (!isValidDomain(entry)) continue;
    if (seen.has(entry)) continue;
    seen.add(entry);
    result.push(entry);
    if (result.length === 50) break;
  }
  return result;
}

