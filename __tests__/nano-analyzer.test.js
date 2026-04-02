'use strict';

const { describe, test, expect, beforeEach, afterEach, jest: jestGlobal } = require('@jest/globals');
const fs = require('fs');
const path = require('path');

describe('NanoAnalyzer', () => {
  let mockSession;

  beforeEach(() => {
    // Reset module state by re-evaluating
    delete global.NanoAnalyzer;
    delete global.window.NanoAnalyzer;

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
    const code = fs.readFileSync(path.join(__dirname, '../src/analysis/nano-analyzer.js'), 'utf8');
    eval(code);
  });

  afterEach(() => {
    // Clean up
    if (global.NanoAnalyzer) {
      global.NanoAnalyzer.destroy();
    }
  });

  // ── checkAvailability ─────────────────────────────────────────────────

  describe('checkAvailability()', () => {
    test('returns "no-api" when LanguageModel is undefined', async () => {
      delete global.LanguageModel;
      const status = await NanoAnalyzer.checkAvailability();
      expect(status).toBe('no-api');
    });

    test('returns "available" when LanguageModel.availability() returns "available"', async () => {
      global.LanguageModel.availability.mockResolvedValue('available');
      const status = await NanoAnalyzer.checkAvailability();
      expect(status).toBe('available');
    });

    test('returns "downloadable" when LanguageModel.availability() returns "downloadable"', async () => {
      global.LanguageModel.availability.mockResolvedValue('downloadable');
      const status = await NanoAnalyzer.checkAvailability();
      expect(status).toBe('downloadable');
    });

    test('returns "downloading" when LanguageModel.availability() returns "downloading"', async () => {
      global.LanguageModel.availability.mockResolvedValue('downloading');
      const status = await NanoAnalyzer.checkAvailability();
      expect(status).toBe('downloading');
    });

    test('returns "unavailable" when LanguageModel.availability() returns "unavailable"', async () => {
      global.LanguageModel.availability.mockResolvedValue('unavailable');
      const status = await NanoAnalyzer.checkAvailability();
      expect(status).toBe('unavailable');
    });

    test('returns "unavailable" when LanguageModel.availability() throws', async () => {
      global.LanguageModel.availability.mockRejectedValue(new Error('API error'));
      const status = await NanoAnalyzer.checkAvailability();
      expect(status).toBe('unavailable');
    });
  });

  // ── batchAnalyze ──────────────────────────────────────────────────────

  describe('batchAnalyze()', () => {
    const sampleEmails = [
      { id: 0, subject: 'Order shipped', sender: 'Amazon', senderEmail: 'ship@amazon.com' },
      { id: 1, subject: 'Meeting tomorrow', sender: 'John', senderEmail: 'john@company.com' }
    ];
    const categories = ['Shopping', 'Work', 'Social'];

    test('returns correct results for valid input', async () => {
      const mockResponse = JSON.stringify({
        results: [
          { id: 0, category: 'Shopping' },
          { id: 1, category: 'Work' }
        ]
      });
      mockSession.prompt.mockResolvedValue(mockResponse);

      const result = await NanoAnalyzer.batchAnalyze(sampleEmails, categories);

      expect(result.results).toHaveLength(2);
      expect(result.results[0]).toEqual({ id: 0, category: 'Shopping' });
      expect(result.results[1]).toEqual({ id: 1, category: 'Work' });
      expect(global.LanguageModel.create).toHaveBeenCalledTimes(1);
      expect(mockSession.prompt).toHaveBeenCalledTimes(1);
    });

    test('returns { results: [] } for empty email array', async () => {
      const result = await NanoAnalyzer.batchAnalyze([], categories);
      expect(result).toEqual({ results: [] });
      expect(global.LanguageModel.create).not.toHaveBeenCalled();
    });

    test('chunks >10 emails into multiple prompt calls', async () => {
      const emails = Array.from({ length: 25 }, (_, i) => ({
        id: i,
        subject: `Email ${i}`,
        sender: `Sender ${i}`,
        senderEmail: `sender${i}@example.com`
      }));

      mockSession.prompt.mockResolvedValue(JSON.stringify({
        results: [{ id: 0, category: 'Work' }]
      }));

      await NanoAnalyzer.batchAnalyze(emails, categories);

      // 25 emails / 10 per chunk = 3 chunks
      expect(mockSession.prompt).toHaveBeenCalledTimes(3);
    });

    test('returns { results: [] } when session.prompt throws', async () => {
      mockSession.prompt.mockRejectedValue(new Error('Prompt failed'));

      const result = await NanoAnalyzer.batchAnalyze(sampleEmails, categories);
      expect(result).toEqual({ results: [] });
    });

    // ── chunkSize parameter tests ──────────────────────────────────────────

    test('default chunkSize (omitted) uses 10 — backward compatible', async () => {
      const emails = Array.from({ length: 25 }, (_, i) => ({
        id: i, subject: `Email ${i}`, sender: `S ${i}`, senderEmail: `s${i}@e.com`
      }));
      mockSession.prompt.mockResolvedValue(JSON.stringify({ results: [{ id: 0, category: 'Work' }] }));

      await NanoAnalyzer.batchAnalyze(emails, categories);
      // 25 / 10 = 3 chunks
      expect(mockSession.prompt).toHaveBeenCalledTimes(3);
    });

    test('chunkSize=5 with 12 emails → 3 prompt calls (5, 5, 2)', async () => {
      const emails = Array.from({ length: 12 }, (_, i) => ({
        id: i, subject: `Email ${i}`, sender: `S ${i}`, senderEmail: `s${i}@e.com`
      }));
      const promptArgs = [];
      mockSession.prompt.mockImplementation((prompt) => {
        promptArgs.push(JSON.parse(prompt));
        return Promise.resolve(JSON.stringify({ results: [{ id: 0, category: 'Work' }] }));
      });

      await NanoAnalyzer.batchAnalyze(emails, categories, 5);
      expect(mockSession.prompt).toHaveBeenCalledTimes(3);
      expect(promptArgs[0]).toHaveLength(5);
      expect(promptArgs[1]).toHaveLength(5);
      expect(promptArgs[2]).toHaveLength(2);
    });

    test('chunkSize=1 → one prompt call per email', async () => {
      mockSession.prompt.mockResolvedValue(JSON.stringify({ results: [{ id: 0, category: 'Work' }] }));

      await NanoAnalyzer.batchAnalyze(sampleEmails, categories, 1);
      expect(mockSession.prompt).toHaveBeenCalledTimes(sampleEmails.length);
    });

    test('chunkSize=0 → sanitized to 1', async () => {
      mockSession.prompt.mockResolvedValue(JSON.stringify({ results: [{ id: 0, category: 'Work' }] }));

      await NanoAnalyzer.batchAnalyze(sampleEmails, categories, 0);
      expect(mockSession.prompt).toHaveBeenCalledTimes(sampleEmails.length);
    });

    test('chunkSize=-5 → sanitized to 1', async () => {
      mockSession.prompt.mockResolvedValue(JSON.stringify({ results: [{ id: 0, category: 'Work' }] }));

      await NanoAnalyzer.batchAnalyze(sampleEmails, categories, -5);
      expect(mockSession.prompt).toHaveBeenCalledTimes(sampleEmails.length);
    });
  });

  // ── analyzeEmail ──────────────────────────────────────────────────────

  describe('analyzeEmail()', () => {
    const validResponse = {
      category: 'notification',
      tags: ['github', 'pull request'],
      safetyScore: 95,
      issues: [],
      detectedServices: ['GitHub'],
      flags: []
    };

    const sampleEmail = {
      subject: 'PR merged',
      sender: 'GitHub',
      senderEmail: 'noreply@github.com',
      body: 'Your pull request was merged',
      links: ['https://github.com/user/repo/pull/42']
    };

    test('returns all 6 required fields for valid input', async () => {
      mockSession.prompt.mockResolvedValue(JSON.stringify(validResponse));

      const result = await NanoAnalyzer.analyzeEmail(sampleEmail);

      expect(result.category).toBe('notification');
      expect(result.tags).toEqual(['github', 'pull request']);
      expect(result.safetyScore).toBe(95);
      expect(result.issues).toEqual([]);
      expect(result.detectedServices).toEqual(['GitHub']);
      expect(result.flags).toEqual([]);
    });

    test('truncates body to 1000 chars in prompt', async () => {
      mockSession.prompt.mockResolvedValue(JSON.stringify(validResponse));

      const longBody = 'x'.repeat(3000);
      await NanoAnalyzer.analyzeEmail({ ...sampleEmail, body: longBody });

      const promptArg = mockSession.prompt.mock.calls[0][0];
      // The body section in the prompt should not contain the full 3000 chars
      expect(promptArg).not.toContain('x'.repeat(1001));
      // But should contain the truncated 1000 chars
      expect(promptArg).toContain('x'.repeat(1000));
    });

    test('caps links at 10 in prompt', async () => {
      mockSession.prompt.mockResolvedValue(JSON.stringify(validResponse));

      const manyLinks = Array.from({ length: 20 }, (_, i) => `https://example.com/link${i}`);
      await NanoAnalyzer.analyzeEmail({ ...sampleEmail, links: manyLinks });

      const promptArg = mockSession.prompt.mock.calls[0][0];
      expect(promptArg).toContain('link9');
      expect(promptArg).not.toContain('link10');
    });

    test('throws when response has invalid shape', async () => {
      mockSession.prompt.mockResolvedValue(JSON.stringify({
        category: 'work'
        // missing all other required fields
      }));

      await expect(NanoAnalyzer.analyzeEmail(sampleEmail)).rejects.toThrow('Invalid response shape');
    });
  });

  // ── destroy ───────────────────────────────────────────────────────────

  describe('destroy()', () => {
    test('calls session.destroy() when session exists', async () => {
      // Trigger session creation
      mockSession.prompt.mockResolvedValue(JSON.stringify({ results: [] }));
      await NanoAnalyzer.batchAnalyze(
        [{ id: 0, subject: 'Test', sender: 'A', senderEmail: 'a@b.com' }],
        ['Work']
      );

      NanoAnalyzer.destroy();
      expect(mockSession.destroy).toHaveBeenCalled();
    });

    test('safe to call when no session exists (no throw)', () => {
      // No session created yet — should not throw
      expect(() => NanoAnalyzer.destroy()).not.toThrow();
    });
  });

  // ── Session lifecycle ─────────────────────────────────────────────────

  describe('Session lifecycle', () => {
    test('reuses session across multiple calls of same type', async () => {
      mockSession.prompt.mockResolvedValue(JSON.stringify({ results: [{ id: 0, category: 'Work' }] }));

      const emails = [{ id: 0, subject: 'Test', sender: 'A', senderEmail: 'a@b.com' }];
      await NanoAnalyzer.batchAnalyze(emails, ['Work']);
      await NanoAnalyzer.batchAnalyze(emails, ['Work']);
      await NanoAnalyzer.batchAnalyze(emails, ['Work']);

      // Session should be created only once
      expect(global.LanguageModel.create).toHaveBeenCalledTimes(1);
    });

    test('creates new session when context exceeds 80%', async () => {
      mockSession.prompt.mockResolvedValue(JSON.stringify({ results: [{ id: 0, category: 'Work' }] }));

      const emails = [{ id: 0, subject: 'Test', sender: 'A', senderEmail: 'a@b.com' }];

      // First call — creates session
      await NanoAnalyzer.batchAnalyze(emails, ['Work']);
      expect(global.LanguageModel.create).toHaveBeenCalledTimes(1);

      // Simulate context exceeding 80%
      mockSession.contextUsage = 0.9;

      // Second call — should destroy old and create new
      const freshSession = {
        prompt: jestGlobal.fn().mockResolvedValue(JSON.stringify({ results: [{ id: 0, category: 'Work' }] })),
        destroy: jestGlobal.fn(),
        contextUsage: 0.1
      };
      global.LanguageModel.create.mockResolvedValue(freshSession);

      await NanoAnalyzer.batchAnalyze(emails, ['Work']);
      expect(mockSession.destroy).toHaveBeenCalled();
      expect(global.LanguageModel.create).toHaveBeenCalledTimes(2);
    });

    test('creates new session when switching between batch and single types', async () => {
      mockSession.prompt.mockResolvedValue(JSON.stringify({ results: [{ id: 0, category: 'Work' }] }));

      // First call — batch
      await NanoAnalyzer.batchAnalyze(
        [{ id: 0, subject: 'Test', sender: 'A', senderEmail: 'a@b.com' }],
        ['Work']
      );
      expect(global.LanguageModel.create).toHaveBeenCalledTimes(1);

      // Switch to single — should create new session
      const singleSession = {
        prompt: jestGlobal.fn().mockResolvedValue(JSON.stringify({
          category: 'work', tags: [], safetyScore: 90,
          issues: [], detectedServices: [], flags: []
        })),
        destroy: jestGlobal.fn(),
        contextUsage: 0.1
      };
      global.LanguageModel.create.mockResolvedValue(singleSession);

      await NanoAnalyzer.analyzeEmail({
        subject: 'Test', sender: 'A', senderEmail: 'a@b.com',
        body: 'Hello', links: []
      });

      expect(mockSession.destroy).toHaveBeenCalled();
      expect(global.LanguageModel.create).toHaveBeenCalledTimes(2);
    });
  });
});
