// Unit tests for POST /feedback/email handler
// Requirements: 3.2, 3.5, 3.6, 3.7

import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { handler } from '../../../src/handlers/feedback/email.js';

const ddbMock = mockClient(DynamoDBDocumentClient);

beforeEach(() => {
  ddbMock.reset();
  ddbMock.on(PutCommand).resolves({});
  ddbMock.on(UpdateCommand).resolves({});
  process.env.EMAIL_FEEDBACK_TABLE = 'EmailFeedback';
  process.env.SENDER_DOMAINS_TABLE = 'SenderDomains';
  process.env.URL_DOMAINS_TABLE = 'UrlDomains';
});

afterEach(() => {
  delete process.env.EMAIL_FEEDBACK_TABLE;
  delete process.env.SENDER_DOMAINS_TABLE;
  delete process.env.URL_DOMAINS_TABLE;
});

const makeEvent = (body, headers = { 'X-Extension-Version': '1.0.0' }) => ({
  headers,
  body: JSON.stringify(body),
});

const validPayload = {
  senderDomain: 'example.com',
  emailTitle: 'Hello world',
  urlDomains: ['tracking.example.com'],
  category: 'shopping',
};

// ─── Validation ──────────────────────────────────────────────────────────────

describe('email handler — validation', () => {
  it('returns 400 when senderDomain is missing', async () => {
    const { senderDomain: _, ...body } = validPayload;
    const res = await handler(makeEvent(body));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/senderDomain/i);
  });

  it('returns 400 when senderDomain is not a valid domain format', async () => {
    const res = await handler(makeEvent({ ...validPayload, senderDomain: 'not a domain' }));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/senderDomain/i);
  });

  it('returns 400 when emailTitle is missing', async () => {
    const { emailTitle: _, ...body } = validPayload;
    const res = await handler(makeEvent(body));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/emailTitle/i);
  });

  it('returns 400 when urlDomains is missing', async () => {
    const { urlDomains: _, ...body } = validPayload;
    const res = await handler(makeEvent(body));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/urlDomains/i);
  });

  it('returns 400 when urlDomains is not an array', async () => {
    const res = await handler(makeEvent({ ...validPayload, urlDomains: 'not-an-array' }));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/urlDomains/i);
  });

  it('returns 400 when category is missing', async () => {
    const { category: _, ...body } = validPayload;
    const res = await handler(makeEvent(body));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/category/i);
  });

  it('returns 400 when X-Extension-Version header is missing', async () => {
    const res = await handler(makeEvent(validPayload, {}));
    expect(res.statusCode).toBe(400);
  });
});

// ─── emailTitle truncation ────────────────────────────────────────────────────

describe('email handler — emailTitle truncation', () => {
  it('stores emailTitle verbatim when exactly 500 chars', async () => {
    const title500 = 'a'.repeat(500);
    const res = await handler(makeEvent({ ...validPayload, emailTitle: title500 }));
    expect(res.statusCode).toBe(201);

    const putCalls = ddbMock.commandCalls(PutCommand);
    expect(putCalls[0].args[0].input.Item.emailTitle).toBe(title500);
    expect(putCalls[0].args[0].input.Item.emailTitle.length).toBe(500);
  });

  it('truncates emailTitle to 500 chars when 501 chars are submitted', async () => {
    const title501 = 'b'.repeat(501);
    const res = await handler(makeEvent({ ...validPayload, emailTitle: title501 }));
    expect(res.statusCode).toBe(201);

    const putCalls = ddbMock.commandCalls(PutCommand);
    expect(putCalls[0].args[0].input.Item.emailTitle.length).toBe(500);
    expect(putCalls[0].args[0].input.Item.emailTitle).toBe('b'.repeat(500));
  });
});

// ─── urlDomains capping ───────────────────────────────────────────────────────

describe('email handler — urlDomains capping', () => {
  it('caps urlDomains at 50 entries in UpdateCommand calls', async () => {
    // Generate 51 unique valid domains
    const domains51 = Array.from({ length: 51 }, (_, i) => `domain${i}.com`);
    const res = await handler(makeEvent({ ...validPayload, urlDomains: domains51 }));
    expect(res.statusCode).toBe(201);

    const urlDomainCalls = ddbMock
      .commandCalls(UpdateCommand)
      .filter((c) => c.args[0].input.TableName === 'UrlDomains');

    expect(urlDomainCalls.length).toBe(50);
  });
});

// ─── DynamoDB params ──────────────────────────────────────────────────────────

describe('email handler — DynamoDB params', () => {
  it('sends correct PutCommand and UpdateCommand params', async () => {
    const payload = {
      senderDomain: 'sender.com',
      emailTitle: 'Test email',
      urlDomains: ['link.example.com', 'cdn.example.org'],
      category: 'news',
    };

    const res = await handler(makeEvent(payload, { 'X-Extension-Version': '3.0.0' }));
    expect(res.statusCode).toBe(201);

    const body = JSON.parse(res.body);
    expect(typeof body.id).toBe('string');

    // PutCommand to EmailFeedback
    const putCalls = ddbMock.commandCalls(PutCommand);
    expect(putCalls).toHaveLength(1);
    const { TableName, Item } = putCalls[0].args[0].input;
    expect(TableName).toBe('EmailFeedback');
    expect(Item.id).toBe(body.id);
    expect(Item.senderDomain).toBe(payload.senderDomain);
    expect(Item.emailTitle).toBe(payload.emailTitle);
    expect(Item.urlDomains).toEqual(payload.urlDomains);
    expect(Item.category).toBe(payload.category);
    expect(Item.extensionVersion).toBe('3.0.0');
    expect(typeof Item.createdAt).toBe('string');

    const updateCalls = ddbMock.commandCalls(UpdateCommand);
    // 1 SenderDomains + 2 UrlDomains = 3 total
    expect(updateCalls).toHaveLength(3);

    // SenderDomains UpdateCommand
    const senderCall = updateCalls.find(
      (c) => c.args[0].input.TableName === 'SenderDomains'
    );
    expect(senderCall).toBeDefined();
    expect(senderCall.args[0].input.Key).toEqual({ domain: 'sender.com' });
    expect(senderCall.args[0].input.UpdateExpression).toContain('ADD #count :one');
    expect(senderCall.args[0].input.ExpressionAttributeValues[':one']).toBe(1);

    // UrlDomains UpdateCommands
    const urlCalls = updateCalls.filter(
      (c) => c.args[0].input.TableName === 'UrlDomains'
    );
    expect(urlCalls).toHaveLength(2);
    const storedUrlDomains = urlCalls.map((c) => c.args[0].input.Key.domain);
    expect(storedUrlDomains).toContain('link.example.com');
    expect(storedUrlDomains).toContain('cdn.example.org');

    for (const call of urlCalls) {
      const input = call.args[0].input;
      expect(input.ExpressionAttributeValues[':cat']).toBe('news');
      expect(input.ExpressionAttributeValues[':one']).toBe(1);
    }
  });
});
