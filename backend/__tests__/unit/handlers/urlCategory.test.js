// Unit tests for POST /feedback/url-category handler
// Requirements: 2.2, 2.3, 2.5

import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { handler } from '../../../src/handlers/feedback/urlCategory.js';

const ddbMock = mockClient(DynamoDBDocumentClient);

beforeEach(() => {
  ddbMock.reset();
  ddbMock.on(PutCommand).resolves({});
  process.env.URL_FEEDBACK_TABLE = 'UrlFeedback';
});

afterEach(() => {
  delete process.env.URL_FEEDBACK_TABLE;
});

const makeEvent = (body, headers = { 'X-Extension-Version': '1.0.0' }) => ({
  headers,
  body: JSON.stringify(body),
});

describe('urlCategory handler — validation', () => {
  it('returns 400 when url is missing', async () => {
    const res = await handler(makeEvent({ suggestedCategory: 'shopping', currentCategory: 'unknown' }));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/url/i);
  });

  it('returns 400 when url is not a valid URL string', async () => {
    const res = await handler(makeEvent({ url: 'not-a-url', suggestedCategory: 'shopping', currentCategory: 'unknown' }));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/url/i);
  });

  it('returns 400 when suggestedCategory is missing', async () => {
    const res = await handler(makeEvent({ url: 'https://example.com', currentCategory: 'unknown' }));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/suggestedCategory/i);
  });

  it('returns 400 when currentCategory is missing', async () => {
    const res = await handler(makeEvent({ url: 'https://example.com', suggestedCategory: 'shopping' }));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/currentCategory/i);
  });

  it('returns 400 when X-Extension-Version header is missing', async () => {
    const res = await handler(makeEvent(
      { url: 'https://example.com', suggestedCategory: 'shopping', currentCategory: 'unknown' },
      {}
    ));
    expect(res.statusCode).toBe(400);
  });
});

describe('urlCategory handler — domain extraction', () => {
  it('stores the correct domain extracted from the URL', async () => {
    const res = await handler(makeEvent({
      url: 'https://shop.example.com/path?q=1',
      suggestedCategory: 'shopping',
      currentCategory: 'unknown',
    }));

    expect(res.statusCode).toBe(201);
    const calls = ddbMock.commandCalls(PutCommand);
    expect(calls).toHaveLength(1);
    expect(calls[0].args[0].input.Item.domain).toBe('shop.example.com');
  });
});

describe('urlCategory handler — DynamoDB params', () => {
  it('sends PutCommand with correct table name and item shape', async () => {
    const payload = {
      url: 'https://example.com/page',
      suggestedCategory: 'news',
      currentCategory: 'unknown',
    };

    const res = await handler(makeEvent(payload, { 'X-Extension-Version': '2.1.0' }));

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(typeof body.id).toBe('string');

    const calls = ddbMock.commandCalls(PutCommand);
    expect(calls).toHaveLength(1);

    const { TableName, Item } = calls[0].args[0].input;
    expect(TableName).toBe('UrlFeedback');
    expect(Item.id).toBe(body.id);
    expect(Item.url).toBe(payload.url);
    expect(Item.domain).toBe('example.com');
    expect(Item.suggestedCategory).toBe(payload.suggestedCategory);
    expect(Item.currentCategory).toBe(payload.currentCategory);
    expect(Item.extensionVersion).toBe('2.1.0');
    expect(typeof Item.createdAt).toBe('string');
  });
});
