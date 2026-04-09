'use strict';

const fc = require('fast-check');
const { describe, test, expect, beforeEach, afterEach } = require('@jest/globals');
const fs = require('fs');
const path = require('path');

function loadEmailPopup() {
  delete global.EmailPopup;
  delete global.window.EmailPopup;
  delete global.window.getPopupIconSvg;
  const code = fs.readFileSync(path.join(__dirname, '../src/ui/email-popup.js'), 'utf8');
  eval(code);
}

const SAFE_CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 ';
const safeStringArb = (opts) => fc.array(
  fc.constantFrom(...SAFE_CHARS.split('')),
  { minLength: opts.minLength, maxLength: opts.maxLength }
).map(chars => chars.join(''));

const MINIMAL_ANALYSIS = {
  category: { name: 'Test', emoji: 'tag', color: '#333', bgColor: '#f5f5f5' },
  tags: [],
  safetyScore: 80,
  safetyLevel: 'safe',
  safetyColor: '#1a7f37',
  issues: [],
  linkResults: []
};

describe('EmailPopup Reply Panel Property Tests', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    delete global.EmailPopup;
    delete global.window.EmailPopup;
    delete global.window.getPopupIconSvg;
    loadEmailPopup();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  // ── Property 7: Panel renders emailType and all option labels ──────────
  // **Validates: Requirements 4.2, 4.3**
  describe('Property 7: Panel renders emailType and all option labels', () => {
    test('DOM contains emailType text and every label as a button', () => {
      const replyDataArb = fc.record({
        emailType: safeStringArb({ minLength: 1, maxLength: 30 }),
        replyOptions: fc.array(
          fc.record({
            label: safeStringArb({ minLength: 1, maxLength: 20 }),
            prefix: safeStringArb({ minLength: 1, maxLength: 50 })
          }),
          { minLength: 2, maxLength: 3 }
        )
      });

      fc.assert(
        fc.property(replyDataArb, (replyData) => {
          document.body.innerHTML = '';
          loadEmailPopup();

          const popup = new EmailPopup();
          popup.show(MINIMAL_ANALYSIS);
          popup.showReplyOptions(replyData, () => {});

          const panel = popup.popup.querySelector('.aegis-reply-panel');
          expect(panel).not.toBeNull();

          // emailType rendered as uppercase in the label
          const typeLabel = panel.querySelector('.aegis-reply-type-label');
          expect(typeLabel).not.toBeNull();
          expect(typeLabel.textContent).toContain(replyData.emailType.toUpperCase());

          // Every option label rendered as a button
          const buttons = panel.querySelectorAll('.aegis-reply-btn');
          expect(buttons.length).toBe(replyData.replyOptions.length);

          replyData.replyOptions.forEach((option, i) => {
            expect(buttons[i].textContent).toBe(option.label);
            expect(buttons[i].tagName).toBe('BUTTON');
          });
        }),
        { numRuns: 100 }
      );
    });
  });
});
