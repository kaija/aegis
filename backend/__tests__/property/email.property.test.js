// Feature: feedback-collection-api, Property 5: Unified email feedback round-trip
// Feature: feedback-collection-api, Property 8: URL domains batch validation
// Feature: feedback-collection-api, Property 9: Sender domain aggregate count
// Feature: feedback-collection-api, Property 10: URL domain aggregate count
// Validates: Requirements 3.1, 3.7, 3.8, 3.9

import fc from 'fast-check';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { handler } from '../../src/handlers/feedback/email.js';

const ddbMock = mockClient(DynamoDBDocumentClient);

beforeEach(() => {
  ddbMock.reset();
  ddbMock.on(PutCommand).resolves({});
  ddbMock.on(UpdateCommand).resolves({});
  process.env.EMAIL_FEEDBACK_TABLE = 'EmailFeedback';
  process.env.SENDER_DOMAINS_TABLE = 'SenderDomains';
  process.env.URL_DOMAINS_TABLE = 'UrlDomains';
});

afterEach(() => {
  delete process.env.EMAIL_FEEDBACK_TABLE;
  delete process.env.SENDER_DOMAINS_TABLE;
  delete process.env.URL_DOMAINS_TABLE;
});

const makeEvent = (body, headers = { 'X-Extension-Version': '1.0.0' }) => ({
  headers,
  body: JSON.stringify(body),
});

// ─── Property 5 ──────────────────────────────────────────────────────────────

// Feature: feedback-collection-api, Property 5: Unified email feedback round-trip
describe('Property 5: Unified email feedback round-trip', () => {
  it('returns 201 with id and stores correct fields (emailTitle truncated to 500)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          senderDomain: fc.domain(),
          emailTitle: fc.string({ maxLength: 600 }),
          urlDomains: fc.array(fc.domain(), { maxLength: 50 }),
          category: fc.string({ minLength: 1 }),
        }),
        async (payload) => {
          ddbMock.resetHistory();

          const response = await handler(makeEvent(payload));
          if (response.statusCode !== 201) return false;

          const body = JSON.parse(response.body);
          if (!body.id || typeof body.id !== 'string') return false;

          const putCalls = ddbMock.commandCalls(PutCommand);
          if (putCalls.length !== 1) return false;

          const item = putCalls[0].args[0].input.Item;
          const expectedTitle = payload.emailTitle.slice(0, 500);

          return (
            item.id === body.id &&
            item.senderDomain === payload.senderDomain &&
            item.emailTitle === expectedTitle &&
            item.emailTitle.length <= 500 &&
            item.category === payload.category &&
            Array.isArray(item.urlDomains)
          );
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Property 8 ──────────────────────────────────────────────────────────────

// Feature: feedback-collection-api, Property 8: URL domains batch validation
describe('Property 8: URL domains batch validation', () => {
  it('only stores valid domains in UrlDomains UpdateCommand calls', async () => {
    // Invalid domain generator: strings with spaces or @ signs
    const invalidDomainArb = fc.oneof(
      fc.string({ minLength: 1 }).map((s) => s + ' space'),
      fc.string({ minLength: 1 }).map((s) => s + '@invalid'),
      fc.constant(''),
      fc.constant('nodot'),
      fc.constant('has space.com'),
    );

    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.domain(), { minLength: 1, maxLength: 25 }),
        fc.array(invalidDomainArb, { minLength: 1, maxLength: 25 }),
        fc.domain(),
        fc.string({ minLength: 1 }),
        async (validDomains, invalidDomains, senderDomain, category) => {
          ddbMock.resetHistory();

          // Shuffle valid and invalid together
          const mixed = [...validDomains, ...invalidDomains].sort(() => 0.5 - Math.random());

          const payload = { senderDomain, emailTitle: 'test', urlDomains: mixed, category };
          const response = await handler(makeEvent(payload));
          if (response.statusCode !== 201) return false;

          const updateCalls = ddbMock.commandCalls(UpdateCommand);
          // First UpdateCommand is for SenderDomains, rest are for UrlDomains
          const urlDomainCalls = updateCalls.filter(
            (c) => c.args[0].input.TableName === 'UrlDomains'
          );

          const storedDomains = urlDomainCalls.map((c) => c.args[0].input.Key.domain);

          // No invalid domain should appear in stored domains
          for (const stored of storedDomains) {
            if (invalidDomains.includes(stored)) return false;
          }

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Property 9 ──────────────────────────────────────────────────────────────

// Feature: feedback-collection-api, Property 9: Sender domain aggregate count
describe('Property 9: Sender domain aggregate count', () => {
  it('calls UpdateCommand to SenderDomains exactly M times for M submissions', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.domain(),
        fc.string({ minLength: 1 }),
        fc.integer({ min: 1, max: 5 }),
        async (senderDomain, category, m) => {
          ddbMock.resetHistory();

          const payload = { senderDomain, emailTitle: 'test', urlDomains: [], category };

          for (let i = 0; i < m; i++) {
            const res = await handler(makeEvent(payload));
            if (res.statusCode !== 201) return false;
          }

          const senderDomainCalls = ddbMock
            .commandCalls(UpdateCommand)
            .filter(
              (c) =>
                c.args[0].input.TableName === 'SenderDomains' &&
                c.args[0].input.Key.domain === senderDomain
            );

          return senderDomainCalls.length === m;
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Property 10 ─────────────────────────────────────────────────────────────

// Feature: feedback-collection-api, Property 10: URL domain aggregate count
describe('Property 10: URL domain aggregate count', () => {
  it('calls UpdateCommand to UrlDomains exactly N times for a domain appearing in N submissions', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.domain(),
        fc.domain(),
        fc.string({ minLength: 1 }),
        fc.integer({ min: 1, max: 5 }),
        async (senderDomain, urlDomain, category, n) => {
          ddbMock.resetHistory();

          const payload = {
            senderDomain,
            emailTitle: 'test',
            urlDomains: [urlDomain],
            category,
          };

          for (let i = 0; i < n; i++) {
            const res = await handler(makeEvent(payload));
            if (res.statusCode !== 201) return false;
          }

          const urlDomainCalls = ddbMock
            .commandCalls(UpdateCommand)
            .filter(
              (c) =>
                c.args[0].input.TableName === 'UrlDomains' &&
                c.args[0].input.Key.domain === urlDomain
            );

          return urlDomainCalls.length === n;
        }
      ),
      { numRuns: 100 }
    );
  });
});
