'use strict';

const { describe, test, expect } = require('@jest/globals');
const fc = require('fast-check');
const fs = require('fs');
const path = require('path');

// Load module
const validationHelpersCode = fs.readFileSync(path.join(__dirname, '../src/utils/validation-helpers.js'), 'utf8');
eval(validationHelpersCode);

describe('ValidationHelpers', () => {
  describe('isValidHexColor', () => {
    test('should accept valid hex colors in #RRGGBB format', () => {
      expect(ValidationHelpers.isValidColor('#000000')).toBe(true);
      expect(ValidationHelpers.isValidColor('#FFFFFF')).toBe(true);
      expect(ValidationHelpers.isValidColor('#4285f4')).toBe(true);
      expect(ValidationHelpers.isValidColor('#e8f0fe')).toBe(true);
      expect(ValidationHelpers.isValidColor('#1A2B3C')).toBe(true);
    });

    test('should reject invalid hex colors', () => {
      expect(ValidationHelpers.isValidColor('#FFF')).toBe(false); // Too short
      expect(ValidationHelpers.isValidColor('#FFFFFFF')).toBe(false); // Too long
      expect(ValidationHelpers.isValidColor('4285f4')).toBe(false); // Missing #
      expect(ValidationHelpers.isValidColor('#GGGGGG')).toBe(false); // Invalid hex chars
      expect(ValidationHelpers.isValidColor('blue')).toBe(false); // Color name
      expect(ValidationHelpers.isValidColor('rgb(255,0,0)')).toBe(false); // RGB format
      expect(ValidationHelpers.isValidColor('')).toBe(false); // Empty string
      expect(ValidationHelpers.isValidColor(null)).toBe(false); // Null
      expect(ValidationHelpers.isValidColor(undefined)).toBe(false); // Undefined
      expect(ValidationHelpers.isValidColor(123456)).toBe(false); // Number
    });

    test('should be case insensitive for hex digits', () => {
      expect(ValidationHelpers.isValidColor('#abcdef')).toBe(true);
      expect(ValidationHelpers.isValidColor('#ABCDEF')).toBe(true);
      expect(ValidationHelpers.isValidColor('#AbCdEf')).toBe(true);
    });
  });

  describe('isValidEmoji', () => {
    test('should accept valid single emoji characters', () => {
      expect(ValidationHelpers.isValidIconOrEmoji('✈️')).toBe(true);
      expect(ValidationHelpers.isValidIconOrEmoji('💼')).toBe(true);
      expect(ValidationHelpers.isValidIconOrEmoji('📧')).toBe(true);
      expect(ValidationHelpers.isValidIconOrEmoji('🎉')).toBe(true);
      expect(ValidationHelpers.isValidIconOrEmoji('❤️')).toBe(true);
      expect(ValidationHelpers.isValidIconOrEmoji('⭐')).toBe(true);
    });

    test('should accept emoji with skin tone modifiers', () => {
      expect(ValidationHelpers.isValidIconOrEmoji('👍🏽')).toBe(true);
      expect(ValidationHelpers.isValidIconOrEmoji('👋🏻')).toBe(true);
      expect(ValidationHelpers.isValidIconOrEmoji('🤝🏿')).toBe(true);
    });

    test('should accept emoji sequences (ZWJ sequences)', () => {
      expect(ValidationHelpers.isValidIconOrEmoji('👨‍👩‍👧‍👦')).toBe(true); // Family emoji
      expect(ValidationHelpers.isValidIconOrEmoji('👨‍💻')).toBe(true); // Man technologist
      expect(ValidationHelpers.isValidIconOrEmoji('🏳️‍🌈')).toBe(true); // Rainbow flag
    });

    test('should accept flag emojis', () => {
      expect(ValidationHelpers.isValidIconOrEmoji('🇺🇸')).toBe(true);
      expect(ValidationHelpers.isValidIconOrEmoji('🇯🇵')).toBe(true);
      expect(ValidationHelpers.isValidIconOrEmoji('🇬🇧')).toBe(true);
    });

    test('should reject non-emoji text', () => {
      expect(ValidationHelpers.isValidIconOrEmoji('a')).toBe(false);
      expect(ValidationHelpers.isValidIconOrEmoji('ABC')).toBe(false);
      expect(ValidationHelpers.isValidIconOrEmoji('123')).toBe(false);
      expect(ValidationHelpers.isValidIconOrEmoji('hello')).toBe(false);
      expect(ValidationHelpers.isValidIconOrEmoji('')).toBe(false);
      expect(ValidationHelpers.isValidIconOrEmoji(null)).toBe(false);
      expect(ValidationHelpers.isValidIconOrEmoji(undefined)).toBe(false);
      expect(ValidationHelpers.isValidIconOrEmoji(123)).toBe(false);
    });

    test('should reject emoji mixed with text', () => {
      expect(ValidationHelpers.isValidIconOrEmoji('a✈️')).toBe(false);
      expect(ValidationHelpers.isValidIconOrEmoji('✈️b')).toBe(false);
      expect(ValidationHelpers.isValidIconOrEmoji('hello✈️')).toBe(false);
    });
  });

  describe('generateCategoryId', () => {
    test('should generate ID with correct format', () => {
      const id = ValidationHelpers.generateCategoryId();
      expect(id).toMatch(/^custom-\d+-\d{5}$/);
    });

    test('should generate unique IDs', () => {
      const ids = new Set();
      for (let i = 0; i < 100; i++) {
        ids.add(ValidationHelpers.generateCategoryId());
      }
      // All IDs should be unique
      expect(ids.size).toBe(100);
    });

    test('should include timestamp in ID', () => {
      const beforeTime = Date.now();
      const id = ValidationHelpers.generateCategoryId();
      const afterTime = Date.now();

      const timestamp = parseInt(id.split('-')[1]);
      expect(timestamp).toBeGreaterThanOrEqual(beforeTime);
      expect(timestamp).toBeLessThanOrEqual(afterTime);
    });

    test('should include 5-digit counter+random component', () => {
      const id = ValidationHelpers.generateCategoryId();
      const counterRandomPart = id.split('-')[2];
      expect(counterRandomPart).toHaveLength(5);
      expect(counterRandomPart).toMatch(/^\d{5}$/);
    });
  });

  describe('Property-Based Tests', () => {
    describe('Property 3: Valid Category Data Format - Hex Color Validation', () => {
      test('**Validates: Requirements 4.2, 4.3, 5.3** - valid hex colors always pass validation', () => {
        fc.assert(
          fc.property(
            // Generate valid hex colors: # followed by 6 hex digits (0-9, A-F)
            fc.array(fc.integer({ min: 0, max: 15 }), { minLength: 6, maxLength: 6 }).map(arr =>
              '#' + arr.map(n => n.toString(16)).join('')
            ),
            (color) => {
              return ValidationHelpers.isValidColor(color) === true;
            }
          ),
          { numRuns: 100 }
        );
      });

      test('**Validates: Requirements 4.2, 4.3, 5.3** - invalid hex colors always fail validation', () => {
        fc.assert(
          fc.property(
            fc.oneof(
              // Missing # prefix - 6 hex chars without #
              fc.array(fc.integer({ min: 0, max: 15 }), { minLength: 6, maxLength: 6 }).map(arr =>
                arr.map(n => n.toString(16)).join('')
              ),
              // Wrong length (too short)
              fc.array(fc.integer({ min: 0, max: 15 }), { minLength: 1, maxLength: 5 }).map(arr =>
                '#' + arr.map(n => n.toString(16)).join('')
              ),
              // Wrong length (too long)
              fc.array(fc.integer({ min: 0, max: 15 }), { minLength: 7, maxLength: 10 }).map(arr =>
                '#' + arr.map(n => n.toString(16)).join('')
              ),
              // Non-string types
              fc.oneof(fc.constant(null), fc.constant(undefined), fc.integer(), fc.constant(''))
            ),
            (invalidColor) => {
              return ValidationHelpers.isValidColor(invalidColor) === false;
            }
          ),
          { numRuns: 100 }
        );
      });

      test('**Validates: Requirements 4.2, 4.3, 5.3** - hex color validation is case insensitive', () => {
        fc.assert(
          fc.property(
            fc.array(fc.integer({ min: 10, max: 15 }), { minLength: 6, maxLength: 6 }),
            (arr) => {
              const hexChars = arr.map(n => n.toString(16));
              const lower = '#' + hexChars.join('').toLowerCase();
              const upper = '#' + hexChars.join('').toUpperCase();

              return ValidationHelpers.isValidColor(lower) === true &&
                ValidationHelpers.isValidColor(upper) === true;
            }
          ),
          { numRuns: 50 }
        );
      });
    });

    describe('Property 3: Valid Category Data Format - Emoji Validation', () => {
      test('**Validates: Requirements 4.2, 4.3, 5.3** - common emojis pass validation', () => {
        const commonEmojis = [
          '✈️', '💼', '📧', '🎉', '❤️', '⭐', '🔥', '💡', '📱', '🏠',
          '🚀', '🎯', '💰', '🎨', '🎵', '🏆', '🌟', '💻', '📚', '🌈',
          '👍', '👋', '🙏', '💪', '🤝', '👏', '🎊', '🎁', '🌸', '🌺'
        ];

        fc.assert(
          fc.property(
            fc.constantFrom(...commonEmojis),
            (emoji) => {
              return ValidationHelpers.isValidIconOrEmoji(emoji) === true;
            }
          ),
          { numRuns: 30 }
        );
      });

      test('**Validates: Requirements 4.2, 4.3, 5.3** - non-emoji strings fail validation', () => {
        fc.assert(
          fc.property(
            fc.oneof(
              // Regular ASCII text
              fc.string({ minLength: 1, maxLength: 10 }).filter(s => /^[a-zA-Z0-9]+$/.test(s)),
              // Empty or null
              fc.constantFrom('', null, undefined),
              // Numbers
              fc.integer(),
              // Special characters
              fc.constantFrom('!', '@', '#', '$', '%', '^', '&', '*')
            ),
            (nonEmoji) => {
              return ValidationHelpers.isValidIconOrEmoji(nonEmoji) === false;
            }
          ),
          { numRuns: 100 }
        );
      });
    });

    describe('Property 1: Category ID Uniqueness', () => {
      test('**Validates: Requirements 8.1, 8.4** - generated IDs are always unique', () => {
        fc.assert(
          fc.property(
            fc.integer({ min: 10, max: 100 }),
            (count) => {
              const ids = new Set();
              for (let i = 0; i < count; i++) {
                ids.add(ValidationHelpers.generateCategoryId());
              }
              // All generated IDs should be unique (counter + random ensures this)
              return ids.size === count;
            }
          ),
          { numRuns: 20 }
        );
      });

      test('**Validates: Requirements 8.1, 8.4** - generated IDs always match expected format', () => {
        fc.assert(
          fc.property(
            fc.integer({ min: 1, max: 50 }),
            (iterations) => {
              for (let i = 0; i < iterations; i++) {
                const id = ValidationHelpers.generateCategoryId();
                // Must match format: custom-{timestamp}-{5digits}
                if (!/^custom-\d+-\d{5}$/.test(id)) {
                  return false;
                }
              }
              return true;
            }
          ),
          { numRuns: 20 }
        );
      });
    });
  });
});
