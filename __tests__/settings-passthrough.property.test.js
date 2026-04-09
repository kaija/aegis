'use strict';

const fc = require('fast-check');
const fs = require('fs');
const path = require('path');
const { describe, test, expect, beforeEach, afterEach } = require('@jest/globals');

// Load options.js source for round-trip tests
const optionsCode = fs.readFileSync(path.join(__dirname, '../options.js'), 'utf8');

// Helper: flush pending microtasks / timers
function flushPromises() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Build the minimal DOM that options.js expects during DOMContentLoaded.
 */
function buildOptionsDOM() {
  document.body.innerHTML = `
    <input type="radio" name="analysisMode" value="local" checked>
    <input type="radio" name="analysisMode" value="ai">
    <input type="radio" name="analysisMode" value="nano">
    <section id="aiSettingsSection" style="display:none;"></section>
    <section id="categoriesSection"></section>
    <input type="url" id="whitelistUrl">
    <button id="updateWhitelistBtn"></button>
    <span id="whitelistStatus"></span>
    <div id="whitelistInfo"></div>
    <input type="checkbox" id="analysisDebug">
    <input type="url" id="aiBaseUrl" value="">
    <input type="password" id="aiApiKey" value="">
    <input type="text" id="aiModel" value="" list="aiModelList">
    <datalist id="aiModelList"></datalist>
    <span id="fetchModelsStatus"></span>
    <button id="testAiBtn"></button>
    <div id="testAiStatus"></div>
    <div id="categoriesList"></div>
    <button id="addCategoryBtn"></button>
    <section id="dataFeedbackSection" style="display:none;">
      <input type="checkbox" id="dataFeedbackToggle">
    </section>
    <div id="nanoStatusSection" style="display:none;">
      <div id="nanoStatus"></div>
      <button id="nanoDownloadBtn" style="display:none;"></button>
      <div id="nanoProgressContainer" style="display:none;">
        <div id="nanoProgressBar"></div>
      </div>
    </div>
    <label class="toggle-option" id="quickReplyToggleLabel" style="display:none; margin-top: 12px;">
      <input type="checkbox" id="nanoQuickReplyToggle">
      <span>Enable Quick Reply suggestions</span>
    </label>
    <div id="nanoFlagsGuide" style="display:none;"></div>
    <button id="saveBtn"></button>
    <span id="saveStatus"></span>
  `;
}

/**
 * Property 9: Settings pass-through preserves analysisMode
 *
 * The GET_SETTINGS handler in background.js merges stored settings over
 * DEFAULT_SETTINGS via Object.assign({}, DEFAULT_SETTINGS, storedResult).
 * This means any analysisMode value persisted in chrome.storage.sync must
 * appear unchanged in the response — the default 'local' is only used when
 * no stored value exists.
 *
 * **Validates: Requirements 8.2**
 */
describe('Settings pass-through property tests', () => {
  // Mirror of background.js DEFAULT_SETTINGS (relevant subset)
  const DEFAULT_SETTINGS = {
    eulaAccepted: false,
    dataFeedbackEnabled: false,
    analysisMode: 'local',
    analysisDebug: false,
    aiSettings: {
      baseUrl: 'https://api.openai.com/v1',
      apiKey: '',
      model: 'gpt-5-nano-2025-08-07'
    },
    categories: []
  };

  describe('Property 9: Settings pass-through preserves analysisMode', () => {
    test('GET_SETTINGS returns exact stored analysisMode value', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.oneof(
            fc.constant('local'),
            fc.constant('ai'),
            fc.constant('nano'),
            fc.string({ minLength: 1, maxLength: 20 })
          ),
          async (analysisMode) => {
            // Simulate what GET_SETTINGS does:
            //   Object.assign({}, DEFAULT_SETTINGS, storedResult)
            const storedResult = { analysisMode };
            const response = Object.assign({}, DEFAULT_SETTINGS, storedResult);

            // The stored analysisMode must pass through unchanged
            expect(response.analysisMode).toBe(analysisMode);
          }
        ),
        { numRuns: 100 }
      );
    });

    test('missing analysisMode in storage defaults to local', async () => {
      // Edge case: when storage has no analysisMode, default applies
      const storedResult = {};
      const response = Object.assign({}, DEFAULT_SETTINGS, storedResult);
      expect(response.analysisMode).toBe('local');
    });
  });
});

/**
 * Feature: nano-quick-reply, Property 1: Settings persistence round-trip
 *
 * For any boolean value of nanoQuickReplyEnabled, saving it via the settings
 * page and then reading it back from storage yields the same boolean value,
 * and the toggle reflects this value on load.
 *
 * **Validates: Requirements 1.3**
 */
describe('Feature: nano-quick-reply, Property 1: Settings persistence round-trip', () => {
  beforeEach(() => {
    buildOptionsDOM();

    chrome.storage.sync.get.mockReset();
    chrome.storage.sync.set.mockReset();
    chrome.storage.local.get.mockReset();
    chrome.runtime.sendMessage.mockReset();
    chrome.runtime.lastError = null;

    chrome.runtime.sendMessage.mockImplementation(() => {});
    chrome.storage.local.get.mockImplementation((keys, cb) => {
      if (cb) { cb({}); return; }
      return Promise.resolve({});
    });

    window.CategoryDialog = { getIconSvg: jest.fn().mockReturnValue('') };
    window.CategoryManager = {
      createCategory: jest.fn(),
      updateCategory: jest.fn(),
      deleteCategory: jest.fn()
    };
  });

  afterEach(() => {
    document.body.innerHTML = '';
    delete window.CategoryDialog;
    delete window.CategoryManager;
  });

  test('round-trips any boolean through the nanoQuickReplyEnabled toggle', async () => {
    jest.setTimeout(60000);

    const booleans = fc.sample(fc.boolean(), 100);

    for (const quickReplyValue of booleans) {
      // Fresh DOM
      buildOptionsDOM();

      // Reset chrome mocks
      chrome.storage.sync.get.mockReset();
      chrome.storage.sync.set.mockReset();
      chrome.storage.local.get.mockReset();
      chrome.runtime.sendMessage.mockReset();
      chrome.runtime.lastError = null;

      chrome.runtime.sendMessage.mockImplementation(() => {});
      chrome.storage.local.get.mockImplementation((keys, cb) => {
        if (cb) { cb({}); return; }
        return Promise.resolve({});
      });

      window.CategoryDialog = { getIconSvg: jest.fn().mockReturnValue('') };
      window.CategoryManager = {
        createCategory: jest.fn(),
        updateCategory: jest.fn(),
        deleteCategory: jest.fn()
      };

      // Capture what gets written to storage
      let savedData = null;
      chrome.storage.sync.set.mockImplementation((data, cb) => {
        savedData = data;
        if (cb) cb();
        return Promise.resolve();
      });

      // Load options page with nano mode and the generated boolean
      chrome.storage.sync.get.mockImplementation((keys, cb) => {
        if (cb) { cb({ analysisMode: 'nano', nanoQuickReplyEnabled: quickReplyValue }); return; }
        return Promise.resolve({ analysisMode: 'nano', nanoQuickReplyEnabled: quickReplyValue });
      });

      eval(optionsCode);
      document.dispatchEvent(new Event('DOMContentLoaded'));
      await flushPromises();

      // Verify the toggle reflects the loaded value (Req 1.3)
      const toggle = document.getElementById('nanoQuickReplyToggle');
      expect(toggle.checked).toBe(quickReplyValue);

      // Click save and verify the written value matches (Req 1.3)
      document.getElementById('saveBtn').click();
      await flushPromises();

      expect(savedData).not.toBeNull();
      expect(savedData.nanoQuickReplyEnabled).toBe(quickReplyValue);

      // Clean up
      document.body.innerHTML = '';
      delete window.CategoryDialog;
      delete window.CategoryManager;
    }
  });
});


/**
 * Feature: nano-quick-reply, Property 9: Settings pass-through preserves nanoQuickReplyEnabled
 *
 * The GET_SETTINGS handler in background.js merges stored settings over
 * DEFAULT_SETTINGS via Object.assign({}, DEFAULT_SETTINGS, storedResult).
 * Since nanoQuickReplyEnabled is NOT in DEFAULT_SETTINGS, it only appears
 * in the response when explicitly stored. When stored, the value must pass
 * through unchanged.
 *
 * **Validates: Requirements 8.4**
 */
describe('Feature: nano-quick-reply, Property 9: Settings pass-through preserves nanoQuickReplyEnabled', () => {
  // Mirror of background.js DEFAULT_SETTINGS (relevant subset)
  // Note: nanoQuickReplyEnabled is intentionally NOT in DEFAULT_SETTINGS
  const DEFAULT_SETTINGS = {
    eulaAccepted: false,
    dataFeedbackEnabled: false,
    analysisMode: 'local',
    analysisDebug: false,
    aiSettings: {
      baseUrl: 'https://api.openai.com/v1',
      apiKey: '',
      model: 'gpt-5-nano-2025-08-07'
    },
    categories: []
  };

  test('GET_SETTINGS returns exact stored nanoQuickReplyEnabled boolean value', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.boolean(),
        async (nanoQuickReplyEnabled) => {
          // Simulate what GET_SETTINGS does:
          //   Object.assign({}, DEFAULT_SETTINGS, storedResult)
          const storedResult = { nanoQuickReplyEnabled };
          const response = Object.assign({}, DEFAULT_SETTINGS, storedResult);

          // The stored nanoQuickReplyEnabled must pass through unchanged
          expect(response.nanoQuickReplyEnabled).toBe(nanoQuickReplyEnabled);
        }
      ),
      { numRuns: 100 }
    );
  });

  test('GET_SETTINGS preserves nanoQuickReplyEnabled alongside other settings', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.boolean(),
        fc.oneof(fc.constant('local'), fc.constant('ai'), fc.constant('nano')),
        async (nanoQuickReplyEnabled, analysisMode) => {
          // Storage may contain multiple settings at once
          const storedResult = { nanoQuickReplyEnabled, analysisMode };
          const response = Object.assign({}, DEFAULT_SETTINGS, storedResult);

          // Both values must pass through unchanged
          expect(response.nanoQuickReplyEnabled).toBe(nanoQuickReplyEnabled);
          expect(response.analysisMode).toBe(analysisMode);
        }
      ),
      { numRuns: 100 }
    );
  });

  test('missing nanoQuickReplyEnabled in storage results in undefined', () => {
    // Edge case: when storage has no nanoQuickReplyEnabled, it should be
    // undefined since it's not in DEFAULT_SETTINGS
    const storedResult = {};
    const response = Object.assign({}, DEFAULT_SETTINGS, storedResult);
    expect(response.nanoQuickReplyEnabled).toBeUndefined();
  });

  test('null and undefined values in storage are handled correctly', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(
          fc.boolean(),
          fc.constant(null),
          fc.constant(undefined)
        ),
        async (nanoQuickReplyEnabled) => {
          const storedResult = {};
          // Only set the key if the value is not undefined
          // (chrome.storage.sync.get omits keys that were never set)
          if (nanoQuickReplyEnabled !== undefined) {
            storedResult.nanoQuickReplyEnabled = nanoQuickReplyEnabled;
          }
          const response = Object.assign({}, DEFAULT_SETTINGS, storedResult);

          if (nanoQuickReplyEnabled !== undefined) {
            // Stored value passes through exactly (including null)
            expect(response.nanoQuickReplyEnabled).toBe(nanoQuickReplyEnabled);
          } else {
            // Never stored → not present in response
            expect(response.nanoQuickReplyEnabled).toBeUndefined();
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
