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

function loadQuickReplyGenerator() {
  delete global.QuickReplyGenerator;
  delete global.window.QuickReplyGenerator;
  const code = fs.readFileSync(path.join(__dirname, '../src/analysis/quick-reply-generator.js'), 'utf8');
  eval(code);
}

// Use alphanumeric strings to avoid JSON escaping issues in prompt assertions
const SAFE_CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 .-_@';
const safeStringArb = (opts) => fc.array(
  fc.constantFrom(...SAFE_CHARS.split('')),
  { minLength: opts.minLength, maxLength: opts.maxLength }
).map(chars => chars.join(''));

describe('QuickReplyGenerator Property Tests', () => {
  let mockSession;

  beforeEach(() => {
    delete global.QuickReplyGenerator;
    delete global.window.QuickReplyGenerator;

    mockSession = createMockSession(0.1);

    global.LanguageModel = {
      availability: jestGlobal.fn().mockResolvedValue('available'),
      create: jestGlobal.fn().mockResolvedValue(mockSession)
    };

    loadQuickReplyGenerator();
  });

  afterEach(() => {
    if (global.QuickReplyGenerator) {
      global.QuickReplyGenerator.destroy();
    }
  });

  // ── Property 2: Body truncation invariant ─────────────────────────────
  // **Validates: Requirements 2.3**
  describe('Property 2: Body truncation invariant', () => {
    test('body in prompt has length ≤ 2000 for any input body length 0–5000', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 0, maxLength: 5000 }),
          async (body) => {
            delete global.QuickReplyGenerator;
            delete global.window.QuickReplyGenerator;

            let capturedPrompt = '';
            const session = createMockSession(0.1);
            session.prompt.mockImplementation((prompt) => {
              capturedPrompt = prompt;
              return Promise.resolve(JSON.stringify({
                emailType: 'General',
                replyOptions: [
                  { label: 'Accept', prefix: 'Sure thing.' },
                  { label: 'Decline', prefix: 'No thanks.' }
                ]
              }));
            });

            global.LanguageModel.create = jestGlobal.fn().mockResolvedValue(session);
            loadQuickReplyGenerator();

            await QuickReplyGenerator.generateReplyOptions({
              subject: 'Test',
              sender: 'Sender',
              body
            });

            // Extract the body section from the prompt
            // The prompt format is: "Body:\n<body>\n\nRespond with JSON"
            const bodyMatch = capturedPrompt.match(/Body:\n([\s\S]*?)\n\nRespond with JSON/);
            if (bodyMatch) {
              expect(bodyMatch[1].length).toBeLessThanOrEqual(2000);
            }

            QuickReplyGenerator.destroy();
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // ── Property 3: Prompt includes all email metadata ────────────────────
  // **Validates: Requirements 3.1**
  describe('Property 3: Prompt includes all email metadata', () => {
    test('prompt contains subject, sender, and body (truncated) for any email data', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            subject: safeStringArb({ minLength: 1, maxLength: 100 }),
            sender: safeStringArb({ minLength: 1, maxLength: 50 }),
            body: safeStringArb({ minLength: 1, maxLength: 3000 })
          }),
          async (emailData) => {
            delete global.QuickReplyGenerator;
            delete global.window.QuickReplyGenerator;

            let capturedPrompt = '';
            const session = createMockSession(0.1);
            session.prompt.mockImplementation((prompt) => {
              capturedPrompt = prompt;
              return Promise.resolve(JSON.stringify({
                emailType: 'General',
                replyOptions: [
                  { label: 'Accept', prefix: 'Sure thing.' },
                  { label: 'Decline', prefix: 'No thanks.' }
                ]
              }));
            });

            global.LanguageModel.create = jestGlobal.fn().mockResolvedValue(session);
            loadQuickReplyGenerator();

            await QuickReplyGenerator.generateReplyOptions(emailData);

            // Assert prompt contains subject and sender
            expect(capturedPrompt).toContain(emailData.subject);
            expect(capturedPrompt).toContain(emailData.sender);

            // Assert prompt contains body (truncated to 2000)
            const truncatedBody = emailData.body.slice(0, 2000);
            expect(capturedPrompt).toContain(truncatedBody);

            QuickReplyGenerator.destroy();
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // ── Property 4: Valid response parsing preserves data ─────────────────
  // **Validates: Requirements 3.5**
  describe('Property 4: Valid response parsing preserves data', () => {
    test('returned object matches the AI response emailType and replyOptions', async () => {
      const replyOptionArb = fc.record({
        label: safeStringArb({ minLength: 1, maxLength: 30 }),
        prefix: safeStringArb({ minLength: 1, maxLength: 80 })
      });

      const validResponseArb = fc.record({
        emailType: safeStringArb({ minLength: 1, maxLength: 40 }),
        replyOptions: fc.array(replyOptionArb, { minLength: 2, maxLength: 3 })
      });

      await fc.assert(
        fc.asyncProperty(
          validResponseArb,
          async (response) => {
            delete global.QuickReplyGenerator;
            delete global.window.QuickReplyGenerator;

            const session = createMockSession(0.1);
            session.prompt.mockResolvedValue(JSON.stringify(response));

            global.LanguageModel.create = jestGlobal.fn().mockResolvedValue(session);
            loadQuickReplyGenerator();

            const result = await QuickReplyGenerator.generateReplyOptions({
              subject: 'Test', sender: 'Sender', body: 'Hello'
            });

            expect(result).not.toBeNull();
            expect(result.emailType).toBe(response.emailType);
            expect(result.replyOptions).toHaveLength(response.replyOptions.length);

            for (let i = 0; i < response.replyOptions.length; i++) {
              expect(result.replyOptions[i].label).toBe(response.replyOptions[i].label);
              expect(result.replyOptions[i].prefix).toBe(response.replyOptions[i].prefix);
            }

            QuickReplyGenerator.destroy();
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // ── Property 5: Invalid response returns null ─────────────────────────
  // **Validates: Requirements 3.6**
  describe('Property 5: Invalid response returns null', () => {
    test('returns null and does not throw for non-JSON strings', async () => {
      // Generate strings that are definitely not valid JSON
      const nonJsonArb = safeStringArb({ minLength: 1, maxLength: 200 }).filter(
        s => { try { JSON.parse(s); return false; } catch { return true; } }
      );

      await fc.assert(
        fc.asyncProperty(
          nonJsonArb,
          async (invalidStr) => {
            delete global.QuickReplyGenerator;
            delete global.window.QuickReplyGenerator;

            const session = createMockSession(0.1);
            session.prompt.mockResolvedValue(invalidStr);

            global.LanguageModel.create = jestGlobal.fn().mockResolvedValue(session);
            loadQuickReplyGenerator();

            const result = await QuickReplyGenerator.generateReplyOptions({
              subject: 'Test', sender: 'Sender', body: 'Hello'
            });

            expect(result).toBeNull();

            QuickReplyGenerator.destroy();
          }
        ),
        { numRuns: 100 }
      );
    });

    test('returns null for malformed JSON objects missing required fields', async () => {
      const malformedArb = fc.oneof(
        // Missing emailType
        fc.record({
          replyOptions: fc.constant([{ label: 'A', prefix: 'B' }])
        }),
        // Missing replyOptions
        fc.record({
          emailType: safeStringArb({ minLength: 1, maxLength: 20 })
        }),
        // replyOptions not an array
        fc.record({
          emailType: safeStringArb({ minLength: 1, maxLength: 20 }),
          replyOptions: fc.constant('not an array')
        }),
        // emailType not a string
        fc.record({
          emailType: fc.integer(),
          replyOptions: fc.constant([{ label: 'A', prefix: 'B' }, { label: 'C', prefix: 'D' }])
        })
      );

      await fc.assert(
        fc.asyncProperty(
          malformedArb,
          async (malformed) => {
            delete global.QuickReplyGenerator;
            delete global.window.QuickReplyGenerator;

            const session = createMockSession(0.1);
            session.prompt.mockResolvedValue(JSON.stringify(malformed));

            global.LanguageModel.create = jestGlobal.fn().mockResolvedValue(session);
            loadQuickReplyGenerator();

            const result = await QuickReplyGenerator.generateReplyOptions({
              subject: 'Test', sender: 'Sender', body: 'Hello'
            });

            expect(result).toBeNull();

            QuickReplyGenerator.destroy();
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // ── Property 6: Reply options count validation ────────────────────────
  // **Validates: Requirements 4.4**
  describe('Property 6: Reply options count validation', () => {
    test('returns null for replyOptions arrays with count outside 2–3 range', async () => {
      const replyOptionArb = fc.record({
        label: safeStringArb({ minLength: 1, maxLength: 20 }),
        prefix: safeStringArb({ minLength: 1, maxLength: 40 })
      });

      // Generate arrays of length 0, 1, 4, 5, or 10 (all invalid counts)
      const invalidCountArb = fc.constantFrom(0, 1, 4, 5, 10).chain(count =>
        fc.record({
          emailType: safeStringArb({ minLength: 1, maxLength: 30 }),
          replyOptions: fc.array(replyOptionArb, { minLength: count, maxLength: count })
        })
      );

      await fc.assert(
        fc.asyncProperty(
          invalidCountArb,
          async (response) => {
            delete global.QuickReplyGenerator;
            delete global.window.QuickReplyGenerator;

            const session = createMockSession(0.1);
            session.prompt.mockResolvedValue(JSON.stringify(response));

            global.LanguageModel.create = jestGlobal.fn().mockResolvedValue(session);
            loadQuickReplyGenerator();

            const result = await QuickReplyGenerator.generateReplyOptions({
              subject: 'Test', sender: 'Sender', body: 'Hello'
            });

            expect(result).toBeNull();

            QuickReplyGenerator.destroy();
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
