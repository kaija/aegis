'use strict';

const fc = require('fast-check');
const { describe, test, expect, beforeEach, afterEach, jest: jestGlobal } = require('@jest/globals');

/**
 * These property tests validate the sequential batch processing logic
 * from the nano branch in content.js. Since content.js is an IIFE that
 * depends on many globals (chrome, platform, etc.), we extract and test
 * the core sequential batch logic in isolation.
 */

// ── Extracted nano batch processing logic (mirrors content.js nano branch) ──
const NANO_BATCH_SIZE = 5;

async function processNanoBatches(emails, labelNames, batchAnalyzeFn, renderFn, applyResultsFn) {
  const chunks = [];
  for (let i = 0; i < emails.length; i += NANO_BATCH_SIZE) {
    chunks.push({ startIndex: i, data: emails.slice(i, i + NANO_BATCH_SIZE) });
  }

  for (let ci = 0; ci < chunks.length; ci++) {
    try {
      const batchData = chunks[ci].data.map((email, index) => ({
        id: index,
        subject: email.subject,
        sender: email.sender,
        senderEmail: email.senderEmail
      }));

      const nanoResult = await batchAnalyzeFn(batchData, labelNames);
      applyResultsFn(nanoResult, emails, chunks[ci].startIndex);
    } catch (err) {
      // Continue to next batch on failure
    }
    renderFn(ci < chunks.length - 1); // true = still loading, false = final
  }
}

function makeEmails(count) {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    subject: `Email ${i}`,
    sender: `Sender ${i}`,
    senderEmail: `sender${i}@example.com`,
    category: null
  }));
}

describe('Nano Progressive Batch Property Tests', () => {

  // ── Property 2: Sequential batch processing — no concurrent batchAnalyze calls ──
  // **Validates: Requirements 2.1**
  describe('Property 2: Sequential batch processing — no concurrent batchAnalyze calls', () => {
    test('concurrent call counter never exceeds 1', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 30 }),
          async (emailCount) => {
            const emails = makeEmails(emailCount);
            let concurrentCalls = 0;
            let maxConcurrent = 0;

            const batchAnalyzeFn = async (batchData, labelNames) => {
              concurrentCalls++;
              maxConcurrent = Math.max(maxConcurrent, concurrentCalls);
              // Simulate async delay
              await new Promise(resolve => setTimeout(resolve, 1));
              concurrentCalls--;
              return { results: batchData.map(e => ({ id: e.id, category: 'Work' })) };
            };

            const renderFn = jestGlobal.fn();
            const applyFn = jestGlobal.fn();

            await processNanoBatches(emails, ['Work'], batchAnalyzeFn, renderFn, applyFn);

            expect(maxConcurrent).toBe(1);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // ── Property 3: Failed batches do not prevent remaining batches ──────────
  // **Validates: Requirements 2.3**
  describe('Property 3: Failed batches do not prevent remaining batches from processing', () => {
    test('all batches attempted regardless of failures', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 5, max: 30 }),
          fc.array(fc.boolean(), { minLength: 1, maxLength: 6 }),
          async (emailCount, failurePattern) => {
            const emails = makeEmails(emailCount);
            const expectedBatchCount = Math.ceil(emailCount / NANO_BATCH_SIZE);
            let batchCallCount = 0;
            let appliedBatches = 0;

            // Extend failure pattern to match batch count
            const failures = Array.from({ length: expectedBatchCount }, (_, i) =>
              i < failurePattern.length ? failurePattern[i] : false
            );

            const batchAnalyzeFn = async (batchData, labelNames) => {
              const idx = batchCallCount;
              batchCallCount++;
              if (failures[idx]) {
                throw new Error(`Batch ${idx} failed`);
              }
              return { results: batchData.map(e => ({ id: e.id, category: 'Work' })) };
            };

            const renderFn = jestGlobal.fn();
            const applyFn = jestGlobal.fn().mockImplementation(() => { appliedBatches++; });

            await processNanoBatches(emails, ['Work'], batchAnalyzeFn, renderFn, applyFn);

            // All batches were attempted
            expect(batchCallCount).toBe(expectedBatchCount);

            // Non-failing batches had their results applied
            const expectedApplied = failures.filter(f => !f).length;
            expect(appliedBatches).toBe(expectedApplied);

            // Render was called for every batch (success or failure)
            expect(renderFn).toHaveBeenCalledTimes(expectedBatchCount);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // ── Property 4: Progressive render triggered after each batch completion ──
  // **Validates: Requirements 3.1, 3.3**
  describe('Property 4: Progressive render triggered after each batch completion', () => {
    test('render called K times with correct isLoading flags', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 30 }),
          async (emailCount) => {
            const emails = makeEmails(emailCount);
            const expectedBatchCount = Math.ceil(emailCount / NANO_BATCH_SIZE);

            const batchAnalyzeFn = async (batchData) => {
              return { results: batchData.map(e => ({ id: e.id, category: 'Work' })) };
            };

            const renderCalls = [];
            const renderFn = (isLoading) => { renderCalls.push(isLoading); };
            const applyFn = jestGlobal.fn();

            await processNanoBatches(emails, ['Work'], batchAnalyzeFn, renderFn, applyFn);

            // Render called exactly once per batch
            expect(renderCalls.length).toBe(expectedBatchCount);

            // All calls except the last pass isLoading=true
            for (let i = 0; i < renderCalls.length - 1; i++) {
              expect(renderCalls[i]).toBe(true);
            }
            // Last call passes isLoading=false
            expect(renderCalls[renderCalls.length - 1]).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
