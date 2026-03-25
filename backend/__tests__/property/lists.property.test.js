// Feature: feedback-collection-api, Property 17: Public list endpoints include caching headers
// Feature: feedback-collection-api, Property 18: Public list endpoints require no authentication
// Feature: feedback-collection-api, Property 19: Whitelist response conforms to schema
// Feature: feedback-collection-api, Property 20: Health check response shape
// Validates: Requirements 7.1, 7.3, 7.4, 8.1, 8.3, 8.4, 8.5, 10.1, 10.2

import fc from 'fast-check';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, ScanCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { handler as urlCategoriesHandler } from '../../src/handlers/lists/urlCategories.js';
import { handler as whitelistHandler } from '../../src/handlers/lists/whitelist.js';
import { handler as healthHandler } from '../../src/handlers/health.js';

const ddbMock = mockClient(DynamoDBDocumentClient);

const fixtureWhitelistItem = {
  id: 'singleton',
  etag: 'abc123def456',
  updatedAt: '2026-03-04',
  data: {
    version: '2',
    updatedAt: '2026-03-04',
    services: [{ name: 'Google', domains: ['google.com'] }],
    publicEmailDomains: ['gmail.com'],
    suspiciousDomains: ['evil.com'],
    shortUrlServices: ['bit.ly'],
  },
};

beforeEach(() => {
  ddbMock.reset();
  process.env.URL_FEEDBACK_TABLE = 'UrlFeedback';
  process.env.WHITELIST_TABLE = 'Whitelist';
});

afterEach(() => {
  delete process.env.URL_FEEDBACK_TABLE;
  delete process.env.WHITELIST_TABLE;
});

// ─── Property 17 ─────────────────────────────────────────────────────────────

// Feature: feedback-collection-api, Property 17: Public list endpoints include caching headers
describe('Property 17: Public list endpoints include caching headers', () => {
  it('/lists/url-categories response includes Cache-Control, ETag, and Content-Type headers', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            domain: fc.domain(),
            suggestedCategory: fc.string({ minLength: 1 }),
          }),
          { maxLength: 20 }
        ),
        async (items) => {
          ddbMock.reset();
          ddbMock.on(ScanCommand).resolves({ Items: items });

          const res = await urlCategoriesHandler({});
          if (res.statusCode !== 200) return false;

          return (
            typeof res.headers['Cache-Control'] === 'string' &&
            typeof res.headers['ETag'] === 'string' &&
            res.headers['Content-Type'] === 'application/json'
          );
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Property 18 ─────────────────────────────────────────────────────────────

// Feature: feedback-collection-api, Property 18: Public list endpoints require no authentication
describe('Property 18: Public list endpoints require no authentication', () => {
  it('/lists/url-categories returns 200 without Authorization header', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          headers: fc.record({
            'X-Extension-Version': fc.option(fc.string(), { nil: undefined }),
          }),
        }),
        async (event) => {
          ddbMock.reset();
          ddbMock.on(ScanCommand).resolves({ Items: [] });

          // Ensure no Authorization header
          const eventWithoutAuth = { headers: { ...event.headers } };
          delete eventWithoutAuth.headers['Authorization'];

          const res = await urlCategoriesHandler(eventWithoutAuth);
          return res.statusCode === 200;
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Property 19 ─────────────────────────────────────────────────────────────

// Feature: feedback-collection-api, Property 19: Whitelist response conforms to schema
describe('Property 19: Whitelist response conforms to schema', () => {
  it('/lists/whitelist response body contains all required keys', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          version: fc.string({ minLength: 1 }),
          updatedAt: fc.string({ minLength: 1 }),
          services: fc.array(fc.record({ name: fc.string(), domains: fc.array(fc.domain()) })),
          publicEmailDomains: fc.array(fc.domain()),
          suspiciousDomains: fc.array(fc.domain()),
          shortUrlServices: fc.array(fc.domain()),
        }),
        async (whitelistData) => {
          ddbMock.reset();
          ddbMock.on(GetCommand).resolves({
            Item: {
              id: 'singleton',
              etag: 'test-etag',
              updatedAt: whitelistData.updatedAt,
              data: whitelistData,
            },
          });

          const res = await whitelistHandler({});
          if (res.statusCode !== 200) return false;

          const body = JSON.parse(res.body);
          return (
            'version' in body &&
            'updatedAt' in body &&
            'services' in body &&
            'publicEmailDomains' in body &&
            'suspiciousDomains' in body &&
            'shortUrlServices' in body
          );
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Property 20 ─────────────────────────────────────────────────────────────

// Feature: feedback-collection-api, Property 20: Health check response shape
describe('Property 20: Health check response shape', () => {
  it('/health returns 200 with { status: ok, timestamp: <ISO8601> } with or without auth headers', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.option(fc.string(), { nil: undefined }),
        async (authHeader) => {
          const event = authHeader
            ? { headers: { Authorization: authHeader } }
            : { headers: {} };

          const res = await healthHandler(event);
          if (res.statusCode !== 200) return false;

          const body = JSON.parse(res.body);
          if (body.status !== 'ok') return false;
          if (typeof body.timestamp !== 'string') return false;

          // Validate ISO8601
          const parsed = new Date(body.timestamp);
          return !isNaN(parsed.getTime()) && parsed.toISOString() === body.timestamp;
        }
      ),
      { numRuns: 100 }
    );
  });
});
