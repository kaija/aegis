import { BASE_URL, STAGE } from './config.js';

// ---------------------------------------------------------------------------
// GET /lists/url-categories
// ---------------------------------------------------------------------------

describe(`GET /lists/url-categories [${STAGE}]`, () => {
  let res;
  let body;

  beforeAll(async () => {
    res = await fetch(`${BASE_URL}/lists/url-categories`);
    body = await res.json();
  });

  it('returns 200', () => {
    expect(res.status).toBe(200);
  });

  it('returns a categories object', () => {
    expect(body).toHaveProperty('categories');
    expect(typeof body.categories).toBe('object');
    expect(Array.isArray(body.categories)).toBe(false);
  });

  it('returns a valid ISO 8601 generatedAt timestamp', () => {
    expect(typeof body.generatedAt).toBe('string');
    expect(isNaN(Date.parse(body.generatedAt))).toBe(false);
  });

  it('returns Cache-Control: public, max-age=3600', () => {
    expect(res.headers.get('cache-control')).toBe('public, max-age=3600');
  });

  it('returns an ETag header', () => {
    expect(res.headers.get('etag')).toBeTruthy();
  });

  it('returns Content-Type: application/json', () => {
    expect(res.headers.get('content-type')).toMatch(/application\/json/);
  });
});

// ---------------------------------------------------------------------------
// GET /lists/whitelist
// ---------------------------------------------------------------------------

describe(`GET /lists/whitelist [${STAGE}]`, () => {
  let res;
  let body;

  beforeAll(async () => {
    res = await fetch(`${BASE_URL}/lists/whitelist`);
    body = await res.json();
  });

  it('returns 200', () => {
    expect(res.status).toBe(200);
  });

  it('returns a non-null body', () => {
    expect(body).not.toBeNull();
    expect(typeof body).toBe('object');
  });

  it('returns Cache-Control: public, max-age=86400', () => {
    expect(res.headers.get('cache-control')).toBe('public, max-age=86400');
  });

  it('returns an ETag header', () => {
    expect(res.headers.get('etag')).toBeTruthy();
  });

  it('returns Content-Type: application/json', () => {
    expect(res.headers.get('content-type')).toMatch(/application\/json/);
  });
});
