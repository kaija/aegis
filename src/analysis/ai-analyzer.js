'use strict';

const AIAnalyzer = (() => {

  async function analyzeWithAI(emailData, aiSettings, whitelist) {
    const { baseUrl, apiKey, model } = aiSettings;

    const systemPrompt = `You are an email security and categorization assistant. Analyze the email for:
1. Category classification
2. Security issues (phishing, spoofing, suspicious links)
3. Service identification - detect if the email mentions well-known services (banks, tech companies, etc.)
4. Domain validation - check if sender domain and link domains match the claimed service
5. Sender type - identify if sender uses public email (Gmail, Yahoo, etc.) or suspicious temporary email services

Respond with ONLY valid JSON in this exact format:
{
  "category": "category name",
  "tags": ["tag1", "tag2"],
  "safetyScore": 85,
  "issues": ["issue description"],
  "detectedServices": ["service1", "service2"],
  "flags": ["public_email", "suspicious_domain"]
}

safetyScore is 0-100 where 100 is completely safe. Deduct points for:
- Temporary/disposable email services (-30 points)
- Mismatched sender domain vs claimed service (-25 points)
- Links to domains not matching claimed service (-25 points per link, max -40)
- Suspicious keywords or urgency tactics (-10 points each, max -30)
- HTTP links (-5 points each, max -15)

Flags can include:
- "public_email": Sender uses public email service (Gmail, Yahoo, Outlook, etc.)
- "suspicious_domain": Sender uses temporary/disposable email service
- "potential_spoof": Content mentions a service but sender/links don't match

Do not include any text outside the JSON.`;

    const userMessage = buildUserMessage(emailData, whitelist);

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

  function buildUserMessage(emailData, whitelist) {
    const { subject = '', sender = '', senderEmail = '', body = '', links = [] } = emailData;

    let whitelistInfo = '';
    if (whitelist && whitelist.services) {
      const serviceNames = whitelist.services.map(s => s.name).join(', ');
      whitelistInfo = `\n\nKnown trusted services: ${serviceNames}`;
    }

    let publicEmailInfo = '';
    if (whitelist && whitelist.publicEmailDomains) {
      publicEmailInfo = `\n\nPublic email domains: ${whitelist.publicEmailDomains.slice(0, 10).join(', ')}...`;
    }

    let suspiciousInfo = '';
    if (whitelist && whitelist.suspiciousDomains) {
      suspiciousInfo = `\n\nKnown suspicious/temporary email services: ${whitelist.suspiciousDomains.slice(0, 10).join(', ')}...`;
    }

    return `Subject: ${subject}
From: ${sender} <${senderEmail}>

Body:
${body.slice(0, 1000)}

Links:
${links.slice(0, 10).join('\n')}${whitelistInfo}${publicEmailInfo}${suspiciousInfo}`;
  }

  return { analyzeWithAI };
})();

window.AIAnalyzer = AIAnalyzer;
