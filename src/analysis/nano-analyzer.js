'use strict';

const NanoAnalyzer = (() => {

  // ── Internal state ───────────────────────────────────────────────────────
  let _session = null;
  let _sessionType = null; // 'batch' | 'single'

  // ── Response constraint schemas ──────────────────────────────────────────
  const BATCH_RESPONSE_SCHEMA = {
    type: 'object',
    properties: {
      results: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'number' },
            category: { type: 'string' }
          },
          required: ['id', 'category']
        }
      }
    },
    required: ['results']
  };

  const SINGLE_RESPONSE_SCHEMA = {
    type: 'object',
    properties: {
      category: { type: 'string' },
      tags: { type: 'array', items: { type: 'string' } },
      safetyScore: { type: 'number' },
      issues: { type: 'array', items: { type: 'string' } },
      detectedServices: { type: 'array', items: { type: 'string' } },
      flags: { type: 'array', items: { type: 'string' } }
    },
    required: ['category', 'tags', 'safetyScore', 'issues', 'detectedServices', 'flags']
  };

  // ── 1.2: checkAvailability ────────────────────────────────────────────────
  async function checkAvailability() {
    try {
      if (typeof LanguageModel === 'undefined') {
        return 'no-api';
      }
      const status = await LanguageModel.availability();
      return status;
    } catch (e) {
      console.warn('[Aegis] Nano availability check failed:', e);
      return 'unavailable';
    }
  }

  // ── 1.3: Session lifecycle helpers ──────────────────────────────────────
  function _buildSystemPrompt(type, availableCategories) {
    if (type === 'batch') {
      const categoryList = availableCategories && availableCategories.length > 0
        ? availableCategories.join(', ')
        : '';
      return `You are an email categorization assistant. Categorize each email into one of these categories: ${categoryList}. Respond with JSON containing a "results" array where each element has "id" (number) and "category" (string).`;
    }
    // single analysis
    return `You are an email security and categorization assistant. Analyze the email for:
1. Category classification
2. Security issues (phishing, spoofing, suspicious links)
3. Service identification
4. Safety scoring (0-100, where 100 is completely safe)

Respond with JSON containing: category (string), tags (array of strings), safetyScore (number 0-100), issues (array of strings), detectedServices (array of strings), flags (array of strings).`;
  }

  async function _getOrCreateSession(type, availableCategories) {
    // Reuse existing session if type matches and context usage < 80%
    if (_session && _sessionType === type) {
      if (_checkContextUsage()) {
        return _session;
      }
      // Context exceeded 80%, destroy and recreate
      try { _session.destroy(); } catch (e) { /* ignore */ }
      _session = null;
      _sessionType = null;
    }

    // Different type requested, destroy old session
    if (_session && _sessionType !== type) {
      try { _session.destroy(); } catch (e) { /* ignore */ }
      _session = null;
      _sessionType = null;
    }

    const systemPrompt = _buildSystemPrompt(type, availableCategories);
    _session = await LanguageModel.create({
      initialPrompts: [
        { role: 'system', content: systemPrompt }
      ]
    });
    _sessionType = type;
    return _session;
  }

  function _checkContextUsage() {
    if (!_session) return false;
    // contextUsage is a fraction 0-1
    return _session.contextUsage < 0.8;
  }

  // ── 1.4: batchAnalyze ────────────────────────────────────────────────────
  async function batchAnalyze(emails, availableCategories) {
    try {
      if (!emails || emails.length === 0) {
        return { results: [] };
      }

      const session = await _getOrCreateSession('batch', availableCategories);
      const CHUNK_SIZE = 10;
      const allResults = [];

      for (let i = 0; i < emails.length; i += CHUNK_SIZE) {
        const chunk = emails.slice(i, i + CHUNK_SIZE);
        const emailMetadata = chunk.map(e => ({
          id: e.id,
          subject: e.subject,
          sender: e.sender,
          senderEmail: e.senderEmail
        }));

        const userPrompt = JSON.stringify(emailMetadata);
        const responseText = await session.prompt(userPrompt, {
          responseConstraint: BATCH_RESPONSE_SCHEMA
        });

        const parsed = JSON.parse(responseText);
        if (parsed.results && Array.isArray(parsed.results)) {
          allResults.push(...parsed.results);
        }

        // Check context usage after each chunk, rotate if needed
        if (!_checkContextUsage() && i + CHUNK_SIZE < emails.length) {
          try { _session.destroy(); } catch (e) { /* ignore */ }
          _session = null;
          _sessionType = null;
          // Recreate session for remaining chunks
          await _getOrCreateSession('batch', availableCategories);
        }
      }

      return { results: allResults };
    } catch (e) {
      console.warn('[Aegis] Nano batch analysis failed:', e);
      return { results: [] };
    }
  }

  // ── 1.5: analyzeEmail ──────────────────────────────────────────────────
  async function analyzeEmail(emailData) {
    const { subject = '', sender = '', senderEmail = '', body = '', links = [] } = emailData;

    const session = await _getOrCreateSession('single');

    const truncatedBody = body.slice(0, 1000);
    const truncatedLinks = links.slice(0, 10);

    const userPrompt = `Subject: ${subject}
From: ${sender} <${senderEmail}>

Body:
${truncatedBody}

Links:
${truncatedLinks.join('\n')}`;

    const responseText = await session.prompt(userPrompt, {
      responseConstraint: SINGLE_RESPONSE_SCHEMA
    });

    const parsed = JSON.parse(responseText);

    // Validate required fields
    if (typeof parsed.category !== 'string' ||
        !Array.isArray(parsed.tags) ||
        typeof parsed.safetyScore !== 'number' ||
        !Array.isArray(parsed.issues) ||
        !Array.isArray(parsed.detectedServices) ||
        !Array.isArray(parsed.flags)) {
      throw new Error('Invalid response shape from Nano AI');
    }

    return {
      category: parsed.category,
      tags: parsed.tags,
      safetyScore: parsed.safetyScore,
      issues: parsed.issues,
      detectedServices: parsed.detectedServices,
      flags: parsed.flags
    };
  }

  // ── 1.6: destroy ──────────────────────────────────────────────────────
  function destroy() {
    if (_session) {
      try { _session.destroy(); } catch (e) { /* ignore */ }
      _session = null;
      _sessionType = null;
    }
  }

  return { checkAvailability, batchAnalyze, analyzeEmail, destroy };
})();

window.NanoAnalyzer = NanoAnalyzer;
