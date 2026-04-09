'use strict';

const { describe, test, expect, beforeEach, afterEach, jest: jestGlobal } = require('@jest/globals');
const fs = require('fs');
const path = require('path');

describe('QuickReplyGenerator', () => {
  let mockSession;

  beforeEach(() => {
    // Reset module state by re-evaluating
    delete global.QuickReplyGenerator;
    delete global.window.QuickReplyGenerator;

    mockSession = {
      prompt: jestGlobal.fn(),
      destroy: jestGlobal.fn(),
      contextUsage: 0.1
    };

    global.LanguageModel = {
      availability: jestGlobal.fn().mockResolvedValue('available'),
      create: jestGlobal.fn().mockResolvedValue(mockSession)
    };

    // Load module fresh
    const code = fs.readFileSync(path.join(__dirname, '../src/analysis/quick-reply-generator.js'), 'utf8');
    eval(code);
  });

  afterEach(() => {
    // Clean up
    if (global.QuickReplyGenerator) {
      global.QuickReplyGenerator.destroy();
    }
  });

  // ── generateReplyOptions ──────────────────────────────────────────────

  describe('generateReplyOptions()', () => {
    const sampleEmail = {
      subject: 'Meeting tomorrow at 3pm',
      sender: 'Alice',
      body: 'Hi, can we meet tomorrow at 3pm to discuss the project?'
    };

    const validResponse = {
      emailType: 'Meeting Request',
      replyOptions: [
        { label: 'Accept', prefix: 'Sure, I can make it at 3pm.' },
        { label: 'Decline', prefix: 'Sorry, I have a conflict at that time.' }
      ]
    };

    test('returns correct shape for valid email data and valid AI response', async () => {
      mockSession.prompt.mockResolvedValue(JSON.stringify(validResponse));

      const result = await QuickReplyGenerator.generateReplyOptions(sampleEmail);

      expect(result).not.toBeNull();
      expect(result.emailType).toBe('Meeting Request');
      expect(result.replyOptions).toHaveLength(2);
      expect(result.replyOptions[0]).toEqual({ label: 'Accept', prefix: 'Sure, I can make it at 3pm.' });
      expect(result.replyOptions[1]).toEqual({ label: 'Decline', prefix: 'Sorry, I have a conflict at that time.' });
    });

    test('returns correct shape with 3 reply options', async () => {
      const threeOptions = {
        emailType: 'Invoice',
        replyOptions: [
          { label: 'Approve', prefix: 'Invoice approved, please proceed.' },
          { label: 'Reject', prefix: 'I need to review this further.' },
          { label: 'Question', prefix: 'Could you clarify the line items?' }
        ]
      };
      mockSession.prompt.mockResolvedValue(JSON.stringify(threeOptions));

      const result = await QuickReplyGenerator.generateReplyOptions(sampleEmail);

      expect(result).not.toBeNull();
      expect(result.emailType).toBe('Invoice');
      expect(result.replyOptions).toHaveLength(3);
    });

    test('returns null when body is empty string', async () => {
      const emailWithEmptyBody = { subject: 'Test', sender: 'Bob', body: '' };

      // The module should still call the API but with empty body
      // If the AI returns something invalid for empty body, it returns null
      // But the key behavior: empty body doesn't crash
      const invalidResponse = { emailType: 'Unknown', replyOptions: [] };
      mockSession.prompt.mockResolvedValue(JSON.stringify(invalidResponse));

      const result = await QuickReplyGenerator.generateReplyOptions(emailWithEmptyBody);
      // replyOptions.length < 2 → null
      expect(result).toBeNull();
    });

    test('returns null when AI returns invalid JSON', async () => {
      mockSession.prompt.mockResolvedValue('this is not valid json at all');

      const result = await QuickReplyGenerator.generateReplyOptions(sampleEmail);
      expect(result).toBeNull();
    });

    test('returns null when AI returns fewer than 2 options', async () => {
      const oneOption = {
        emailType: 'Newsletter',
        replyOptions: [
          { label: 'Unsubscribe', prefix: 'Please remove me from this list.' }
        ]
      };
      mockSession.prompt.mockResolvedValue(JSON.stringify(oneOption));

      const result = await QuickReplyGenerator.generateReplyOptions(sampleEmail);
      expect(result).toBeNull();
    });

    test('returns null when AI returns more than 3 options', async () => {
      const fourOptions = {
        emailType: 'Meeting Request',
        replyOptions: [
          { label: 'Accept', prefix: 'Sure!' },
          { label: 'Decline', prefix: 'No thanks.' },
          { label: 'Reschedule', prefix: 'Can we move it?' },
          { label: 'Delegate', prefix: 'Let me forward this.' }
        ]
      };
      mockSession.prompt.mockResolvedValue(JSON.stringify(fourOptions));

      const result = await QuickReplyGenerator.generateReplyOptions(sampleEmail);
      expect(result).toBeNull();
    });

    test('returns null without throwing when LanguageModel is undefined', async () => {
      delete global.LanguageModel;

      const result = await QuickReplyGenerator.generateReplyOptions(sampleEmail);
      expect(result).toBeNull();
    });

    test('returns null when session.prompt() throws', async () => {
      mockSession.prompt.mockRejectedValue(new Error('Prompt API error'));

      const result = await QuickReplyGenerator.generateReplyOptions(sampleEmail);
      expect(result).toBeNull();
    });

    test('creates a LanguageModel session on first call', async () => {
      mockSession.prompt.mockResolvedValue(JSON.stringify(validResponse));

      await QuickReplyGenerator.generateReplyOptions(sampleEmail);

      expect(global.LanguageModel.create).toHaveBeenCalledTimes(1);
    });

    test('prompt includes subject, sender, and body', async () => {
      mockSession.prompt.mockResolvedValue(JSON.stringify(validResponse));

      await QuickReplyGenerator.generateReplyOptions(sampleEmail);

      const promptArg = mockSession.prompt.mock.calls[0][0];
      expect(promptArg).toContain('Meeting tomorrow at 3pm');
      expect(promptArg).toContain('Alice');
      expect(promptArg).toContain('can we meet tomorrow');
    });
  });

  // ── generateFullReply ─────────────────────────────────────────────────

  describe('generateFullReply()', () => {
    const sampleEmail = {
      subject: 'Meeting tomorrow at 3pm',
      sender: 'Alice',
      body: 'Hi, can we meet tomorrow at 3pm to discuss the project?'
    };

    test('returns reply string for valid input', async () => {
      const fullReplyResponse = {
        reply: 'Sure, I can make it at 3pm tomorrow. Looking forward to discussing the project updates with you.'
      };
      mockSession.prompt.mockResolvedValue(JSON.stringify(fullReplyResponse));

      const result = await QuickReplyGenerator.generateFullReply(sampleEmail, 'Sure, I can make it at 3pm.');

      expect(typeof result).toBe('string');
      expect(result).toBe(fullReplyResponse.reply);
    });

    test('returns null when AI returns invalid response', async () => {
      mockSession.prompt.mockResolvedValue('not valid json');

      const result = await QuickReplyGenerator.generateFullReply(sampleEmail, 'Sure!');
      expect(result).toBeNull();
    });

    test('returns null when AI response missing reply field', async () => {
      mockSession.prompt.mockResolvedValue(JSON.stringify({ text: 'wrong field' }));

      const result = await QuickReplyGenerator.generateFullReply(sampleEmail, 'Sure!');
      expect(result).toBeNull();
    });

    test('returns null when LanguageModel is undefined', async () => {
      delete global.LanguageModel;

      const result = await QuickReplyGenerator.generateFullReply(sampleEmail, 'Sure!');
      expect(result).toBeNull();
    });

    test('returns null when session.prompt() throws', async () => {
      mockSession.prompt.mockRejectedValue(new Error('Session error'));

      const result = await QuickReplyGenerator.generateFullReply(sampleEmail, 'Sure!');
      expect(result).toBeNull();
    });
  });

  // ── destroy ───────────────────────────────────────────────────────────

  describe('destroy()', () => {
    test('calls session.destroy() when session exists', async () => {
      const validResponse = {
        emailType: 'Meeting Request',
        replyOptions: [
          { label: 'Accept', prefix: 'Sure!' },
          { label: 'Decline', prefix: 'No thanks.' }
        ]
      };
      mockSession.prompt.mockResolvedValue(JSON.stringify(validResponse));

      // Trigger session creation
      await QuickReplyGenerator.generateReplyOptions({
        subject: 'Test', sender: 'A', body: 'Hello'
      });

      QuickReplyGenerator.destroy();
      expect(mockSession.destroy).toHaveBeenCalled();
    });

    test('safe to call when no session exists (no throw)', () => {
      // No session created yet — should not throw
      expect(() => QuickReplyGenerator.destroy()).not.toThrow();
    });
  });

  // ── Session lifecycle ─────────────────────────────────────────────────

  describe('Session lifecycle', () => {
    const validResponse = {
      emailType: 'Meeting Request',
      replyOptions: [
        { label: 'Accept', prefix: 'Sure!' },
        { label: 'Decline', prefix: 'No thanks.' }
      ]
    };

    const sampleEmail = { subject: 'Test', sender: 'A', body: 'Hello' };

    test('reuses session across multiple calls', async () => {
      mockSession.prompt.mockResolvedValue(JSON.stringify(validResponse));

      await QuickReplyGenerator.generateReplyOptions(sampleEmail);
      await QuickReplyGenerator.generateReplyOptions(sampleEmail);
      await QuickReplyGenerator.generateReplyOptions(sampleEmail);

      // Session should be created only once
      expect(global.LanguageModel.create).toHaveBeenCalledTimes(1);
    });

    test('creates new session when context exceeds 80%', async () => {
      mockSession.prompt.mockResolvedValue(JSON.stringify(validResponse));

      // First call — creates session
      await QuickReplyGenerator.generateReplyOptions(sampleEmail);
      expect(global.LanguageModel.create).toHaveBeenCalledTimes(1);

      // Simulate context exceeding 80%
      mockSession.contextUsage = 0.9;

      // Second call — should destroy old and create new
      const freshSession = {
        prompt: jestGlobal.fn().mockResolvedValue(JSON.stringify(validResponse)),
        destroy: jestGlobal.fn(),
        contextUsage: 0.1
      };
      global.LanguageModel.create.mockResolvedValue(freshSession);

      await QuickReplyGenerator.generateReplyOptions(sampleEmail);
      expect(mockSession.destroy).toHaveBeenCalled();
      expect(global.LanguageModel.create).toHaveBeenCalledTimes(2);
    });
  });
});
