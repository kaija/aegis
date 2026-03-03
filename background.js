const DEFAULT_SETTINGS = {
  analysisMode: 'local',
  aiSettings: {
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '',
    model: 'gpt-5-nano-2025-08-07'
  },
  categories: [
    { id: 'work', name: '工作', emoji: '💼', color: '#4285f4', bgColor: '#e8f0fe', keywords: ['meeting', '會議', 'project', '專案', 'deadline', 'invoice', '發票', 'report', '報告'] },
    { id: 'shopping', name: '購物', emoji: '🛍', color: '#ff6d00', bgColor: '#fff3e0', keywords: ['order', '訂單', 'shipping', '出貨', 'receipt', 'purchase', 'delivery', '配送'] },
    { id: 'finance', name: '財務', emoji: '💰', color: '#00897b', bgColor: '#e0f2f1', keywords: ['payment', '付款', 'bank', '銀行', 'transfer', '帳單', 'bill', 'credit', 'invoice'] },
    { id: 'social', name: '社交', emoji: '👥', color: '#9c27b0', bgColor: '#f3e5f5', keywords: ['invitation', '邀請', 'follow', 'friend', 'connect', 'linkedin', 'facebook'] },
    { id: 'promotions', name: '促銷', emoji: '🎁', color: '#e91e63', bgColor: '#fce4ec', keywords: ['sale', '特價', 'discount', '折扣', 'offer', '優惠', 'promo', 'newsletter'] },
    { id: 'security', name: '安全', emoji: '🔐', color: '#f44336', bgColor: '#ffebee', keywords: ['verify', '驗證', 'password', '密碼', 'secure', 'unauthorized', 'breach', 'phishing'] },
    { id: 'notifications', name: '通知', emoji: '🔔', color: '#607d8b', bgColor: '#eceff1', keywords: ['notification', '通知', 'alert', 'update', 'reminder', 'otp', 'confirm'] }
  ]
};

chrome.runtime.onInstalled.addListener(async () => {
  const existing = await chrome.storage.sync.get(null);
  const merged = {};

  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    if (!(key in existing)) {
      merged[key] = value;
    }
  }

  if (Object.keys(merged).length > 0) {
    await chrome.storage.sync.set(merged);
  }
});

function buildUserMessage(emailData) {
  return `Subject: ${emailData.subject}
From: ${emailData.sender} <${emailData.senderEmail}>

Body:
${(emailData.body || '').slice(0, 1000)}

Links:
${(emailData.links || []).slice(0, 10).join('\n')}`;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_SETTINGS') {
    chrome.storage.sync.get(null, (result) => {
      sendResponse(Object.assign({}, DEFAULT_SETTINGS, result));
    });
    return true;
  }

  if (message.type === 'AI_ANALYZE') {
    chrome.storage.sync.get(null, (result) => {
      const settings = Object.assign({}, DEFAULT_SETTINGS, result);

      const promptContent = buildUserMessage(message.emailData);
      console.log('========== [Aegis] AI Prompt ==========');
      const categoryListStr = message.availableCategories ? message.availableCategories.join(', ') : 'no specific categories';
      const batchSystemPrompt = `You are a fast email categorization assistant. Analyze the email sender and subject, and respond with ONLY valid JSON in this exact format: { "category": "category name" }. You MUST choose the most appropriate category strictly from this list: [${categoryListStr}]. Do not invent new categories.`;

      console.log('System: ' + batchSystemPrompt);
      console.log('User:\n' + promptContent);
      console.log('=======================================');

      fetch(settings.aiSettings.baseUrl + '/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + settings.aiSettings.apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: settings.aiSettings.model,
          messages: [
            {
              role: 'system',
              content: batchSystemPrompt
            },
            {
              role: 'user',
              content: promptContent
            }
          ],
          max_completion_tokens: 3000
        })
      })
        .then((res) => res.text())
        .then((rawText) => {
          console.log('\n\n========== [Aegis] RAW HTTP RESPONSE ==========');
          console.log(rawText);
          console.log('===============================================\n\n');

          let data;
          try {
            data = JSON.parse(rawText);
          } catch (e) {
            console.error('[Aegis] RAW Response is not valid JSON!');
            return sendResponse({ error: 'API returned non-JSON response' });
          }

          if (data.error) {
            console.error('[Aegis] API Error Response:', data.error);
            return sendResponse({ error: data.error.message || 'API Error' });
          }
          if (!data.choices || !data.choices[0] || !data.choices[0].message) {
            console.error('[Aegis] Unexpected API format:', data);
            return sendResponse({ error: 'Unexpected API response format' });
          }

          const content = data.choices[0].message.content;
          console.log('========== [Aegis] AI Content ==========');
          console.log(content);
          console.log('========================================');

          try {
            // Bulletproof JSON extraction: find the first { and last }
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
              throw new Error('No JSON object found in response');
            }
            const result = JSON.parse(jsonMatch[0]);
            sendResponse(result);
          } catch (e) {
            console.error('[Aegis] Invalid JSON Content:', content, e);
            sendResponse({ error: 'Invalid JSON from AI' });
          }
        })
        .catch((error) => {
          console.error('[Aegis] Fetch error:', error);
          sendResponse({ error: error.message });
        });
    });
    return true;
  }

  if (message.type === 'AI_BATCH_ANALYZE') {
    chrome.storage.sync.get(null, (result) => {
      const settings = Object.assign({}, DEFAULT_SETTINGS, result);

      const promptContent = JSON.stringify(message.batchData, null, 2);
      const categoryListStr = message.availableCategories ? message.availableCategories.join(', ') : 'no specific categories';
      const batchSystemPrompt = `You are a fast email categorization assistant. Analyze the following list of emails (provided as a JSON array). Respond with ONLY a valid JSON object containing a "results" array. Format: { "results": [ { "id": ID_NUMBER, "category": "category name" } ] }. You MUST map every id from the input to an output. You MUST choose the most appropriate category strictly from this list: [${categoryListStr}]. Do not invent new categories.`;

      console.log('System: ' + batchSystemPrompt);
      console.log('User:\n' + promptContent);
      console.log('=======================================');

      fetch(settings.aiSettings.baseUrl + '/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + settings.aiSettings.apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: settings.aiSettings.model,
          messages: [
            {
              role: 'system',
              content: batchSystemPrompt
            },
            {
              role: 'user',
              content: promptContent
            }
          ],
          max_completion_tokens: 3000
        })
      })
        .then((res) => res.text())
        .then((rawText) => {
          console.log('\n\n========== [Aegis] BATCH RAW HTTP RESPONSE ==========');
          console.log(rawText);
          console.log('===============================================\n\n');

          let data;
          try {
            data = JSON.parse(rawText);
          } catch (e) {
            console.error('[Aegis] BATCH RAW Response is not valid JSON!');
            return sendResponse({ error: 'API returned non-JSON response' });
          }

          if (data.error) {
            console.error('[Aegis] API Error Response:', data.error);
            return sendResponse({ error: data.error.message || 'API Error' });
          }
          if (!data.choices || !data.choices[0] || !data.choices[0].message) {
            console.error('[Aegis] Unexpected API format:', data);
            return sendResponse({ error: 'Unexpected API response format' });
          }

          const content = data.choices[0].message.content;

          try {
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (!jsonMatch) throw new Error('No JSON object found in response');
            const result = JSON.parse(jsonMatch[0]);
            sendResponse(result);
          } catch (e) {
            console.error('[Aegis] Invalid JSON Content:', content, e);
            sendResponse({ error: 'Invalid JSON from AI' });
          }
        })
        .catch((error) => {
          console.error('[Aegis] Fetch error:', error);
          sendResponse({ error: error.message });
        });
    });
    return true;
  }

  if (message.type === 'TEST_AI_API') {
    const { baseUrl, apiKey, model } = message.settings;
    fetch(baseUrl + '/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: model,
        messages: [{ role: 'user', content: 'hi' }],
        max_completion_tokens: 10
      })
    })
      .then(res => res.text())
      .then(rawText => {
        // Always return the exact, unparsed string for debugging realistic payload formatting
        sendResponse({ success: true, message: rawText });
      })
      .catch(e => sendResponse({ success: false, error: e.message }));
    return true;
  }
  if (message.type === 'FETCH_AI_MODELS') {
    const { baseUrl, apiKey } = message.settings;
    if (!baseUrl || !apiKey) {
      sendResponse({ success: false, error: '缺少 Base URL 或 API Key' });
      return true;
    }

    let fetchUrl = baseUrl.replace(/\/chat\/completions\/?$/, '');
    let headers = {
      'Content-Type': 'application/json'
    };

    if (baseUrl.includes('generative')) {
      // Gemini format (e.g. GET /v1beta/models?key=API_KEY)
      fetchUrl = fetchUrl + '/models?key=' + apiKey;
    } else {
      // Standard OpenAI compatible
      fetchUrl = fetchUrl + '/models';
      headers['Authorization'] = 'Bearer ' + apiKey;
    }

    fetch(fetchUrl, { method: 'GET', headers })
      .then(res => {
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        return res.json();
      })
      .then(data => {
        let models = [];
        if (data.data && Array.isArray(data.data)) { // OpenAI
          models = data.data.map(m => m.id);
        } else if (data.models && Array.isArray(data.models)) { // Gemini
          models = data.models.map(m => m.name.replace('models/', ''));
        } else {
          return sendResponse({ success: false, error: '無法解析模型清單格式' });
        }
        sendResponse({ success: true, models: models.sort() });
      })
      .catch(e => {
        console.error('[Aegis] FETCH_MODELS error:', e);
        sendResponse({ success: false, error: e.message });
      });

    return true;
  }

  if (message.type === 'SAVE_SETTINGS') {
    chrome.storage.sync.set(message.settings, () => {
      sendResponse({ ok: true });
    });
    return true;
  }
});
