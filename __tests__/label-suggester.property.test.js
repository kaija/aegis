'use strict';

const fc = require('fast-check');
const { describe, test, expect, beforeEach } = require('@jest/globals');
const fs = require('fs');
const path = require('path');

// ── Helpers ────────────────────────────────────────────────────────────────

function loadLabelSuggester() {
  delete global.LabelSuggester;
  delete global.window.LabelSuggester;
  const code = fs.readFileSync(path.join(__dirname, '../src/analysis/label-suggester.js'), 'utf8');
  eval(code);
}

/**
 * Reference implementation of icon selection — mirrors the logic in
 * LabelSuggester._selectIcon() so we can independently verify results.
 */
function expectedIcon(labelName, iconMapping) {
  if (!labelName) return 'tag';
  const lower = labelName.toLowerCase();
  for (const [icon, keywords] of Object.entries(iconMapping)) {
    if (keywords.some(kw => lower.includes(kw))) {
      return icon;
    }
  }
  return 'tag';
}

describe('LabelSuggester Property Tests', () => {
  beforeEach(() => {
    delete global.LabelSuggester;
    delete global.window.LabelSuggester;
    loadLabelSuggester();
  });

  // ── Property 8: Icon and color auto-selection ───────────────────────────
  // **Validates: Requirements 8.1, 8.2, 8.3**
  describe('Property 8: Icon and color auto-selection', () => {
    test('_selectIcon returns the first matching ICON_MAPPING entry or "tag" default', () => {
      const ICON_MAPPING = LabelSuggester._ICON_MAPPING;

      fc.assert(
        fc.property(
          fc.string({ minLength: 0, maxLength: 200 }),
          (labelName) => {
            const result = LabelSuggester._selectIcon(labelName);
            const expected = expectedIcon(labelName, ICON_MAPPING);
            expect(result).toBe(expected);
          }
        ),
        { numRuns: 500 }
      );
    });

    test('_selectIcon returns "tag" when no ICON_MAPPING keyword matches', () => {
      const ICON_MAPPING = LabelSuggester._ICON_MAPPING;
      const allKeywords = Object.values(ICON_MAPPING).flat();

      fc.assert(
        fc.property(
          // Generate numeric-only strings that won't match any keyword
          fc.array(fc.constantFrom(...'0123456789'.split('')), { minLength: 1, maxLength: 50 })
            .map(chars => chars.join('')),
          (labelName) => {
            const lower = labelName.toLowerCase();
            const hasMatch = allKeywords.some(kw => lower.includes(kw));
            if (!hasMatch) {
              expect(LabelSuggester._selectIcon(labelName)).toBe('tag');
            }
          }
        ),
        { numRuns: 200 }
      );
    });

    test('_selectIcon returns a matching icon when label name contains a keyword', () => {
      const ICON_MAPPING = LabelSuggester._ICON_MAPPING;
      const entries = Object.entries(ICON_MAPPING);

      // Pick a random icon entry and a random keyword from it, embed in a random string
      const keywordArb = fc.constantFrom(...entries).chain(([icon, keywords]) =>
        fc.constantFrom(...keywords).map(kw => ({ icon, keyword: kw }))
      );

      fc.assert(
        fc.property(
          keywordArb,
          fc.string({ minLength: 0, maxLength: 50 }),
          fc.string({ minLength: 0, maxLength: 50 }),
          ({ icon, keyword }, prefix, suffix) => {
            const labelName = prefix + keyword + suffix;
            const result = LabelSuggester._selectIcon(labelName);
            // The result should match the expected icon from our reference implementation
            // (which finds the FIRST matching entry, not necessarily `icon` if prefix/suffix
            // happen to contain an earlier keyword)
            const expected = expectedIcon(labelName, ICON_MAPPING);
            expect(result).toBe(expected);
          }
        ),
        { numRuns: 500 }
      );
    });

    test('_selectColors returns LABEL_COLORS[icon] for any icon returned by _selectIcon', () => {
      const LABEL_COLORS = LabelSuggester._LABEL_COLORS;

      fc.assert(
        fc.property(
          fc.string({ minLength: 0, maxLength: 200 }),
          (labelName) => {
            const icon = LabelSuggester._selectIcon(labelName);
            const colors = LabelSuggester._selectColors(icon);
            const expectedColors = LABEL_COLORS[icon] || LABEL_COLORS['tag'];

            expect(colors).toEqual(expectedColors);
            expect(colors).toHaveProperty('color');
            expect(colors).toHaveProperty('bgColor');
          }
        ),
        { numRuns: 500 }
      );
    });

    test('_selectColors falls back to LABEL_COLORS["tag"] for unknown icons', () => {
      const LABEL_COLORS = LabelSuggester._LABEL_COLORS;

      fc.assert(
        fc.property(
          // Generate icon names that are NOT in LABEL_COLORS
          fc.string({ minLength: 1, maxLength: 30 }).filter(s => !(s in LABEL_COLORS)),
          (unknownIcon) => {
            const colors = LabelSuggester._selectColors(unknownIcon);
            expect(colors).toEqual(LABEL_COLORS['tag']);
          }
        ),
        { numRuns: 200 }
      );
    });
  });

  // ── Property 1: Prompt construction includes all metadata with limits ──
  // **Validates: Requirements 3.2, 3.5, 8.1, 8.2**
  describe('Property 1: Prompt construction includes all metadata with limits', () => {

    /** Arbitrary for a random email object with random metadata */
    const emailArb = fc.record({
      id: fc.nat({ max: 9999 }),
      subject: fc.string({ minLength: 0, maxLength: 500 }),
      sender: fc.string({ minLength: 0, maxLength: 100 }),
      senderEmail: fc.string({ minLength: 1, maxLength: 100 }).map(s => s + '@example.com'),
      category: fc.constant({ id: 'other', name: 'Other' })
    });

    /** Arbitrary for an array of 1–50 emails */
    const emailsArb = fc.array(emailArb, { minLength: 1, maxLength: 50 });

    /** Arbitrary for an array of 0–20 existing label names */
    const labelsArb = fc.array(
      fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
      { minLength: 0, maxLength: 20 }
    );

    test('user prompt contains metadata for at most MAX_EMAILS_IN_PROMPT emails', () => {
      const MAX_EMAILS = LabelSuggester._MAX_EMAILS_IN_PROMPT; // 30

      fc.assert(
        fc.property(
          emailsArb,
          (emails) => {
            const userPrompt = LabelSuggester._buildUserPrompt(emails);

            // Parse the JSON array embedded in the prompt to count emails
            const jsonMatch = userPrompt.match(/\[[\s\S]*\]/);
            expect(jsonMatch).not.toBeNull();
            const parsed = JSON.parse(jsonMatch[0]);

            // At most MAX_EMAILS_IN_PROMPT emails in the prompt
            expect(parsed.length).toBeLessThanOrEqual(MAX_EMAILS);

            // Should include min(emails.length, MAX_EMAILS) emails
            const expectedCount = Math.min(emails.length, MAX_EMAILS);
            expect(parsed.length).toBe(expectedCount);
          }
        ),
        { numRuns: 300 }
      );
    });

    test('each subject in user prompt is at most MAX_SUBJECT_LENGTH characters', () => {
      const MAX_SUBJECT = LabelSuggester._MAX_SUBJECT_LENGTH; // 100

      fc.assert(
        fc.property(
          emailsArb,
          (emails) => {
            const userPrompt = LabelSuggester._buildUserPrompt(emails);

            // Parse the JSON array embedded in the prompt
            const jsonMatch = userPrompt.match(/\[[\s\S]*\]/);
            expect(jsonMatch).not.toBeNull();
            const parsed = JSON.parse(jsonMatch[0]);

            for (const entry of parsed) {
              expect(entry.subject.length).toBeLessThanOrEqual(MAX_SUBJECT);
            }
          }
        ),
        { numRuns: 300 }
      );
    });

    test('user prompt preserves id, sender, and senderEmail for included emails', () => {
      const MAX_EMAILS = LabelSuggester._MAX_EMAILS_IN_PROMPT;

      fc.assert(
        fc.property(
          emailsArb,
          (emails) => {
            const userPrompt = LabelSuggester._buildUserPrompt(emails);

            const jsonMatch = userPrompt.match(/\[[\s\S]*\]/);
            expect(jsonMatch).not.toBeNull();
            const parsed = JSON.parse(jsonMatch[0]);

            const included = emails.slice(0, MAX_EMAILS);
            expect(parsed.length).toBe(included.length);

            for (let i = 0; i < parsed.length; i++) {
              expect(parsed[i].id).toBe(included[i].id);
              expect(parsed[i].sender).toBe(included[i].sender || '');
              expect(parsed[i].senderEmail).toBe(included[i].senderEmail || '');
            }
          }
        ),
        { numRuns: 300 }
      );
    });

    test('system prompt contains every existing label name', () => {
      fc.assert(
        fc.property(
          labelsArb,
          (existingLabels) => {
            const systemPrompt = LabelSuggester._buildSystemPrompt(existingLabels);

            for (const label of existingLabels) {
              expect(systemPrompt).toContain(label);
            }
          }
        ),
        { numRuns: 300 }
      );
    });
  });

  // ── Property 7 (Design): Prompt size stays within character limit ─────
  // **Validates: Requirements 8.5**
  describe('Property 7 (Design): Prompt size stays within character limit', () => {

    /** Arbitrary for an email with a potentially very long subject */
    const longEmailArb = fc.record({
      id: fc.nat({ max: 9999 }),
      subject: fc.string({ minLength: 0, maxLength: 600 }),
      sender: fc.string({ minLength: 0, maxLength: 100 }),
      senderEmail: fc.string({ minLength: 1, maxLength: 100 }).map(s => s + '@example.com'),
      category: fc.constant({ id: 'other', name: 'Other' })
    });

    /** Arbitrary for a large array of emails (stress test) */
    const largeEmailArrayArb = fc.array(longEmailArb, { minLength: 1, maxLength: 60 });

    test('user prompt never exceeds 4000 characters regardless of email count or subject length', () => {
      fc.assert(
        fc.property(
          largeEmailArrayArb,
          (emails) => {
            const userPrompt = LabelSuggester._buildUserPrompt(emails);
            expect(userPrompt.length).toBeLessThanOrEqual(4000);
          }
        ),
        { numRuns: 500 }
      );
    });

    test('user prompt stays within budget even with 60 emails having 500+ char subjects', () => {
      // Generate emails with extremely long subjects
      const extremeEmailArb = fc.record({
        id: fc.nat({ max: 9999 }),
        subject: fc.string({ minLength: 500, maxLength: 600 }),
        sender: fc.string({ minLength: 50, maxLength: 100 }),
        senderEmail: fc.string({ minLength: 50, maxLength: 100 }).map(s => s + '@longdomain.example.com'),
        category: fc.constant({ id: 'other', name: 'Other' })
      });

      const extremeArrayArb = fc.array(extremeEmailArb, { minLength: 50, maxLength: 60 });

      fc.assert(
        fc.property(
          extremeArrayArb,
          (emails) => {
            const userPrompt = LabelSuggester._buildUserPrompt(emails);
            expect(userPrompt.length).toBeLessThanOrEqual(4000);
          }
        ),
        { numRuns: 300 }
      );
    });

    test('user prompt truncates email list to fit budget while preserving valid JSON', () => {
      fc.assert(
        fc.property(
          largeEmailArrayArb,
          (emails) => {
            const userPrompt = LabelSuggester._buildUserPrompt(emails);

            // Prompt should be valid: contains a JSON array
            const jsonMatch = userPrompt.match(/\[[\s\S]*\]/);
            expect(jsonMatch).not.toBeNull();

            // The JSON should be parseable
            const parsed = JSON.parse(jsonMatch[0]);
            expect(Array.isArray(parsed)).toBe(true);

            // If emails were truncated, the count should be less than input
            // but the prompt should still be within budget
            expect(userPrompt.length).toBeLessThanOrEqual(4000);
            expect(parsed.length).toBeLessThanOrEqual(emails.length);
          }
        ),
        { numRuns: 300 }
      );
    });

    test('single email with very long fields still produces a valid prompt within budget', () => {
      const singleLongEmailArb = fc.record({
        id: fc.nat({ max: 9999 }),
        subject: fc.string({ minLength: 200, maxLength: 600 }),
        sender: fc.string({ minLength: 100, maxLength: 200 }),
        senderEmail: fc.string({ minLength: 100, maxLength: 200 }).map(s => s + '@example.com'),
        category: fc.constant({ id: 'other', name: 'Other' })
      }).map(email => [email]);

      fc.assert(
        fc.property(
          singleLongEmailArb,
          (emails) => {
            const userPrompt = LabelSuggester._buildUserPrompt(emails);
            expect(userPrompt.length).toBeLessThanOrEqual(4000);
          }
        ),
        { numRuns: 200 }
      );
    });
  });

  // ── Property 2: Suggestion count cap ──────────────────────────────────
  // **Validates: Requirements 1.4**
  describe('Property 2: Suggestion count cap', () => {

    /**
     * Arbitrary for a valid suggestion object with a unique-ish name.
     * Uses alphanumeric names to avoid JSON serialization issues.
     */
    const validSuggestionArb = (index) => fc.record({
      name: fc.array(
        fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'.split('')),
        { minLength: 3, maxLength: 20 }
      ).map(chars => 'Label' + index + chars.join('')),
      rationale: fc.constant('Rationale for suggestion'),
      emailIds: fc.array(fc.integer({ min: 1, max: 100 }), { minLength: 1, maxLength: 5 })
    });

    /**
     * Arbitrary for an array of 0–20 valid suggestion objects.
     * Each suggestion gets a unique index prefix to avoid name collisions.
     */
    const suggestionsArrayArb = fc.integer({ min: 0, max: 20 }).chain(count =>
      count === 0
        ? fc.constant([])
        : fc.tuple(...Array.from({ length: count }, (_, i) => validSuggestionArb(i)))
    );

    test('output of _parseResponse then _filterSuggestions is always ≤ MAX_SUGGESTIONS (5)', () => {
      const MAX_SUGGESTIONS = LabelSuggester._MAX_SUGGESTIONS; // 5

      fc.assert(
        fc.property(
          suggestionsArrayArb,
          (suggestions) => {
            // Serialize as mock LLM response JSON
            const jsonStr = JSON.stringify({ suggestions });

            // Parse the response
            const parsed = LabelSuggester._parseResponse(jsonStr);

            // Filter with empty existing labels and empty dismissed names
            const filtered = LabelSuggester._filterSuggestions(parsed, [], []);

            // The core property: output length is always ≤ 5
            expect(filtered.length).toBeLessThanOrEqual(MAX_SUGGESTIONS);
          }
        ),
        { numRuns: 300 }
      );
    });

    test('when input has ≤ 5 valid suggestions, all are preserved after filtering', () => {
      const MAX_SUGGESTIONS = LabelSuggester._MAX_SUGGESTIONS;

      const smallArrayArb = fc.integer({ min: 0, max: 5 }).chain(count =>
        count === 0
          ? fc.constant([])
          : fc.tuple(...Array.from({ length: count }, (_, i) => validSuggestionArb(i)))
      );

      fc.assert(
        fc.property(
          smallArrayArb,
          (suggestions) => {
            const jsonStr = JSON.stringify({ suggestions });
            const parsed = LabelSuggester._parseResponse(jsonStr);
            const filtered = LabelSuggester._filterSuggestions(parsed, [], []);

            // All valid suggestions should be preserved when count ≤ 5
            expect(filtered.length).toBe(suggestions.length);
            expect(filtered.length).toBeLessThanOrEqual(MAX_SUGGESTIONS);
          }
        ),
        { numRuns: 200 }
      );
    });

    test('when input has > 5 valid suggestions, output is capped at exactly 5', () => {
      const MAX_SUGGESTIONS = LabelSuggester._MAX_SUGGESTIONS;

      const largeArrayArb = fc.integer({ min: 6, max: 20 }).chain(count =>
        fc.tuple(...Array.from({ length: count }, (_, i) => validSuggestionArb(i)))
      );

      fc.assert(
        fc.property(
          largeArrayArb,
          (suggestions) => {
            const jsonStr = JSON.stringify({ suggestions });
            const parsed = LabelSuggester._parseResponse(jsonStr);
            const filtered = LabelSuggester._filterSuggestions(parsed, [], []);

            // Should be capped at exactly MAX_SUGGESTIONS
            expect(filtered.length).toBe(MAX_SUGGESTIONS);
          }
        ),
        { numRuns: 200 }
      );
    });
  });

  // ── Property 3: Existing label exclusion ────────────────────────────
  // **Validates: Requirements 4.3, 8.1**
  describe('Property 3: Existing label exclusion', () => {

    /**
     * Arbitrary for a valid suggestion object with a given name.
     */
    const suggestionWithName = (name) => fc.record({
      name: fc.constant(name),
      rationale: fc.constant('Some rationale'),
      emailIds: fc.array(fc.integer({ min: 1, max: 100 }), { minLength: 1, maxLength: 5 })
    });

    /**
     * Arbitrary for a valid suggestion with a random alphanumeric name.
     */
    const randomSuggestionArb = fc.record({
      name: fc.array(
        fc.constantFrom(...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 '.split('')),
        { minLength: 1, maxLength: 30 }
      ).map(chars => chars.join('').trim() || 'Fallback'),
      rationale: fc.constant('Rationale text'),
      emailIds: fc.array(fc.integer({ min: 1, max: 100 }), { minLength: 1, maxLength: 5 })
    });

    /**
     * Arbitrary for an existing label name (non-empty string).
     */
    const labelNameArb = fc.array(
      fc.constantFrom(...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 '.split('')),
      { minLength: 1, maxLength: 30 }
    ).map(chars => chars.join('').trim() || 'Label');

    test('no output suggestion name matches any existing label case-insensitively', () => {
      fc.assert(
        fc.property(
          fc.array(randomSuggestionArb, { minLength: 0, maxLength: 10 }),
          fc.array(labelNameArb, { minLength: 0, maxLength: 10 }),
          (suggestions, existingLabels) => {
            const filtered = LabelSuggester._filterSuggestions(suggestions, existingLabels, []);

            // Build a set of lowercased existing labels for comparison
            const existingSet = new Set(existingLabels.map(l => l.toLowerCase()));

            // Assert: no output suggestion name matches any existing label case-insensitively
            for (const s of filtered) {
              expect(existingSet.has(s.name.toLowerCase())).toBe(false);
            }
          }
        ),
        { numRuns: 500 }
      );
    });

    test('suggestions with names matching existing labels in different case are excluded', () => {
      // Generate existing labels, then create suggestions with case variations of those labels
      const caseVariationArb = labelNameArb.chain(label => {
        // Create case variations: uppercase, lowercase, mixed
        const variations = [
          label.toUpperCase(),
          label.toLowerCase(),
          label.charAt(0).toUpperCase() + label.slice(1).toLowerCase(),
          label.split('').map((c, i) => i % 2 === 0 ? c.toUpperCase() : c.toLowerCase()).join('')
        ];
        return fc.constantFrom(...variations).chain(variant =>
          suggestionWithName(variant).map(s => ({ suggestion: s, originalLabel: label }))
        );
      });

      fc.assert(
        fc.property(
          fc.array(caseVariationArb, { minLength: 1, maxLength: 8 }),
          (items) => {
            const existingLabels = items.map(i => i.originalLabel);
            const suggestions = items.map(i => i.suggestion);

            const filtered = LabelSuggester._filterSuggestions(suggestions, existingLabels, []);

            // All suggestions should be excluded since they are case variations of existing labels
            const existingSet = new Set(existingLabels.map(l => l.toLowerCase()));
            for (const s of filtered) {
              expect(existingSet.has(s.name.toLowerCase())).toBe(false);
            }
          }
        ),
        { numRuns: 300 }
      );
    });

    test('suggestions NOT matching any existing label are preserved', () => {
      fc.assert(
        fc.property(
          fc.array(randomSuggestionArb, { minLength: 1, maxLength: 5 }),
          fc.array(labelNameArb, { minLength: 0, maxLength: 5 }),
          (suggestions, existingLabels) => {
            const filtered = LabelSuggester._filterSuggestions(suggestions, existingLabels, []);

            const existingSet = new Set(existingLabels.map(l => l.toLowerCase()));

            // Count how many input suggestions do NOT match existing labels
            const nonMatchingInputs = suggestions.filter(
              s => s && typeof s.name === 'string' && !existingSet.has(s.name.toLowerCase())
            );

            // All non-matching suggestions should be preserved (up to MAX_SUGGESTIONS cap)
            const MAX_SUGGESTIONS = LabelSuggester._MAX_SUGGESTIONS;
            const expectedCount = Math.min(nonMatchingInputs.length, MAX_SUGGESTIONS);
            expect(filtered.length).toBe(expectedCount);
          }
        ),
        { numRuns: 300 }
      );
    });
  });

  // ── Property 4: Dismissed name exclusion within 30 days ─────────────
  // **Validates: Requirements 4.3**
  describe('Property 4: Dismissed name exclusion within 30 days', () => {

    const DISMISS_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

    /**
     * Arbitrary for a valid suggestion with a given name.
     */
    const suggestionWithName = (name) => ({
      name,
      rationale: 'Some rationale',
      emailIds: [1, 2, 3]
    });

    /**
     * Arbitrary for a non-empty alphanumeric label name.
     */
    const labelNameArb = fc.array(
      fc.constantFrom(...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split('')),
      { minLength: 2, maxLength: 20 }
    ).map(chars => chars.join(''));

    /**
     * Arbitrary for a dismissed entry with a timestamp within the last 30 days (recent).
     */
    const recentDismissedArb = labelNameArb.chain(name =>
      fc.integer({ min: 1, max: DISMISS_TTL_MS - 1 }).map(ageMs => ({
        name,
        dismissedAt: Date.now() - ageMs
      }))
    );

    /**
     * Arbitrary for a dismissed entry with a timestamp older than 30 days (expired).
     */
    const oldDismissedArb = labelNameArb.chain(name =>
      fc.integer({ min: DISMISS_TTL_MS + 1, max: DISMISS_TTL_MS * 3 }).map(ageMs => ({
        name,
        dismissedAt: Date.now() - ageMs
      }))
    );

    test('suggestions matching recently dismissed names (< 30 days) are excluded', () => {
      fc.assert(
        fc.property(
          fc.array(recentDismissedArb, { minLength: 1, maxLength: 5 }),
          (recentDismissed) => {
            // Create suggestions whose names match the recently dismissed entries
            const suggestions = recentDismissed.map(d => suggestionWithName(d.name));

            const filtered = LabelSuggester._filterSuggestions(suggestions, [], recentDismissed);

            // Build set of recently dismissed names (lowercased)
            const dismissedSet = new Set(recentDismissed.map(d => d.name.toLowerCase()));

            // No filtered suggestion should match a recently dismissed name
            for (const s of filtered) {
              expect(dismissedSet.has(s.name.toLowerCase())).toBe(false);
            }

            // Since all suggestions match dismissed names, result should be empty
            expect(filtered.length).toBe(0);
          }
        ),
        { numRuns: 300 }
      );
    });

    test('suggestions matching old dismissed names (> 30 days) are included', () => {
      fc.assert(
        fc.property(
          fc.array(oldDismissedArb, { minLength: 1, maxLength: 5 }),
          (oldDismissed) => {
            // Create suggestions whose names match the old dismissed entries
            const suggestions = oldDismissed.map(d => suggestionWithName(d.name));

            const filtered = LabelSuggester._filterSuggestions(suggestions, [], oldDismissed);

            // Old dismissed entries should NOT cause exclusion
            // All suggestions should be included (up to MAX_SUGGESTIONS cap)
            const MAX_SUGGESTIONS = LabelSuggester._MAX_SUGGESTIONS;
            const expectedCount = Math.min(suggestions.length, MAX_SUGGESTIONS);
            expect(filtered.length).toBe(expectedCount);

            // Verify the names are preserved
            for (let i = 0; i < filtered.length; i++) {
              expect(filtered[i].name).toBe(suggestions[i].name);
            }
          }
        ),
        { numRuns: 300 }
      );
    });

    test('case-insensitive matching for dismissed names', () => {
      fc.assert(
        fc.property(
          fc.array(recentDismissedArb, { minLength: 1, maxLength: 5 }),
          (recentDismissed) => {
            // Create suggestions with case variations of dismissed names
            const suggestions = recentDismissed.map(d => {
              const name = d.name;
              // Alternate case: uppercase the name
              return suggestionWithName(name.toUpperCase());
            });

            const filtered = LabelSuggester._filterSuggestions(suggestions, [], recentDismissed);

            // All should be excluded despite case differences
            expect(filtered.length).toBe(0);
          }
        ),
        { numRuns: 300 }
      );
    });

    test('mixed dismissed list: recent entries exclude, old entries do not', () => {
      fc.assert(
        fc.property(
          fc.array(recentDismissedArb, { minLength: 1, maxLength: 3 }),
          fc.array(oldDismissedArb, { minLength: 1, maxLength: 3 }),
          (recentDismissed, oldDismissed) => {
            // Ensure no name overlap between recent and old dismissed lists
            const recentNames = new Set(recentDismissed.map(d => d.name.toLowerCase()));
            const filteredOld = oldDismissed.filter(d => !recentNames.has(d.name.toLowerCase()));
            if (filteredOld.length === 0) return; // skip if all old names collide with recent

            // Create suggestions for both recent and old dismissed names
            const recentSuggestions = recentDismissed.map(d => suggestionWithName(d.name));
            const oldSuggestions = filteredOld.map(d => suggestionWithName(d.name));
            const allSuggestions = [...recentSuggestions, ...oldSuggestions];

            const allDismissed = [...recentDismissed, ...filteredOld];

            const filtered = LabelSuggester._filterSuggestions(allSuggestions, [], allDismissed);

            // Build sets for verification
            const recentSet = new Set(recentDismissed.map(d => d.name.toLowerCase()));
            const oldSet = new Set(filteredOld.map(d => d.name.toLowerCase()));

            // No recently dismissed names should appear in output
            for (const s of filtered) {
              expect(recentSet.has(s.name.toLowerCase())).toBe(false);
            }

            // Old dismissed names should appear in output (up to MAX_SUGGESTIONS cap)
            const MAX_SUGGESTIONS = LabelSuggester._MAX_SUGGESTIONS;
            const expectedOldCount = Math.min(filteredOld.length, MAX_SUGGESTIONS);
            const oldInOutput = filtered.filter(s => oldSet.has(s.name.toLowerCase()));
            expect(oldInOutput.length).toBe(expectedOldCount);
          }
        ),
        { numRuns: 300 }
      );
    });

    test('dismissed entry well within 30-day boundary is excluded', () => {
      fc.assert(
        fc.property(
          labelNameArb,
          (name) => {
            // Dismissed 1 hour ago — safely within the 30-day window
            const boundaryDismissed = [{
              name,
              dismissedAt: Date.now() - (60 * 60 * 1000)
            }];

            const suggestions = [suggestionWithName(name)];
            const filtered = LabelSuggester._filterSuggestions(suggestions, [], boundaryDismissed);

            // Should be excluded (within the 30-day window)
            expect(filtered.length).toBe(0);
          }
        ),
        { numRuns: 200 }
      );
    });

    test('dismissed entry safely past 30-day boundary is included', () => {
      fc.assert(
        fc.property(
          labelNameArb,
          (name) => {
            // Dismissed 31 days ago — safely past the 30-day window
            const expiredDismissed = [{
              name,
              dismissedAt: Date.now() - (DISMISS_TTL_MS + 24 * 60 * 60 * 1000)
            }];

            const suggestions = [suggestionWithName(name)];
            const filtered = LabelSuggester._filterSuggestions(suggestions, [], expiredDismissed);

            // Should be included (past the 30-day window)
            expect(filtered.length).toBe(1);
            expect(filtered[0].name).toBe(name);
          }
        ),
        { numRuns: 200 }
      );
    });
  });

  // ── Property 5: Invalid response returns empty array ──────────────────
  // **Validates: Requirements 4.7, 7.5**
  describe('Property 5: Invalid response returns empty array', () => {

    test('completely random strings (non-JSON) return empty array without throwing', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 0, maxLength: 500 }),
          (randomStr) => {
            const result = LabelSuggester._parseResponse(randomStr);
            expect(result).toEqual([]);
          }
        ),
        { numRuns: 300 }
      );
    });

    test('partial/truncated JSON returns empty array without throwing', () => {
      const partialJsonArb = fc.oneof(
        fc.constant('{ "suggestions": ['),
        fc.constant('{ "suggestions": [{ "name": "Test"'),
        fc.constant('{ "suggestions": [{ "name": "Test", "rationale": "reason", "emailIds": [1, 2'),
        fc.constant('{"suggestions":[{"name":"A","rationale":"B","emailIds":[1]},'),
        fc.constant('{ "suggestions'),
        fc.constant('{'),
        // Random prefix + opening brace but no closing
        fc.string({ minLength: 0, maxLength: 50 }).map(s => s + '{ "suggestions": [')
      );

      fc.assert(
        fc.property(
          partialJsonArb,
          (partialJson) => {
            const result = LabelSuggester._parseResponse(partialJson);
            expect(result).toEqual([]);
          }
        ),
        { numRuns: 200 }
      );
    });

    test('valid JSON with wrong schema returns empty array without throwing', () => {
      const wrongSchemaArb = fc.oneof(
        // Missing "suggestions" key entirely
        fc.constant('{ "data": [] }'),
        fc.constant('{ "labels": ["a", "b"] }'),
        fc.constant('{ "result": "ok" }'),
        // "suggestions" is not an array
        fc.constant('{ "suggestions": "not an array" }'),
        fc.constant('{ "suggestions": 42 }'),
        fc.constant('{ "suggestions": null }'),
        fc.constant('{ "suggestions": { "name": "test" } }'),
        fc.constant('{ "suggestions": true }'),
        // Empty object
        fc.constant('{}'),
        // Random key-value pairs
        fc.dictionary(
          fc.string({ minLength: 1, maxLength: 20 }).filter(s => s !== 'suggestions'),
          fc.jsonValue()
        ).map(obj => JSON.stringify(obj))
      );

      fc.assert(
        fc.property(
          wrongSchemaArb,
          (wrongJson) => {
            const result = LabelSuggester._parseResponse(wrongJson);
            expect(result).toEqual([]);
          }
        ),
        { numRuns: 200 }
      );
    });

    test('primitive values (numbers, booleans, null, undefined) return empty array without throwing', () => {
      const primitiveArb = fc.oneof(
        fc.integer().map(n => String(n)),
        fc.double().map(n => String(n)),
        fc.constant('true'),
        fc.constant('false'),
        fc.constant('null'),
        fc.constant('undefined'),
        fc.constant('NaN'),
        fc.constant('Infinity')
      );

      fc.assert(
        fc.property(
          primitiveArb,
          (primitive) => {
            const result = LabelSuggester._parseResponse(primitive);
            expect(result).toEqual([]);
          }
        ),
        { numRuns: 200 }
      );
    });

    test('empty strings return empty array without throwing', () => {
      const emptyishArb = fc.oneof(
        fc.constant(''),
        fc.constant('   '),
        fc.constant('\n'),
        fc.constant('\t'),
        fc.constant('\n\t  \n')
      );

      fc.assert(
        fc.property(
          emptyishArb,
          (emptyStr) => {
            const result = LabelSuggester._parseResponse(emptyStr);
            expect(result).toEqual([]);
          }
        ),
        { numRuns: 50 }
      );
    });

    test('non-string inputs (number, boolean, null, undefined, object) return empty array without throwing', () => {
      const nonStringArb = fc.oneof(
        fc.integer(),
        fc.double(),
        fc.boolean(),
        fc.constant(null),
        fc.constant(undefined),
        fc.constant([]),
        fc.constant({})
      );

      fc.assert(
        fc.property(
          nonStringArb,
          (nonString) => {
            const result = LabelSuggester._parseResponse(nonString);
            expect(result).toEqual([]);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // ── Property 6: Suggestion parse-enrich round-trip ────────────────────
  // **Validates: Requirements 1.3, 12.3, 12.4, 12.5**
  describe('Property 6: Suggestion parse-enrich round-trip', () => {

    /**
     * Arbitrary for JSON-safe strings — avoids curly braces that break the
     * brace-counting JSON extractor in _parseResponse(), and backslashes/quotes
     * that could break JSON serialization round-trips.
     */
    const jsonSafeStringArb = (minLen, maxLen) =>
      fc.string({ minLength: minLen, maxLength: maxLen })
        .map(s => s.replace(/[{}"\\]/g, 'x'));

    /** Arbitrary for a valid Suggestion: non-empty name, non-empty rationale, non-empty emailIds of positive ints */
    const validSuggestionArb = fc.record({
      name: jsonSafeStringArb(1, 80).filter(s => s.trim().length > 0),
      rationale: jsonSafeStringArb(1, 200),
      emailIds: fc.array(fc.integer({ min: 1, max: 9999 }), { minLength: 1, maxLength: 20 })
    });

    /** Arbitrary for random extra fields (keys that are NOT name/rationale/emailIds) */
    const extraFieldsArb = fc.dictionary(
      jsonSafeStringArb(1, 20).filter(
        s => !['name', 'rationale', 'emailIds'].includes(s)
      ),
      fc.oneof(
        jsonSafeStringArb(0, 50),
        fc.integer(),
        fc.boolean(),
        fc.constant(null),
        fc.array(fc.integer(), { minLength: 0, maxLength: 5 })
      ),
      { minKeys: 0, maxKeys: 5 }
    );

    test('parse then enrich preserves name, rationale, and emailIds from original', () => {
      fc.assert(
        fc.property(
          validSuggestionArb,
          extraFieldsArb,
          (suggestion, extraFields) => {
            // Merge extra fields into the suggestion object
            const inputObj = { ...extraFields, ...suggestion };
            const jsonStr = JSON.stringify({ suggestions: [inputObj] });

            // Parse and enrich
            const parsed = LabelSuggester._parseResponse(jsonStr);
            expect(parsed.length).toBe(1);

            const enriched = LabelSuggester._enrichSuggestion(parsed[0]);

            // Core fields match original
            expect(enriched.name).toBe(suggestion.name);
            expect(enriched.rationale).toBe(suggestion.rationale);
            expect(enriched.emailIds).toEqual(suggestion.emailIds);
          }
        ),
        { numRuns: 300 }
      );
    });

    test('enriched output has icon, color, and bgColor fields', () => {
      fc.assert(
        fc.property(
          validSuggestionArb,
          (suggestion) => {
            const jsonStr = JSON.stringify({ suggestions: [suggestion] });
            const parsed = LabelSuggester._parseResponse(jsonStr);
            expect(parsed.length).toBe(1);

            const enriched = LabelSuggester._enrichSuggestion(parsed[0]);

            expect(typeof enriched.icon).toBe('string');
            expect(enriched.icon.length).toBeGreaterThan(0);
            expect(typeof enriched.color).toBe('string');
            expect(enriched.color.length).toBeGreaterThan(0);
            expect(typeof enriched.bgColor).toBe('string');
            expect(enriched.bgColor.length).toBeGreaterThan(0);
          }
        ),
        { numRuns: 300 }
      );
    });

    test('extra fields in input are not present in enriched output', () => {
      // Built-in property names that exist on all objects — exclude from generated keys
      const builtinProps = new Set([
        'constructor', 'toString', 'valueOf', 'hasOwnProperty',
        'isPrototypeOf', 'propertyIsEnumerable', 'toLocaleString',
        '__proto__', '__defineGetter__', '__defineSetter__',
        '__lookupGetter__', '__lookupSetter__'
      ]);
      const reservedKeys = new Set([
        'name', 'rationale', 'emailIds', 'icon', 'color', 'bgColor',
        ...builtinProps
      ]);

      fc.assert(
        fc.property(
          validSuggestionArb,
          // Ensure at least one extra field with keys that are not reserved or built-in
          fc.dictionary(
            jsonSafeStringArb(1, 20).filter(s => !reservedKeys.has(s)),
            fc.oneof(
              jsonSafeStringArb(0, 50),
              fc.integer(),
              fc.boolean()
            ),
            { minKeys: 1, maxKeys: 5 }
          ),
          (suggestion, extraFields) => {
            const inputObj = { ...extraFields, ...suggestion };
            const jsonStr = JSON.stringify({ suggestions: [inputObj] });

            const parsed = LabelSuggester._parseResponse(jsonStr);
            expect(parsed.length).toBe(1);

            const enriched = LabelSuggester._enrichSuggestion(parsed[0]);

            // Only the expected keys should be present as own properties
            const allowedKeys = new Set(['name', 'rationale', 'emailIds', 'icon', 'color', 'bgColor']);
            const enrichedOwnKeys = Object.keys(enriched);
            for (const key of enrichedOwnKeys) {
              expect(allowedKeys.has(key)).toBe(true);
            }

            // Extra field keys should NOT be own properties of the output
            for (const extraKey of Object.keys(extraFields)) {
              expect(Object.prototype.hasOwnProperty.call(enriched, extraKey)).toBe(false);
            }
          }
        ),
        { numRuns: 300 }
      );
    });

    test('enriched output has exactly 6 keys: name, rationale, emailIds, icon, color, bgColor', () => {
      fc.assert(
        fc.property(
          validSuggestionArb,
          (suggestion) => {
            const jsonStr = JSON.stringify({ suggestions: [suggestion] });
            const parsed = LabelSuggester._parseResponse(jsonStr);
            expect(parsed.length).toBe(1);

            const enriched = LabelSuggester._enrichSuggestion(parsed[0]);
            const keys = Object.keys(enriched).sort();
            expect(keys).toEqual(['bgColor', 'color', 'emailIds', 'icon', 'name', 'rationale']);
          }
        ),
        { numRuns: 300 }
      );
    });
  });

  // ── Property 7: Invalid suggestions filtered out ─────────────────────────
  // **Validates: Requirements 12.6**
  describe('Property 7: Invalid suggestions filtered out', () => {

    /**
     * Arbitrary for a non-empty name that will survive trimming.
     * Generates a guaranteed non-whitespace core with optional padding.
     */
    const nonEmptyNameArb = fc.tuple(
      fc.array(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'.split('')), { minLength: 1, maxLength: 30 }).map(chars => chars.join('')),
      fc.array(fc.constantFrom(' ', ''), { minLength: 0, maxLength: 3 }).map(chars => chars.join(''))
    ).map(([core, pad]) => pad + core);

    /** Arbitrary for a valid suggestion (non-empty trimmed name, non-empty emailIds of numbers) */
    const validSuggestionArb = fc.record({
      name: nonEmptyNameArb,
      rationale: fc.constant('valid rationale'),
      emailIds: fc.array(fc.integer({ min: 0, max: 999 }), { minLength: 1, maxLength: 5 })
    });

    /** Arbitrary for an invalid suggestion — empty name, whitespace-only name, or empty emailIds */
    const invalidSuggestionArb = fc.oneof(
      // Empty string name
      fc.record({
        name: fc.constant(''),
        rationale: fc.constant('some rationale'),
        emailIds: fc.array(fc.integer({ min: 0, max: 99 }), { minLength: 1, maxLength: 3 })
      }),
      // Whitespace-only name
      fc.record({
        name: fc.constantFrom('   ', ' ', '\t', '\n', '  \t\n  '),
        rationale: fc.constant('some rationale'),
        emailIds: fc.array(fc.integer({ min: 0, max: 99 }), { minLength: 1, maxLength: 3 })
      }),
      // Empty emailIds array
      fc.record({
        name: nonEmptyNameArb,
        rationale: fc.constant('some rationale'),
        emailIds: fc.constant([])
      })
    );

    /** Reference check: is a suggestion valid per _parseResponse rules? */
    function isValidSuggestion(s) {
      if (typeof s.name !== 'string' || s.name.trim().length === 0) return false;
      if (!Array.isArray(s.emailIds) || s.emailIds.length === 0) return false;
      return true;
    }

    test('_parseResponse filters out suggestions with empty names, whitespace names, or empty emailIds', () => {
      fc.assert(
        fc.property(
          fc.array(validSuggestionArb, { minLength: 0, maxLength: 5 }),
          fc.array(invalidSuggestionArb, { minLength: 0, maxLength: 5 }),
          (validSuggestions, invalidSuggestions) => {
            // Interleave valid and invalid suggestions
            const mixed = [];
            const maxLen = Math.max(validSuggestions.length, invalidSuggestions.length);
            for (let i = 0; i < maxLen; i++) {
              if (i < invalidSuggestions.length) mixed.push(invalidSuggestions[i]);
              if (i < validSuggestions.length) mixed.push(validSuggestions[i]);
            }

            const jsonStr = JSON.stringify({ suggestions: mixed });
            const result = LabelSuggester._parseResponse(jsonStr);

            // All results must have non-empty trimmed names
            for (const s of result) {
              expect(typeof s.name).toBe('string');
              expect(s.name.trim().length).toBeGreaterThan(0);
            }

            // All results must have non-empty emailIds arrays of numbers
            for (const s of result) {
              expect(Array.isArray(s.emailIds)).toBe(true);
              expect(s.emailIds.length).toBeGreaterThan(0);
              for (const id of s.emailIds) {
                expect(typeof id).toBe('number');
              }
            }

            // The count of results should equal the count of valid items in the mixed array
            const expectedCount = mixed.filter(s => isValidSuggestion(s)).length;
            expect(result.length).toBe(expectedCount);
          }
        ),
        { numRuns: 300 }
      );
    });

    test('_parseResponse returns empty array when all suggestions are invalid', () => {
      fc.assert(
        fc.property(
          fc.array(invalidSuggestionArb, { minLength: 1, maxLength: 10 }),
          (invalidSuggestions) => {
            const jsonStr = JSON.stringify({ suggestions: invalidSuggestions });
            const result = LabelSuggester._parseResponse(jsonStr);
            expect(result).toEqual([]);
          }
        ),
        { numRuns: 200 }
      );
    });

    test('_parseResponse preserves all valid suggestions when no invalid ones are present', () => {
      fc.assert(
        fc.property(
          fc.array(validSuggestionArb, { minLength: 1, maxLength: 10 }),
          (validSuggestions) => {
            const jsonStr = JSON.stringify({ suggestions: validSuggestions });
            const result = LabelSuggester._parseResponse(jsonStr);

            expect(result.length).toBe(validSuggestions.length);

            for (let i = 0; i < result.length; i++) {
              expect(result[i].name).toBe(validSuggestions[i].name);
              expect(result[i].rationale).toBe(validSuggestions[i].rationale);
              expect(result[i].emailIds).toEqual(validSuggestions[i].emailIds);
            }
          }
        ),
        { numRuns: 200 }
      );
    });
  });

  // ── Property 12: Uncategorized email identification ─────────────────────
  // **Validates: Requirements 1.1**
  describe('Property 12: Uncategorized email identification', () => {

    /** Arbitrary for a real (non-fallback) category */
    const realCategoryArb = fc.record({
      id: fc.string({ minLength: 1, maxLength: 20 }).filter(s => s !== 'other'),
      name: fc.string({ minLength: 1, maxLength: 30 }).filter(s => s !== 'Other' && s !== '其他')
    });

    /** Arbitrary for a fallback / uncategorized category */
    const uncategorizedCategoryArb = fc.oneof(
      fc.constant({ id: 'other', name: 'Other' }),
      fc.constant({ id: 'other', name: '其他' }),
      fc.constant({ id: 'other', name: 'Misc' }),
      // id is 'other' but name is something random
      fc.string({ minLength: 1, maxLength: 20 }).map(name => ({ id: 'other', name })),
      // id is not 'other' but name is 'Other'
      fc.string({ minLength: 1, maxLength: 20 }).filter(s => s !== 'other').map(id => ({ id, name: 'Other' })),
      // id is not 'other' but name is '其他'
      fc.string({ minLength: 1, maxLength: 20 }).filter(s => s !== 'other').map(id => ({ id, name: '其他' }))
    );

    /** Build an email object with a given category */
    function makeEmail(id, category) {
      return {
        id,
        subject: 'Test subject ' + id,
        sender: 'Sender ' + id,
        senderEmail: 'sender' + id + '@example.com',
        category
      };
    }

    /** Reference implementation: true if category id is 'other' OR name is 'Other' or '其他' */
    function isUncategorizedRef(email) {
      if (!email || !email.category) return true;
      const cat = email.category;
      if (cat.id === 'other') return true;
      const name = (cat.name || '').trim();
      if (name === 'Other' || name === '其他') return true;
      return false;
    }

    test('_isUncategorized returns true for emails with fallback categories', () => {
      fc.assert(
        fc.property(
          uncategorizedCategoryArb,
          (category) => {
            const email = makeEmail(0, category);
            expect(LabelSuggester._isUncategorized(email)).toBe(true);
          }
        ),
        { numRuns: 300 }
      );
    });

    test('_isUncategorized returns false for emails with real categories', () => {
      fc.assert(
        fc.property(
          realCategoryArb,
          (category) => {
            const email = makeEmail(0, category);
            expect(LabelSuggester._isUncategorized(email)).toBe(false);
          }
        ),
        { numRuns: 300 }
      );
    });

    test('filtering an array by _isUncategorized returns exactly the fallback-category emails', () => {
      // Generate a mixed array of emails: some uncategorized, some real
      const emailArrayArb = fc.array(
        fc.oneof(
          realCategoryArb.map(cat => ({ cat, uncategorized: false })),
          uncategorizedCategoryArb.map(cat => ({ cat, uncategorized: true }))
        ),
        { minLength: 0, maxLength: 30 }
      ).map(items =>
        items.map((item, idx) => ({
          email: makeEmail(idx, item.cat),
          expectedUncategorized: item.uncategorized
        }))
      );

      fc.assert(
        fc.property(
          emailArrayArb,
          (items) => {
            const emails = items.map(i => i.email);
            const filtered = emails.filter(e => LabelSuggester._isUncategorized(e));
            const expectedFiltered = items
              .filter(i => isUncategorizedRef(i.email))
              .map(i => i.email);

            // The filtered set should match exactly the reference implementation
            expect(filtered).toEqual(expectedFiltered);

            // Every filtered email should have a fallback category
            for (const email of filtered) {
              const cat = email.category;
              const isFallback = cat.id === 'other' || cat.name === 'Other' || cat.name === '其他';
              expect(isFallback).toBe(true);
            }

            // No non-fallback email should be in the filtered set
            const nonFallback = emails.filter(e => !LabelSuggester._isUncategorized(e));
            for (const email of nonFallback) {
              const cat = email.category;
              expect(cat.id).not.toBe('other');
              expect(cat.name).not.toBe('Other');
              expect(cat.name).not.toBe('其他');
            }
          }
        ),
        { numRuns: 500 }
      );
    });
  });

  // ── Property 9: Cache validity check ────────────────────────────────────
  // **Validates: Requirements 5.2**
  describe('Property 9: Cache validity check', () => {

    const CACHE_TTL_MS = 24 * 60 * 60 * 1000;   // 24 hours
    const DRIFT_THRESHOLD = 0.3;                  // 30%

    /**
     * Builds a cache object and a currentEmails array that produce a specific
     * drift percentage.
     *
     * Strategy: create a pool of `totalSubjects` unique subjects. The cache
     * holds all of them. The current emails keep `overlapCount` of them and
     * replace the rest with fresh subjects not in the cache. This gives:
     *
     *   drift = (totalSubjects - overlapCount) / totalSubjects
     *
     * @param {number} cacheAgeMs - How old the cache timestamp should be
     * @param {number} totalSubjects - Total number of current email subjects (≥ 1)
     * @param {number} overlapCount - How many current subjects also appear in the cache
     * @returns {{ cache: object, currentEmails: Array }}
     */
    function buildCacheScenario(cacheAgeMs, totalSubjects, overlapCount) {
      // Generate unique subjects for the cache
      const cachedSubjects = new Set();
      for (let i = 0; i < totalSubjects; i++) {
        cachedSubjects.add('cached-subject-' + i);
      }

      // Build current emails: first `overlapCount` overlap with cache, rest are new
      const currentEmails = [];
      let idx = 0;
      for (const subj of cachedSubjects) {
        if (idx < overlapCount) {
          currentEmails.push({ subject: subj });
        } else {
          currentEmails.push({ subject: 'new-subject-' + idx });
        }
        idx++;
      }

      const cache = {
        timestamp: Date.now() - cacheAgeMs,
        subjectHash: cachedSubjects,
        suggestions: [],
        emailCount: totalSubjects
      };

      return { cache, currentEmails };
    }

    test('returns true iff cache age < 24h AND drift ≤ 30%', () => {
      // Generate cache age from 0 to 48 hours in milliseconds
      const cacheAgeArb = fc.integer({ min: 0, max: 48 * 60 * 60 * 1000 });

      // Generate total subjects (1–20) and a drift percentage (0–100) as integers
      const totalSubjectsArb = fc.integer({ min: 1, max: 20 });
      const driftPercentArb = fc.integer({ min: 0, max: 100 });

      fc.assert(
        fc.property(
          cacheAgeArb,
          totalSubjectsArb,
          driftPercentArb,
          (cacheAgeMs, totalSubjects, driftPercent) => {
            // Compute overlap count from drift percentage
            // drift = (total - overlap) / total  →  overlap = total * (1 - drift/100)
            const overlapCount = Math.round(totalSubjects * (1 - driftPercent / 100));
            const clampedOverlap = Math.max(0, Math.min(totalSubjects, overlapCount));

            const { cache, currentEmails } = buildCacheScenario(cacheAgeMs, totalSubjects, clampedOverlap);

            const result = LabelSuggester._isCacheValid(cache, currentEmails);

            // Compute actual drift for this scenario
            const actualDrift = (totalSubjects - clampedOverlap) / totalSubjects;

            // Expected: true iff age < 24h AND drift ≤ 30%
            const isFresh = cacheAgeMs < CACHE_TTL_MS;
            const isLowDrift = actualDrift <= DRIFT_THRESHOLD;
            const expected = isFresh && isLowDrift;

            expect(result).toBe(expected);
          }
        ),
        { numRuns: 500 }
      );
    });

    test('cache exactly 24h old is invalid regardless of drift', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 20 }),
          (totalSubjects) => {
            // 0% drift (all subjects overlap) but exactly 24h old
            const { cache, currentEmails } = buildCacheScenario(CACHE_TTL_MS, totalSubjects, totalSubjects);
            expect(LabelSuggester._isCacheValid(cache, currentEmails)).toBe(false);
          }
        ),
        { numRuns: 200 }
      );
    });

    test('cache just under 24h old with 0% drift is valid', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 20 }),
          fc.integer({ min: 1, max: 1000 }),
          (totalSubjects, msUnder) => {
            // Just under 24h, 0% drift
            const cacheAge = CACHE_TTL_MS - msUnder;
            const { cache, currentEmails } = buildCacheScenario(cacheAge, totalSubjects, totalSubjects);
            expect(LabelSuggester._isCacheValid(cache, currentEmails)).toBe(true);
          }
        ),
        { numRuns: 200 }
      );
    });

    test('cache with exactly 30% drift and fresh timestamp is valid', () => {
      // Use totalSubjects = 10 so 30% drift = 3 new subjects, 7 overlap
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: CACHE_TTL_MS - 1 }),
          (cacheAgeMs) => {
            const totalSubjects = 10;
            const overlapCount = 7; // drift = 3/10 = 0.3 = exactly 30%
            const { cache, currentEmails } = buildCacheScenario(cacheAgeMs, totalSubjects, overlapCount);
            expect(LabelSuggester._isCacheValid(cache, currentEmails)).toBe(true);
          }
        ),
        { numRuns: 200 }
      );
    });

    test('cache with drift just over 30% is invalid even if fresh', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: CACHE_TTL_MS - 1 }),
          (cacheAgeMs) => {
            // Use totalSubjects = 10, overlapCount = 6 → drift = 4/10 = 0.4 > 0.3
            const totalSubjects = 10;
            const overlapCount = 6;
            const { cache, currentEmails } = buildCacheScenario(cacheAgeMs, totalSubjects, overlapCount);
            expect(LabelSuggester._isCacheValid(cache, currentEmails)).toBe(false);
          }
        ),
        { numRuns: 200 }
      );
    });

    test('cache older than 24h is invalid regardless of drift', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: CACHE_TTL_MS, max: 48 * 60 * 60 * 1000 }),
          fc.integer({ min: 1, max: 20 }),
          (cacheAgeMs, totalSubjects) => {
            // 0% drift but stale cache
            const { cache, currentEmails } = buildCacheScenario(cacheAgeMs, totalSubjects, totalSubjects);
            expect(LabelSuggester._isCacheValid(cache, currentEmails)).toBe(false);
          }
        ),
        { numRuns: 200 }
      );
    });

    test('null or missing cache returns false', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({ subject: fc.string({ minLength: 1, maxLength: 50 }) }),
            { minLength: 0, maxLength: 10 }
          ),
          (currentEmails) => {
            expect(LabelSuggester._isCacheValid(null, currentEmails)).toBe(false);
            expect(LabelSuggester._isCacheValid(undefined, currentEmails)).toBe(false);
            expect(LabelSuggester._isCacheValid({}, currentEmails)).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    test('cache with subjectHash as Array (serialized from Set) works correctly', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: CACHE_TTL_MS - 1 }),
          fc.integer({ min: 1, max: 10 }),
          (cacheAgeMs, totalSubjects) => {
            // Build scenario with 0% drift, but store subjectHash as Array instead of Set
            const { cache, currentEmails } = buildCacheScenario(cacheAgeMs, totalSubjects, totalSubjects);
            cache.subjectHash = Array.from(cache.subjectHash);

            expect(LabelSuggester._isCacheValid(cache, currentEmails)).toBe(true);
          }
        ),
        { numRuns: 200 }
      );
    });

    test('empty current emails with fresh cache returns true (0% drift)', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: CACHE_TTL_MS - 1 }),
          (cacheAgeMs) => {
            const cache = {
              timestamp: Date.now() - cacheAgeMs,
              subjectHash: new Set(['a', 'b', 'c']),
              suggestions: [],
              emailCount: 3
            };
            // Empty current emails → _hashEmailSubjects returns empty Set → drift = 0
            expect(LabelSuggester._isCacheValid(cache, [])).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // ── Property 10: Email subject drift detection ──────────────────────────
  // **Validates: Requirements 5.3**
  describe('Property 10: Email subject drift detection', () => {

    const DRIFT_THRESHOLD = 0.3; // 30%

    /**
     * Arbitrary for a non-empty, unique email subject string.
     * Uses a prefix + index strategy to guarantee uniqueness within a pool.
     */
    const subjectArb = fc.array(
      fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'.split('')),
      { minLength: 1, maxLength: 30 }
    ).map(chars => chars.join(''));

    /**
     * Builds two subject arrays with controlled overlap.
     *
     * @param {string[]} sharedPool - Subjects present in both cached and current sets
     * @param {string[]} cachedOnlyPool - Subjects only in the cached set
     * @param {string[]} currentOnlyPool - Subjects only in the current set
     * @returns {{ cachedSubjects: string[], currentSubjects: string[] }}
     */
    function buildSubjectSets(sharedPool, cachedOnlyPool, currentOnlyPool) {
      const cachedSubjects = [...sharedPool, ...cachedOnlyPool];
      const currentSubjects = [...sharedPool, ...currentOnlyPool];
      return { cachedSubjects, currentSubjects };
    }

    test('_computeDrift equals proportion of current subjects not in cached set', () => {
      // Generate three disjoint pools of subjects using unique prefixes
      const poolArb = fc.tuple(
        fc.integer({ min: 0, max: 10 }), // shared count
        fc.integer({ min: 0, max: 10 }), // cached-only count
        fc.integer({ min: 0, max: 10 })  // current-only count
      ).filter(([shared, , currentOnly]) => shared + currentOnly > 0); // at least 1 current subject

      fc.assert(
        fc.property(
          poolArb,
          ([sharedCount, cachedOnlyCount, currentOnlyCount]) => {
            // Build unique subjects using prefixes to guarantee disjointness
            const shared = Array.from({ length: sharedCount }, (_, i) => 'shared-' + i);
            const cachedOnly = Array.from({ length: cachedOnlyCount }, (_, i) => 'cached-only-' + i);
            const currentOnly = Array.from({ length: currentOnlyCount }, (_, i) => 'current-only-' + i);

            const cachedSet = new Set([...shared, ...cachedOnly]);
            const currentSet = new Set([...shared, ...currentOnly]);

            const drift = LabelSuggester._computeDrift(cachedSet, currentSet);

            // Expected drift: proportion of current subjects NOT in cached set
            const totalCurrent = currentSet.size;
            const missingCount = currentOnlyCount; // only current-only subjects are missing from cache
            const expectedDrift = missingCount / totalCurrent;

            expect(drift).toBeCloseTo(expectedDrift, 10);
          }
        ),
        { numRuns: 500 }
      );
    });

    test('_computeDrift returns 0 when current subjects is empty', () => {
      fc.assert(
        fc.property(
          fc.array(subjectArb, { minLength: 0, maxLength: 10 }),
          (cachedSubjects) => {
            const cachedSet = new Set(cachedSubjects);
            const currentSet = new Set();

            const drift = LabelSuggester._computeDrift(cachedSet, currentSet);
            expect(drift).toBe(0);
          }
        ),
        { numRuns: 200 }
      );
    });

    test('_computeDrift returns 0 when all current subjects are in cached set', () => {
      fc.assert(
        fc.property(
          fc.array(subjectArb, { minLength: 1, maxLength: 15 }).filter(arr => new Set(arr).size > 0),
          (subjects) => {
            const uniqueSubjects = [...new Set(subjects)];
            const cachedSet = new Set(uniqueSubjects);
            const currentSet = new Set(uniqueSubjects);

            const drift = LabelSuggester._computeDrift(cachedSet, currentSet);
            expect(drift).toBe(0);
          }
        ),
        { numRuns: 200 }
      );
    });

    test('_computeDrift returns 1 when no current subjects are in cached set', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 15 }),
          fc.integer({ min: 1, max: 15 }),
          (cachedCount, currentCount) => {
            // Use disjoint prefixes to guarantee no overlap
            const cachedSet = new Set(Array.from({ length: cachedCount }, (_, i) => 'old-' + i));
            const currentSet = new Set(Array.from({ length: currentCount }, (_, i) => 'new-' + i));

            const drift = LabelSuggester._computeDrift(cachedSet, currentSet);
            expect(drift).toBe(1);
          }
        ),
        { numRuns: 200 }
      );
    });

    test('_hashEmailSubjects normalizes subjects by trimming and lowercasing', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              subject: fc.tuple(
                fc.constantFrom('', ' ', '  '),
                fc.string({ minLength: 1, maxLength: 50 }),
                fc.constantFrom('', ' ', '  ')
              ).map(([pre, core, post]) => pre + core + post)
            }),
            { minLength: 1, maxLength: 15 }
          ),
          (emails) => {
            const result = LabelSuggester._hashEmailSubjects(emails);

            expect(result).toBeInstanceOf(Set);

            // Every entry in the result should be trimmed and lowercased
            for (const subj of result) {
              expect(subj).toBe(subj.trim());
              expect(subj).toBe(subj.toLowerCase());
              expect(subj.length).toBeGreaterThan(0);
            }
          }
        ),
        { numRuns: 300 }
      );
    });

    test('drift > 30% means cache is stale via _isCacheValid', () => {
      // Generate scenarios where drift is controlled and cache is fresh
      const driftPercentArb = fc.integer({ min: 0, max: 100 });

      fc.assert(
        fc.property(
          driftPercentArb,
          (driftPercent) => {
            const totalSubjects = 10;
            // overlap = total * (1 - drift/100)
            const overlapCount = Math.round(totalSubjects * (1 - driftPercent / 100));
            const clampedOverlap = Math.max(0, Math.min(totalSubjects, overlapCount));

            // Build unique subjects
            const shared = Array.from({ length: clampedOverlap }, (_, i) => 'subj-' + i);
            const cachedOnly = Array.from({ length: totalSubjects - clampedOverlap }, (_, i) => 'cached-extra-' + i);
            const currentOnly = Array.from({ length: totalSubjects - clampedOverlap }, (_, i) => 'current-extra-' + i);

            const cachedSubjects = new Set([...shared, ...cachedOnly]);
            const currentEmails = [...shared, ...currentOnly].map(s => ({ subject: s }));

            // Use a fresh cache (1 hour old) so only drift determines staleness
            const cache = {
              timestamp: Date.now() - (60 * 60 * 1000), // 1 hour ago
              subjectHash: cachedSubjects,
              suggestions: [],
              emailCount: totalSubjects
            };

            const isValid = LabelSuggester._isCacheValid(cache, currentEmails);
            const actualDrift = (totalSubjects - clampedOverlap) / totalSubjects;

            if (actualDrift > DRIFT_THRESHOLD) {
              // drift > 30% → cache is stale
              expect(isValid).toBe(false);
            } else {
              // drift ≤ 30% → cache is valid (since timestamp is fresh)
              expect(isValid).toBe(true);
            }
          }
        ),
        { numRuns: 500 }
      );
    });

    test('_computeDrift and _hashEmailSubjects work together end-to-end', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 10 }), // shared count
          fc.integer({ min: 0, max: 10 }), // cached-only count
          fc.integer({ min: 0, max: 10 }), // current-only count
          (sharedCount, cachedOnlyCount, currentOnlyCount) => {
            // Build email objects with unique subjects
            const sharedEmails = Array.from({ length: sharedCount }, (_, i) =>
              ({ subject: 'Shared Subject ' + i })
            );
            const cachedOnlyEmails = Array.from({ length: cachedOnlyCount }, (_, i) =>
              ({ subject: 'Cached Only ' + i })
            );
            const currentOnlyEmails = Array.from({ length: currentOnlyCount }, (_, i) =>
              ({ subject: 'Current Only ' + i })
            );

            // Hash both sets using the real _hashEmailSubjects function
            const cachedSet = LabelSuggester._hashEmailSubjects([...sharedEmails, ...cachedOnlyEmails]);
            const currentSet = LabelSuggester._hashEmailSubjects([...sharedEmails, ...currentOnlyEmails]);

            const drift = LabelSuggester._computeDrift(cachedSet, currentSet);

            // Expected: currentOnly subjects are the ones not in cached set
            const totalCurrent = currentSet.size;
            if (totalCurrent === 0) {
              expect(drift).toBe(0);
            } else {
              const expectedDrift = currentOnlyCount / totalCurrent;
              expect(drift).toBeCloseTo(expectedDrift, 10);
            }
          }
        ),
        { numRuns: 500 }
      );
    });
  });

  // ── Property 11: Uncategorized email threshold ──────────────────────────
  // **Validates: Requirements 10.1, 10.2**
  describe('Property 11: Uncategorized email threshold', () => {

    /** Arbitrary for a well-categorized email (real category, not 'other'/'Other'/'其他') */
    const realCategoryArb = fc.constantFrom(
      { id: 'work', name: 'Work' },
      { id: 'shopping', name: 'Shopping' },
      { id: 'finance', name: 'Finance' },
      { id: 'travel', name: 'Travel' },
      { id: 'social', name: 'Social' },
      { id: 'promo', name: 'Promotions' }
    );

    /** Arbitrary for an uncategorized email category */
    const uncategorizedCategoryArb = fc.constantFrom(
      { id: 'other', name: 'Other' },
      { id: 'other', name: '其他' },
      { id: 'other', name: 'Misc' }
    );

    /** Build an email object with a given category */
    function makeEmail(id, category) {
      return {
        id,
        subject: 'Subject for email ' + id,
        sender: 'Sender ' + id,
        senderEmail: 'sender' + id + '@example.com',
        category
      };
    }

    /**
     * Generate an email array with exactly `uncatCount` uncategorized emails
     * and `catCount` well-categorized emails.
     */
    const emailArrayArb = (uncatCount, catCount) =>
      fc.tuple(
        fc.array(uncategorizedCategoryArb, { minLength: uncatCount, maxLength: uncatCount }),
        fc.array(realCategoryArb, { minLength: catCount, maxLength: catCount })
      ).map(([uncatCats, catCats]) => {
        const emails = [];
        let idx = 0;
        for (const cat of uncatCats) {
          emails.push(makeEmail(idx++, cat));
        }
        for (const cat of catCats) {
          emails.push(makeEmail(idx++, cat));
        }
        return emails;
      });

    beforeEach(() => {
      // Reset chrome mocks before each test
      chrome.runtime.sendMessage.mockReset();
      chrome.storage.local.get.mockReset();
      chrome.storage.local.set.mockReset();

      // Mock chrome.storage.local.get to return empty cache (no cached suggestions)
      chrome.storage.local.get.mockImplementation((keys, callback) => {
        const result = {};
        if (Array.isArray(keys)) {
          for (const k of keys) result[k] = undefined;
        }
        callback(result);
      });
    });

    test('returns empty array when 0 uncategorized emails exist', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 0, max: 15 }),
          async (catCount) => {
            chrome.runtime.sendMessage.mockReset();

            const emails = catCount === 0
              ? []
              : await fc.sample(emailArrayArb(0, catCount), 1)[0];

            const result = await LabelSuggester.generateSuggestions(
              emails,
              ['Work', 'Shopping'],
              'ai',
              { baseUrl: 'http://test', apiKey: 'key', model: 'gpt-4' }
            );

            // Should return empty array
            expect(result).toEqual([]);

            // LLM should never be called
            expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
          }
        ),
        { numRuns: 100 }
      );
    });

    test('returns empty array when 1 uncategorized email exists', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 0, max: 15 }),
          async (catCount) => {
            chrome.runtime.sendMessage.mockReset();

            const emails = fc.sample(emailArrayArb(1, catCount), 1)[0];

            const result = await LabelSuggester.generateSuggestions(
              emails,
              ['Work', 'Shopping'],
              'ai',
              { baseUrl: 'http://test', apiKey: 'key', model: 'gpt-4' }
            );

            expect(result).toEqual([]);
            expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
          }
        ),
        { numRuns: 100 }
      );
    });

    test('returns empty array when 2 uncategorized emails exist', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 0, max: 15 }),
          async (catCount) => {
            chrome.runtime.sendMessage.mockReset();

            const emails = fc.sample(emailArrayArb(2, catCount), 1)[0];

            const result = await LabelSuggester.generateSuggestions(
              emails,
              ['Work', 'Shopping'],
              'ai',
              { baseUrl: 'http://test', apiKey: 'key', model: 'gpt-4' }
            );

            expect(result).toEqual([]);
            expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
          }
        ),
        { numRuns: 100 }
      );
    });

    test('for any email array with 0–2 uncategorized emails, returns empty and never calls LLM', async () => {
      // Generate 0–2 uncategorized + 0–20 well-categorized emails
      const uncatCountArb = fc.integer({ min: 0, max: 2 });
      const catCountArb = fc.integer({ min: 0, max: 20 });

      await fc.assert(
        fc.asyncProperty(
          uncatCountArb,
          catCountArb,
          async (uncatCount, catCount) => {
            chrome.runtime.sendMessage.mockReset();

            const emails = fc.sample(emailArrayArb(uncatCount, catCount), 1)[0];

            const result = await LabelSuggester.generateSuggestions(
              emails,
              ['Work', 'Shopping'],
              'ai',
              { baseUrl: 'http://test', apiKey: 'key', model: 'gpt-4' }
            );

            // With fewer than 3 uncategorized emails, should always return empty
            expect(result).toEqual([]);

            // chrome.runtime.sendMessage should NOT have been called with AI_SUGGEST_LABELS
            const aiCalls = chrome.runtime.sendMessage.mock.calls.filter(
              call => call[0] && call[0].type === 'AI_SUGGEST_LABELS'
            );
            expect(aiCalls.length).toBe(0);
          }
        ),
        { numRuns: 200 }
      );
    });
  });
});
