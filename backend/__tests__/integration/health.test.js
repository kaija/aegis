import { BASE_URL, STAGE } from './config.js';

describe(`GET /health [${STAGE}]`, () => {
  let res;
  let body;

  beforeAll(async () => {
    res = await fetch(`${BASE_URL}/health`);
    body = await res.json();
  });

  it('returns 200', () => {
    expect(res.status).toBe(200);
  });

  it('returns status ok', () => {
    expect(body.status).toBe('ok');
  });

  it('returns a valid ISO 8601 timestamp', () => {
    expect(typeof body.timestamp).toBe('string');
    expect(isNaN(Date.parse(body.timestamp))).toBe(false);
  });
});
