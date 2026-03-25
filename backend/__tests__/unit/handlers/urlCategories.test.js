// Unit tests for GET /export/url-categories handler
// Requirements: 6.2, 6.4, 6.5

import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { handler } from '../../../src/handlers/export/urlCategories.js';

const ddbMock = mockClient(DynamoDBDocumentClient);

beforeEach(() => {
  ddbMock.reset();
  process.env.URL_FEEDBACK_TABLE = 'UrlFeedback';
  process.env.EXPORT_SECRET = 'super-secret';
});

afterEach(() => {
  delete process.env.URL_FEEDBACK_TABLE;
  delete process.env.EXPORT_SECRET;
});

const makeEvent = (headers = { Authorization: 'super-secret' }) => ({ headers });

// ─── Auth ─────────────────────────────────────────────────────────────────────

describe('urlCategories handler — auth', () => {
  it('returns 401 when Authorization header is missing', async () => {
    const res = await handler(makeEvent({}));
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body).error).toBe('Unauthorized');
  });

  it('returns 401 when Authorization header has wrong value', async () => {
    const res = await handler(makeEvent({ Authorization: 'wrong-secret' }));
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body).error).toBe('Unauthorized');
  });
});

// ─── Empty result ─────────────────────────────────────────────────────────────

describe('urlCategories handler — empty result', () => {
  it('returns 200 with empty categories object when table is empty', async () => {
    ddbMock.on(ScanCommand).resolves({ Items: [] });

    const res = await handler(makeEvent());
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.categories).toEqual({});
    expect(typeof body.generatedAt).toBe('string');
  });

  it('returns 200 with empty categories when Items is undefined', async () => {
    ddbMock.on(ScanCommand).resolves({});

    const res = await handler(makeEvent());
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).categories).toEqual({});
  });
});

// ─── Response schema ──────────────────────────────────────────────────────────

describe('urlCategories handler — response schema', () => {
  it('returns { categories, generatedAt } with known fixture data', async () => {
    ddbMock.on(ScanCommand).resolves({
      Items: [
        { domain: 'example.com', suggestedCategory: 'shopping' },
        { domain: 'cdn.example.org', suggestedCategory: 'cdn' },
      ],
    });

    const res = await handler(makeEvent());
    expect(res.statusCode).toBe(200);

    const body = JSON.parse(res.body);
    expect(typeof body.categories).toBe('object');
    expect(typeof body.generatedAt).toBe('string');
    expect(new Date(body.generatedAt).toISOString()).toBe(body.generatedAt);
    expect(body.categories['example.com']).toBe('shopping');
    expect(body.categories['cdn.example.org']).toBe('cdn');
  });
});

// ─── Category selection ───────────────────────────────────────────────────────

describe('urlCategories handler — category selection', () => {
  it('assigns the category with the highest count for a domain', async () => {
    ddbMock.on(ScanCommand).resolves({
      Items: [
        { domain: 'example.com', suggestedCategory: 'shopping' },
        { domain: 'example.com', suggestedCategory: 'shopping' },
        { domain: 'example.com', suggestedCategory: 'finance' },
      ],
    });

    const res = await handler(makeEvent());
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).categories['example.com']).toBe('shopping');
  });

  it('uses lexicographic tiebreak when categories are tied', async () => {
    ddbMock.on(ScanCommand).resolves({
      Items: [
        { domain: 'example.com', suggestedCategory: 'shopping' },
        { domain: 'example.com', suggestedCategory: 'finance' },
      ],
    });

    const res = await handler(makeEvent());
    expect(res.statusCode).toBe(200);
    // 'finance' < 'shopping' lexicographically → finance wins on tie
    expect(JSON.parse(res.body).categories['example.com']).toBe('finance');
  });
});
