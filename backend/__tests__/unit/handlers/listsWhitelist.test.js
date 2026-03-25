// Unit tests for GET /lists/whitelist handler
// Requirements: 8.4, 8.5, 8.6

import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { handler } from '../../../src/handlers/lists/whitelist.js';

const ddbMock = mockClient(DynamoDBDocumentClient);

const fixtureWhitelist = {
  version: '2',
  updatedAt: '2026-03-04',
  services: [{ name: 'Google', domains: ['google.com'] }],
  publicEmailDomains: ['gmail.com'],
  suspiciousDomains: ['evil.com'],
  shortUrlServices: ['bit.ly'],
};

beforeEach(() => {
  ddbMock.reset();
  process.env.WHITELIST_TABLE = 'Whitelist';
});

afterEach(() => {
  delete process.env.WHITELIST_TABLE;
});

// ─── Missing singleton ────────────────────────────────────────────────────────

describe('listsWhitelist handler — missing singleton', () => {
  it('returns 500 with generic error when singleton record is not found', async () => {
    ddbMock.on(GetCommand).resolves({ Item: undefined });
    const res = await handler({});
    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.body).error).toBe('Internal server error');
  });
});

// ─── Caching headers ──────────────────────────────────────────────────────────

describe('listsWhitelist handler — caching headers', () => {
  it('includes Cache-Control: public, max-age=86400 header', async () => {
    ddbMock.on(GetCommand).resolves({
      Item: { id: 'singleton', data: fixtureWhitelist, etag: 'abc123', updatedAt: '2026-03-04' },
    });
    const res = await handler({});
    expect(res.headers['Cache-Control']).toBe('public, max-age=86400');
  });

  it('includes ETag header from stored etag attribute', async () => {
    ddbMock.on(GetCommand).resolves({
      Item: { id: 'singleton', data: fixtureWhitelist, etag: 'abc123def456', updatedAt: '2026-03-04' },
    });
    const res = await handler({});
    expect(res.headers['ETag']).toBe('abc123def456');
  });

  it('includes Content-Type: application/json header', async () => {
    ddbMock.on(GetCommand).resolves({
      Item: { id: 'singleton', data: fixtureWhitelist, etag: 'abc123', updatedAt: '2026-03-04' },
    });
    const res = await handler({});
    expect(res.headers['Content-Type']).toBe('application/json');
  });
});

// ─── Response body ────────────────────────────────────────────────────────────

describe('listsWhitelist handler — response body', () => {
  it('returns 200 with the stored whitelist data', async () => {
    ddbMock.on(GetCommand).resolves({
      Item: { id: 'singleton', data: fixtureWhitelist, etag: 'abc123', updatedAt: '2026-03-04' },
    });
    const res = await handler({});
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.version).toBe('2');
    expect(body.updatedAt).toBe('2026-03-04');
    expect(Array.isArray(body.services)).toBe(true);
    expect(Array.isArray(body.publicEmailDomains)).toBe(true);
    expect(Array.isArray(body.suspiciousDomains)).toBe(true);
    expect(Array.isArray(body.shortUrlServices)).toBe(true);
  });
});
