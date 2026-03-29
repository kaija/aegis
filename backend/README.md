# Aegis Mail — Backend API

Serverless REST API for collecting URL categorization and email domain feedback from the Aegis Mail Chrome extension.

## Stack

- **Runtime**: Node.js 20.x (ES Modules)
- **Framework**: Serverless Framework v4
- **Cloud**: AWS Lambda + API Gateway V2 (HTTP API)
- **Database**: DynamoDB (on-demand billing)
- **Region**: ap-northeast-1 (Tokyo)

## Environments

| Stage | Base URL |
|-------|----------|
| `dev` | `https://aegis.dev.penrose.services` |
| `prod` | `https://aegis.penrose.services` |

---

## API Reference

### Common Headers

All `POST` endpoints enforce:

| Header | Required | Description |
|--------|----------|-------------|
| `X-Extension-Version` | Yes | Extension version string (e.g. `1.0.0`) |
| `Content-Type` | Yes | Must be `application/json` |
| `Content-Length` | No | If present, must not exceed 10,240 bytes |

### Error Responses

| Status | Body | Cause |
|--------|------|-------|
| `400` | `{ "error": "<message>" }` | Validation failure (missing/invalid fields or headers) |
| `413` | `{ "error": "Request too large" }` | `Content-Length` exceeds 10 KB |
| `500` | `{ "error": "Internal server error" }` | Unexpected server error |

---

### GET /health

Health check endpoint. No authentication required.

**Response** `200`:
```json
{ "status": "ok", "timestamp": "2026-03-29T00:00:00.000Z" }
```

---

### POST /feedback/url-category

Submit a user-labeled URL category correction. Used when a user re-categorizes an uncategorized URL via the feedback widget.

**Request**:
```json
{
  "url": "https://shop.example.com/item/123",
  "suggestedCategory": "shopping",
  "currentCategory": "uncategorized"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `url` | string | Yes | Full URL (must be valid `http:` or `https:`) |
| `suggestedCategory` | string | Yes | Category the user selected |
| `currentCategory` | string | Yes | Category before the correction |

**Response** `201`:
```json
{ "id": "550e8400-e29b-41d4-a716-446655440000" }
```

**Validation errors** `400`:
- `Missing or invalid url`
- `Missing or invalid suggestedCategory`
- `Missing or invalid currentCategory`

---

### POST /feedback/sender-mapping

Submit a sender domain → URL domain mapping observed from an email scan. The extension sends this after analyzing an open email to help build sender-to-domain associations.

**Request**:
```json
{
  "senderDomain": "notifications.amazon.com",
  "urlDomains": ["amazon.com", "amazon-adsystem.com"],
  "companyName": "Amazon"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `senderDomain` | string | Yes | Sender's email domain (validated format) |
| `urlDomains` | string[] | Yes | Domains found in email links (min 1, deduplicated, capped at 50) |
| `companyName` | string | No | Display name of the sender |

**Response** `201`:
```json
{ "senderDomain": "notifications.amazon.com" }
```

**Validation errors** `400`:
- `Missing or invalid senderDomain`
- `Missing or invalid urlDomains`
- `Invalid companyName`

**Side effects**: In addition to storing the raw feedback record, this endpoint atomically increments per-domain counters in the `sender-domain-mapping` table. This builds an aggregated view of which URL domains are associated with each sender domain.

---

### GET /lists/url-categories

Returns aggregated URL category votes derived from all user feedback submissions. Each domain is assigned the category with the highest vote count (lexicographic tiebreak).

**Response** `200`:
```json
{
  "categories": {
    "shop.example.com": "shopping",
    "news.example.com": "news"
  },
  "generatedAt": "2026-03-29T00:00:00.000Z"
}
```

| Header | Value |
|--------|-------|
| `Cache-Control` | `public, max-age=3600` |
| `ETag` | MD5 hash of response body |

---

### GET /lists/url-categories/full

Returns the complete URL categories list in the extension's native `url-categories.json` format. Merges the bundled category definitions with community-voted domains from feedback. The Chrome extension downloads this weekly to stay up-to-date.

**Response** `200`:
```json
{
  "version": "2",
  "updatedAt": "2026-03-29",
  "categories": [
    {
      "id": "shopping",
      "name": "Shopping",
      "emoji": "🛒",
      "color": "#ff6d00",
      "bgColor": "#fff3e0",
      "domains": ["amazon.com", "ebay.com", "community-voted-domain.com"]
    }
  ],
  "excludedDomains": ["bit.ly", "tinyurl.com", "localhost"]
}
```

| Header | Value |
|--------|-------|
| `Cache-Control` | `public, max-age=86400` |
| `ETag` | MD5 hash of response body |

---

### GET /lists/whitelist

Returns the service whitelist singleton used by the extension for trusted domain validation.

**Response** `200`: Whitelist JSON object (structure defined by `src/data/service-whitelist.json`)

| Header | Value |
|--------|-------|
| `Cache-Control` | `public, max-age=86400` |
| `ETag` | Stored ETag from seed |

---

## DynamoDB Tables

| Table | Key | Purpose |
|-------|-----|---------|
| `feedback-collection-api-{stage}-url-feedback` | `id` (hash) + `createdAt` (range) | Raw URL category feedback records |
| `feedback-collection-api-{stage}-sender-mapping-feedback` | `id` (hash) + `createdAt` (range) | Raw email sender mapping records |
| `feedback-collection-api-{stage}-sender-domain-mapping` | `senderDomain` (hash) | Aggregated sender → URL domain counts |
| `feedback-collection-api-{stage}-whitelist` | `id` (hash) | Whitelist singleton (`id = 'singleton'`) |

## Domain Validation Rules

- **Domain**: alphanumeric + hyphens + dots, must contain at least one dot, no leading/trailing hyphens
- **URL**: must have `http:` or `https:` protocol
- **urlDomains**: filtered to valid domains, deduplicated, capped at 50

---

## Project Structure

```
backend/
├── src/
│   ├── handlers/
│   │   ├── feedback/
│   │   │   ├── urlCategory.js       # POST /feedback/url-category
│   │   │   └── senderMapping.js     # POST /feedback/sender-mapping
│   │   ├── lists/
│   │   │   ├── urlCategories.js     # GET /lists/url-categories
│   │   │   └── whitelist.js         # GET /lists/whitelist
│   │   └── health.js                # GET /health
│   ├── lib/
│   │   ├── dynamo.js                # DynamoDB client singleton
│   │   ├── response.js              # HTTP response helpers
│   │   └── validation.js            # isValidUrl, isValidDomain, sanitizeUrlDomains
│   ├── middleware/
│   │   └── validateRequest.js       # X-Extension-Version + Content-Length guard
│   └── config.js                    # Environment variable bindings
├── scripts/
│   ├── seed-whitelist.js            # Seed whitelist to DynamoDB
│   ├── seed-url-history.js          # Seed URL history data
│   └── delete-uncategorized.js      # Clean up uncategorized records
├── __tests__/
│   ├── integration/                 # Live API tests (hits deployed endpoints)
│   ├── unit/                        # Unit tests with mocked DynamoDB
│   └── property/                    # Property-based tests (fast-check)
├── serverless.yml
├── jest.config.json
├── jest.integration.json
└── package.json
```

## Setup

```bash
npm install
```

## Deployment

```bash
# Deploy to dev
npx serverless deploy --stage dev

# Deploy to prod
npx serverless deploy --stage prod
```

## Seeding the Whitelist

The whitelist must be seeded once after each fresh deployment:

```bash
# Dev
node scripts/seed-whitelist.js --table feedback-collection-api-dev-whitelist

# Prod
node scripts/seed-whitelist.js --table feedback-collection-api-prod-whitelist
```

## Testing

```bash
# Unit + property tests (no network)
npm test

# Integration tests against dev
npm run test:integration:dev

# Integration tests against prod
npm run test:integration:prod
```
