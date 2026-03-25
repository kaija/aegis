// Feature: feedback-collection-api, Property 11: Missing X-Extension-Version header returns HTTP 400
// Feature: feedback-collection-api, Property 13: Export endpoints require valid Authorization header
// Validates: Requirements 4.2, 5.2, 6.2

import fc from 'fast-check';
import { validateRequest } from '../../src/middleware/validateRequest.js';
import { authGuard } from '../../src/middleware/authGuard.js';

// ─── Property 11 ─────────────────────────────────────────────────────────────

// Validates: Requirements 4.2
describe('Property 11: Missing X-Extension-Version header returns HTTP 400', () => {
  it('returns 400 for any headers object that lacks X-Extension-Version', () => {
    // Feature: feedback-collection-api, Property 11: Missing X-Extension-Version header returns HTTP 400

    // Arbitrary: a record of HTTP-like headers that never contains x-extension-version
    const headersWithoutVersionArb = fc.dictionary(
      // key: any non-empty string that is NOT x-extension-version (case-insensitive)
      fc.string({ minLength: 1, maxLength: 40 }).filter(
        (k) => k.toLowerCase() !== 'x-extension-version'
      ),
      fc.string({ maxLength: 100 })
    );

    fc.assert(
      fc.property(headersWithoutVersionArb, (headers) => {
        const result = validateRequest({ headers });
        return result !== null && result.statusCode === 400;
      }),
      { numRuns: 100 }
    );
  });
});

// ─── Property 13 ─────────────────────────────────────────────────────────────

// Validates: Requirements 5.2, 6.2
describe('Property 13: Export endpoints require valid Authorization header', () => {
  const SECRET = 'test-export-secret-abc123';

  beforeEach(() => {
    process.env.EXPORT_SECRET = SECRET;
  });

  afterEach(() => {
    delete process.env.EXPORT_SECRET;
  });

  it('returns 401 for any Authorization value that does not equal the secret', () => {
    // Feature: feedback-collection-api, Property 13: Export endpoints require valid Authorization header

    // Arbitrary: any string that is NOT the exact secret
    const wrongTokenArb = fc.string({ maxLength: 80 }).filter((s) => s !== SECRET);

    fc.assert(
      fc.property(wrongTokenArb, (token) => {
        const result = authGuard({ headers: { Authorization: token } });
        return result !== null && result.statusCode === 401;
      }),
      { numRuns: 100 }
    );
  });

  it('returns 401 when Authorization header is absent (empty headers)', () => {
    // Feature: feedback-collection-api, Property 13: Export endpoints require valid Authorization header

    // Arbitrary: headers dict with no authorization key
    const headersWithoutAuthArb = fc.dictionary(
      fc.string({ minLength: 1, maxLength: 40 }).filter(
        (k) => k.toLowerCase() !== 'authorization'
      ),
      fc.string({ maxLength: 100 })
    );

    fc.assert(
      fc.property(headersWithoutAuthArb, (headers) => {
        const result = authGuard({ headers });
        return result !== null && result.statusCode === 401;
      }),
      { numRuns: 100 }
    );
  });
});
