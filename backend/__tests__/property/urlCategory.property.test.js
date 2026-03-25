// Feature: feedback-collection-api, Property 1: URL feedback submission round-trip
// Feature: feedback-collection-api, Property 3: URL feedback is append-only
// Feature: feedback-collection-api, Property 4: Missing/invalid fields return HTTP 400
// Validates: Requirements 2.1, 2.3, 2.4, 2.6

import fc from 'fast-check';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { handler } from '../../src/handlers/feedback/urlCategory.js';

const ddbMock = mockClient(DynamoDBDocumentClient);

beforeEach(() => {
  ddbMock.reset();
  ddbMock.on(PutCommand).resolves({});
  process.env.URL_FEEDBACK_TABLE = 'UrlFeedback';
});

afterEach(() => {
  delete process.env.URL_FEEDBACK_TABLE;
});

const makeEvent = (body, headers = { 'X-Extension-Version': '1.0.0' }) => ({
  headers,
  body: JSON.stringify(body),
});

// ─── Property 1 ──────────────────────────────────────────────────────────────

// Feature: feedback-collection-api, Property 1: URL feedback submission round-trip
describe('Property 1: URL feedback submission round-trip', () => {
  it('returns 201 with an id and stores correct item in DynamoDB', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          url: fc.webUrl(),
          suggestedCategory: fc.string({ minLength: 1 }),
          currentCategory: fc.string({ minLength: 1 }),
        }),
        async (payload) => {
          ddbMock.resetHistory();

          const event = makeEvent(payload);
          const response = await handler(event);

          if (response.statusCode !== 201) return false;

          const body = JSON.parse(response.body);
          if (!body.id) return false;

          const calls = ddbMock.commandCalls(PutCommand);
          if (calls.length !== 1) return false;

          const cmdInput = calls[0].args[0].input;
          const item = cmdInput.Item;
          return (
            cmdInput.TableName === 'UrlFeedback' &&
            item.url === payload.url &&
            item.suggestedCategory === payload.suggestedCategory &&
            item.currentCategory === payload.currentCategory &&
            typeof item.id === 'string' &&
            typeof item.createdAt === 'string'
          );
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Property 3 ──────────────────────────────────────────────────────────────

// Feature: feedback-collection-api, Property 3: URL feedback is append-only
describe('Property 3: URL feedback is append-only', () => {
  it('calls PutCommand exactly N times with distinct ids for N submissions', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          url: fc.webUrl(),
          suggestedCategory: fc.string({ minLength: 1 }),
          currentCategory: fc.string({ minLength: 1 }),
        }),
        fc.integer({ min: 1, max: 5 }),
        async (payload, n) => {
          ddbMock.resetHistory();

          for (let i = 0; i < n; i++) {
            await handler(makeEvent(payload));
          }

          const calls = ddbMock.commandCalls(PutCommand);
          if (calls.length !== n) return false;

          const ids = calls.map((c) => c.args[0].input.Item.id);
          const uniqueIds = new Set(ids);
          return uniqueIds.size === n;
        }
      ),
      { numRuns: 50 }
    );
  });
});

// ─── Property 4 ──────────────────────────────────────────────────────────────

// Feature: feedback-collection-api, Property 4: Missing/invalid fields return HTTP 400
describe('Property 4: Missing/invalid fields return HTTP 400', () => {
  it('returns 400 when url is missing', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          suggestedCategory: fc.string({ minLength: 1 }),
          currentCategory: fc.string({ minLength: 1 }),
        }),
        async (payload) => {
          const response = await handler(makeEvent(payload));
          if (response.statusCode !== 400) return false;
          const body = JSON.parse(response.body);
          return typeof body.error === 'string';
        }
      ),
      { numRuns: 50 }
    );
  });

  it('returns 400 when suggestedCategory is missing', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          url: fc.webUrl(),
          currentCategory: fc.string({ minLength: 1 }),
        }),
        async (payload) => {
          const response = await handler(makeEvent(payload));
          if (response.statusCode !== 400) return false;
          const body = JSON.parse(response.body);
          return typeof body.error === 'string';
        }
      ),
      { numRuns: 50 }
    );
  });

  it('returns 400 when currentCategory is missing', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          url: fc.webUrl(),
          suggestedCategory: fc.string({ minLength: 1 }),
        }),
        async (payload) => {
          const response = await handler(makeEvent(payload));
          if (response.statusCode !== 400) return false;
          const body = JSON.parse(response.body);
          return typeof body.error === 'string';
        }
      ),
      { numRuns: 50 }
    );
  });

  it('returns 400 when a required field is empty string', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('url', 'suggestedCategory', 'currentCategory'),
        fc.record({
          url: fc.webUrl(),
          suggestedCategory: fc.string({ minLength: 1 }),
          currentCategory: fc.string({ minLength: 1 }),
        }),
        async (emptyField, payload) => {
          const body = { ...payload, [emptyField]: '' };
          const response = await handler(makeEvent(body));
          if (response.statusCode !== 400) return false;
          const parsed = JSON.parse(response.body);
          return typeof parsed.error === 'string';
        }
      ),
      { numRuns: 100 }
    );
  });
});
