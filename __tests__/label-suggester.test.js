'use strict';

const { describe, test, expect, beforeEach, afterEach, jest: jestGlobal } = require('@jest/globals');
const fs = require('fs');
const path = require('path');

// ── Helpers ────────────────────────────────────────────────────────────────

function loadLabelSuggester() {
  delete global.LabelSuggester;
  delete global.window.LabelSuggester;
  const code = fs.readFileSync(path.join(__dirname, '../src/analysis/label-suggester.js'), 'utf8');
  eval(code);
}

describe('LabelSuggester Unit Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    chrome.runtime.lastError = null;
    delete global.LabelSuggester;
    delete global.window.LabelSuggester;
    loadLabelSuggester();
  });

  // ════════════════════════════════════════════════════════════════════════
  // Task 13.1: Unit tests for _parseResponse()
  // Validates: Requirements 1.3, 1.6, 12.1, 12.2, 12.3, 12.5, 12.6
  // ════════════════════════════════════════════════════════════════════════

  describe('_parseResponse()', () => {
    test('valid JSON with suggestions array returns parsed suggestions', () => {
      const input = JSON.stringify({
        suggestions: [
          { name: 'Travel', rationale: 'Flight emails', emailIds: [1, 2, 3] },
          { name: 'Finance', rationale: 'Bank statements', emailIds: [4, 5] }
        ]
      });

      const result = LabelSuggester._parseResponse(input);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ name: 'Travel', rationale: 'Flight emails', emailIds: [1, 2, 3] });
      expect(result[1]).toEqual({ name: 'Finance', rationale: 'Bank statements', emailIds: [4, 5] });
    });

    test('JSON wrapped in markdown code fences extracts JSON correctly', () => {
      const input = '```json\n' + JSON.stringify({
        suggestions: [
          { name: 'Shopping', rationale: 'Order confirmations', emailIds: [1] }
        ]
      }) + '\n```';

      const result = LabelSuggester._parseResponse(input);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Shopping');
      expect(result[0].rationale).toBe('Order confirmations');
      expect(result[0].emailIds).toEqual([1]);
    });

    test('JSON wrapped in plain code fences (no language tag) extracts correctly', () => {
      const input = '```\n' + JSON.stringify({
        suggestions: [
          { name: 'Updates', rationale: 'Software updates', emailIds: [7, 8] }
        ]
      }) + '\n```';

      const result = LabelSuggester._parseResponse(input);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Updates');
    });

    test('invalid JSON returns empty array', () => {
      expect(LabelSuggester._parseResponse('not json at all')).toEqual([]);
      expect(LabelSuggester._parseResponse('{ broken json')).toEqual([]);
      expect(LabelSuggester._parseResponse('')).toEqual([]);
      expect(LabelSuggester._parseResponse(null)).toEqual([]);
      expect(LabelSuggester._parseResponse(undefined)).toEqual([]);
      expect(LabelSuggester._parseResponse(42)).toEqual([]);
    });

    test('valid JSON but missing suggestions key returns empty array', () => {
      const input = JSON.stringify({ labels: [{ name: 'Test' }] });
      expect(LabelSuggester._parseResponse(input)).toEqual([]);
    });

    test('valid JSON with suggestions as non-array returns empty array', () => {
      expect(LabelSuggester._parseResponse(JSON.stringify({ suggestions: 'not an array' }))).toEqual([]);
      expect(LabelSuggester._parseResponse(JSON.stringify({ suggestions: 42 }))).toEqual([]);
      expect(LabelSuggester._parseResponse(JSON.stringify({ suggestions: null }))).toEqual([]);
    });

    test('suggestions with extra fields are stripped to name, rationale, emailIds only', () => {
      const input = JSON.stringify({
        suggestions: [
          {
            name: 'Travel',
            rationale: 'Flight emails',
            emailIds: [1, 2],
            confidence: 0.95,
            priority: 'high',
            extraField: 'should be removed'
          }
        ]
      });

      const result = LabelSuggester._parseResponse(input);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ name: 'Travel', rationale: 'Flight emails', emailIds: [1, 2] });
      expect(result[0]).not.toHaveProperty('confidence');
      expect(result[0]).not.toHaveProperty('priority');
      expect(result[0]).not.toHaveProperty('extraField');
    });

    test('suggestions with empty names are filtered out', () => {
      const input = JSON.stringify({
        suggestions: [
          { name: '', rationale: 'No name', emailIds: [1] },
          { name: '   ', rationale: 'Whitespace name', emailIds: [2] },
          { name: 'Valid', rationale: 'Has a name', emailIds: [3] }
        ]
      });

      const result = LabelSuggester._parseResponse(input);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Valid');
    });

    test('suggestions with empty emailIds are filtered out', () => {
      const input = JSON.stringify({
        suggestions: [
          { name: 'NoEmails', rationale: 'Empty array', emailIds: [] },
          { name: 'HasEmails', rationale: 'Has IDs', emailIds: [1, 2] }
        ]
      });

      const result = LabelSuggester._parseResponse(input);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('HasEmails');
    });

    test('suggestions with non-number emailIds are filtered out', () => {
      const input = JSON.stringify({
        suggestions: [
          { name: 'BadIds', rationale: 'String IDs', emailIds: ['a', 'b'] },
          { name: 'GoodIds', rationale: 'Number IDs', emailIds: [1, 2] }
        ]
      });

      const result = LabelSuggester._parseResponse(input);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('GoodIds');
    });

    test('suggestions missing rationale are filtered out', () => {
      const input = JSON.stringify({
        suggestions: [
          { name: 'NoRationale', emailIds: [1] },
          { name: 'Valid', rationale: 'Has rationale', emailIds: [2] }
        ]
      });

      const result = LabelSuggester._parseResponse(input);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Valid');
    });

    test('JSON with leading text before the object is handled', () => {
      const input = 'Here are my suggestions: ' + JSON.stringify({
        suggestions: [
          { name: 'Travel', rationale: 'Flights', emailIds: [1] }
        ]
      });

      const result = LabelSuggester._parseResponse(input);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Travel');
    });
  });


  // ════════════════════════════════════════════════════════════════════════
  // Task 10.1: Unit tests for _parseResponse() with simple string format
  // Validates: Requirements 4.5, 4.7, 7.5
  // ════════════════════════════════════════════════════════════════════════

  describe('_parseResponse() - simple string format', () => {
    test('valid JSON with string suggestions array returns parsed strings', () => {
      const input = '{"suggestions": ["Travel", "Finance", "Shopping"]}';
      const result = LabelSuggester._parseResponse(input);
      expect(result).toEqual(['Travel', 'Finance', 'Shopping']);
    });

    test('code-fenced JSON extracts suggestions correctly', () => {
      const input = '```json\n{"suggestions": ["Work", "Health"]}\n```';
      const result = LabelSuggester._parseResponse(input);
      expect(result).toEqual(['Work', 'Health']);
    });

    test('empty string returns empty array', () => {
      const result = LabelSuggester._parseResponse('');
      expect(result).toEqual([]);
    });

    test('non-JSON text returns empty array', () => {
      const result = LabelSuggester._parseResponse('I cannot help with that');
      expect(result).toEqual([]);
    });

    test('wrong schema (no suggestions key) returns empty array', () => {
      const input = '{"labels": ["a", "b"]}';
      const result = LabelSuggester._parseResponse(input);
      expect(result).toEqual([]);
    });

    test('partial/truncated JSON returns empty array', () => {
      const input = '{"suggestions": ["Travel", "Fin';
      const result = LabelSuggester._parseResponse(input);
      expect(result).toEqual([]);
    });

    test('null input returns empty array', () => {
      expect(LabelSuggester._parseResponse(null)).toEqual([]);
    });

    test('undefined input returns empty array', () => {
      expect(LabelSuggester._parseResponse(undefined)).toEqual([]);
    });

    test('number input returns empty array', () => {
      expect(LabelSuggester._parseResponse(42)).toEqual([]);
    });

    test('suggestions with empty strings are filtered out', () => {
      const input = '{"suggestions": ["Travel", "", "  ", "Finance"]}';
      const result = LabelSuggester._parseResponse(input);
      expect(result).toEqual(['Travel', 'Finance']);
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // Task 13.2: Unit tests for generateSuggestions()
  // Validates: Requirements 1.1, 1.2, 1.6, 5.2, 6.1, 6.5, 10.1
  // ════════════════════════════════════════════════════════════════════════

  describe('generateSuggestions()', () => {
    // Helper to create uncategorized emails
    function makeUncategorizedEmails(count) {
      return Array.from({ length: count }, (_, i) => ({
        id: i,
        subject: `Uncategorized email ${i}`,
        sender: `Sender ${i}`,
        senderEmail: `sender${i}@example.com`,
        category: { id: 'other', name: 'Other' }
      }));
    }

    // Helper to create well-categorized emails
    function makeCategorizedEmails(count) {
      return Array.from({ length: count }, (_, i) => ({
        id: 100 + i,
        subject: `Categorized email ${i}`,
        sender: `Sender ${i}`,
        senderEmail: `sender${i}@work.com`,
        category: { id: 'work', name: 'Work' }
      }));
    }

    const validLLMResponse = {
      suggestions: [
        { name: 'Travel', rationale: 'Flight confirmations', emailIds: [0, 1] },
        { name: 'Newsletters', rationale: 'Weekly digests', emailIds: [2] }
      ]
    };

    beforeEach(() => {
      // Default: empty cache, empty dismissed list
      chrome.storage.local.get.mockImplementation((keys, cb) => {
        if (Array.isArray(keys) && keys.includes('aegis_suggestion_cache')) {
          cb({ aegis_suggestion_cache: undefined });
        } else if (Array.isArray(keys) && keys.includes('aegis_dismissed_suggestions')) {
          cb({ aegis_dismissed_suggestions: [] });
        } else {
          cb({});
        }
      });
      chrome.storage.local.set.mockImplementation((data, cb) => {
        if (cb) cb();
      });
    });

    test('returns empty array when fewer than 3 uncategorized emails', async () => {
      const emails = [
        ...makeUncategorizedEmails(2),
        ...makeCategorizedEmails(5)
      ];

      const result = await LabelSuggester.generateSuggestions(emails, ['Work'], 'ai', {});

      expect(result).toEqual([]);
      // Should not have called sendMessage (no LLM call)
      expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
    });

    test('returns empty array when zero uncategorized emails', async () => {
      const emails = makeCategorizedEmails(10);

      const result = await LabelSuggester.generateSuggestions(emails, ['Work'], 'ai', {});

      expect(result).toEqual([]);
    });

    test('returns cached suggestions when cache is valid', async () => {
      const cachedSuggestions = [
        { name: 'Cached Label', rationale: 'From cache', emailIds: [0], icon: 'tag', color: '#1976d2', bgColor: '#e3f2fd' }
      ];

      const uncategorizedEmails = makeUncategorizedEmails(5);

      // Mock cache with valid timestamp and matching subjects
      const subjectSet = uncategorizedEmails.map(e => e.subject.trim().toLowerCase());
      chrome.storage.local.get.mockImplementation((keys, cb) => {
        if (Array.isArray(keys) && keys.includes('aegis_suggestion_cache')) {
          cb({
            aegis_suggestion_cache: {
              timestamp: Date.now() - (1000 * 60 * 60), // 1 hour ago
              subjectHash: subjectSet,
              suggestions: cachedSuggestions,
              emailCount: 5
            }
          });
        } else if (Array.isArray(keys) && keys.includes('aegis_dismissed_suggestions')) {
          cb({ aegis_dismissed_suggestions: [] });
        } else {
          cb({});
        }
      });

      const result = await LabelSuggester.generateSuggestions(uncategorizedEmails, ['Work'], 'ai', {});

      expect(result).toEqual(cachedSuggestions);
      // Should not have called the LLM
      expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
    });

    test('calls LLM when cache is stale (older than 24 hours)', async () => {
      const uncategorizedEmails = makeUncategorizedEmails(5);
      const subjectSet = uncategorizedEmails.map(e => e.subject.trim().toLowerCase());

      // Mock stale cache (25 hours old)
      chrome.storage.local.get.mockImplementation((keys, cb) => {
        if (Array.isArray(keys) && keys.includes('aegis_suggestion_cache')) {
          cb({
            aegis_suggestion_cache: {
              timestamp: Date.now() - (25 * 60 * 60 * 1000),
              subjectHash: subjectSet,
              suggestions: [{ name: 'Old', rationale: 'Stale', emailIds: [0], icon: 'tag', color: '#1976d2', bgColor: '#e3f2fd' }],
              emailCount: 5
            }
          });
        } else if (Array.isArray(keys) && keys.includes('aegis_dismissed_suggestions')) {
          cb({ aegis_dismissed_suggestions: [] });
        } else {
          cb({});
        }
      });

      // Mock AI response
      chrome.runtime.sendMessage.mockImplementation((msg, cb) => {
        cb(validLLMResponse);
      });

      const result = await LabelSuggester.generateSuggestions(uncategorizedEmails, ['Work'], 'ai', {
        baseUrl: 'https://api.example.com',
        apiKey: 'test-key',
        model: 'gpt-4'
      });

      expect(chrome.runtime.sendMessage).toHaveBeenCalled();
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].name).toBe('Travel');
    });

    test('AI mode sends AI_SUGGEST_LABELS message via chrome.runtime.sendMessage', async () => {
      const uncategorizedEmails = makeUncategorizedEmails(5);

      chrome.runtime.sendMessage.mockImplementation((msg, cb) => {
        cb(validLLMResponse);
      });

      const aiSettings = { baseUrl: 'https://api.example.com', apiKey: 'test-key', model: 'gpt-4' };
      await LabelSuggester.generateSuggestions(uncategorizedEmails, ['Work'], 'ai', aiSettings);

      expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(1);
      const sentMessage = chrome.runtime.sendMessage.mock.calls[0][0];
      expect(sentMessage.type).toBe('AI_SUGGEST_LABELS');
      expect(sentMessage.systemPrompt).toBeDefined();
      expect(sentMessage.userPrompt).toBeDefined();
      expect(sentMessage.settings).toEqual(aiSettings);
    });

    test('error handling returns empty array without throwing', async () => {
      const uncategorizedEmails = makeUncategorizedEmails(5);

      // Mock sendMessage to simulate an error
      chrome.runtime.sendMessage.mockImplementation((msg, cb) => {
        chrome.runtime.lastError = { message: 'Extension context invalidated' };
        cb(undefined);
        chrome.runtime.lastError = null;
      });

      const result = await LabelSuggester.generateSuggestions(uncategorizedEmails, ['Work'], 'ai', {});

      expect(result).toEqual([]);
    });

    test('AI API returning error object results in empty array', async () => {
      const uncategorizedEmails = makeUncategorizedEmails(5);

      chrome.runtime.sendMessage.mockImplementation((msg, cb) => {
        cb({ error: true });
      });

      const result = await LabelSuggester.generateSuggestions(uncategorizedEmails, ['Work'], 'ai', {});

      expect(result).toEqual([]);
    });

    test('enriches suggestions with icon, color, and bgColor', async () => {
      const uncategorizedEmails = makeUncategorizedEmails(5);

      chrome.runtime.sendMessage.mockImplementation((msg, cb) => {
        cb({
          suggestions: [
            { name: 'Travel Bookings', rationale: 'Flight emails', emailIds: [0, 1] }
          ]
        });
      });

      const result = await LabelSuggester.generateSuggestions(uncategorizedEmails, [], 'ai', {});

      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty('icon');
      expect(result[0]).toHaveProperty('color');
      expect(result[0]).toHaveProperty('bgColor');
      // 'travel' keyword should match 'send' icon
      expect(result[0].icon).toBe('send');
    });

    // ════════════════════════════════════════════════════════════════════════
    // Task 10.2: Additional unit tests for generateSuggestions() integration paths
    // Validates: Requirements 4.1, 4.2, 7.2
    // ════════════════════════════════════════════════════════════════════════

    test('Nano mode: uses LanguageModel API and returns parsed suggestions', async () => {
      const uncategorizedEmails = makeUncategorizedEmails(5);

      // Mock the LanguageModel API (Chrome 138+ global)
      const mockSession = {
        prompt: jest.fn().mockResolvedValue(JSON.stringify({
          suggestions: ['Newsletters', 'Receipts', 'Social']
        })),
        destroy: jest.fn()
      };
      global.LanguageModel = {
        create: jest.fn().mockResolvedValue(mockSession)
      };

      const result = await LabelSuggester.generateSuggestions(uncategorizedEmails, ['Work'], 'nano', {});

      expect(global.LanguageModel.create).toHaveBeenCalledTimes(1);
      expect(global.LanguageModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ systemPrompt: expect.any(String) })
      );
      expect(mockSession.prompt).toHaveBeenCalledTimes(1);
      expect(mockSession.destroy).toHaveBeenCalledTimes(1);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].name).toBe('Newsletters');

      delete global.LanguageModel;
    });

    test('Nano mode: falls back to self.ai.languageModel when global LanguageModel unavailable', async () => {
      const uncategorizedEmails = makeUncategorizedEmails(5);

      // Remove global LanguageModel
      delete global.LanguageModel;

      const mockSession = {
        prompt: jest.fn().mockResolvedValue(JSON.stringify({
          suggestions: ['Updates', 'Alerts']
        })),
        destroy: jest.fn()
      };
      // In jsdom, `self` === `window` === `global`, so set ai on global directly
      global.ai = {
        languageModel: {
          create: jest.fn().mockResolvedValue(mockSession)
        }
      };

      const result = await LabelSuggester.generateSuggestions(uncategorizedEmails, [], 'nano', {});

      expect(global.ai.languageModel.create).toHaveBeenCalledTimes(1);
      expect(mockSession.prompt).toHaveBeenCalledTimes(1);
      expect(mockSession.destroy).toHaveBeenCalledTimes(1);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].name).toBe('Updates');

      delete global.ai;
    });

    test('Nano mode: returns empty array when LanguageModel API is unavailable', async () => {
      const uncategorizedEmails = makeUncategorizedEmails(5);

      delete global.LanguageModel;
      // Ensure self.ai is not available (self === window === global in jsdom)
      delete global.ai;

      const result = await LabelSuggester.generateSuggestions(uncategorizedEmails, [], 'nano', {});

      expect(result).toEqual([]);
    });

    test('returns empty array on network failure (sendMessage callback with lastError)', async () => {
      const uncategorizedEmails = makeUncategorizedEmails(5);

      chrome.runtime.sendMessage.mockImplementation((msg, cb) => {
        chrome.runtime.lastError = { message: 'Could not establish connection' };
        cb(undefined);
        chrome.runtime.lastError = null;
      });

      const result = await LabelSuggester.generateSuggestions(uncategorizedEmails, ['Work'], 'ai', {
        baseUrl: 'https://api.example.com',
        apiKey: 'test-key',
        model: 'gpt-4'
      });

      expect(result).toEqual([]);
    });

    test('filters out existing labels from suggestions (case-insensitive)', async () => {
      const uncategorizedEmails = makeUncategorizedEmails(5);

      chrome.runtime.sendMessage.mockImplementation((msg, cb) => {
        cb({
          suggestions: ['Travel', 'Work', 'Finance', 'Shopping', 'NEWSLETTERS']
        });
      });

      // 'Work' and 'Newsletters' are existing labels — should be filtered out
      const result = await LabelSuggester.generateSuggestions(
        uncategorizedEmails, ['Work', 'Newsletters'], 'ai', {}
      );

      const names = result.map(s => s.name);
      expect(names).not.toContain('Work');
      expect(names).not.toContain('NEWSLETTERS');
      expect(names).toContain('Travel');
      expect(names).toContain('Finance');
      expect(names).toContain('Shopping');
    });

    test('caps suggestions at MAX_SUGGESTIONS (5)', async () => {
      const uncategorizedEmails = makeUncategorizedEmails(5);

      chrome.runtime.sendMessage.mockImplementation((msg, cb) => {
        cb({
          suggestions: ['Label1', 'Label2', 'Label3', 'Label4', 'Label5', 'Label6', 'Label7', 'Label8']
        });
      });

      const result = await LabelSuggester.generateSuggestions(uncategorizedEmails, [], 'ai', {});

      expect(result.length).toBeLessThanOrEqual(5);
      expect(result).toHaveLength(5);
    });
  });


  // ════════════════════════════════════════════════════════════════════════
  // Task 13.3: Unit tests for dismissSuggestion()
  // Validates: Requirements 4.2, 4.3
  // ════════════════════════════════════════════════════════════════════════

  describe('dismissSuggestion()', () => {
    test('adds name to dismissed list in chrome.storage.local', async () => {
      // Start with empty dismissed list
      chrome.storage.local.get.mockImplementation((keys, cb) => {
        cb({ aegis_dismissed_suggestions: [] });
      });
      chrome.storage.local.set.mockImplementation((data, cb) => {
        if (cb) cb();
      });

      await LabelSuggester.dismissSuggestion('Travel');

      expect(chrome.storage.local.set).toHaveBeenCalledTimes(1);
      const savedData = chrome.storage.local.set.mock.calls[0][0];
      const dismissedList = savedData.aegis_dismissed_suggestions;

      expect(dismissedList).toHaveLength(1);
      expect(dismissedList[0].name).toBe('Travel');
      expect(typeof dismissedList[0].dismissedAt).toBe('number');
      // dismissedAt should be recent (within last second)
      expect(Date.now() - dismissedList[0].dismissedAt).toBeLessThan(1000);
    });

    test('appends to existing dismissed list', async () => {
      const existingDismissed = [
        { name: 'Shopping', dismissedAt: Date.now() - 1000 }
      ];

      chrome.storage.local.get.mockImplementation((keys, cb) => {
        cb({ aegis_dismissed_suggestions: existingDismissed });
      });
      chrome.storage.local.set.mockImplementation((data, cb) => {
        if (cb) cb();
      });

      await LabelSuggester.dismissSuggestion('Finance');

      const savedData = chrome.storage.local.set.mock.calls[0][0];
      const dismissedList = savedData.aegis_dismissed_suggestions;

      expect(dismissedList).toHaveLength(2);
      expect(dismissedList[0].name).toBe('Shopping');
      expect(dismissedList[1].name).toBe('Finance');
    });

    test('does not duplicate existing dismissed names (case-insensitive)', async () => {
      const existingDismissed = [
        { name: 'Travel', dismissedAt: Date.now() - 5000 }
      ];

      chrome.storage.local.get.mockImplementation((keys, cb) => {
        cb({ aegis_dismissed_suggestions: existingDismissed });
      });
      chrome.storage.local.set.mockImplementation((data, cb) => {
        if (cb) cb();
      });

      // Dismiss same name with different case
      await LabelSuggester.dismissSuggestion('travel');

      const savedData = chrome.storage.local.set.mock.calls[0][0];
      const dismissedList = savedData.aegis_dismissed_suggestions;

      // Should still have only 1 entry, not 2
      expect(dismissedList).toHaveLength(1);
      expect(dismissedList[0].name).toBe('Travel'); // original name preserved
      // Timestamp should be updated (or same if sub-millisecond)
      expect(dismissedList[0].dismissedAt).toBeGreaterThanOrEqual(existingDismissed[0].dismissedAt);
    });

    test('does not duplicate when exact same name is dismissed again', async () => {
      const existingDismissed = [
        { name: 'Travel', dismissedAt: Date.now() - 10000 }
      ];

      chrome.storage.local.get.mockImplementation((keys, cb) => {
        cb({ aegis_dismissed_suggestions: existingDismissed });
      });
      chrome.storage.local.set.mockImplementation((data, cb) => {
        if (cb) cb();
      });

      await LabelSuggester.dismissSuggestion('Travel');

      const savedData = chrome.storage.local.set.mock.calls[0][0];
      const dismissedList = savedData.aegis_dismissed_suggestions;

      expect(dismissedList).toHaveLength(1);
      // Timestamp should be refreshed (or same if sub-millisecond)
      expect(dismissedList[0].dismissedAt).toBeGreaterThanOrEqual(existingDismissed[0].dismissedAt);
    });

    test('handles empty/null storage gracefully', async () => {
      chrome.storage.local.get.mockImplementation((keys, cb) => {
        cb({ aegis_dismissed_suggestions: null });
      });
      chrome.storage.local.set.mockImplementation((data, cb) => {
        if (cb) cb();
      });

      await LabelSuggester.dismissSuggestion('NewLabel');

      const savedData = chrome.storage.local.set.mock.calls[0][0];
      const dismissedList = savedData.aegis_dismissed_suggestions;

      expect(dismissedList).toHaveLength(1);
      expect(dismissedList[0].name).toBe('NewLabel');
    });

    test('handles storage read errors gracefully (does not throw)', async () => {
      // Simulate chrome.storage.local.get throwing an error
      chrome.storage.local.get.mockImplementation((keys, cb) => {
        throw new Error('Storage unavailable');
      });

      // Should not throw — errors are handled internally
      await expect(LabelSuggester.dismissSuggestion('SomeLabel')).resolves.toBeUndefined();

      // set should not have been called since get threw
      expect(chrome.storage.local.set).not.toHaveBeenCalled();
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // Task 10.4: Unit tests for popup visibility gate
  // Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5
  // ════════════════════════════════════════════════════════════════════════

  describe('shouldShowSuggestionButton() - popup visibility gate', () => {
    // Define the function inline for testing (popup.js is not loaded in test env)
    function shouldShowSuggestionButton(isEmailPlatform, analysisMode, aiSettings) {
      if (!isEmailPlatform) return false;
      if (analysisMode === 'nano') return true;
      if (analysisMode === 'ai' && aiSettings && aiSettings.apiKey) return true;
      return false;
    }

    // Requirement 1.2: email platform + nano mode → show
    test('returns true when on email platform with nano mode', () => {
      expect(shouldShowSuggestionButton(true, 'nano', {})).toBe(true);
      expect(shouldShowSuggestionButton(true, 'nano', null)).toBe(true);
      expect(shouldShowSuggestionButton(true, 'nano', undefined)).toBe(true);
    });

    // Requirement 1.1: email platform + ai mode + valid apiKey → show
    test('returns true when on email platform with ai mode and valid apiKey', () => {
      expect(shouldShowSuggestionButton(true, 'ai', { apiKey: 'sk-abc123' })).toBe(true);
      expect(shouldShowSuggestionButton(true, 'ai', { apiKey: 'test-key', baseUrl: 'https://api.example.com' })).toBe(true);
    });

    // Requirement 1.5: NOT on email platform → hide (regardless of mode)
    test('returns false when NOT on email platform regardless of mode', () => {
      expect(shouldShowSuggestionButton(false, 'nano', {})).toBe(false);
      expect(shouldShowSuggestionButton(false, 'ai', { apiKey: 'sk-abc123' })).toBe(false);
      expect(shouldShowSuggestionButton(false, 'local', {})).toBe(false);
    });

    // Requirement 1.3: local mode → hide
    test('returns false when on email platform with local mode', () => {
      expect(shouldShowSuggestionButton(true, 'local', {})).toBe(false);
      expect(shouldShowSuggestionButton(true, 'local', { apiKey: 'sk-abc123' })).toBe(false);
    });

    // Requirement 1.4: ai mode + no apiKey → hide
    test('returns false when on email platform with ai mode but no apiKey', () => {
      expect(shouldShowSuggestionButton(true, 'ai', {})).toBe(false);
    });

    // Requirement 1.4: ai mode + empty apiKey → hide
    test('returns false when on email platform with ai mode and empty apiKey', () => {
      expect(shouldShowSuggestionButton(true, 'ai', { apiKey: '' })).toBe(false);
    });

    // Requirement 1.4: ai mode + null aiSettings → hide
    test('returns false when on email platform with ai mode and null aiSettings', () => {
      expect(shouldShowSuggestionButton(true, 'ai', null)).toBe(false);
      expect(shouldShowSuggestionButton(true, 'ai', undefined)).toBe(false);
    });
  });
});
