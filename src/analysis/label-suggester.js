'use strict';

const LabelSuggester = (() => {

  // ── Constants ──────────────────────────────────────────────────────────
  const MAX_SUGGESTIONS = 5;
  const MAX_EMAILS_IN_PROMPT = 30;
  const MAX_SUBJECT_LENGTH = 100;
  const CACHE_TTL_MS = 86400000;        // 24 hours
  const DISMISS_TTL_MS = 2592000000;    // 30 days
  const MIN_UNCATEGORIZED = 3;
  const DRIFT_THRESHOLD = 0.3;

  // ── Icon mapping: keyword → icon name ─────────────────────────────────
  const ICON_MAPPING = {
    'send':     ['travel', 'flight', 'booking', 'trip', 'hotel', 'airline', 'vacation'],
    'work':     ['work', 'meeting', 'project', 'office', 'team', 'deadline', 'report'],
    'attach_money': ['finance', 'bank', 'payment', 'invoice', 'receipt', 'bill', 'tax', 'money'],
    'shopping_cart': ['shopping', 'order', 'delivery', 'purchase', 'store', 'buy', 'cart'],
    'school':   ['education', 'school', 'course', 'class', 'university', 'learn', 'study'],
    'favorite': ['social', 'friend', 'family', 'birthday', 'party', 'event', 'invitation'],
    'notifications': ['newsletter', 'update', 'digest', 'weekly', 'daily', 'subscription', 'alert'],
    'security': ['security', 'password', 'verify', 'authentication', 'login', 'account'],
    'local_hospital': ['health', 'medical', 'doctor', 'appointment', 'pharmacy', 'insurance'],
    'code':     ['developer', 'github', 'code', 'deploy', 'build', 'release', 'bug']
  };

  // ── Label colors: icon → { color, bgColor } ──────────────────────────
  const LABEL_COLORS = {
    'send':          { color: '#0277bd', bgColor: '#e1f5fe' },
    'work':          { color: '#4527a0', bgColor: '#ede7f6' },
    'attach_money':  { color: '#2e7d32', bgColor: '#e8f5e9' },
    'shopping_cart': { color: '#e65100', bgColor: '#fff3e0' },
    'school':        { color: '#1565c0', bgColor: '#e3f2fd' },
    'favorite':      { color: '#c62828', bgColor: '#ffebee' },
    'notifications': { color: '#6a1b9a', bgColor: '#f3e5f5' },
    'security':      { color: '#bf360c', bgColor: '#fbe9e7' },
    'local_hospital':{ color: '#00695c', bgColor: '#e0f2f1' },
    'code':          { color: '#37474f', bgColor: '#eceff1' },
    'tag':           { color: '#1976d2', bgColor: '#e3f2fd' }
  };

  // ── Internal state ────────────────────────────────────────────────────
  // (reserved for future use by subsequent tasks)

  // ── Debug logging helper ──────────────────────────────────────────────
  const D = {
    log: function() { if (typeof window !== 'undefined' && window.__aegisDebug) console.log('[Aegis][LabelSuggester]', ...arguments); },
    warn: function() { if (typeof window !== 'undefined' && window.__aegisDebug) console.warn('[Aegis][LabelSuggester]', ...arguments); }
  };

  // ── Internal helpers ──────────────────────────────────────────────────

  /**
   * Returns true if the email has no meaningful category assigned.
   * Checks for missing category, id === 'other', or name === 'Other'/'其他'.
   */
  function _isUncategorized(email) {
    if (!email || !email.category) return true;
    const cat = email.category;
    if (cat.id === 'other') return true;
    const name = (cat.name || '').trim();
    if (name === 'Other' || name === '其他') return true;
    return false;
  }

  /**
   * Constructs the LLM system prompt including existing labels to avoid.
   * @param {string[]} existingLabels
   * @returns {string}
   */
  function _buildSystemPrompt(existingLabels) {
    var lines = [];
    lines.push('You are an email organization assistant. Analyze the provided email subjects and suggest new labels that represent recurring themes or patterns found across multiple emails.');
    lines.push('');
    lines.push('Rules:');
    lines.push('- Suggest between 3 and 8 new label names.');
    lines.push('- Each label name must be concise: 1-3 words maximum.');
    lines.push('- Do NOT suggest icons, colors, or any metadata beyond the label name.');
    lines.push('- Do NOT duplicate any existing label listed below.');
    lines.push('');
    if (existingLabels && existingLabels.length > 0) {
      lines.push('Existing labels to avoid duplicating:');
      for (var i = 0; i < existingLabels.length; i++) {
        lines.push('- ' + existingLabels[i]);
      }
      lines.push('');
    }
    lines.push('Return your response as JSON in this exact format:');
    lines.push('{ "suggestions": ["label1", "label2", ...] }');
    return lines.join('\n');
  }

  /**
   * Constructs the LLM user prompt with email metadata.
   * Enforces MAX_EMAILS_IN_PROMPT, MAX_SUBJECT_LENGTH, and 4000 char total budget.
   * @param {Array} emails
   * @returns {string}
   */
  function _buildUserPrompt(emails) {
    var PROMPT_CHAR_BUDGET = 4000;
    var header = 'Here are the inbox emails to analyze. Suggest new labels based on recurring themes:\n\n';

    // Limit to MAX_EMAILS_IN_PROMPT
    var limited = emails.slice(0, MAX_EMAILS_IN_PROMPT);

    // Build email entries with truncated subjects
    var entries = [];
    for (var i = 0; i < limited.length; i++) {
      var email = limited[i];
      var subject = (email.subject || '').substring(0, MAX_SUBJECT_LENGTH);
      var sender = email.sender || '';
      var senderEmail = email.senderEmail || '';
      entries.push({
        id: email.id,
        subject: subject,
        sender: sender,
        senderEmail: senderEmail
      });
    }

    // Enforce total prompt character budget by trimming entries from the end
    var jsonStr = JSON.stringify(entries, null, 0);
    var fullPrompt = header + jsonStr;
    while (fullPrompt.length > PROMPT_CHAR_BUDGET && entries.length > 0) {
      entries.pop();
      jsonStr = JSON.stringify(entries, null, 0);
      fullPrompt = header + jsonStr;
    }

    return fullPrompt;
  }

  /**
   * Safely extracts suggestion objects from LLM response text.
   * Handles valid JSON, code-fenced JSON, non-JSON, partial JSON, wrong schema.
   * Always returns an array (empty on failure), never throws.
   * @param {*} responseText
   * @returns {Array<{name: string, rationale: string, emailIds: number[]}>}
   */
  function _parseResponse(responseText) {
    try {
      // Step 1: If input is not a string or is empty/whitespace, return []
      if (typeof responseText !== 'string' || responseText.trim().length === 0) {
        return [];
      }

      var parsed = null;

      // Step 2: Try to parse as JSON directly
      try {
        parsed = JSON.parse(responseText);
      } catch (e) {
        // Step 3: Try to extract JSON from code fences (```json ... ``` or ``` ... ```)
        var fenceMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (fenceMatch) {
          try {
            parsed = JSON.parse(fenceMatch[1].trim());
          } catch (e2) {
            // fall through
          }
        }

        // Step 4: Try to find a JSON object pattern in the text using brace counting
        if (!parsed) {
          var startIdx = responseText.indexOf('{');
          if (startIdx !== -1) {
            var depth = 0;
            var endIdx = -1;
            for (var i = startIdx; i < responseText.length; i++) {
              if (responseText[i] === '{') depth++;
              else if (responseText[i] === '}') {
                depth--;
                if (depth === 0) {
                  endIdx = i;
                  break;
                }
              }
            }
            if (endIdx !== -1) {
              try {
                parsed = JSON.parse(responseText.substring(startIdx, endIdx + 1));
              } catch (e3) {
                // fall through
              }
            }
          }
        }
      }

      // Step 5: Validate parsed object has a suggestions array
      if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.suggestions)) {
        return [];
      }

      var suggestions = parsed.suggestions;

      // Step 6: Filter and validate each suggestion
      var result = [];
      for (var j = 0; j < suggestions.length; j++) {
        var item = suggestions[j];

        // Handle string items (simple format: ["label1", "label2"])
        if (typeof item === 'string') {
          var trimmed = item.trim();
          if (trimmed.length > 0) {
            result.push(trimmed);
          }
          continue;
        }

        // Handle object items (rich format: [{ name, rationale, emailIds }])
        if (item && typeof item === 'object') {
          // Must have a non-empty string name after trimming
          if (typeof item.name !== 'string' || item.name.trim().length === 0) {
            continue;
          }
          // Must have a rationale string
          if (typeof item.rationale !== 'string' || item.rationale.length === 0) {
            continue;
          }
          // Must have a non-empty emailIds array of numbers only
          if (!Array.isArray(item.emailIds) || item.emailIds.length === 0) {
            continue;
          }
          var allNumbers = true;
          for (var k = 0; k < item.emailIds.length; k++) {
            if (typeof item.emailIds[k] !== 'number') {
              allNumbers = false;
              break;
            }
          }
          if (!allNumbers) {
            continue;
          }
          result.push({
            name: item.name,
            rationale: item.rationale,
            emailIds: item.emailIds
          });
          continue;
        }
      }

      return result;
    } catch (e) {
      // Step 8: On any error, return [] without throwing
      return [];
    }
  }

  /**
   * Filters suggestions by removing existing labels (case-insensitive),
   * dismissed names within 30-day window, and caps at MAX_SUGGESTIONS.
   * @param {Array} suggestions
   * @param {string[]} existingLabels
   * @param {Array} dismissedNames - Array of { name, dismissedAt }
   * @returns {Array}
   */
  function _filterSuggestions(suggestions, existingLabels, dismissedNames) {
    if (!Array.isArray(suggestions)) return [];

    // Step 1: Create a Set of existing labels (lowercased) for O(1) lookup
    var existingSet = new Set();
    if (Array.isArray(existingLabels)) {
      for (var i = 0; i < existingLabels.length; i++) {
        if (typeof existingLabels[i] === 'string') {
          existingSet.add(existingLabels[i].toLowerCase());
        }
      }
    }

    // Step 2: Build a map of dismissed names within the 30-day window
    var now = Date.now();
    var dismissedSet = new Set();
    if (Array.isArray(dismissedNames)) {
      for (var d = 0; d < dismissedNames.length; d++) {
        var entry = dismissedNames[d];
        if (entry && typeof entry.name === 'string' && typeof entry.dismissedAt === 'number') {
          var age = now - entry.dismissedAt;
          if (age < DISMISS_TTL_MS) {
            dismissedSet.add(entry.name.toLowerCase());
          }
        }
      }
    }

    // Step 3: Filter suggestions
    var result = [];
    for (var j = 0; j < suggestions.length; j++) {
      if (result.length >= MAX_SUGGESTIONS) break;

      var item = suggestions[j];
      var name;

      // Handle both string and object suggestions
      if (typeof item === 'string') {
        name = item;
      } else if (item && typeof item === 'object' && typeof item.name === 'string') {
        name = item.name;
      } else {
        continue;
      }

      var lowerName = name.toLowerCase();

      // Filter out suggestions matching existing labels (case-insensitive)
      if (existingSet.has(lowerName)) continue;

      // Filter out suggestions matching dismissed names within 30-day window
      if (dismissedSet.has(lowerName)) continue;

      result.push(item);
    }

    return result;
  }

  /**
   * Selects an icon name based on keyword matching against the label name.
   * @param {string} labelName
   * @returns {string}
   */
  function _selectIcon(labelName) {
    if (!labelName) return 'tag';
    const lower = labelName.toLowerCase();
    for (const [icon, keywords] of Object.entries(ICON_MAPPING)) {
      if (keywords.some(kw => lower.includes(kw))) {
        return icon;
      }
    }
    return 'tag';
  }

  /**
   * Returns color and bgColor for a given icon name.
   * @param {string} icon
   * @returns {{ color: string, bgColor: string }}
   */
  function _selectColors(icon) {
    return LABEL_COLORS[icon] || LABEL_COLORS['tag'];
  }

  /**
   * Enriches a parsed suggestion with icon, color, and bgColor.
   * Strips any extra fields, keeping only name, rationale, emailIds, icon, color, bgColor.
   * @param {{ name: string, rationale: string, emailIds: number[] }} suggestion
   * @returns {{ name: string, rationale: string, emailIds: number[], icon: string, color: string, bgColor: string }}
   */
  function _enrichSuggestion(suggestion) {
    const icon = _selectIcon(suggestion.name);
    const colors = _selectColors(icon);
    return {
      name: suggestion.name,
      rationale: suggestion.rationale,
      emailIds: suggestion.emailIds,
      icon: icon,
      color: colors.color,
      bgColor: colors.bgColor
    };
  }

  /**
   * Creates a normalized Set of email subjects for drift detection.
   * Trims and lowercases each subject, filters out empty strings.
   * @param {Array} emails
   * @returns {Set<string>}
   */
  function _hashEmailSubjects(emails) {
    var subjects = new Set();
    if (!Array.isArray(emails)) return subjects;
    for (var i = 0; i < emails.length; i++) {
      var email = emails[i];
      if (!email || typeof email.subject !== 'string') continue;
      var normalized = email.subject.trim().toLowerCase();
      if (normalized.length > 0) {
        subjects.add(normalized);
      }
    }
    return subjects;
  }

  /**
   * Calculates inbox change ratio between cached and current subjects.
   * Returns the proportion of current subjects not found in the cached set.
   * @param {Set<string>|Array} cachedSubjects
   * @param {Set<string>} currentSubjects
   * @returns {number} 0–1
   */
  function _computeDrift(cachedSubjects, currentSubjects) {
    if (!currentSubjects || currentSubjects.size === 0) return 0;
    // Ensure cachedSubjects is a Set for O(1) lookup
    var cachedSet = cachedSubjects instanceof Set ? cachedSubjects : new Set(cachedSubjects);
    var missingCount = 0;
    var totalCount = 0;
    for (var subj of currentSubjects) {
      totalCount++;
      if (!cachedSet.has(subj)) {
        missingCount++;
      }
    }
    if (totalCount === 0) return 0;
    return missingCount / totalCount;
  }

  /**
   * Checks whether the suggestion cache is still valid.
   * Valid if: cache exists, age < CACHE_TTL_MS, and drift ≤ DRIFT_THRESHOLD.
   * @param {object|null} cache
   * @param {Array} currentEmails
   * @returns {boolean}
   */
  function _isCacheValid(cache, currentEmails) {
    // Return false if cache is null/undefined or missing timestamp
    if (!cache || typeof cache.timestamp !== 'number') return false;

    // Check TTL: cache must be strictly less than 24h old
    var age = Date.now() - cache.timestamp;
    if (age >= CACHE_TTL_MS) return false;

    // Check drift: compute current subjects and compare with cached subjectHash
    var currentSubjects = _hashEmailSubjects(currentEmails || []);
    var cachedSubjects = cache.subjectHash instanceof Set
      ? cache.subjectHash
      : new Set(Array.isArray(cache.subjectHash) ? cache.subjectHash : []);
    var drift = _computeDrift(cachedSubjects, currentSubjects);
    if (drift > DRIFT_THRESHOLD) return false;

    return true;
  }

  // ── Public API ────────────────────────────────────────────────────────

  /**
   * Generates label suggestions using AI analysis of inbox emails.
   * @param {Array} emails
   * @param {string[]} existingLabels
   * @param {string} mode - 'ai' or 'nano'
   * @param {object} aiSettings
   * @returns {Promise<Array>}
   */
  async function generateSuggestions(emails, existingLabels, mode, aiSettings) {
    try {
      // 1. Return empty if fewer than MIN_UNCATEGORIZED uncategorized emails
      if (!Array.isArray(emails)) return [];
      var uncategorizedCount = 0;
      for (var i = 0; i < emails.length; i++) {
        if (_isUncategorized(emails[i])) {
          uncategorizedCount++;
        }
      }
      if (uncategorizedCount < MIN_UNCATEGORIZED) return [];

      // 2. Check cache validity; return cached suggestions if valid
      var cacheData = await new Promise(function(resolve) {
        chrome.storage.local.get(['aegis_suggestion_cache'], resolve);
      });
      var cache = cacheData && cacheData.aegis_suggestion_cache;
      if (_isCacheValid(cache, emails)) {
        D.log('Returning cached suggestions');
        return cache.suggestions || [];
      }

      // 3. Build prompts
      var systemPrompt = _buildSystemPrompt(existingLabels || []);
      var userPrompt = _buildUserPrompt(emails);

      // 4. Branch on mode and get raw response
      var rawResponse = null;

      if (mode === 'ai') {
        // AI mode: send AI_SUGGEST_LABELS message to background
        rawResponse = await new Promise(function(resolve) {
          chrome.runtime.sendMessage({
            type: 'AI_SUGGEST_LABELS',
            systemPrompt: systemPrompt,
            userPrompt: userPrompt,
            settings: aiSettings
          }, function(response) {
            if (chrome.runtime.lastError) {
              D.warn('sendMessage error:', chrome.runtime.lastError.message);
              resolve(null);
              return;
            }
            resolve(response);
          });
        });
      } else if (mode === 'nano') {
        // Nano mode: use LanguageModel API directly
        var session = null;
        try {
          // Chrome 138+: global LanguageModel
          if (typeof LanguageModel !== 'undefined') {
            session = await LanguageModel.create({ systemPrompt: systemPrompt });
          } else if (typeof self !== 'undefined' && self.ai && self.ai.languageModel) {
            // Chrome 131-137: self.ai.languageModel
            session = await self.ai.languageModel.create({ systemPrompt: systemPrompt });
          } else {
            D.warn('Nano LanguageModel API not available');
            return [];
          }
          var nanoResult = await session.prompt(userPrompt);
          rawResponse = nanoResult;
        } catch (nanoErr) {
          D.warn('Nano session error:', nanoErr);
          return [];
        } finally {
          if (session && typeof session.destroy === 'function') {
            session.destroy();
          }
        }
      } else {
        // Unknown mode
        return [];
      }

      // 5. Handle error responses or null
      if (!rawResponse) return [];
      if (rawResponse && rawResponse.error) return [];

      // 6. Parse response — handle both string and object responses
      var responseText = typeof rawResponse === 'string'
        ? rawResponse
        : JSON.stringify(rawResponse);
      var parsed = _parseResponse(responseText);
      if (!parsed || parsed.length === 0) return [];

      // 7. Get dismissed suggestions from chrome.storage.local
      var dismissedData = await new Promise(function(resolve) {
        chrome.storage.local.get(['aegis_dismissed_suggestions'], resolve);
      });
      var dismissed = (dismissedData && dismissedData.aegis_dismissed_suggestions) || [];

      // 8. Filter suggestions
      var filtered = _filterSuggestions(parsed, existingLabels || [], dismissed);

      // 9. Enrich each suggestion with icon, color, bgColor
      var enriched = [];
      for (var j = 0; j < filtered.length; j++) {
        var item = filtered[j];
        if (typeof item === 'string') {
          // String suggestions: wrap in object for enrichment
          var icon = _selectIcon(item);
          var colors = _selectColors(icon);
          enriched.push({
            name: item,
            icon: icon,
            color: colors.color,
            bgColor: colors.bgColor
          });
        } else if (item && typeof item === 'object' && item.name) {
          enriched.push(_enrichSuggestion(item));
        }
      }

      // 10. Cache results to chrome.storage.local
      try {
        var cacheEntry = {
          timestamp: Date.now(),
          subjectHash: Array.from(_hashEmailSubjects(emails)),
          suggestions: enriched,
          emailCount: emails.length
        };
        await new Promise(function(resolve) {
          chrome.storage.local.set({ aegis_suggestion_cache: cacheEntry }, resolve);
        });
      } catch (cacheErr) {
        D.warn('Cache write error:', cacheErr);
        // Continue — caching failure is non-fatal
      }

      // 11. Return enriched suggestions
      return enriched;
    } catch (e) {
      // On any error: return []
      D.warn('generateSuggestions error:', e);
      return [];
    }
  }

  /**
   * Returns cached suggestions if available, null otherwise.
   * @returns {Promise<Array|null>}
   */
  async function getCachedSuggestions() {
    try {
      var data = await new Promise(function(r) {
        chrome.storage.local.get('aegis_suggestion_cache', r);
      });
      var cache = data && data.aegis_suggestion_cache;
      if (cache && cache.suggestions) {
        return cache.suggestions;
      }
      return null;
    } catch (e) {
      D.warn('getCachedSuggestions error:', e);
      return null;
    }
  }

  /**
   * Dismisses a suggestion by name, suppressing it for 30 days.
   * If the name already exists (case-insensitive), updates its dismissedAt timestamp.
   * If the name doesn't exist, adds a new entry.
   * @param {string} labelName
   * @returns {Promise<void>}
   */
  async function dismissSuggestion(labelName) {
    try {
      // Read current dismissed list from chrome.storage.local
      var data = await new Promise(function(resolve) {
        chrome.storage.local.get(['aegis_dismissed_suggestions'], resolve);
      });
      var dismissed = (data && data.aegis_dismissed_suggestions) || [];
      if (!Array.isArray(dismissed)) dismissed = [];

      // Check if name already exists (case-insensitive)
      var lowerName = labelName.toLowerCase();
      var found = false;
      for (var i = 0; i < dismissed.length; i++) {
        if (dismissed[i] && typeof dismissed[i].name === 'string' &&
            dismissed[i].name.toLowerCase() === lowerName) {
          // Update existing entry's timestamp
          dismissed[i].dismissedAt = Date.now();
          found = true;
          break;
        }
      }

      // If not found, add new entry
      if (!found) {
        dismissed.push({ name: labelName, dismissedAt: Date.now() });
      }

      // Write updated list back to chrome.storage.local
      await new Promise(function(resolve) {
        chrome.storage.local.set({ aegis_dismissed_suggestions: dismissed }, resolve);
      });
    } catch (e) {
      D.warn('dismissSuggestion error:', e);
      // Handle errors gracefully — don't throw
    }
  }

  // ── Internal session state ────────────────────────────────────────────
  var _nanoSession = null;

  /**
   * Cleans up any session state (e.g., nano session reference).
   */
  function destroy() {
    if (_nanoSession && typeof _nanoSession.destroy === 'function') {
      try {
        _nanoSession.destroy();
      } catch (e) {
        D.warn('destroy session error:', e);
      }
    }
    _nanoSession = null;
  }

  // ── Return public API + test-visible internals ────────────────────────
  return {
    // Public methods
    generateSuggestions,
    getCachedSuggestions,
    dismissSuggestion,
    destroy,

    // Internal helpers (exposed with _ prefix for testability)
    _buildSystemPrompt,
    _buildUserPrompt,
    _parseResponse,
    _filterSuggestions,
    _hashEmailSubjects,
    _computeDrift,
    _isCacheValid,
    _isUncategorized,
    _enrichSuggestion,
    _selectIcon,
    _selectColors,

    // Exposed constants for testability
    _MAX_SUGGESTIONS: MAX_SUGGESTIONS,
    _MAX_EMAILS_IN_PROMPT: MAX_EMAILS_IN_PROMPT,
    _MAX_SUBJECT_LENGTH: MAX_SUBJECT_LENGTH,
    _CACHE_TTL_MS: CACHE_TTL_MS,
    _DISMISS_TTL_MS: DISMISS_TTL_MS,
    _MIN_UNCATEGORIZED: MIN_UNCATEGORIZED,
    _DRIFT_THRESHOLD: DRIFT_THRESHOLD,
    _ICON_MAPPING: ICON_MAPPING,
    _LABEL_COLORS: LABEL_COLORS
  };
})();

window.LabelSuggester = LabelSuggester;
