'use strict';

const fc = require('fast-check');
const { describe, test, expect, beforeEach, afterEach } = require('@jest/globals');
const fs = require('fs');
const path = require('path');

describe('GmailPlatform Reply Methods Property Tests', () => {
  let platform;

  beforeEach(() => {
    delete global.BasePlatform;
    delete global.window.BasePlatform;
    delete global.GmailPlatform;
    delete global.window.GmailPlatform;

    document.body.innerHTML = '';

    const baseCode = fs.readFileSync(path.join(__dirname, '../src/platforms/base-platform.js'), 'utf8');
    eval(baseCode);
    const gmailCode = fs.readFileSync(path.join(__dirname, '../src/platforms/gmail-platform.js'), 'utf8');
    eval(gmailCode);

    platform = new GmailPlatform();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  // ── Property 8: insertReplyContent sets content and dispatches event ──
  // **Validates: Requirements 7.3**
  describe('Property 8: insertReplyContent sets content and dispatches event', () => {
    // Use characters safe for innerHTML (no HTML special chars that get encoded)
    const SAFE_CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 .,!?-_:;()@#$%^*+=~`\'"\\/ \n\t';
    const safeTextArb = fc.array(
      fc.constantFrom(...SAFE_CHARS.split('')),
      { minLength: 1, maxLength: 200 }
    ).map(chars => chars.join(''));

    test('for any non-empty text, innerHTML equals text and input event fires', () => {
      fc.assert(
        fc.property(
          safeTextArb,
          (text) => {
            const composeBox = document.createElement('div');
            composeBox.setAttribute('contenteditable', 'true');
            document.body.appendChild(composeBox);

            let inputFired = false;
            composeBox.addEventListener('input', () => { inputFired = true; });

            platform.insertReplyContent(composeBox, text);

            expect(composeBox.innerHTML).toBe(text);
            expect(inputFired).toBe(true);

            // Clean up for next iteration
            document.body.removeChild(composeBox);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
