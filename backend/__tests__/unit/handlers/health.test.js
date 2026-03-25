// Unit tests for GET /health handler
// Requirements: 10.1

import { handler } from '../../../src/handlers/health.js';

// ─── Response shape ───────────────────────────────────────────────────────────

describe('health handler — response shape', () => {
  it('returns HTTP 200', async () => {
    const res = await handler({});
    expect(res.statusCode).toBe(200);
  });

  it('returns body with status: ok', async () => {
    const res = await handler({});
    const body = JSON.parse(res.body);
    expect(body.status).toBe('ok');
  });

  it('returns body with a timestamp string', async () => {
    const res = await handler({});
    const body = JSON.parse(res.body);
    expect(typeof body.timestamp).toBe('string');
  });

  it('timestamp is a valid ISO8601 string', async () => {
    const res = await handler({});
    const body = JSON.parse(res.body);
    expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp);
  });
});
