// No 'use strict' — needed so eval() promotes function declarations to global scope

const { describe, test, expect, beforeEach } = require('@jest/globals');
const fs = require('fs');
const path = require('path');
const fc = require('fast-check');

// Load background.js source
const backgroundCode = fs.readFileSync(path.join(__dirname, '../background.js'), 'utf8');

function flushPromises() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

// ---- Chrome API mocks (standalone, independent of feedback-guard.test.js) ----

chrome.runtime.getManifest = jest.fn().mockReturnValue({ version: '1.0.0' });
chrome.runtime.getURL = jest.fn((p) => `chrome-extension://fakeid/${p}`);
chrome.runtime.onInstalled = { addListener: jest.fn() };
chrome.runtime.onMessage = { addListener: jest.fn() };

chrome.tabs = {
  onActivated: { addListener: jest.fn() },
  onUpdated: { addListener: jest.fn() },
  get: jest.fn(),
  query: jest.fn()
};

chrome.webNavigation = {
  onCompleted: { addListener: jest.fn() }
};

chrome.windows = {
  onFocusChanged: { addListener: jest.fn() },
  WINDOW_ID_NONE: -1
};

chrome.idle = {
  setDetectionInterval: jest.fn(),
  onStateChanged: { addListener: jest.fn() }
};

chrome.alarms = {
  create: jest.fn(),
  onAlarm: { addListener: jest.fn() }
};

chrome.scripting = {
  executeScript: jest.fn().mockResolvedValue(undefined)
};

chrome.storage.onChanged = { addListener: jest.fn() };

// Mock fetch before loading background.js
const originalFetch = global.fetch;
global.fetch = jest.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });

// Load background.js via indirect eval (global scope)
(0, eval)(backgroundCode);

// ---- Helpers ----

// Allowed fields for email domain feedback payload
const EMAIL_FEEDBACK_ALLOWED_KEYS = new Set(['senderDomain', 'urlDomains', 'companyName']);

// Allowed fields for URL category feedback payload
const URL_FEEDBACK_ALLOWED_KEYS = new Set(['url', 'suggestedCategory', 'currentCategory']);


// Sensitive data patterns that must NEVER appear in payloads.
// Only checks strings that are long enough to be meaningful (>= 4 chars, non-whitespace)
// to avoid false positives from trivially short strings like " " matching inside JSON.
function containsSensitiveData(payloadStr, sensitiveValues) {
  for (const val of sensitiveValues) {
    if (val && typeof val === 'string' && val.trim().length >= 4 && payloadStr.includes(val)) {
      return val;
    }
  }
  return null;
}

// ---- Property-Based Tests ----

describe('Feature: eula-data-feedback, Property 4: Feedback payload contains only anonymous data', () => {
  beforeEach(() => {
    global.fetch.mockClear();
    chrome.storage.sync.get.mockReset();
    // Always allow feedback for these tests
    chrome.storage.sync.get.mockImplementation((keys, cb) => {
      cb({ eulaAccepted: true, dataFeedbackEnabled: true });
    });
  });

  /**
   * Validates: Requirements 3.5, 5.1, 5.2, 5.3
   *
   * For any random email data with arbitrary subject, body, full sender address,
   * recipients, and attachments, the email domain feedback payload sent via fetch
   * contains ONLY the allowed fields: senderDomain, urlDomains, and optionally companyName.
   * No email subject, body content, full email addresses, recipient info, or attachment data
   * is present in the payload.
   */
  test('submitEmailDomainFeedback payload contains only senderDomain, urlDomains, and optionally companyName', async () => {
    // Generate realistic email data with distinct sensitive fields
    // Use prefixed strings to ensure sensitive values are distinguishable from domain data
    const emailDataArb = fc.record({
      subject: fc.string({ minLength: 4, maxLength: 100 }).map(s => `SUBJ:${s}`),
      body: fc.string({ minLength: 4, maxLength: 500 }).map(s => `BODY:${s}`),
      fullAddress: fc.emailAddress(),
      recipients: fc.array(fc.emailAddress(), { minLength: 1, maxLength: 5 }),
      attachmentName: fc.string({ minLength: 4, maxLength: 50 }).map(s => `ATT:${s}`),
      senderDomain: fc.domain(),
      urlDomains: fc.array(fc.domain(), { minLength: 1, maxLength: 5 }),
      companyName: fc.oneof(fc.constant(undefined), fc.string({ minLength: 1, maxLength: 50 }))
    });

    await fc.assert(
      fc.asyncProperty(emailDataArb, async (emailData) => {
        global.fetch.mockClear();

        // Call the function with only the domain-level data it accepts
        await submitEmailDomainFeedback(
          emailData.senderDomain,
          emailData.urlDomains,
          emailData.companyName
        );
        await flushPromises();

        // fetch should have been called
        expect(global.fetch).toHaveBeenCalledTimes(1);

        const [, fetchOptions] = global.fetch.mock.calls[0];
        const payload = JSON.parse(fetchOptions.body);

        // Verify payload contains ONLY allowed keys
        const payloadKeys = Object.keys(payload);
        for (const key of payloadKeys) {
          expect(EMAIL_FEEDBACK_ALLOWED_KEYS.has(key)).toBe(true);
        }

        // senderDomain must be present and match
        expect(payload.senderDomain).toBe(emailData.senderDomain);

        // urlDomains must be present and match
        expect(payload.urlDomains).toEqual(emailData.urlDomains);

        // companyName: present only if truthy input was provided
        if (emailData.companyName) {
          expect(payload.companyName).toBe(emailData.companyName);
        } else {
          expect(payload).not.toHaveProperty('companyName');
        }

        // Verify sensitive data is NOT in the serialized payload
        const payloadStr = JSON.stringify(payload);
        const sensitiveValues = [
          emailData.subject,
          emailData.body,
          emailData.fullAddress,
          emailData.attachmentName,
          ...emailData.recipients
        ];
        const found = containsSensitiveData(payloadStr, sensitiveValues);
        // found should be null (no sensitive data leaked)
        expect(found).toBeNull();
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Validates: Requirements 3.5, 5.1, 5.2, 5.3
   *
   * For any random URL feedback data, the URL category feedback payload sent via fetch
   * contains ONLY the allowed fields: url, suggestedCategory, currentCategory.
   */
  test('submitUrlCategoryFeedback payload contains only url, suggestedCategory, and currentCategory', async () => {
    const urlFeedbackArb = fc.record({
      url: fc.webUrl(),
      suggestedCategory: fc.stringMatching(/^[a-z][a-z0-9-]{0,29}$/),
      currentCategory: fc.stringMatching(/^[a-z][a-z0-9-]{0,29}$/)
    });

    await fc.assert(
      fc.asyncProperty(urlFeedbackArb, async (data) => {
        global.fetch.mockClear();

        await submitUrlCategoryFeedback(data.url, data.suggestedCategory, data.currentCategory);
        await flushPromises();

        expect(global.fetch).toHaveBeenCalledTimes(1);

        const [, fetchOptions] = global.fetch.mock.calls[0];
        const payload = JSON.parse(fetchOptions.body);

        // Verify payload contains ONLY allowed keys
        const payloadKeys = Object.keys(payload);
        for (const key of payloadKeys) {
          expect(URL_FEEDBACK_ALLOWED_KEYS.has(key)).toBe(true);
        }

        // All three fields must be present and match
        expect(payload.url).toBe(data.url);
        expect(payload.suggestedCategory).toBe(data.suggestedCategory);
        expect(payload.currentCategory).toBe(data.currentCategory);

        // Verify no extra fields leaked
        expect(payloadKeys.length).toBe(3);
      }),
      { numRuns: 100 }
    );
  });
});


describe('Feature: eula-data-feedback, Property 7: Feedback requests include extension version header', () => {
  beforeEach(() => {
    global.fetch.mockClear();
    chrome.storage.sync.get.mockReset();
    // Always allow feedback for these tests
    chrome.storage.sync.get.mockImplementation((keys, cb) => {
      cb({ eulaAccepted: true, dataFeedbackEnabled: true });
    });
  });

  /**
   * Validates: Requirements 5.4
   *
   * For any feedback submission to the API (both email and URL feedback),
   * the HTTP request must include the X-Extension-Version header with a
   * non-empty string value.
   */
  test('email feedback requests include X-Extension-Version header with non-empty string', async () => {
    const emailDataArb = fc.record({
      senderDomain: fc.domain(),
      urlDomains: fc.array(fc.domain(), { minLength: 1, maxLength: 5 }),
      companyName: fc.oneof(fc.constant(undefined), fc.string({ minLength: 1, maxLength: 50 }))
    });

    await fc.assert(
      fc.asyncProperty(emailDataArb, async (data) => {
        global.fetch.mockClear();

        await submitEmailDomainFeedback(data.senderDomain, data.urlDomains, data.companyName);
        await flushPromises();

        expect(global.fetch).toHaveBeenCalledTimes(1);

        const [, fetchOptions] = global.fetch.mock.calls[0];
        const headers = fetchOptions.headers;

        // X-Extension-Version header must exist and be a non-empty string
        expect(headers).toHaveProperty('X-Extension-Version');
        expect(typeof headers['X-Extension-Version']).toBe('string');
        expect(headers['X-Extension-Version'].length).toBeGreaterThan(0);
      }),
      { numRuns: 100 }
    );
  });

  test('URL feedback requests include X-Extension-Version header with non-empty string', async () => {
    const urlFeedbackArb = fc.record({
      url: fc.webUrl(),
      suggestedCategory: fc.stringMatching(/^[a-z][a-z0-9-]{0,29}$/),
      currentCategory: fc.stringMatching(/^[a-z][a-z0-9-]{0,29}$/)
    });

    await fc.assert(
      fc.asyncProperty(urlFeedbackArb, async (data) => {
        global.fetch.mockClear();

        await submitUrlCategoryFeedback(data.url, data.suggestedCategory, data.currentCategory);
        await flushPromises();

        expect(global.fetch).toHaveBeenCalledTimes(1);

        const [, fetchOptions] = global.fetch.mock.calls[0];
        const headers = fetchOptions.headers;

        // X-Extension-Version header must exist and be a non-empty string
        expect(headers).toHaveProperty('X-Extension-Version');
        expect(typeof headers['X-Extension-Version']).toBe('string');
        expect(headers['X-Extension-Version'].length).toBeGreaterThan(0);
      }),
      { numRuns: 100 }
    );
  });
});
