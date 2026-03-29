// No 'use strict' — needed so eval() promotes function declarations to global scope

const { describe, test, expect, beforeEach, afterEach } = require('@jest/globals');
const fs = require('fs');
const path = require('path');
const fc = require('fast-check');

// Load background.js source
const backgroundCode = fs.readFileSync(path.join(__dirname, '../background.js'), 'utf8');

function flushPromises() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

// ---- One-time setup: mock all Chrome APIs and load background.js once ----
// The setup.js already provides chrome.storage.sync/local and chrome.runtime.
// We need to add the remaining APIs that background.js uses at the top level.

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

// Load background.js once via indirect eval (runs in global scope).
// This makes function declarations (like _isFeedbackAllowed) available as globals.
(0, eval)(backgroundCode);

// ---- Tests ----

describe('Feedback guard in background.js', () => {
  beforeEach(() => {
    global.fetch.mockClear();
    chrome.storage.sync.get.mockReset();
  });

  // ---- Unit Tests ----

  describe('_isFeedbackAllowed', () => {
    test('returns true only when both flags are strictly true', async () => {
      chrome.storage.sync.get.mockImplementation((keys, cb) => {
        cb({ eulaAccepted: true, dataFeedbackEnabled: true });
      });
      const result = await _isFeedbackAllowed();
      expect(result).toBe(true);
    });

    test('returns false when eulaAccepted is false', async () => {
      chrome.storage.sync.get.mockImplementation((keys, cb) => {
        cb({ eulaAccepted: false, dataFeedbackEnabled: true });
      });
      const result = await _isFeedbackAllowed();
      expect(result).toBe(false);
    });

    test('returns false when dataFeedbackEnabled is false', async () => {
      chrome.storage.sync.get.mockImplementation((keys, cb) => {
        cb({ eulaAccepted: true, dataFeedbackEnabled: false });
      });
      const result = await _isFeedbackAllowed();
      expect(result).toBe(false);
    });

    test('returns false when both flags are false', async () => {
      chrome.storage.sync.get.mockImplementation((keys, cb) => {
        cb({ eulaAccepted: false, dataFeedbackEnabled: false });
      });
      const result = await _isFeedbackAllowed();
      expect(result).toBe(false);
    });

    test('returns false when eulaAccepted is absent', async () => {
      chrome.storage.sync.get.mockImplementation((keys, cb) => {
        cb({ dataFeedbackEnabled: true });
      });
      const result = await _isFeedbackAllowed();
      expect(result).toBe(false);
    });

    test('returns false when dataFeedbackEnabled is absent', async () => {
      chrome.storage.sync.get.mockImplementation((keys, cb) => {
        cb({ eulaAccepted: true });
      });
      const result = await _isFeedbackAllowed();
      expect(result).toBe(false);
    });

    test('returns false when both flags are absent', async () => {
      chrome.storage.sync.get.mockImplementation((keys, cb) => {
        cb({});
      });
      const result = await _isFeedbackAllowed();
      expect(result).toBe(false);
    });
  });

  describe('submitEmailDomainFeedback', () => {
    test('skips API call when guard returns false', async () => {
      chrome.storage.sync.get.mockImplementation((keys, cb) => {
        cb({ eulaAccepted: false, dataFeedbackEnabled: true });
      });

      await submitEmailDomainFeedback('example.com', ['cdn.example.com'], 'Example');
      await flushPromises();

      expect(global.fetch).not.toHaveBeenCalled();
    });

    test('makes API call when guard returns true', async () => {
      chrome.storage.sync.get.mockImplementation((keys, cb) => {
        cb({ eulaAccepted: true, dataFeedbackEnabled: true });
      });

      await submitEmailDomainFeedback('example.com', ['cdn.example.com'], 'Example');
      await flushPromises();

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/feedback/sender-mapping'),
        expect.objectContaining({ method: 'POST' })
      );
    });
  });

  describe('submitUrlCategoryFeedback', () => {
    test('skips API call when guard returns false', async () => {
      chrome.storage.sync.get.mockImplementation((keys, cb) => {
        cb({ eulaAccepted: true, dataFeedbackEnabled: false });
      });

      await submitUrlCategoryFeedback('https://example.com', 'shopping', 'uncategorized');
      await flushPromises();

      expect(global.fetch).not.toHaveBeenCalled();
    });

    test('makes API call when guard returns true', async () => {
      chrome.storage.sync.get.mockImplementation((keys, cb) => {
        cb({ eulaAccepted: true, dataFeedbackEnabled: true });
      });

      await submitUrlCategoryFeedback('https://example.com', 'shopping', 'uncategorized');
      await flushPromises();

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/feedback/url-category'),
        expect.objectContaining({ method: 'POST' })
      );
    });
  });
});

// ---- Property-Based Tests ----

describe('Feature: eula-data-feedback, Property 3: Feedback guard — both flags required', () => {
  beforeEach(() => {
    global.fetch.mockClear();
    chrome.storage.sync.get.mockReset();
  });

  const flagArb = fc.oneof(
    fc.constant(true),
    fc.constant(false),
    fc.constant(undefined)
  );

  /**
   * Validates: Requirements 1.2, 2.2, 3.3, 3.4, 4.4, 7.3, 7.4
   *
   * For any combination of eulaAccepted and dataFeedbackEnabled (true/false/absent),
   * _submitFeedback (via fetch) is called iff both are strictly true.
   */
  test('feedback is submitted iff both eulaAccepted and dataFeedbackEnabled are strictly true', async () => {
    await fc.assert(
      fc.asyncProperty(flagArb, flagArb, async (eulaVal, feedbackVal) => {
        // Reset fetch tracking
        global.fetch.mockClear();

        // Configure storage mock
        chrome.storage.sync.get.mockReset();
        chrome.storage.sync.get.mockImplementation((keys, cb) => {
          const result = {};
          if (eulaVal !== undefined) result.eulaAccepted = eulaVal;
          if (feedbackVal !== undefined) result.dataFeedbackEnabled = feedbackVal;
          cb(result);
        });

        // Call submitUrlCategoryFeedback (no input validation guard, only feedback guard)
        await submitUrlCategoryFeedback('https://test.com', 'shopping', 'uncategorized');
        await flushPromises();

        const bothTrue = eulaVal === true && feedbackVal === true;

        if (bothTrue) {
          expect(global.fetch).toHaveBeenCalled();
        } else {
          expect(global.fetch).not.toHaveBeenCalled();
        }
      }),
      { numRuns: 100 }
    );
  });
});
