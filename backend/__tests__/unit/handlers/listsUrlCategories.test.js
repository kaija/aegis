// Unit tests for GET /lists/url-categories handler
// Requirements: 7.3, 7.4, 7.5

import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { handler } from '../../../src/handlers/lists/urlCategories.js';

const ddbMock = mockClient(DynamoDBDocumentClient);

beforeEach(() => {
  ddbMock.reset();
  process.env.URL_FEEDBACK_TABLE = 'UrlFeedback';
});

afterEach(() => {
  delete process.env.URL_FEEDBACK_TABLE;
});

// ─── Caching headers ──────────────────────────────────────────────────────────

describe('listsUrlCategories handler — caching headers', () => {
  it('includes Cache-Control: public, max-age=3600 header', async () => {
    ddbMock.on(ScanCommand).resolves({ Items: [] });
    const res = await handler({});
    expect(res.headers['Cache-Control']).toBe('public, max-age=3600');
  });

  it('includes ETag header', async () => {
    ddbMock.on(ScanCommand).resolves({ Items: [] });
    const res = await handler({});
    expect(typeof res.headers['ETag']).toBe('string');
    expect(res.headers['ETag'].length).toBeGreaterThan(0);
  });

  it('includes Content-Type: application/json header', async () => {
    ddbMock.on(ScanCommand).resolves({ Items: [] });
    const res = await handler({});
    expect(res.headers['Content-Type']).toBe('application/json');
  });
});

// ─── Empty result ─────────────────────────────────────────────────────────────

describe('listsUrlCategories handler — empty result', () => {
  it('returns 200 with empty categories object when table is empty', async () => {
    ddbMock.on(ScanCommand).resolves({ Items: [] });
    const res = await handler({});
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.categories).toEqual({});
    expect(typeof body.generatedAt).toBe('string');
  });

  it('returns 200 with empty categories when Items is undefined', async () => {
    ddbMock.on(ScanCommand).resolves({});
    const res = await handler({});
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).categories).toEqual({});
  });
});

// ─── Response schema ──────────────────────────────────────────────────────────

describe('listsUrlCategories handler — response schema', () => {
  it('returns { categories, generatedAt } with known fixture data', async () => {
    ddbMock.on(ScanCommand).resolves({
      Items: [
        { domain: 'example.com', suggestedCategory: 'shopping' },
        { domain: 'cdn.example.org', suggestedCategory: 'cdn' },
      ],
    });

    const res = await handler({});
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.categories['example.com']).toBe('shopping');
    expect(body.categories['cdn.example.org']).toBe('cdn');
    expect(new Date(body.generatedAt).toISOString()).toBe(body.generatedAt);
  });
});
