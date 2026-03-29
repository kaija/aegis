'use strict';

const { describe, test, expect, beforeEach, afterEach } = require('@jest/globals');
const fs = require('fs');
const path = require('path');

// Load the EulaDialog module source
const eulaDialogCode = fs.readFileSync(path.join(__dirname, '../src/ui/eula-dialog.js'), 'utf8');

describe('EulaDialog', () => {
  let dialog;

  beforeEach(() => {
    // Reset DOM
    document.body.innerHTML = '';

    // Reset chrome mocks
    chrome.storage.sync.set.mockReset();
    chrome.runtime.lastError = null;

    // Re-evaluate module to ensure clean state
    eval(eulaDialogCode);

    dialog = new window.EulaDialog();
  });

  afterEach(() => {
    // Clean up any remaining overlays and listeners
    dialog.hide();
    const overlay = document.getElementById('aegis-eula-overlay');
    if (overlay) overlay.remove();
  });

  describe('DOM structure', () => {
    test('should create full-screen overlay with correct id and class', () => {
      dialog.show({ onAccept: jest.fn(), onDecline: jest.fn() });

      const overlay = document.getElementById('aegis-eula-overlay');
      expect(overlay).toBeTruthy();
      expect(overlay.className).toBe('aegis-eula-overlay');
    });

    test('should create dialog with role, aria-modal, and aria-labelledby', () => {
      dialog.show({ onAccept: jest.fn(), onDecline: jest.fn() });

      const dlg = document.querySelector('.aegis-eula-dialog');
      expect(dlg).toBeTruthy();
      expect(dlg.getAttribute('role')).toBe('dialog');
      expect(dlg.getAttribute('aria-modal')).toBe('true');
      expect(dlg.getAttribute('aria-labelledby')).toBe('aegis-eula-title');
    });

    test('should contain title "End User License Agreement"', () => {
      dialog.show({ onAccept: jest.fn(), onDecline: jest.fn() });

      const title = document.getElementById('aegis-eula-title');
      expect(title).toBeTruthy();
      expect(title.textContent).toBe('End User License Agreement');
      expect(title.tagName).toBe('H2');
    });

    test('should contain scrollable EULA body', () => {
      dialog.show({ onAccept: jest.fn(), onDecline: jest.fn() });

      const body = document.querySelector('.aegis-eula-body');
      expect(body).toBeTruthy();
      // Body should have EULA content
      expect(body.children.length).toBeGreaterThan(0);
    });

    test('should contain data feedback notice text', () => {
      dialog.show({ onAccept: jest.fn(), onDecline: jest.fn() });

      const notice = document.querySelector('.aegis-eula-notice');
      expect(notice).toBeTruthy();
      expect(notice.textContent).toContain('anonymous category data feedback will be enabled by default');
      expect(notice.textContent).toContain('Settings');
    });

    test('should contain Accept and Decline buttons', () => {
      dialog.show({ onAccept: jest.fn(), onDecline: jest.fn() });

      const acceptBtn = document.querySelector('.aegis-eula-btn-accept');
      const declineBtn = document.querySelector('.aegis-eula-btn-decline');
      expect(acceptBtn).toBeTruthy();
      expect(declineBtn).toBeTruthy();
      expect(acceptBtn.textContent).toBe('Accept');
      expect(declineBtn.textContent).toBe('Decline');
    });

    test('should contain actions container', () => {
      dialog.show({ onAccept: jest.fn(), onDecline: jest.fn() });

      const actions = document.querySelector('.aegis-eula-actions');
      expect(actions).toBeTruthy();
      expect(actions.querySelectorAll('button').length).toBe(2);
    });
  });

  describe('Accept button', () => {
    test('should call chrome.storage.sync.set with correct data', () => {
      const onAccept = jest.fn();
      chrome.storage.sync.set.mockImplementation((data, cb) => cb());

      dialog.show({ onAccept, onDecline: jest.fn() });

      const acceptBtn = document.querySelector('.aegis-eula-btn-accept');
      acceptBtn.click();

      expect(chrome.storage.sync.set).toHaveBeenCalledTimes(1);
      const storedData = chrome.storage.sync.set.mock.calls[0][0];
      expect(storedData.eulaAccepted).toBe(true);
      expect(storedData.dataFeedbackEnabled).toBe(true);
    });

    test('should store a valid ISO 8601 eulaAcceptedAt timestamp', () => {
      chrome.storage.sync.set.mockImplementation((data, cb) => cb());

      dialog.show({ onAccept: jest.fn(), onDecline: jest.fn() });

      const acceptBtn = document.querySelector('.aegis-eula-btn-accept');
      acceptBtn.click();

      const storedData = chrome.storage.sync.set.mock.calls[0][0];
      expect(storedData.eulaAcceptedAt).toBeDefined();
      // Validate ISO 8601 format — Date.parse returns NaN for invalid strings
      const parsed = Date.parse(storedData.eulaAcceptedAt);
      expect(isNaN(parsed)).toBe(false);
      // Verify it looks like an ISO string (ends with Z or has timezone offset)
      expect(storedData.eulaAcceptedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    test('should call onAccept callback after successful storage write', () => {
      const onAccept = jest.fn();
      chrome.storage.sync.set.mockImplementation((data, cb) => cb());

      dialog.show({ onAccept, onDecline: jest.fn() });

      const acceptBtn = document.querySelector('.aegis-eula-btn-accept');
      acceptBtn.click();

      expect(onAccept).toHaveBeenCalledTimes(1);
    });

    test('should remove dialog from DOM after successful accept', () => {
      chrome.storage.sync.set.mockImplementation((data, cb) => cb());

      dialog.show({ onAccept: jest.fn(), onDecline: jest.fn() });
      expect(document.getElementById('aegis-eula-overlay')).toBeTruthy();

      const acceptBtn = document.querySelector('.aegis-eula-btn-accept');
      acceptBtn.click();

      expect(document.getElementById('aegis-eula-overlay')).toBeNull();
    });
  });

  describe('Decline button', () => {
    test('should remove dialog from DOM', () => {
      dialog.show({ onAccept: jest.fn(), onDecline: jest.fn() });
      expect(document.getElementById('aegis-eula-overlay')).toBeTruthy();

      const declineBtn = document.querySelector('.aegis-eula-btn-decline');
      declineBtn.click();

      expect(document.getElementById('aegis-eula-overlay')).toBeNull();
    });

    test('should call onDecline callback', () => {
      const onDecline = jest.fn();
      dialog.show({ onAccept: jest.fn(), onDecline });

      const declineBtn = document.querySelector('.aegis-eula-btn-decline');
      declineBtn.click();

      expect(onDecline).toHaveBeenCalledTimes(1);
    });

    test('should not call chrome.storage.sync.set', () => {
      dialog.show({ onAccept: jest.fn(), onDecline: jest.fn() });

      const declineBtn = document.querySelector('.aegis-eula-btn-decline');
      declineBtn.click();

      expect(chrome.storage.sync.set).not.toHaveBeenCalled();
    });
  });

  describe('Escape key', () => {
    test('should trigger decline behavior when Escape is pressed', () => {
      const onDecline = jest.fn();
      dialog.show({ onAccept: jest.fn(), onDecline });

      const event = new KeyboardEvent('keydown', { key: 'Escape' });
      document.dispatchEvent(event);

      expect(onDecline).toHaveBeenCalledTimes(1);
    });

    test('should remove dialog from DOM on Escape', () => {
      dialog.show({ onAccept: jest.fn(), onDecline: jest.fn() });
      expect(document.getElementById('aegis-eula-overlay')).toBeTruthy();

      const event = new KeyboardEvent('keydown', { key: 'Escape' });
      document.dispatchEvent(event);

      expect(document.getElementById('aegis-eula-overlay')).toBeNull();
    });

    test('should not respond to other keys', () => {
      const onDecline = jest.fn();
      dialog.show({ onAccept: jest.fn(), onDecline });

      const event = new KeyboardEvent('keydown', { key: 'Enter' });
      document.dispatchEvent(event);

      expect(onDecline).not.toHaveBeenCalled();
      expect(document.getElementById('aegis-eula-overlay')).toBeTruthy();
    });
  });

  describe('Overlay click', () => {
    test('should not dismiss dialog when clicking overlay outside dialog', () => {
      const onDecline = jest.fn();
      dialog.show({ onAccept: jest.fn(), onDecline });

      const overlay = document.getElementById('aegis-eula-overlay');
      overlay.click();

      // Dialog should still be present
      expect(document.getElementById('aegis-eula-overlay')).toBeTruthy();
      expect(onDecline).not.toHaveBeenCalled();
    });

    test('should not dismiss dialog when clicking inside dialog', () => {
      const onDecline = jest.fn();
      dialog.show({ onAccept: jest.fn(), onDecline });

      const dlg = document.querySelector('.aegis-eula-dialog');
      dlg.click();

      expect(document.getElementById('aegis-eula-overlay')).toBeTruthy();
      expect(onDecline).not.toHaveBeenCalled();
    });
  });

  describe('Storage write failure', () => {
    test('should not call onAccept when storage write fails', () => {
      const onAccept = jest.fn();
      chrome.storage.sync.set.mockImplementation((data, cb) => {
        chrome.runtime.lastError = { message: 'Storage quota exceeded' };
        cb();
        chrome.runtime.lastError = null;
      });

      dialog.show({ onAccept, onDecline: jest.fn() });

      const acceptBtn = document.querySelector('.aegis-eula-btn-accept');
      acceptBtn.click();

      expect(chrome.storage.sync.set).toHaveBeenCalledTimes(1);
      expect(onAccept).not.toHaveBeenCalled();
    });

    test('should log warning on storage write failure', () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      chrome.storage.sync.set.mockImplementation((data, cb) => {
        chrome.runtime.lastError = { message: 'Write error' };
        cb();
        chrome.runtime.lastError = null;
      });

      dialog.show({ onAccept: jest.fn(), onDecline: jest.fn() });

      const acceptBtn = document.querySelector('.aegis-eula-btn-accept');
      acceptBtn.click();

      expect(warnSpy).toHaveBeenCalled();
      expect(warnSpy.mock.calls[0][0]).toContain('Aegis');
      warnSpy.mockRestore();
    });

    test('should keep dialog visible on storage write failure', () => {
      chrome.storage.sync.set.mockImplementation((data, cb) => {
        chrome.runtime.lastError = { message: 'Disk full' };
        cb();
        chrome.runtime.lastError = null;
      });

      dialog.show({ onAccept: jest.fn(), onDecline: jest.fn() });

      const acceptBtn = document.querySelector('.aegis-eula-btn-accept');
      acceptBtn.click();

      // Dialog should remain since accept failed
      expect(document.getElementById('aegis-eula-overlay')).toBeTruthy();
    });
  });

  describe('hide()', () => {
    test('should remove overlay from DOM', () => {
      dialog.show({ onAccept: jest.fn(), onDecline: jest.fn() });
      expect(document.getElementById('aegis-eula-overlay')).toBeTruthy();

      dialog.hide();

      expect(document.getElementById('aegis-eula-overlay')).toBeNull();
    });

    test('should not throw when called without showing first', () => {
      expect(() => dialog.hide()).not.toThrow();
    });

    test('should clean up Escape key listener after hide', () => {
      const onDecline = jest.fn();
      dialog.show({ onAccept: jest.fn(), onDecline });
      dialog.hide();

      const event = new KeyboardEvent('keydown', { key: 'Escape' });
      document.dispatchEvent(event);

      // onDecline was called once during hide's internal cleanup,
      // but the keydown listener should be removed
      expect(onDecline).not.toHaveBeenCalled();
    });
  });

  describe('module export', () => {
    test('should export EulaDialog to window', () => {
      expect(window.EulaDialog).toBeDefined();
      expect(typeof window.EulaDialog).toBe('function');
    });

    test('should have show and hide methods', () => {
      const instance = new window.EulaDialog();
      expect(typeof instance.show).toBe('function');
      expect(typeof instance.hide).toBe('function');
    });
  });
});

// Property-based tests for EULA dialog CSS prefix convention
const fc = require('fast-check');

describe('Property 6: EULA dialog CSS prefix convention', () => {
  // Feature: eula-data-feedback, Property 6: EULA dialog CSS prefix convention
  // **Validates: Requirements 6.5**

  let dialog;

  beforeEach(() => {
    document.body.innerHTML = '';
    chrome.storage.sync.set.mockReset();
    chrome.runtime.lastError = null;
    eval(eulaDialogCode);
    dialog = new window.EulaDialog();
  });

  afterEach(() => {
    dialog.hide();
    const overlay = document.getElementById('aegis-eula-overlay');
    if (overlay) overlay.remove();
  });

  test('every element ID injected by EulaDialog uses the aegis- prefix', () => {
    fc.assert(
      fc.property(fc.constant(null), () => {
        // Render the dialog
        dialog.show({ onAccept: jest.fn(), onDecline: jest.fn() });

        const overlay = document.getElementById('aegis-eula-overlay');
        expect(overlay).toBeTruthy();

        // Collect all elements with an id attribute inside the overlay (including overlay itself)
        const allElements = [overlay, ...overlay.querySelectorAll('*')];
        const elementsWithId = allElements.filter(el => el.id);

        expect(elementsWithId.length).toBeGreaterThan(0);

        for (const el of elementsWithId) {
          expect(el.id).toMatch(/^aegis-/);
        }

        // Clean up for next iteration
        dialog.hide();
      }),
      { numRuns: 100 }
    );
  });

  test('every CSS class injected by EulaDialog uses the aegis- prefix', () => {
    fc.assert(
      fc.property(fc.constant(null), () => {
        // Render the dialog
        dialog.show({ onAccept: jest.fn(), onDecline: jest.fn() });

        const overlay = document.getElementById('aegis-eula-overlay');
        expect(overlay).toBeTruthy();

        // Collect all elements with class names inside the overlay (including overlay itself)
        const allElements = [overlay, ...overlay.querySelectorAll('*')];
        const elementsWithClasses = allElements.filter(el => el.classList.length > 0);

        expect(elementsWithClasses.length).toBeGreaterThan(0);

        for (const el of elementsWithClasses) {
          for (const cls of el.classList) {
            expect(cls).toMatch(/^aegis-/);
          }
        }

        // Clean up for next iteration
        dialog.hide();
      }),
      { numRuns: 100 }
    );
  });
});

// Property-based tests for EULA acceptance state persistence
describe('Property 2: Acceptance persists correct state', () => {
  // Feature: eula-data-feedback, Property 2: Acceptance persists correct state
  // **Validates: Requirements 1.4, 2.1, 3.1**

  let dialog;

  beforeEach(() => {
    document.body.innerHTML = '';
    chrome.storage.sync.set.mockReset();
    chrome.runtime.lastError = null;
    eval(eulaDialogCode);
    dialog = new window.EulaDialog();
  });

  afterEach(() => {
    dialog.hide();
    const overlay = document.getElementById('aegis-eula-overlay');
    if (overlay) overlay.remove();
  });

  test('acceptance handler always persists eulaAccepted: true, valid ISO 8601 eulaAcceptedAt, and dataFeedbackEnabled: true', () => {
    fc.assert(
      fc.property(
        // Generate random timestamps spanning a wide range (1970 to ~2033)
        fc.integer({ min: 0, max: 2000000000000 }),
        (timestamp) => {
          // Reset mocks for each iteration
          chrome.storage.sync.set.mockReset();
          chrome.runtime.lastError = null;
          document.body.innerHTML = '';

          // Use jest.spyOn to mock Date.now for the generated timestamp
          const dateNowSpy = jest.spyOn(Date, 'now').mockReturnValue(timestamp);
          const originalToISOString = Date.prototype.toISOString;
          Date.prototype.toISOString = function () {
            return new Date(timestamp).toISOString.call(new Date(timestamp));
          };
          // Restore toISOString properly — use a fresh Date from the timestamp
          Date.prototype.toISOString = originalToISOString;

          // Mock storage to invoke callback synchronously (success path)
          chrome.storage.sync.set.mockImplementation((_data, cb) => cb());

          dialog = new window.EulaDialog();
          dialog.show({ onAccept: jest.fn(), onDecline: jest.fn() });

          const acceptBtn = document.querySelector('.aegis-eula-btn-accept');
          acceptBtn.click();

          // Verify chrome.storage.sync.set was called exactly once
          expect(chrome.storage.sync.set).toHaveBeenCalledTimes(1);

          const storedData = chrome.storage.sync.set.mock.calls[0][0];

          // Requirement 1.4 / 2.1: eulaAccepted must be strictly true
          expect(storedData.eulaAccepted).toBe(true);

          // Requirement 3.1: dataFeedbackEnabled must be strictly true
          expect(storedData.dataFeedbackEnabled).toBe(true);

          // Requirement 2.1: eulaAcceptedAt must be a valid ISO 8601 string
          expect(typeof storedData.eulaAcceptedAt).toBe('string');
          const parsed = Date.parse(storedData.eulaAcceptedAt);
          expect(isNaN(parsed)).toBe(false);
          // Verify ISO 8601 format pattern (YYYY-MM-DDTHH:mm:ss.sssZ)
          expect(storedData.eulaAcceptedAt).toMatch(
            /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/
          );

          // Clean up
          dateNowSpy.mockRestore();
          dialog.hide();
        }
      ),
      { numRuns: 100 }
    );
  });
});
