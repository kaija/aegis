// Unit tests for validateRequest and authGuard middleware
// Requirements: 4.2, 4.5, 5.2

import { validateRequest } from '../../src/middleware/validateRequest.js';
import { authGuard } from '../../src/middleware/authGuard.js';

// ─── validateRequest ──────────────────────────────────────────────────────────

describe('validateRequest', () => {
  it('returns 400 when X-Extension-Version header is missing', () => {
    const result = validateRequest({ headers: {} });
    expect(result).not.toBeNull();
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toMatch(/X-Extension-Version/i);
  });

  it('returns 400 when headers object is absent entirely', () => {
    const result = validateRequest({});
    expect(result).not.toBeNull();
    expect(result.statusCode).toBe(400);
  });

  it('accepts X-Extension-Version in lowercase form (case-insensitive)', () => {
    const result = validateRequest({
      headers: { 'x-extension-version': '1.0.0' },
    });
    expect(result).toBeNull();
  });

  it('accepts X-Extension-Version in mixed case', () => {
    const result = validateRequest({
      headers: { 'X-Extension-Version': '2.3.1' },
    });
    expect(result).toBeNull();
  });

  it('returns 413 when Content-Length exceeds 10240', () => {
    const result = validateRequest({
      headers: {
        'X-Extension-Version': '1.0.0',
        'Content-Length': '10241',
      },
    });
    expect(result).not.toBeNull();
    expect(result.statusCode).toBe(413);
    expect(JSON.parse(result.body).error).toBe('Request too large');
  });

  it('returns null when Content-Length is exactly 10240', () => {
    const result = validateRequest({
      headers: {
        'X-Extension-Version': '1.0.0',
        'Content-Length': '10240',
      },
    });
    expect(result).toBeNull();
  });

  it('returns null when Content-Length is absent', () => {
    const result = validateRequest({
      headers: { 'X-Extension-Version': '1.0.0' },
    });
    expect(result).toBeNull();
  });

  it('returns null for a fully valid request', () => {
    const result = validateRequest({
      headers: {
        'X-Extension-Version': '1.2.3',
        'Content-Type': 'application/json',
        'Content-Length': '512',
      },
    });
    expect(result).toBeNull();
  });
});

// ─── authGuard ────────────────────────────────────────────────────────────────

describe('authGuard', () => {
  const SECRET = 'super-secret-token';

  beforeEach(() => {
    process.env.EXPORT_SECRET = SECRET;
  });

  afterEach(() => {
    delete process.env.EXPORT_SECRET;
  });

  it('returns null when Authorization header matches the secret exactly', () => {
    const result = authGuard({ headers: { Authorization: SECRET } });
    expect(result).toBeNull();
  });

  it('returns null when Authorization header key is lowercase (case-insensitive)', () => {
    const result = authGuard({ headers: { authorization: SECRET } });
    expect(result).toBeNull();
  });

  it('returns 401 when Authorization header is absent', () => {
    const result = authGuard({ headers: {} });
    expect(result).not.toBeNull();
    expect(result.statusCode).toBe(401);
  });

  it('returns 401 when headers object is absent entirely', () => {
    const result = authGuard({});
    expect(result).not.toBeNull();
    expect(result.statusCode).toBe(401);
  });

  it('returns 401 for a near-miss string (one char off)', () => {
    const nearMiss = SECRET.slice(0, -1) + 'X';
    const result = authGuard({ headers: { Authorization: nearMiss } });
    expect(result).not.toBeNull();
    expect(result.statusCode).toBe(401);
  });

  it('returns 401 for an empty string Authorization header', () => {
    const result = authGuard({ headers: { Authorization: '' } });
    expect(result).not.toBeNull();
    expect(result.statusCode).toBe(401);
  });

  it('returns 401 for a longer string that starts with the secret', () => {
    const result = authGuard({ headers: { Authorization: SECRET + '-extra' } });
    expect(result).not.toBeNull();
    expect(result.statusCode).toBe(401);
  });

  it('returns 401 for a completely wrong secret', () => {
    const result = authGuard({ headers: { Authorization: 'wrong-token' } });
    expect(result).not.toBeNull();
    expect(result.statusCode).toBe(401);
  });
});
