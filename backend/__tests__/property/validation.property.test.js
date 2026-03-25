// Feature: feedback-collection-api, Property 2: Domain extraction from URL
// Feature: feedback-collection-api, Property 6: Email title truncation invariant
// Feature: feedback-collection-api, Property 7: Sender domain format validation

import fc from 'fast-check';
import { extractDomain, truncateTitle, isValidDomain } from '../../src/lib/validation.js';

// Property 2: Domain extraction from URL
// Validates: Requirements 2.5
describe('Property 2: Domain extraction from URL', () => {
  it('extractDomain(url) === new URL(url).hostname for any valid http/https URL', () => {
    // Feature: feedback-collection-api, Property 2: Domain extraction from URL
    fc.assert(
      fc.property(
        fc.webUrl({ validSchemes: ['http', 'https'] }),
        (url) => {
          return extractDomain(url) === new URL(url).hostname;
        }
      ),
      { numRuns: 100 }
    );
  });
});

// Property 6: Email title truncation invariant
// Validates: Requirements 3.5
describe('Property 6: Email title truncation invariant', () => {
  it('truncateTitle(s).length === Math.min(s.length, 500) for any string', () => {
    // Feature: feedback-collection-api, Property 6: Email title truncation invariant
    fc.assert(
      fc.property(
        fc.string({ maxLength: 1000 }),
        (s) => {
          return truncateTitle(s).length === Math.min(s.length, 500);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// Property 7: Sender domain format validation
// Validates: Requirements 3.6
describe('Property 7: Sender domain format validation', () => {
  // Constructive arbitraries — avoid slow .filter() patterns

  // Empty string
  const emptyArb = fc.constant('');

  // Strings with spaces: build as "word space word"
  const withSpaceArb = fc.tuple(
    fc.string({ minLength: 1, maxLength: 20 }),
    fc.string({ minLength: 1, maxLength: 20 })
  ).map(([a, b]) => `${a} ${b}`);

  // Strings without dots: alphanumeric only, no dot
  const noDotArb = fc.stringOf(
    fc.char().filter(c => c !== '.'),
    { minLength: 1, maxLength: 30 }
  );

  // Strings with invalid chars: inject one of @, /, \, #, ! at a random position
  const invalidCharArb = fc.tuple(
    fc.string({ maxLength: 15 }),
    fc.constantFrom('@', '/', '\\', '#', '!'),
    fc.string({ maxLength: 15 })
  ).map(([pre, ch, post]) => `${pre}${ch}${post}`);

  it('isValidDomain returns false for empty strings', () => {
    // Feature: feedback-collection-api, Property 7: Sender domain format validation
    fc.assert(
      fc.property(emptyArb, (s) => isValidDomain(s) === false),
      { numRuns: 100 }
    );
  });

  it('isValidDomain returns false for strings with spaces', () => {
    // Feature: feedback-collection-api, Property 7: Sender domain format validation
    fc.assert(
      fc.property(withSpaceArb, (s) => isValidDomain(s) === false),
      { numRuns: 100 }
    );
  });

  it('isValidDomain returns false for strings without dots', () => {
    // Feature: feedback-collection-api, Property 7: Sender domain format validation
    fc.assert(
      fc.property(noDotArb, (s) => isValidDomain(s) === false),
      { numRuns: 100 }
    );
  });

  it('isValidDomain returns false for strings with invalid chars (@, /, \\, #, !)', () => {
    // Feature: feedback-collection-api, Property 7: Sender domain format validation
    fc.assert(
      fc.property(invalidCharArb, (s) => isValidDomain(s) === false),
      { numRuns: 100 }
    );
  });
});
