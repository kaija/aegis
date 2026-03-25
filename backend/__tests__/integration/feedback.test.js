import { BASE_URL, STAGE } from './config.js';

const VERSION_HEADER = { 'X-Extension-Version': '1.0.0-integration-test' };
const JSON_HEADERS = { 'Content-Type': 'application/json', ...VERSION_HEADER };

const post = (path, body, headers = JSON_HEADERS) =>
  fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

// ---------------------------------------------------------------------------
// POST /feedback/url-category
// ---------------------------------------------------------------------------

describe(`POST /feedback/url-category [${STAGE}]`, () => {
  const VALID_BODY = {
    url: 'https://shop.example.com/item/123',
    suggestedCategory: 'shopping',
    currentCategory: 'promotions',
  };

  it('returns 201 with a UUID id for a valid submission', async () => {
    const res = await post('/feedback/url-category', VALID_BODY);
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(typeof body.id).toBe('string');
    expect(body.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
  });

  it('returns 400 when X-Extension-Version header is missing', async () => {
    const res = await post(
      '/feedback/url-category',
      VALID_BODY,
      { 'Content-Type': 'application/json' }
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/X-Extension-Version/i);
  });

  it('returns 400 for a missing url field', async () => {
    const res = await post('/feedback/url-category', {
      suggestedCategory: 'shopping',
      currentCategory: 'promotions',
    });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/url/i);
  });

  it('returns 400 for an invalid url (not http/https)', async () => {
    const res = await post('/feedback/url-category', {
      url: 'ftp://not-valid.com',
      suggestedCategory: 'shopping',
      currentCategory: 'promotions',
    });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/url/i);
  });

  it('returns 400 for a missing suggestedCategory', async () => {
    const res = await post('/feedback/url-category', {
      url: 'https://example.com',
      currentCategory: 'promotions',
    });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/suggestedCategory/i);
  });

  it('returns 400 for a missing currentCategory', async () => {
    const res = await post('/feedback/url-category', {
      url: 'https://example.com',
      suggestedCategory: 'shopping',
    });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/currentCategory/i);
  });
});

// ---------------------------------------------------------------------------
// POST /feedback/sender-mapping
// ---------------------------------------------------------------------------

describe(`POST /feedback/sender-mapping [${STAGE}]`, () => {
  const VALID_BODY = {
    senderDomain: 'notifications.example.com',
    urlDomains: ['example.com', 'cdn.example.com'],
    companyName: 'Example Inc',
  };

  it('returns 201 with senderDomain for a valid submission', async () => {
    const res = await post('/feedback/sender-mapping', VALID_BODY);
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.senderDomain).toBe(VALID_BODY.senderDomain);
  });

  it('accepts a submission without optional companyName', async () => {
    const res = await post('/feedback/sender-mapping', {
      senderDomain: 'no-company.example.com',
      urlDomains: ['example.com'],
    });
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.senderDomain).toBe('no-company.example.com');
  });

  it('returns 400 when X-Extension-Version header is missing', async () => {
    const res = await post(
      '/feedback/sender-mapping',
      VALID_BODY,
      { 'Content-Type': 'application/json' }
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/X-Extension-Version/i);
  });

  it('returns 400 for an invalid senderDomain', async () => {
    const res = await post('/feedback/sender-mapping', {
      senderDomain: 'not a domain!!',
      urlDomains: ['example.com'],
    });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/senderDomain/i);
  });

  it('returns 400 for an empty urlDomains array', async () => {
    const res = await post('/feedback/sender-mapping', {
      senderDomain: 'example.com',
      urlDomains: [],
    });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/urlDomains/i);
  });

  it('returns 400 when urlDomains is not an array', async () => {
    const res = await post('/feedback/sender-mapping', {
      senderDomain: 'example.com',
      urlDomains: 'example.com',
    });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/urlDomains/i);
  });
});
