'use strict';

const QuickReplyGenerator = (() => {

  // ── Internal state ───────────────────────────────────────────────────────
  let _session = null;

  // ── Response constraint schemas ──────────────────────────────────────────
  const REPLY_OPTIONS_SCHEMA = {
    type: 'object',
    properties: {
      emailType: { type: 'string' },
      replyOptions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            label: { type: 'string' },
            prefix: { type: 'string' }
          },
          required: ['label', 'prefix']
        }
      }
    },
    required: ['emailType', 'replyOptions']
  };

  const FULL_REPLY_SCHEMA = {
    type: 'object',
    properties: {
      reply: { type: 'string' }
    },
    required: ['reply']
  };

  // ── Session lifecycle helpers ────────────────────────────────────────────
  function _checkContextUsage() {
    if (!_session) return false;
    return _session.contextUsage < 0.8;
  }

  async function _getOrCreateSession() {
    // Reuse existing session if context usage < 80%
    if (_session) {
      if (_checkContextUsage()) {
        return _session;
      }
      // Context exceeded 80%, destroy and recreate
      try { _session.destroy(); } catch (e) { /* ignore */ }
      _session = null;
    }

    const systemPrompt = `You are an email reply assistant. You help users quickly reply to emails by:
1. Classifying the email type (e.g., "Meeting Request", "Loan Proposal", "Newsletter", "Invoice")
2. Generating 2-3 short reply option prefixes representing distinct reply intents
3. Expanding a selected prefix into a full 2-5 sentence contextual reply

Respond ONLY with valid JSON.`;

    _session = await LanguageModel.create({
      expectedInputLanguages: ['en', 'zh', 'ja'],
      expectedOutputLanguages: ['en'],
      initialPrompts: [
        { role: 'system', content: systemPrompt }
      ]
    });
    return _session;
  }

  // ── generateReplyOptions ─────────────────────────────────────────────────
  async function generateReplyOptions(emailData) {
    try {
      if (typeof LanguageModel === 'undefined') {
        console.warn('[Aegis] Quick Reply: Prompt API not available');
        return null;
      }

      const { subject = '', sender = '', body = '' } = emailData || {};
      const truncatedBody = body.slice(0, 2000);

      const session = await _getOrCreateSession();

      const userPrompt = `Classify this email and generate 2-3 quick reply options.

Subject: ${subject}
From: ${sender}

Body:
${truncatedBody}

Respond with JSON: { "emailType": "<type>", "replyOptions": [{ "label": "<short label>", "prefix": "<one sentence reply starter>" }] }
Generate exactly 2 to 3 reply options with distinct intents.`;

      let responseText;
      try {
        responseText = await session.prompt(userPrompt, {
          responseConstraint: REPLY_OPTIONS_SCHEMA
        });
      } catch (constraintErr) {
        console.warn('[Aegis] Quick Reply constrained prompt failed, retrying unconstrained:', constraintErr);
        responseText = await session.prompt(userPrompt);
      }

      const parsed = JSON.parse(responseText);

      // Validate required shape
      if (typeof parsed.emailType !== 'string' ||
          !Array.isArray(parsed.replyOptions)) {
        console.warn('[Aegis] Quick Reply: Invalid response shape');
        return null;
      }

      // Validate reply options count (must be 2-3)
      if (parsed.replyOptions.length < 2 || parsed.replyOptions.length > 3) {
        console.warn('[Aegis] Quick Reply: Invalid reply options count:', parsed.replyOptions.length);
        return null;
      }

      // Validate each option has label and prefix
      for (const opt of parsed.replyOptions) {
        if (typeof opt.label !== 'string' || typeof opt.prefix !== 'string') {
          console.warn('[Aegis] Quick Reply: Invalid reply option shape');
          return null;
        }
      }

      return {
        emailType: parsed.emailType,
        replyOptions: parsed.replyOptions
      };
    } catch (e) {
      console.warn('[Aegis] Quick Reply generation failed:', e);
      return null;
    }
  }

  // ── generateFullReply ────────────────────────────────────────────────────
  async function generateFullReply(emailData, selectedPrefix) {
    try {
      if (typeof LanguageModel === 'undefined') {
        console.warn('[Aegis] Quick Reply: Prompt API not available');
        return null;
      }

      const { subject = '', sender = '', body = '' } = emailData || {};
      const truncatedBody = body.slice(0, 2000);

      const session = await _getOrCreateSession();

      const userPrompt = `Expand this reply prefix into a full email reply of 2-5 sentences.

Original email:
Subject: ${subject}
From: ${sender}
Body:
${truncatedBody}

Reply prefix to expand: "${selectedPrefix}"

Write a complete, contextually appropriate reply that starts with or incorporates the prefix. Keep it professional and concise (2-5 sentences).
Respond with JSON: { "reply": "<full reply text>" }`;

      let responseText;
      try {
        responseText = await session.prompt(userPrompt, {
          responseConstraint: FULL_REPLY_SCHEMA
        });
      } catch (constraintErr) {
        console.warn('[Aegis] Quick Reply full reply constrained prompt failed, retrying unconstrained:', constraintErr);
        responseText = await session.prompt(userPrompt);
      }

      const parsed = JSON.parse(responseText);

      if (typeof parsed.reply !== 'string') {
        console.warn('[Aegis] Quick Reply: Invalid full reply response shape');
        return null;
      }

      return parsed.reply;
    } catch (e) {
      console.warn('[Aegis] Quick Reply full reply generation failed:', e);
      return null;
    }
  }

  // ── destroy ──────────────────────────────────────────────────────────────
  function destroy() {
    if (_session) {
      try { _session.destroy(); } catch (e) { /* ignore */ }
      _session = null;
    }
  }

  return { generateReplyOptions, generateFullReply, destroy };
})();

window.QuickReplyGenerator = QuickReplyGenerator;
