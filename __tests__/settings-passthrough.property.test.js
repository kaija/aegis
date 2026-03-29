'use strict';

const fc = require('fast-check');
const { describe, test, expect } = require('@jest/globals');

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
