// Feature: feedback-collection-api, Property 14: Allow list threshold filter
// Feature: feedback-collection-api, Property 15: Allow list ordering
// Validates: Requirements 5.1, 5.3, 5.5

import fc from 'fast-check';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { handler } from '../../src/handlers/export/allowList.js';

const ddbMock = mockClient(DynamoDBDocumentClient);

beforeEach(() => {
  ddbMock.reset();
  process.env.SENDER_DOMAINS_TABLE = 'SenderDomains';
  process.env.EXPORT_SECRET = 'test-secret';
});

afterEach(() => {
  delete process.env.SENDER_DOMAINS_TABLE;
  delete process.env.EXPORT_SECRET;
});

const makeEvent = (headers = { Authorization: 'test-secret' }) => ({ headers });

// ─── Property 14 ─────────────────────────────────────────────────────────────

// Feature: feedback-collection-api, Property 14: Allow list threshold filter
describe('Property 14: Allow list threshold filter', () => {
  it('only returns domains with count >= threshold and excludes domains with count < threshold', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            domain: fc.domain(),
            count: fc.integer({ min: 0, max: 20 }),
          }),
          { minLength: 0, maxLength: 30 }
        ),
        fc.integer({ min: 1, max: 10 }),
        async (items, threshold) => {
          ddbMock.reset();
          process.env.ALLOW_LIST_THRESHOLD = String(threshold);
          ddbMock.on(ScanCommand).resolves({ Items: items });

          const response = await handler(makeEvent());
          if (response.statusCode !== 200) return false;

          const body = JSON.parse(response.body);
          const returnedDomains = new Set(body.domains);

          // Every returned domain must have count >= threshold
          for (const domain of returnedDomains) {
            const item = items.find((i) => i.domain === domain);
            if (!item || item.count < threshold) return false;
          }

          // No domain with count < threshold should appear
          for (const item of items) {
            if (item.count < threshold && returnedDomains.has(item.domain)) return false;
          }

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Property 15 ─────────────────────────────────────────────────────────────

// Feature: feedback-collection-api, Property 15: Allow list ordering
describe('Property 15: Allow list ordering', () => {
  it('returns domains sorted descending by count', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            domain: fc.domain(),
            count: fc.integer({ min: 0, max: 100 }),
          }),
          { minLength: 0, maxLength: 30 }
        ),
        async (items) => {
          ddbMock.reset();
          // Use threshold of 0 so all items pass the filter
          process.env.ALLOW_LIST_THRESHOLD = '0';
          ddbMock.on(ScanCommand).resolves({ Items: items });

          const response = await handler(makeEvent());
          if (response.statusCode !== 200) return false;

          const body = JSON.parse(response.body);
          const returnedDomains = body.domains;

          // Build a map from domain to count for verification
          const countMap = new Map(items.map((i) => [i.domain, i.count]));

          // Verify descending order
          for (let i = 0; i < returnedDomains.length - 1; i++) {
            const countA = countMap.get(returnedDomains[i]) ?? 0;
            const countB = countMap.get(returnedDomains[i + 1]) ?? 0;
            if (countA < countB) return false;
          }

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Property 16 ─────────────────────────────────────────────────────────────

// Feature: feedback-collection-api, Property 16: URL categories max-frequency assignment
// Validates: Requirements 6.1, 6.3

import { handler as urlCategoriesHandler } from '../../src/handlers/export/urlCategories.js';

describe('Property 16: URL categories max-frequency assignment', () => {
  it('assigns the category with the highest count per domain (lexicographic tiebreak)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            domain: fc.domain(),
            suggestedCategory: fc.string({ minLength: 1 }),
          }),
          { minLength: 0, maxLength: 50 }
        ),
        async (items) => {
          ddbMock.reset();
          process.env.URL_FEEDBACK_TABLE = 'UrlFeedback';
          ddbMock.on(ScanCommand).resolves({ Items: items });

          const response = await urlCategoriesHandler({
            headers: { Authorization: 'test-secret' },
          });

          if (response.statusCode !== 200) return false;

          const body = JSON.parse(response.body);
          const { categories } = body;

          // Build expected counts per domain
          const domainCounts = {};
          for (const { domain, suggestedCategory } of items) {
            if (!domain || !suggestedCategory) continue;
            if (!domainCounts[domain]) domainCounts[domain] = {};
            domainCounts[domain][suggestedCategory] =
              (domainCounts[domain][suggestedCategory] ?? 0) + 1;
          }

          // Verify each domain's assigned category
          for (const [domain, assigned] of Object.entries(categories)) {
            const counts = domainCounts[domain];
            if (!counts) return false;

            const assignedCount = counts[assigned] ?? 0;

            for (const [cat, count] of Object.entries(counts)) {
              if (count > assignedCount) return false;
              // On tie, lexicographically first must win
              if (count === assignedCount && cat < assigned) return false;
            }
          }

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});
