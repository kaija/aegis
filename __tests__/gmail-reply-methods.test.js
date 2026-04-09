'use strict';

const { describe, test, expect, beforeEach, afterEach, jest: jestGlobal } = require('@jest/globals');
const fs = require('fs');
const path = require('path');

describe('GmailPlatform Reply Methods', () => {
  let platform;

  beforeEach(() => {
    // Reset module state
    delete global.BasePlatform;
    delete global.window.BasePlatform;
    delete global.GmailPlatform;
    delete global.window.GmailPlatform;

    // Clear DOM
    document.body.innerHTML = '';

    // Load platform modules
    const baseCode = fs.readFileSync(path.join(__dirname, '../src/platforms/base-platform.js'), 'utf8');
    eval(baseCode);
    const gmailCode = fs.readFileSync(path.join(__dirname, '../src/platforms/gmail-platform.js'), 'utf8');
    eval(gmailCode);

    platform = new GmailPlatform();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  // ── clickReplyButton ──────────────────────────────────────────────────

  describe('clickReplyButton()', () => {
    function makeVisibleElement(tag, attrs) {
      const el = document.createElement(tag);
      for (const [key, val] of Object.entries(attrs)) {
        el.setAttribute(key, val);
      }
      // Mock getBoundingClientRect to report visible dimensions
      el.getBoundingClientRect = () => ({ width: 40, height: 40, top: 0, left: 0, right: 40, bottom: 40 });
      document.body.appendChild(el);
      return el;
    }

    test('returns true and clicks button found by aria-label="Reply"', () => {
      const btn = makeVisibleElement('div', { 'aria-label': 'Reply' });
      const clickSpy = jestGlobal.fn();
      btn.addEventListener('click', clickSpy);

      const result = platform.clickReplyButton();

      expect(result).toBe(true);
      expect(clickSpy).toHaveBeenCalled();
    });

    test('returns true and clicks button found by data-tooltip="Reply"', () => {
      const btn = makeVisibleElement('div', { 'data-tooltip': 'Reply' });
      const clickSpy = jestGlobal.fn();
      btn.addEventListener('click', clickSpy);

      const result = platform.clickReplyButton();

      expect(result).toBe(true);
      expect(clickSpy).toHaveBeenCalled();
    });

    test('returns true for i18n Chinese aria-label="回覆"', () => {
      const btn = makeVisibleElement('div', { 'aria-label': '回覆' });
      const clickSpy = jestGlobal.fn();
      btn.addEventListener('click', clickSpy);

      const result = platform.clickReplyButton();

      expect(result).toBe(true);
      expect(clickSpy).toHaveBeenCalled();
    });

    test('returns true for data-tooltip containing "Reply" (tooltipContains)', () => {
      const btn = makeVisibleElement('div', { 'data-tooltip': 'Reply to sender' });
      const clickSpy = jestGlobal.fn();
      btn.addEventListener('click', clickSpy);

      const result = platform.clickReplyButton();

      expect(result).toBe(true);
      expect(clickSpy).toHaveBeenCalled();
    });

    test('returns false when no reply button exists in DOM', () => {
      const result = platform.clickReplyButton();
      expect(result).toBe(false);
    });

    test('returns false when reply button exists but has zero dimensions', () => {
      const btn = document.createElement('div');
      btn.setAttribute('aria-label', 'Reply');
      // Default jsdom getBoundingClientRect returns all zeros
      document.body.appendChild(btn);

      const result = platform.clickReplyButton();
      expect(result).toBe(false);
    });
  });

  // ── waitForComposeBox ─────────────────────────────────────────────────

  describe('waitForComposeBox()', () => {
    test('resolves with element when compose box is present immediately', async () => {
      const composeBox = document.createElement('div');
      composeBox.setAttribute('role', 'textbox');
      composeBox.setAttribute('aria-label', 'Message Body');
      composeBox.setAttribute('contenteditable', 'true');
      composeBox.getBoundingClientRect = () => ({ width: 500, height: 200, top: 0, left: 0, right: 500, bottom: 200 });
      document.body.appendChild(composeBox);

      const result = await platform.waitForComposeBox(1000);

      expect(result).toBe(composeBox);
    });

    test('resolves with null when timeout exceeded and no compose box', async () => {
      jestGlobal.useFakeTimers();

      const promise = platform.waitForComposeBox(500);

      // Advance past the timeout
      jestGlobal.advanceTimersByTime(600);

      const result = await promise;
      expect(result).toBeNull();

      jestGlobal.useRealTimers();
    });

    test('resolves with contenteditable div matching second selector', async () => {
      const composeBox = document.createElement('div');
      composeBox.setAttribute('contenteditable', 'true');
      composeBox.getBoundingClientRect = () => ({ width: 500, height: 200, top: 0, left: 0, right: 500, bottom: 200 });
      document.body.appendChild(composeBox);

      const result = await platform.waitForComposeBox(1000);

      expect(result).toBe(composeBox);
    });
  });

  // ── insertReplyContent ────────────────────────────────────────────────

  describe('insertReplyContent()', () => {
    test('sets innerHTML of compose box to provided text', () => {
      const composeBox = document.createElement('div');
      composeBox.setAttribute('contenteditable', 'true');
      document.body.appendChild(composeBox);

      platform.insertReplyContent(composeBox, 'Hello, thanks for your email!');

      expect(composeBox.innerHTML).toBe('Hello, thanks for your email!');
    });

    test('dispatches input event on the compose box', () => {
      const composeBox = document.createElement('div');
      composeBox.setAttribute('contenteditable', 'true');
      document.body.appendChild(composeBox);

      let inputFired = false;
      composeBox.addEventListener('input', () => { inputFired = true; });

      platform.insertReplyContent(composeBox, 'Test reply content');

      expect(inputFired).toBe(true);
    });

    test('input event bubbles', () => {
      const composeBox = document.createElement('div');
      composeBox.setAttribute('contenteditable', 'true');
      document.body.appendChild(composeBox);

      let bubbled = false;
      document.body.addEventListener('input', () => { bubbled = true; });

      platform.insertReplyContent(composeBox, 'Bubbling test');

      expect(bubbled).toBe(true);
    });
  });
});
