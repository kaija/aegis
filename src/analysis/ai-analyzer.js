'use strict';

const AIAnalyzer = (() => {

  async function analyzeWithAI(emailData, aiSettings) {
    const { baseUrl, apiKey, model } = aiSettings;

    const systemPrompt = 'You are an email security and categorization assistant. Analyze the email and respond with ONLY valid JSON in this exact format: { "category": "category name", "tags": ["tag1", "tag2"], "safetyScore": 85, "issues": ["issue description"] }. safetyScore is 0-100 where 100 is completely safe. Do not include any text outside the JSON.';

    const userMessage = buildUserMessage(emailData);

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: model || 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage }
        ],
        max_completion_tokens: 3000
      })
    });

    if (!response.ok) {
      throw new Error(`AI API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('Empty response from AI API');
    }

    // Parse JSON response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in AI response');
    }

    return JSON.parse(jsonMatch[0]);
  }

  function buildUserMessage(emailData) {
    const { subject = '', sender = '', senderEmail = '', body = '', links = [] } = emailData;
    return `Subject: ${subject}
From: ${sender} <${senderEmail}>

Body:
${body.slice(0, 1000)}

Links:
${links.slice(0, 10).join('\n')}`;
  }

  return { analyzeWithAI };
})();

window.AIAnalyzer = AIAnalyzer;
