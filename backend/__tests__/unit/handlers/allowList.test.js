// Unit tests for GET /export/allow-list handler
// Requirements: 5.2, 5.4, 5.5

import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { handler } from '../../../src/handlers/export/allowList.js';

const ddbMock = mockClient(DynamoDBDocumentClient);

beforeEach(() => {
  ddbMock.reset();
  process.env.SENDER_DOMAINS_TABLE = 'SenderDomains';
  process.env.EXPORT_SECRET = 'super-secret';
  process.env.ALLOW_LIST_THRESHOLD = '5';
});

afterEach(() => {
  delete process.env.SENDER_DOMAINS_TABLE;
  delete process.env.EXPORT_SECRET;
  delete process.env.ALLOW_LIST_THRESHOLD;
});

const makeEvent = (headers = { Authorization: 'super-secret' }) => ({ headers });

// ─── Auth ─────────────────────────────────────────────────────────────────────

describe('allowList handler — auth', () => {
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

describe('allowList handler — empty result', () => {
  it('returns 200 with empty domains array when no domains meet threshold', async () => {
    ddbMock.on(ScanCommand).resolves({
      Items: [
        { domain: 'low.com', count: 1 },
        { domain: 'also-low.com', count: 3 },
      ],
    });

    const res = await handler(makeEvent());
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.domains).toEqual([]);
    expect(typeof body.generatedAt).toBe('string');
  });

  it('returns 200 with empty domains array when table is empty', async () => {
    ddbMock.on(ScanCommand).resolves({ Items: [] });

    const res = await handler(makeEvent());
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.domains).toEqual([]);
  });
});

// ─── Response schema ──────────────────────────────────────────────────────────

describe('allowList handler — response schema', () => {
  it('returns { domains, generatedAt } with known fixture data', async () => {
    ddbMock.on(ScanCommand).resolves({
      Items: [
        { domain: 'trusted.com', count: 10 },
        { domain: 'example.org', count: 7 },
        { domain: 'below.net', count: 2 },
      ],
    });

    const res = await handler(makeEvent());
    expect(res.statusCode).toBe(200);

    const body = JSON.parse(res.body);
    expect(Array.isArray(body.domains)).toBe(true);
    expect(typeof body.generatedAt).toBe('string');
    expect(new Date(body.generatedAt).toISOString()).toBe(body.generatedAt);

    // Only domains with count >= 5 should appear
    expect(body.domains).toContain('trusted.com');
    expect(body.domains).toContain('example.org');
    expect(body.domains).not.toContain('below.net');
  });
});

// ─── Sorting ──────────────────────────────────────────────────────────────────

describe('allowList handler — sorting', () => {
  it('returns domains sorted descending by count', async () => {
    ddbMock.on(ScanCommand).resolves({
      Items: [
        { domain: 'medium.com', count: 7 },
        { domain: 'top.com', count: 15 },
        { domain: 'second.com', count: 10 },
      ],
    });

    const res = await handler(makeEvent());
    expect(res.statusCode).toBe(200);

    const { domains } = JSON.parse(res.body);
    expect(domains).toEqual(['top.com', 'second.com', 'medium.com']);
  });
});
