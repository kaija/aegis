'use strict';

const fc = require('fast-check');
const { describe, test, expect, beforeEach, afterEach, jest: jestGlobal } = require('@jest/globals');
const fs = require('fs');
const path = require('path');

// ── Helpers ────────────────────────────────────────────────────────────────

function createMockSession(contextUsage = 0.1) {
  return {
    prompt: jestGlobal.fn(),
    destroy: jestGlobal.fn(),
    contextUsage
  };
}

function loadNanoAnalyzer() {
  delete global.NanoAnalyzer;
  delete global.window.NanoAnalyzer;
  const code = fs.readFileSync(path.join(__dirname, '../src/analysis/nano-analyzer.js'), 'utf8');
  eval(code);
}

// Use alphanumeric strings to avoid JSON escaping issues in prompt assertions
const SAFE_CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 .-_@';
const safeStringArb = (opts) => fc.array(
  fc.constantFrom(...SAFE_CHARS.split('')),
  { minLength: opts.minLength, maxLength: opts.maxLength }
).map(chars => chars.join(''));

// Arbitrary for email objects used in batch analysis
const emailArb = fc.record({
  id: fc.integer({ min: 0, max: 9999 }),
  subject: safeStringArb({ minLength: 1, maxLength: 100 }),
  sender: safeStringArb({ minLength: 1, maxLength: 50 }),
  senderEmail: safeStringArb({ minLength: 1, maxLength: 80 })
});

// Arbitrary for category names
const categoryArb = safeStringArb({ minLength: 1, maxLength: 30 });

describe('NanoAnalyzer Property Tests', () => {
  let mockSession;

  beforeEach(() => {
    delete global.NanoAnalyzer;
    delete global.window.NanoAnalyzer;

    mockSession = createMockSession(0.1);

    global.LanguageModel = {
      availability: jestGlobal.fn().mockResolvedValue('available'),
      create: jestGlobal.fn().mockResolvedValue(mockSession)
    };

    loadNanoAnalyzer();
  });

  afterEach(() => {
    if (global.NanoAnalyzer) {
      global.NanoAnalyzer.destroy();
    }
  });

  // ── Property 1: Session reuse across calls ──────────────────────────────
  // **Validates: Requirements 3.1, 3.2**
  describe('Property 1: Session reuse across calls', () => {
    test('LanguageModel.create() called exactly once for consecutive same-type calls when context < 80%', async () => {
      // Generate sequences of only one type to test pure reuse (no type switching)
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom('batch', 'single'),
          fc.integer({ min: 1, max: 20 }),
          async (callType, callCount) => {
            delete global.NanoAnalyzer;
            delete global.window.NanoAnalyzer;

            const session = createMockSession(0.1);
            session.prompt.mockResolvedValue(JSON.stringify({
              results: [{ id: 0, category: 'Work' }]
            }));

            global.LanguageModel.create = jestGlobal.fn().mockResolvedValue(session);
            global.LanguageModel.create.mockClear();

            loadNanoAnalyzer();

            const sampleEmail = { id: 0, subject: 'Test', sender: 'A', senderEmail: 'a@b.com' };
            const sampleEmailData = {
              subject: 'Test', sender: 'A', senderEmail: 'a@b.com',
              body: 'Hello', links: []
            };

            const singleResponse = JSON.stringify({
              category: 'work', tags: ['tag'], safetyScore: 85,
              issues: [], detectedServices: [], flags: []
            });

            for (let i = 0; i < callCount; i++) {
              if (callType === 'batch') {
                session.prompt.mockResolvedValue(JSON.stringify({
                  results: [{ id: 0, category: 'Work' }]
                }));
                await NanoAnalyzer.batchAnalyze([sampleEmail], ['Work']);
              } else {
                session.prompt.mockResolvedValue(singleResponse);
                await NanoAnalyzer.analyzeEmail(sampleEmailData);
              }
            }

            // Session should be created exactly once regardless of how many calls
            expect(global.LanguageModel.create).toHaveBeenCalledTimes(1);

            NanoAnalyzer.destroy();
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // ── Property 2: Context threshold triggers session rotation ─────────────
  // **Validates: Requirements 3.3**
  describe('Property 2: Context threshold triggers session rotation', () => {
    test('old session destroyed when contextUsage > 80%', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.double({ min: 0.81, max: 1.0, noNaN: true }),
          async (highUsage) => {
            delete global.NanoAnalyzer;
            delete global.window.NanoAnalyzer;

            const oldSession = createMockSession(0.1);
            oldSession.prompt.mockResolvedValue(JSON.stringify({
              results: [{ id: 0, category: 'Work' }]
            }));

            global.LanguageModel.create = jestGlobal.fn().mockResolvedValue(oldSession);
            loadNanoAnalyzer();

            const sampleEmail = { id: 0, subject: 'Test', sender: 'A', senderEmail: 'a@b.com' };

            // First call creates session
            await NanoAnalyzer.batchAnalyze([sampleEmail], ['Work']);
            expect(global.LanguageModel.create).toHaveBeenCalledTimes(1);

            // Simulate context exceeding 80%
            oldSession.contextUsage = highUsage;

            const freshSession = createMockSession(0.1);
            freshSession.prompt.mockResolvedValue(JSON.stringify({
              results: [{ id: 0, category: 'Work' }]
            }));
            global.LanguageModel.create.mockResolvedValue(freshSession);

            // Second call should rotate
            await NanoAnalyzer.batchAnalyze([sampleEmail], ['Work']);
            expect(oldSession.destroy).toHaveBeenCalled();
            expect(global.LanguageModel.create).toHaveBeenCalledTimes(2);

            NanoAnalyzer.destroy();
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // ── Property 3: Batch prompt includes all email metadata and categories ─
  // **Validates: Requirements 4.1, 4.2**
  describe('Property 3: Batch prompt includes all email metadata and categories', () => {
    test('prompt contains every email id, subject, sender, senderEmail and every category name', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(emailArb, { minLength: 1, maxLength: 10 }),
          fc.array(categoryArb, { minLength: 1, maxLength: 10 }),
          async (emails, categories) => {
            delete global.NanoAnalyzer;
            delete global.window.NanoAnalyzer;

            let capturedPrompt = '';
            let capturedSystemPrompt = '';

            const session = createMockSession(0.1);
            session.prompt.mockImplementation((prompt) => {
              capturedPrompt = prompt;
              return Promise.resolve(JSON.stringify({
                results: emails.map(e => ({ id: e.id, category: 'Work' }))
              }));
            });

            global.LanguageModel.create = jestGlobal.fn().mockImplementation((opts) => {
              if (opts && opts.initialPrompts) {
                const systemMsg = opts.initialPrompts.find(p => p.role === 'system');
                if (systemMsg) capturedSystemPrompt = systemMsg.content;
              }
              return Promise.resolve(session);
            });

            loadNanoAnalyzer();

            await NanoAnalyzer.batchAnalyze(emails, categories);

            // Assert prompt contains every email's metadata
            for (const email of emails) {
              expect(capturedPrompt).toContain(String(email.id));
              expect(capturedPrompt).toContain(email.subject);
              expect(capturedPrompt).toContain(email.sender);
              expect(capturedPrompt).toContain(email.senderEmail);
            }

            // Assert system prompt contains every category name
            for (const cat of categories) {
              expect(capturedSystemPrompt).toContain(cat);
            }

            NanoAnalyzer.destroy();
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // ── Property 4: Batch chunking for large inputs ─────────────────────────
  // **Validates: Requirements 4.5**
  describe('Property 4: Batch chunking for large inputs', () => {
    test('session.prompt() call count equals Math.ceil(emails.length / 10)', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 50 }),
          async (emailCount) => {
            delete global.NanoAnalyzer;
            delete global.window.NanoAnalyzer;

            const session = createMockSession(0.1);
            session.prompt.mockImplementation(() => {
              return Promise.resolve(JSON.stringify({
                results: [{ id: 0, category: 'Work' }]
              }));
            });

            global.LanguageModel.create = jestGlobal.fn().mockResolvedValue(session);
            loadNanoAnalyzer();

            const emails = Array.from({ length: emailCount }, (_, i) => ({
              id: i,
              subject: `Email ${i}`,
              sender: `Sender ${i}`,
              senderEmail: `sender${i}@example.com`
            }));

            await NanoAnalyzer.batchAnalyze(emails, ['Work']);

            const expectedChunks = Math.ceil(emailCount / 10);
            expect(session.prompt).toHaveBeenCalledTimes(expectedChunks);

            NanoAnalyzer.destroy();
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // ── Property 5: Single analysis prompt respects truncation limits ───────
  // **Validates: Requirements 5.1**
  describe('Property 5: Single analysis prompt respects truncation limits', () => {
    test('body in prompt ≤ 1000 chars and ≤ 10 links', async () => {
      const bodyArb = fc.string({ minLength: 0, maxLength: 5000 });
      const linkArb = fc.string({ minLength: 1, maxLength: 50 });
      const linksArb = fc.array(linkArb, { minLength: 0, maxLength: 30 });

      await fc.assert(
        fc.asyncProperty(
          bodyArb,
          linksArb,
          async (body, links) => {
            delete global.NanoAnalyzer;
            delete global.window.NanoAnalyzer;

            let capturedPrompt = '';
            const session = createMockSession(0.1);
            session.prompt.mockImplementation((prompt) => {
              capturedPrompt = prompt;
              return Promise.resolve(JSON.stringify({
                category: 'work', tags: ['tag'], safetyScore: 85,
                issues: [], detectedServices: [], flags: []
              }));
            });

            global.LanguageModel.create = jestGlobal.fn().mockResolvedValue(session);
            loadNanoAnalyzer();

            await NanoAnalyzer.analyzeEmail({
              subject: 'Test',
              sender: 'Sender',
              senderEmail: 'sender@test.com',
              body,
              links
            });

            // Extract body section from prompt (between "Body:\n" and "\n\nLinks:")
            const bodyMatch = capturedPrompt.match(/Body:\n([\s\S]*?)\n\nLinks:/);
            if (bodyMatch) {
              expect(bodyMatch[1].length).toBeLessThanOrEqual(1000);
            }

            // Count links in prompt (between "Links:\n" and "\n\nRespond")
            const linksMatch = capturedPrompt.match(/Links:\n([\s\S]*?)\n\nRespond/);
            if (linksMatch && linksMatch[1].trim().length > 0) {
              const linkLines = linksMatch[1].trim().split('\n').filter(l => l.length > 0);
              expect(linkLines.length).toBeLessThanOrEqual(10);
            }

            NanoAnalyzer.destroy();
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // ── Property 6: batchAnalyze output shape ───────────────────────────────
  // **Validates: Requirements 6.2**
  describe('Property 6: batchAnalyze output shape', () => {
    test('output has results array with numeric id and string category per element', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(emailArb, { minLength: 1, maxLength: 10 }),
          async (emails) => {
            delete global.NanoAnalyzer;
            delete global.window.NanoAnalyzer;

            const session = createMockSession(0.1);
            session.prompt.mockImplementation((prompt) => {
              // Parse the prompt to get the email ids and return matching results
              const parsed = JSON.parse(prompt);
              return Promise.resolve(JSON.stringify({
                results: parsed.map(e => ({ id: e.id, category: 'Work' }))
              }));
            });

            global.LanguageModel.create = jestGlobal.fn().mockResolvedValue(session);
            loadNanoAnalyzer();

            const result = await NanoAnalyzer.batchAnalyze(emails, ['Work']);

            expect(result).toHaveProperty('results');
            expect(Array.isArray(result.results)).toBe(true);

            for (const item of result.results) {
              expect(typeof item.id).toBe('number');
              expect(typeof item.category).toBe('string');
            }

            NanoAnalyzer.destroy();
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // ── Property 7: analyzeEmail output shape ───────────────────────────────
  // **Validates: Requirements 6.3**
  describe('Property 7: analyzeEmail output shape', () => {
    test('output contains all six required fields with correct types', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            subject: fc.string({ minLength: 1, maxLength: 100 }),
            sender: fc.string({ minLength: 1, maxLength: 50 }),
            senderEmail: fc.string({ minLength: 1, maxLength: 80 }),
            body: fc.string({ minLength: 0, maxLength: 500 }),
            links: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 0, maxLength: 5 })
          }),
          async (emailData) => {
            delete global.NanoAnalyzer;
            delete global.window.NanoAnalyzer;

            const session = createMockSession(0.1);
            session.prompt.mockResolvedValue(JSON.stringify({
              category: 'work', tags: ['tag'], safetyScore: 85,
              issues: [], detectedServices: [], flags: []
            }));

            global.LanguageModel.create = jestGlobal.fn().mockResolvedValue(session);
            loadNanoAnalyzer();

            const result = await NanoAnalyzer.analyzeEmail(emailData);

            expect(typeof result.category).toBe('string');
            expect(Array.isArray(result.tags)).toBe(true);
            expect(typeof result.safetyScore).toBe('number');
            expect(Array.isArray(result.issues)).toBe(true);
            expect(Array.isArray(result.detectedServices)).toBe(true);
            expect(Array.isArray(result.flags)).toBe(true);

            NanoAnalyzer.destroy();
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // ── Property (Progressive Batch) 1: Configurable chunk size controls prompt call count ──
  // **Validates: Requirements 1.1, 1.3, 4.3**
  describe('Property PB-1: Configurable chunk size controls prompt call count and chunk boundaries', () => {
    test('prompt called ceil(N/chunkSize) times, each with at most chunkSize emails', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 50 }),
          fc.integer({ min: 1, max: 20 }),
          async (emailCount, chunkSize) => {
            delete global.NanoAnalyzer;
            delete global.window.NanoAnalyzer;

            const promptArgs = [];
            const session = createMockSession(0.1);
            session.prompt.mockImplementation((prompt) => {
              const parsed = JSON.parse(prompt);
              promptArgs.push(parsed);
              return Promise.resolve(JSON.stringify({
                results: parsed.map(e => ({ id: e.id, category: 'Work' }))
              }));
            });

            global.LanguageModel.create = jestGlobal.fn().mockResolvedValue(session);
            loadNanoAnalyzer();

            const emails = Array.from({ length: emailCount }, (_, i) => ({
              id: i,
              subject: `Email ${i}`,
              sender: `Sender ${i}`,
              senderEmail: `sender${i}@example.com`
            }));

            await NanoAnalyzer.batchAnalyze(emails, ['Work'], chunkSize);

            const expectedChunks = Math.ceil(emailCount / chunkSize);
            expect(session.prompt).toHaveBeenCalledTimes(expectedChunks);

            // Each prompt receives at most chunkSize emails
            for (let i = 0; i < promptArgs.length; i++) {
              expect(promptArgs[i].length).toBeLessThanOrEqual(chunkSize);
            }

            // Last prompt receives the remainder
            const expectedLast = emailCount % chunkSize === 0 ? chunkSize : emailCount % chunkSize;
            expect(promptArgs[promptArgs.length - 1].length).toBe(expectedLast);

            NanoAnalyzer.destroy();
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // ── Property 8: checkAvailability returns valid status ──────────────────
  // **Validates: Requirements 6.4**
  describe('Property 8: checkAvailability returns valid status', () => {
    test('return value is one of the five valid status strings', async () => {
      const validStatuses = ['available', 'downloadable', 'downloading', 'unavailable', 'no-api'];

      const languageModelStateArb = fc.oneof(
        // undefined LanguageModel
        fc.constant('undefined'),
        // Each valid availability status
        fc.constant('available'),
        fc.constant('downloadable'),
        fc.constant('downloading'),
        fc.constant('unavailable'),
        // Throwing
        fc.constant('throwing')
      );

      await fc.assert(
        fc.asyncProperty(
          languageModelStateArb,
          async (state) => {
            delete global.NanoAnalyzer;
            delete global.window.NanoAnalyzer;

            if (state === 'undefined') {
              delete global.LanguageModel;
            } else if (state === 'throwing') {
              global.LanguageModel = {
                availability: jestGlobal.fn().mockRejectedValue(new Error('API error')),
                create: jestGlobal.fn()
              };
            } else {
              global.LanguageModel = {
                availability: jestGlobal.fn().mockResolvedValue(state),
                create: jestGlobal.fn()
              };
            }

            loadNanoAnalyzer();

            const result = await NanoAnalyzer.checkAvailability();
            expect(validStatuses).toContain(result);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
