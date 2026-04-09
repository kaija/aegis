'use strict';

const { describe, test, expect, beforeEach, afterEach } = require('@jest/globals');
const fs = require('fs');
const path = require('path');

// Load options.js source
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

describe('Settings page — data feedback toggle', () => {
  beforeEach(() => {
    buildOptionsDOM();

    // Reset chrome mocks
    chrome.storage.sync.get.mockReset();
    chrome.storage.sync.set.mockReset();
    chrome.storage.local.get.mockReset();
    chrome.runtime.sendMessage.mockReset();
    chrome.runtime.lastError = null;

    // Stub sendMessage so loadWhitelistStatus doesn't blow up
    chrome.runtime.sendMessage.mockImplementation(() => {});

    // Stub local storage for model cache
    chrome.storage.local.get.mockImplementation((keys, cb) => {
      if (cb) { cb({}); return; }
      return Promise.resolve({});
    });

    // Mock CategoryDialog (referenced by renderCategories)
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

  /**
   * Helper: configure chrome.storage.sync.get to return given settings,
   * eval options.js, and fire DOMContentLoaded.
   */
  async function loadOptionsWithSettings(settings) {
    chrome.storage.sync.get.mockImplementation((keys, cb) => {
      if (cb) { cb(settings); return; }
      return Promise.resolve(settings);
    });

    // options.js registers a DOMContentLoaded listener; eval it then fire the event
    eval(optionsCode);
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await flushPromises();
  }

  // --- Requirement 4.1: section hidden when eulaAccepted is not true ---
  test('hides data feedback section when eulaAccepted is false', async () => {
    await loadOptionsWithSettings({ eulaAccepted: false, dataFeedbackEnabled: true });

    const section = document.getElementById('dataFeedbackSection');
    expect(section.style.display).toBe('none');
  });

  test('hides data feedback section when eulaAccepted is absent', async () => {
    await loadOptionsWithSettings({});

    const section = document.getElementById('dataFeedbackSection');
    expect(section.style.display).toBe('none');
  });

  // --- Requirement 4.1: section visible when eulaAccepted is true ---
  test('shows data feedback section when eulaAccepted is true', async () => {
    await loadOptionsWithSettings({ eulaAccepted: true, dataFeedbackEnabled: true });

    const section = document.getElementById('dataFeedbackSection');
    expect(section.style.display).toBe('');
  });

  // --- Requirement 4.2: toggle reflects stored dataFeedbackEnabled value on load ---
  test('toggle is checked when dataFeedbackEnabled is true', async () => {
    await loadOptionsWithSettings({ eulaAccepted: true, dataFeedbackEnabled: true });

    const toggle = document.getElementById('dataFeedbackToggle');
    expect(toggle.checked).toBe(true);
  });

  test('toggle is unchecked when dataFeedbackEnabled is false', async () => {
    await loadOptionsWithSettings({ eulaAccepted: true, dataFeedbackEnabled: false });

    const toggle = document.getElementById('dataFeedbackToggle');
    expect(toggle.checked).toBe(false);
  });

  // --- Requirement 4.3: saving with toggle off writes dataFeedbackEnabled: false ---
  test('saving with toggle off writes dataFeedbackEnabled: false', async () => {
    chrome.storage.sync.set.mockImplementation((data, cb) => {
      if (cb) cb();
      return Promise.resolve();
    });

    await loadOptionsWithSettings({ eulaAccepted: true, dataFeedbackEnabled: true });

    // Turn toggle off
    const toggle = document.getElementById('dataFeedbackToggle');
    toggle.checked = false;

    // Click save
    document.getElementById('saveBtn').click();
    await flushPromises();

    expect(chrome.storage.sync.set).toHaveBeenCalled();
    const savedData = chrome.storage.sync.set.mock.calls[0][0];
    expect(savedData.dataFeedbackEnabled).toBe(false);
  });

  // --- Requirement 4.5: saving with toggle on writes dataFeedbackEnabled: true ---
  test('saving with toggle on writes dataFeedbackEnabled: true', async () => {
    chrome.storage.sync.set.mockImplementation((data, cb) => {
      if (cb) cb();
      return Promise.resolve();
    });

    await loadOptionsWithSettings({ eulaAccepted: true, dataFeedbackEnabled: false });

    // Turn toggle on
    const toggle = document.getElementById('dataFeedbackToggle');
    toggle.checked = true;

    // Click save
    document.getElementById('saveBtn').click();
    await flushPromises();

    expect(chrome.storage.sync.set).toHaveBeenCalled();
    const savedData = chrome.storage.sync.set.mock.calls[0][0];
    expect(savedData.dataFeedbackEnabled).toBe(true);
  });
});


// --- Property-Based Tests ---
const fc = require('fast-check');

describe('Feature: eula-data-feedback, Property 5: Settings toggle round-trip', () => {
  /**
   * **Validates: Requirements 4.2, 4.3, 4.5**
   *
   * For any boolean value written to dataFeedbackEnabled via the settings
   * page save action, reading it back from storage yields the same boolean,
   * and the toggle reflects this value on load.
   */
  test('round-trips any boolean through the settings toggle', async () => {
    jest.setTimeout(60000);
    // Collect generated booleans first, then run them sequentially
    // Each iteration: fresh DOM → load options.js → verify toggle → save → verify written value
    const booleans = fc.sample(fc.boolean(), 100);

    for (const feedbackValue of booleans) {
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

      // Load options page with eulaAccepted: true and the generated boolean
      chrome.storage.sync.get.mockImplementation((keys, cb) => {
        if (cb) { cb({ eulaAccepted: true, dataFeedbackEnabled: feedbackValue }); return; }
        return Promise.resolve({ eulaAccepted: true, dataFeedbackEnabled: feedbackValue });
      });

      eval(optionsCode);
      document.dispatchEvent(new Event('DOMContentLoaded'));
      await flushPromises();

      // Verify the toggle reflects the loaded value (Req 4.2)
      const toggle = document.getElementById('dataFeedbackToggle');
      expect(toggle.checked).toBe(feedbackValue);

      // Click save and verify the written value matches (Req 4.3, 4.5)
      document.getElementById('saveBtn').click();
      await flushPromises();

      expect(savedData).not.toBeNull();
      expect(savedData.dataFeedbackEnabled).toBe(feedbackValue);

      // Clean up
      document.body.innerHTML = '';
      delete window.CategoryDialog;
      delete window.CategoryManager;
    }
  });
});
