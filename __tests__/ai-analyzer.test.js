'use strict';

const { describe, test, expect, beforeEach, jest: jestGlobal } = require('@jest/globals');
const fs = require('fs');
const path = require('path');

// Load module
const aiAnalyzerCode = fs.readFileSync(path.join(__dirname, '../src/analysis/ai-analyzer.js'), 'utf8');
eval(aiAnalyzerCode);

const testWhitelist = require('./fixtures/test-whitelist');

describe('AIAnalyzer', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('analyzeWithAI', () => {
    test('should successfully analyze email with AI', async () => {
      const mockResponse = {
        category: 'notification',
        tags: ['github', 'pull request'],
        safetyScore: 95,
        issues: [],
        detectedServices: ['GitHub'],
        flags: []
      };

      global.fetch = jestGlobal.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: JSON.stringify(mockResponse)
            }
          }]
        })
      });

      const emailData = {
        subject: 'Pull request merged',
        sender: 'GitHub',
        senderEmail: 'noreply@github.com',
        body: 'Your pull request was merged',
        links: ['https://github.com/user/repo/pull/42']
      };

      const aiSettings = {
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'test-key',
        model: 'gpt-4o-mini'
      };

      const result = await AIAnalyzer.analyzeWithAI(emailData, aiSettings, testWhitelist);

      expect(result.category).toBe('notification');
      expect(result.safetyScore).toBe(95);
      expect(result.tags).toContain('github');
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    test('should handle AI API error', async () => {
      global.fetch = jestGlobal.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      });

      const emailData = {
        subject: 'Test',
        sender: 'User',
        senderEmail: 'user@example.com',
        body: 'Test body',
        links: []
      };

      const aiSettings = {
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'test-key',
        model: 'gpt-4o-mini'
      };

      await expect(
        AIAnalyzer.analyzeWithAI(emailData, aiSettings, testWhitelist)
      ).rejects.toThrow('AI API error');
    });

    test('should handle empty AI response', async () => {
      global.fetch = jestGlobal.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: ''
            }
          }]
        })
      });

      const emailData = {
        subject: 'Test',
        sender: 'User',
        senderEmail: 'user@example.com',
        body: 'Test body',
        links: []
      };

      const aiSettings = {
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'test-key',
        model: 'gpt-4o-mini'
      };

      await expect(
        AIAnalyzer.analyzeWithAI(emailData, aiSettings, testWhitelist)
      ).rejects.toThrow('Empty response');
    });

    test('should handle invalid JSON in AI response', async () => {
      global.fetch = jestGlobal.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: 'This is not JSON'
            }
          }]
        })
      });

      const emailData = {
        subject: 'Test',
        sender: 'User',
        senderEmail: 'user@example.com',
        body: 'Test body',
        links: []
      };

      const aiSettings = {
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'test-key',
        model: 'gpt-4o-mini'
      };

      await expect(
        AIAnalyzer.analyzeWithAI(emailData, aiSettings, testWhitelist)
      ).rejects.toThrow('No JSON found');
    });

    test('should extract JSON from AI response with extra text', async () => {
      const mockResponse = {
        category: 'work',
        tags: ['meeting'],
        safetyScore: 90,
        issues: [],
        detectedServices: [],
        flags: []
      };

      global.fetch = jestGlobal.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: `Here is the analysis:\n${JSON.stringify(mockResponse)}\nEnd of analysis.`
            }
          }]
        })
      });

      const emailData = {
        subject: 'Meeting tomorrow',
        sender: 'Boss',
        senderEmail: 'boss@company.com',
        body: 'Let\'s meet at 3pm',
        links: []
      };

      const aiSettings = {
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'test-key',
        model: 'gpt-4o-mini'
      };

      const result = await AIAnalyzer.analyzeWithAI(emailData, aiSettings, testWhitelist);

      expect(result.category).toBe('work');
      expect(result.safetyScore).toBe(90);
    });

    test('should include whitelist info in request', async () => {
      global.fetch = jestGlobal.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: JSON.stringify({
                category: 'notification',
                tags: [],
                safetyScore: 100,
                issues: [],
                detectedServices: [],
                flags: []
              })
            }
          }]
        })
      });

      const emailData = {
        subject: 'Test',
        sender: 'User',
        senderEmail: 'user@example.com',
        body: 'Test body',
        links: []
      };

      const aiSettings = {
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'test-key',
        model: 'gpt-4o-mini'
      };

      await AIAnalyzer.analyzeWithAI(emailData, aiSettings, testWhitelist);

      const fetchCall = global.fetch.mock.calls[0];
      const requestBody = JSON.parse(fetchCall[1].body);
      const userMessage = requestBody.messages[1].content;

      expect(userMessage).toContain('Known trusted services');
      expect(userMessage).toContain('Public email domains');
      expect(userMessage).toContain('suspicious/temporary email services');
    });

    test('should truncate long email body', async () => {
      global.fetch = jestGlobal.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: JSON.stringify({
                category: 'other',
                tags: [],
                safetyScore: 100,
                issues: [],
                detectedServices: [],
                flags: []
              })
            }
          }]
        })
      });

      const longBody = 'a'.repeat(2000);
      const emailData = {
        subject: 'Test',
        sender: 'User',
        senderEmail: 'user@example.com',
        body: longBody,
        links: []
      };

      const aiSettings = {
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'test-key',
        model: 'gpt-4o-mini'
      };

      await AIAnalyzer.analyzeWithAI(emailData, aiSettings, testWhitelist);

      const fetchCall = global.fetch.mock.calls[0];
      const requestBody = JSON.parse(fetchCall[1].body);
      const userMessage = requestBody.messages[1].content;

      // Body should be truncated to 1000 chars
      expect(userMessage.length).toBeLessThan(longBody.length + 500);
    });

    test('should limit links to 10', async () => {
      global.fetch = jestGlobal.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: JSON.stringify({
                category: 'other',
                tags: [],
                safetyScore: 100,
                issues: [],
                detectedServices: [],
                flags: []
              })
            }
          }]
        })
      });

      const manyLinks = Array.from({ length: 20 }, (_, i) => `https://example.com/link${i}`);
      const emailData = {
        subject: 'Test',
        sender: 'User',
        senderEmail: 'user@example.com',
        body: 'Many links',
        links: manyLinks
      };

      const aiSettings = {
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'test-key',
        model: 'gpt-4o-mini'
      };

      await AIAnalyzer.analyzeWithAI(emailData, aiSettings, testWhitelist);

      const fetchCall = global.fetch.mock.calls[0];
      const requestBody = JSON.parse(fetchCall[1].body);
      const userMessage = requestBody.messages[1].content;

      // Should only include first 10 links
      expect(userMessage).toContain('link9');
      expect(userMessage).not.toContain('link10');
    });
  });
});
