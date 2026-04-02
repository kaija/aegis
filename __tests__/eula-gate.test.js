'use strict';

const { describe, test, expect, beforeEach, afterEach } = require('@jest/globals');
const fs = require('fs');
const path = require('path');

// Load content.js source
const contentCode = fs.readFileSync(path.join(__dirname, '../content.js'), 'utf8');

// Helper: flush all pending microtasks (async IIFE uses await)
function flushPromises() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('EULA gate in content.js', () => {
  let mockEulaDialogInstance;
  let mockGmailPlatformInstance;
  let mockAnalysisPanelInstance;
  let mockEmailPopupInstance;

  beforeEach(() => {
    // Reset DOM
    document.body.innerHTML = '';

    // Reset the initialization guard
    delete window.__aegisInitialized;

    // Reset chrome mocks
    chrome.storage.sync.get.mockReset();
    chrome.storage.sync.set.mockReset();
    chrome.storage.local.get.mockReset();
    chrome.storage.local.set.mockReset();
    chrome.runtime.sendMessage.mockReset();
    chrome.runtime.lastError = null;

    // Mock chrome.storage.onChanged
    if (!chrome.storage.onChanged) {
      chrome.storage.onChanged = { addListener: jest.fn() };
    } else {
      chrome.storage.onChanged.addListener = jest.fn();
    }

    // Mock chrome.runtime.onMessage
    if (!chrome.runtime.onMessage) {
      chrome.runtime.onMessage = { addListener: jest.fn() };
    } else {
      chrome.runtime.onMessage.addListener = jest.fn();
    }

    // --- Mock EulaDialog ---
    mockEulaDialogInstance = {
      show: jest.fn(),
      hide: jest.fn()
    };
    window.EulaDialog = jest.fn(() => mockEulaDialogInstance);

    // --- Mock GmailPlatform ---
    mockGmailPlatformInstance = {
      isMatchingPage: jest.fn().mockReturnValue(true),
      getName: jest.fn().mockReturnValue('Gmail'),
      getEmails: jest.fn().mockReturnValue([]),
      getLabels: jest.fn().mockReturnValue([]),
      getEmailDetail: jest.fn().mockReturnValue(null),
      observeNavigate: jest.fn()
    };
    window.GmailPlatform = jest.fn(() => mockGmailPlatformInstance);

    // --- Mock AnalysisPanel ---
    mockAnalysisPanelInstance = {
      show: jest.fn(),
      isVisible: jest.fn().mockReturnValue(false),
      getCurrentFilter: jest.fn().mockReturnValue('unread')
    };
    window.AnalysisPanel = jest.fn(() => mockAnalysisPanelInstance);

    // --- Mock EmailPopup ---
    mockEmailPopupInstance = {
      show: jest.fn(),
      hide: jest.fn()
    };
    window.EmailPopup = jest.fn(() => mockEmailPopupInstance);

    // --- Mock WhitelistManager ---
    window.WhitelistManager = {
      init: jest.fn().mockResolvedValue(undefined),
      isKnownShortUrl: jest.fn().mockReturnValue(false),
      getWhitelist: jest.fn().mockReturnValue([])
    };

    // --- Mock EmailAnalyzer ---
    window.EmailAnalyzer = {
      categorizeByKeywords: jest.fn().mockReturnValue({ id: 'tag', name: 'Other' }),
      analyzeEmailDetail: jest.fn().mockReturnValue({})
    };

    // Mock window.location
    Object.defineProperty(window, 'location', {
      value: { href: 'https://mail.google.com/mail/u/0/#inbox', hash: '#inbox' },
      writable: true,
      configurable: true
    });
  });

  afterEach(() => {
    delete window.__aegisInitialized;
  });

  // --- Requirement 1.6, 2.3: eulaAccepted is true → no dialog, initialization proceeds ---
  describe('when eulaAccepted is true', () => {
    test('should not show EULA dialog and should initialize extension', async () => {
      chrome.storage.sync.get.mockImplementation((keys, cb) => {
        if (cb) { cb({ eulaAccepted: true }); return; }
        return Promise.resolve({ eulaAccepted: true });
      });

      eval(contentCode);
      await flushPromises();

      // EulaDialog should NOT have been instantiated
      expect(window.EulaDialog).not.toHaveBeenCalled();
      expect(mockEulaDialogInstance.show).not.toHaveBeenCalled();

      // Initialization should have proceeded — GmailPlatform instantiated
      expect(window.GmailPlatform).toHaveBeenCalled();
      expect(window.AnalysisPanel).toHaveBeenCalled();
      expect(window.EmailPopup).toHaveBeenCalled();
    });
  });

  // --- Requirement 1.1, 2.4, 8.2: eulaAccepted is false → dialog shown, init halted ---
  describe('when eulaAccepted is false', () => {
    test('should show EULA dialog and halt initialization', async () => {
      chrome.storage.sync.get.mockImplementation((keys, cb) => {
        if (cb) { cb({ eulaAccepted: false }); return; }
        return Promise.resolve({ eulaAccepted: false });
      });

      eval(contentCode);
      await flushPromises();

      // EulaDialog should have been shown
      expect(window.EulaDialog).toHaveBeenCalled();
      expect(mockEulaDialogInstance.show).toHaveBeenCalledTimes(1);

      // Initialization should NOT have proceeded
      expect(window.GmailPlatform).not.toHaveBeenCalled();
      expect(window.AnalysisPanel).not.toHaveBeenCalled();
      expect(window.EmailPopup).not.toHaveBeenCalled();
    });
  });

  // --- Requirement 2.4, 8.2: eulaAccepted is absent → dialog shown ---
  describe('when eulaAccepted is absent', () => {
    test('should show EULA dialog when eulaAccepted is undefined', async () => {
      chrome.storage.sync.get.mockImplementation((keys, cb) => {
        if (cb) { cb({}); return; }
        return Promise.resolve({});
      });

      eval(contentCode);
      await flushPromises();

      expect(window.EulaDialog).toHaveBeenCalled();
      expect(mockEulaDialogInstance.show).toHaveBeenCalledTimes(1);

      // Initialization should NOT have proceeded
      expect(window.GmailPlatform).not.toHaveBeenCalled();
    });
  });

  // --- Requirement 8.3: after acceptance callback, initialization proceeds without page reload ---
  describe('after acceptance callback', () => {
    test('should proceed with initialization without page reload', async () => {
      chrome.storage.sync.get.mockImplementation((keys, cb) => {
        if (cb) { cb({ eulaAccepted: false }); return; }
        return Promise.resolve({ eulaAccepted: false });
      });

      // Spy on location.reload to verify it is NOT called
      const reloadSpy = jest.fn();
      window.location.reload = reloadSpy;

      eval(contentCode);
      await flushPromises();

      // Dialog should be shown
      expect(mockEulaDialogInstance.show).toHaveBeenCalledTimes(1);

      // Extract the onAccept callback that content.js passed to EulaDialog.show()
      const showCallArgs = mockEulaDialogInstance.show.mock.calls[0][0];
      expect(showCallArgs).toHaveProperty('onAccept');
      expect(typeof showCallArgs.onAccept).toBe('function');

      // Simulate user accepting the EULA
      showCallArgs.onAccept();
      await flushPromises();

      // Initialization should now have proceeded
      expect(window.GmailPlatform).toHaveBeenCalled();
      expect(window.AnalysisPanel).toHaveBeenCalled();
      expect(window.EmailPopup).toHaveBeenCalled();

      // Page reload should NOT have been called
      expect(reloadSpy).not.toHaveBeenCalled();
    });
  });

  // --- Requirement 1.5, 8.4: after decline, extension remains idle ---
  describe('after decline', () => {
    test('should remain idle and not initialize extension', async () => {
      chrome.storage.sync.get.mockImplementation((keys, cb) => {
        if (cb) { cb({ eulaAccepted: false }); return; }
        return Promise.resolve({ eulaAccepted: false });
      });

      eval(contentCode);
      await flushPromises();

      // Dialog should be shown
      expect(mockEulaDialogInstance.show).toHaveBeenCalledTimes(1);

      // Extract the onDecline callback
      const showCallArgs = mockEulaDialogInstance.show.mock.calls[0][0];
      expect(showCallArgs).toHaveProperty('onDecline');
      expect(typeof showCallArgs.onDecline).toBe('function');

      // Simulate user declining the EULA
      showCallArgs.onDecline();
      await flushPromises();

      // Extension should remain idle — no initialization
      expect(window.GmailPlatform).not.toHaveBeenCalled();
      expect(window.AnalysisPanel).not.toHaveBeenCalled();
      expect(window.EmailPopup).not.toHaveBeenCalled();
      expect(window.WhitelistManager.init).not.toHaveBeenCalled();
    });
  });
});

// --- Property-Based Tests ---
const fc = require('fast-check');

describe('Feature: eula-data-feedback, Property 1: EULA gate controls initialization', () => {
  let mockEulaDialogInstance;
  let mockGmailPlatformInstance;
  let mockAnalysisPanelInstance;
  let mockEmailPopupInstance;

  beforeEach(() => {
    // Reset DOM
    document.body.innerHTML = '';

    // Reset the initialization guard
    delete window.__aegisInitialized;

    // Reset chrome mocks
    chrome.storage.sync.get.mockReset();
    chrome.storage.sync.set.mockReset();
    chrome.storage.local.get.mockReset();
    chrome.storage.local.set.mockReset();
    chrome.runtime.sendMessage.mockReset();
    chrome.runtime.lastError = null;

    // Mock chrome.storage.onChanged
    if (!chrome.storage.onChanged) {
      chrome.storage.onChanged = { addListener: jest.fn() };
    } else {
      chrome.storage.onChanged.addListener = jest.fn();
    }

    // Mock chrome.runtime.onMessage
    if (!chrome.runtime.onMessage) {
      chrome.runtime.onMessage = { addListener: jest.fn() };
    } else {
      chrome.runtime.onMessage.addListener = jest.fn();
    }

    // --- Mock EulaDialog ---
    mockEulaDialogInstance = {
      show: jest.fn(),
      hide: jest.fn()
    };
    window.EulaDialog = jest.fn(() => mockEulaDialogInstance);

    // --- Mock GmailPlatform ---
    mockGmailPlatformInstance = {
      isMatchingPage: jest.fn().mockReturnValue(true),
      getName: jest.fn().mockReturnValue('Gmail'),
      getEmails: jest.fn().mockReturnValue([]),
      getLabels: jest.fn().mockReturnValue([]),
      getEmailDetail: jest.fn().mockReturnValue(null),
      observeNavigate: jest.fn()
    };
    window.GmailPlatform = jest.fn(() => mockGmailPlatformInstance);

    // --- Mock AnalysisPanel ---
    mockAnalysisPanelInstance = {
      show: jest.fn(),
      isVisible: jest.fn().mockReturnValue(false),
      getCurrentFilter: jest.fn().mockReturnValue('unread')
    };
    window.AnalysisPanel = jest.fn(() => mockAnalysisPanelInstance);

    // --- Mock EmailPopup ---
    mockEmailPopupInstance = {
      show: jest.fn(),
      hide: jest.fn()
    };
    window.EmailPopup = jest.fn(() => mockEmailPopupInstance);

    // --- Mock WhitelistManager ---
    window.WhitelistManager = {
      init: jest.fn().mockResolvedValue(undefined),
      isKnownShortUrl: jest.fn().mockReturnValue(false),
      getWhitelist: jest.fn().mockReturnValue([])
    };

    // --- Mock EmailAnalyzer ---
    window.EmailAnalyzer = {
      categorizeByKeywords: jest.fn().mockReturnValue({ id: 'tag', name: 'Other' }),
      analyzeEmailDetail: jest.fn().mockReturnValue({})
    };

    // Mock window.location
    Object.defineProperty(window, 'location', {
      value: { href: 'https://mail.google.com/mail/u/0/#inbox', hash: '#inbox' },
      writable: true,
      configurable: true
    });
  });

  afterEach(() => {
    delete window.__aegisInitialized;
  });

  const eulaStateArb = fc.oneof(
    fc.constant(true),
    fc.constant(false),
    fc.constant(undefined),
    fc.constant(null),
    fc.constant(0),
    fc.constant('true'),
    fc.constant(1),
    fc.constant('')
  );

  /**
   * Validates: Requirements 1.1, 1.2, 1.6, 2.3, 2.4, 8.1, 8.2
   *
   * For any eulaAccepted state, the EULA dialog is shown iff eulaAccepted
   * is not strictly true, and no analysis functions are called when not accepted.
   */
  test('dialog is shown iff eulaAccepted is not strictly true, and no analysis runs when not accepted', async () => {
    await fc.assert(
      fc.asyncProperty(eulaStateArb, async (eulaValue) => {
        // Reset state for each iteration
        delete window.__aegisInitialized;
        document.body.innerHTML = '';

        // Reset all mocks
        window.EulaDialog.mockClear();
        mockEulaDialogInstance.show.mockClear();
        window.GmailPlatform.mockClear();
        window.AnalysisPanel.mockClear();
        window.EmailPopup.mockClear();
        window.WhitelistManager.init.mockClear();
        chrome.storage.sync.get.mockReset();

        // Configure storage mock to return the generated eulaAccepted value
        chrome.storage.sync.get.mockImplementation((keys, cb) => {
          const result = eulaValue === undefined ? {} : { eulaAccepted: eulaValue };
          if (cb) { cb(result); return; }
          return Promise.resolve(result);
        });

        eval(contentCode);
        await flushPromises();

        if (eulaValue === true) {
          // Dialog should NOT be shown; initialization should proceed
          expect(window.EulaDialog).not.toHaveBeenCalled();
          expect(mockEulaDialogInstance.show).not.toHaveBeenCalled();
          expect(window.GmailPlatform).toHaveBeenCalled();
        } else {
          // Dialog SHOULD be shown; initialization should NOT proceed
          expect(window.EulaDialog).toHaveBeenCalled();
          expect(mockEulaDialogInstance.show).toHaveBeenCalledTimes(1);
          expect(window.GmailPlatform).not.toHaveBeenCalled();
          expect(window.AnalysisPanel).not.toHaveBeenCalled();
          expect(window.EmailPopup).not.toHaveBeenCalled();
        }
      }),
      { numRuns: 100 }
    );
  });
});
