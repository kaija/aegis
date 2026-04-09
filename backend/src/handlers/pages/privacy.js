const PRIVACY_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Aegis — Privacy Policy</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#202124;background:#f8f9fa;line-height:1.7}
.container{max-width:800px;margin:0 auto;padding:40px 24px 80px}
h1{font-size:28px;font-weight:700;margin-bottom:8px}
.subtitle{color:#5f6368;font-size:14px;margin-bottom:32px}
h2{font-size:18px;font-weight:600;margin:28px 0 12px;color:#1a73e8}
h3{font-size:15px;font-weight:600;margin:20px 0 8px}
p,li{font-size:14px;color:#3c4043;margin-bottom:10px}
ul{padding-left:24px;margin-bottom:12px}
li{margin-bottom:6px}
table{width:100%;border-collapse:collapse;margin:12px 0 20px;font-size:13px}
th,td{text-align:left;padding:8px 12px;border:1px solid #e0e0e0}
th{background:#f1f3f4;font-weight:600;color:#202124}
td{color:#3c4043}
.badge{display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600}
.badge-yes{background:#e6f4ea;color:#137333}
.badge-no{background:#fce8e6;color:#c5221f}
.badge-opt{background:#fef7e0;color:#7d4e00}
code{background:#f1f3f4;padding:2px 6px;border-radius:3px;font-size:13px;font-family:'SF Mono',Monaco,monospace}
.footer{margin-top:48px;padding-top:20px;border-top:1px solid #e0e0e0;font-size:12px;color:#80868b;text-align:center}
a{color:#1a73e8;text-decoration:none}
a:hover{text-decoration:underline}
</style>
</head>
<body>
<div class="container">

<h1>Aegis — Privacy Policy</h1>
<p class="subtitle">Last updated: April 9, 2026</p>

<h2>1. Overview</h2>
<p>Aegis is a Chrome extension that provides email categorization, email security analysis, domain trust checking, and browsing analytics. This policy explains in detail what data the extension collects, how it is processed, where it is stored, who it is shared with, and how you can control it.</p>
<p>We are committed to transparency and minimal data collection. The extension is designed with a privacy-first approach: all core functionality works locally in your browser without sending data to any server.</p>

<h2>2. Prominent Disclosure</h2>
<p><strong>Aegis collects the following user data only when you explicitly opt in to anonymous data feedback during initial setup or in Settings:</strong></p>
<ul>
<li><strong>Email sender domains</strong> (e.g. <code>notifications.amazon.com</code>) — never full email addresses</li>
<li><strong>URL domains from email links</strong> (e.g. <code>amazon.com</code>) — never full URLs or page content</li>
<li><strong>URLs submitted via the feedback widget</strong> (when you manually correct a URL's category)</li>
<li><strong>Company names</strong> associated with email senders (if available)</li>
<li><strong>Extension version</strong> for compatibility tracking</li>
</ul>
<p>This data is transmitted securely over HTTPS to <code>aegis.penrose.services</code> and is used solely to improve the community URL category database that all users can benefit from. <strong>No feedback data is collected unless you explicitly consent by accepting the EULA and enabling "Anonymous Data Feedback" in Settings.</strong></p>
<p>Additionally, if you choose to enable AI Mode and configure your own API key, email metadata (subject line and sender name) is sent to your chosen third-party AI provider for classification. This requires your explicit configuration and is entirely optional.</p>
<p>The extension also uses Google Analytics 4 (GA4) to collect anonymous usage metrics (see Section 3.3 for details). This uses a randomly generated client ID — no personal information is included.</p>
<p><strong>Email body content, full email addresses, passwords, and personal identification information are never collected or transmitted.</strong></p>

<h2>3. Data We Collect</h2>

<h3>3.1 Data stored locally (never transmitted to Aegis servers)</h3>
<p>The following data is stored only in your browser using Chrome's <code>storage.sync</code> and <code>storage.local</code> APIs and is never sent to Aegis servers:</p>
<ul>
<li>Email categorization results and user settings (analysis mode, custom categories, keywords)</li>
<li>Email security analysis scores and phishing detection results</li>
<li>Browsing history for URL analytics (page URLs, domains, page titles, timestamps) — automatically deleted after 30 days</li>
<li>Active browsing time per website category (domain, category, duration per day)</li>
<li>User-defined URL category labels</li>
<li>AI model configuration (API endpoint, API key, model name) — stored in Chrome's encrypted sync storage</li>
<li>EULA acceptance status and timestamp</li>
<li>Data feedback opt-in preference</li>
<li>Domain security analysis cache (RDAP registration data, IP geolocation results) — cached locally with expiration</li>
<li>GA4 analytics client ID and session ID (randomly generated, not linked to any personal identity)</li>
</ul>

<h3>3.2 Data transmitted to Aegis servers (opt-in only)</h3>
<p>When anonymous data feedback is enabled (opt-in, disabled by default, requires both EULA acceptance and explicit toggle in Settings), the extension sends the following to <code>aegis.penrose.services</code> via HTTPS:</p>

<table>
<tr><th>Data field</th><th>Example</th><th>Purpose</th><th>Storage</th></tr>
<tr><td>Sender email domain</td><td><code>notifications.amazon.com</code></td><td>Build sender-to-domain mappings</td><td>DynamoDB (AWS ap-northeast-1)</td></tr>
<tr><td>URL domains from email links</td><td><code>amazon.com</code></td><td>Improve URL categorization</td><td>DynamoDB (AWS ap-northeast-1)</td></tr>
<tr><td>Company name (if available)</td><td><code>Amazon</code></td><td>Associate domains with companies</td><td>DynamoDB (AWS ap-northeast-1)</td></tr>
<tr><td>URL and suggested category (feedback widget)</td><td><code>https://shop.example.com</code> → <code>shopping</code></td><td>Community-driven category corrections</td><td>DynamoDB (AWS ap-northeast-1)</td></tr>
<tr><td>Extension version</td><td><code>1.6.0</code></td><td>Compatibility tracking</td><td>DynamoDB (AWS ap-northeast-1)</td></tr>
</table>

<p><strong>How this data is processed:</strong></p>
<ul>
<li>URL domains are validated, deduplicated, and capped at 50 entries per submission</li>
<li>Sender domains are validated against a strict domain format (alphanumeric, hyphens, dots only)</li>
<li>Feedback records are stored with a random UUID and timestamp — no user identifier is attached</li>
<li>Sender-domain mappings are aggregated: submission counts and URL domain frequency counts are maintained to determine consensus</li>
<li>URL category feedback is aggregated by domain to determine the community-voted category via majority vote</li>
<li>Aggregated results are served back to all users as the community URL category database</li>
</ul>

<h3>3.3 Analytics data (Google Analytics 4)</h3>
<p>Aegis uses Google Analytics 4 (GA4) via the Measurement Protocol to collect anonymous usage metrics. This data is sent directly to Google's analytics servers (<code>google-analytics.com</code>). The following events are tracked:</p>

<table>
<tr><th>Event</th><th>Data included</th><th>Purpose</th></tr>
<tr><td>Extension install</td><td>Extension version</td><td>Track adoption</td></tr>
<tr><td>Email classified</td><td>Analysis mode, email count, category count</td><td>Measure feature usage</td></tr>
<tr><td>Security scan</td><td>Safety score (0–100), safety level</td><td>Monitor analysis quality</td></tr>
<tr><td>Domain analysis</td><td>Domain name, domain score, domain level</td><td>Monitor domain checking</td></tr>
<tr><td>URL page view</td><td>URL category (e.g. "shopping")</td><td>Understand browsing patterns</td></tr>
<tr><td>Category action</td><td>Action type, category ID</td><td>Track feature engagement</td></tr>
<tr><td>Settings change</td><td>Setting name, setting value</td><td>Understand preferences</td></tr>
</table>

<p>Each analytics request includes a randomly generated client ID and session ID. These are not linked to any Google account, email address, or personal identity. No personally identifiable information (PII) is included in analytics events. GA4 data is subject to <a href="https://policies.google.com/privacy">Google's Privacy Policy</a>.</p>

<h3>3.4 Data transmitted to third-party AI services (optional, user-configured)</h3>
<p>If you enable AI mode and configure an API key in Settings, the extension sends the following to your chosen AI provider (e.g. OpenAI, Google Gemini) for email classification:</p>
<ul>
<li>Email subject line</li>
<li>Email sender name</li>
<li>Your configured category names and keywords (as classification context)</li>
</ul>
<p>This is entirely optional and requires you to explicitly: (1) select AI mode in Settings, (2) enter your own API endpoint, and (3) provide your own API key. The extension does not provide a default API key. Your API key is stored locally in Chrome's encrypted sync storage and is never transmitted to Aegis servers. Data sent to AI providers is subject to the respective provider's privacy policy.</p>

<h3>3.5 Domain security analysis (automatic, external lookups)</h3>
<p>When you visit a website, Aegis performs domain trust analysis by querying the following public services:</p>
<ul>
<li><strong>RDAP (Registration Data Access Protocol)</strong> — queries <code>rdap.org</code> to retrieve domain registration date and registrar information</li>
<li><strong>DNS resolution</strong> — queries <code>dns.google</code> to resolve the domain's IP address</li>
<li><strong>IP geolocation</strong> — queries <code>ip-api.com</code> to determine the server's country of origin</li>
</ul>
<p>These lookups transmit only the domain name or IP address to the respective services. Results are cached locally to minimize repeated requests. No personal data is sent. These services are subject to their own privacy policies.</p>

<h3>3.6 Server-side access logs</h3>
<p>When the extension communicates with <code>aegis.penrose.services</code>, standard HTTP access logs are recorded by the API gateway. These logs may include:</p>
<ul>
<li>IP address</li>
<li>HTTP method and request path</li>
<li>Response status code and latency</li>
<li>User agent string</li>
<li>Request ID</li>
</ul>
<p>Access logs are stored in encrypted S3 storage (AWS ap-northeast-1) and are automatically deleted after 90 days. They are used solely for operational monitoring, debugging, and abuse prevention. They are not linked to feedback data or any user identity.</p>

<h3>3.7 Data we NEVER collect</h3>
<ul>
<li>Email body content or message text</li>
<li>Full email addresses (only the domain portion, e.g. <code>example.com</code> not <code>user@example.com</code>)</li>
<li>Email recipient information</li>
<li>Email attachments or attachment metadata</li>
<li>Passwords, form data, or authentication tokens</li>
<li>Personal identification information (name, phone number, physical address)</li>
<li>Browsing history (stays local, never transmitted to Aegis servers)</li>
<li>Financial or payment information</li>
<li>Health information</li>
<li>Authentication credentials for any service</li>
</ul>

<h2>4. How We Use Your Data</h2>
<table>
<tr><th>Data type</th><th>Purpose</th><th>Legal basis</th></tr>
<tr><td>Anonymous feedback (sender domains, URL domains, categories)</td><td>Improve the community URL category database that all users can sync</td><td>User consent (opt-in)</td></tr>
<tr><td>Sender-domain mappings</td><td>Build a shared knowledge base of which domains are associated with which email senders</td><td>User consent (opt-in)</td></tr>
<tr><td>GA4 analytics events</td><td>Understand feature usage and improve the extension</td><td>Legitimate interest (anonymous, non-identifying metrics)</td></tr>
<tr><td>Server access logs</td><td>Operational monitoring, debugging, abuse prevention</td><td>Legitimate interest (infrastructure security)</td></tr>
<tr><td>AI provider requests</td><td>Email classification when user enables AI mode</td><td>User consent (explicit configuration)</td></tr>
<tr><td>Domain security lookups</td><td>Provide domain trust scores to protect users</td><td>Legitimate interest (security feature)</td></tr>
</table>

<p><strong>We do not:</strong></p>
<ul>
<li>Sell, rent, or trade any user data to third parties</li>
<li>Use data for advertising, profiling, or targeted marketing</li>
<li>Use data for purposes unrelated to the extension's functionality</li>
<li>Combine feedback data with any personally identifiable information</li>
</ul>

<h2>5. Data Sharing with Third Parties</h2>
<p>We share data with third parties only in the following limited circumstances:</p>

<table>
<tr><th>Third party</th><th>Data shared</th><th>Purpose</th><th>Condition</th></tr>
<tr><td>Google Analytics (GA4)</td><td>Anonymous usage events, random client ID</td><td>Usage analytics</td><td>Automatic (no PII)</td></tr>
<tr><td>User-configured AI provider (e.g. OpenAI, Google Gemini)</td><td>Email subject line, sender name</td><td>AI-powered email classification</td><td>Only when user explicitly enables AI mode and provides their own API key</td></tr>
<tr><td>RDAP registries (rdap.org)</td><td>Domain name</td><td>Domain registration lookup</td><td>Automatic for domain trust analysis</td></tr>
<tr><td>Google DNS (dns.google)</td><td>Domain name</td><td>DNS resolution</td><td>Automatic for domain trust analysis</td></tr>
<tr><td>ip-api.com</td><td>IP address</td><td>IP geolocation</td><td>Automatic for domain trust analysis</td></tr>
</table>

<p>We do not share any data with advertisers, data brokers, or any other third parties not listed above. Community feedback data (aggregated URL categories and sender-domain mappings) is served back to extension users as a shared public database — this data contains only domain names and category labels, with no user-identifying information.</p>

<h2>6. Data Storage and Security</h2>

<h3>6.1 Local storage</h3>
<ul>
<li>All local data is stored using Chrome's <code>storage.sync</code> and <code>storage.local</code> APIs</li>
<li>AI API keys are stored in Chrome's encrypted sync storage</li>
<li>Local data is protected by Chrome's built-in security model and your operating system's user account</li>
</ul>

<h3>6.2 Server-side storage</h3>
<ul>
<li>Feedback data is stored in Amazon DynamoDB tables in the AWS ap-northeast-1 (Tokyo) region</li>
<li>All data is encrypted at rest using DynamoDB default encryption (AWS owned keys)</li>
<li>Access logs are stored in S3 with AES-256 server-side encryption and public access blocked</li>
<li>All API communication uses HTTPS (TLS 1.2+)</li>
<li>No user credentials or authentication tokens are stored on our servers</li>
<li>The extension does not execute any remote code — only JSON data is fetched from servers</li>
<li>Request payloads are validated and size-limited (max 10 KB) to prevent abuse</li>
</ul>

<h2>7. Data Retention</h2>

<table>
<tr><th>Data type</th><th>Retention period</th><th>Deletion method</th></tr>
<tr><td>Local browsing history</td><td>30 days (auto-cleanup)</td><td>Automatic daily cleanup by the extension</td></tr>
<tr><td>Local domain analysis cache</td><td>24 hours</td><td>Automatic expiration</td></tr>
<tr><td>Local settings and preferences</td><td>Until uninstall</td><td>Uninstall extension or clear Chrome storage</td></tr>
<tr><td>Server-side feedback data</td><td>Indefinite</td><td>Contact us for deletion (see Section 11)</td></tr>
<tr><td>Server-side access logs</td><td>90 days</td><td>Automatic expiration via S3 lifecycle policy</td></tr>
<tr><td>GA4 analytics data</td><td>Per Google's retention policy</td><td>Managed by Google</td></tr>
</table>

<h2>8. Your Controls and Rights</h2>

<table>
<tr><th>Control</th><th>How</th></tr>
<tr><td>Disable anonymous feedback</td><td>Settings page → toggle off "Anonymous Data Feedback" (disabled by default — only enabled if you opted in)</td></tr>
<tr><td>Disable AI mode</td><td>Settings page → select "Local Rules" analysis engine</td></tr>
<tr><td>Export your data</td><td>URL Analytics page → Export button (JSON labels or CSV history)</td></tr>
<tr><td>Delete all local data</td><td>Uninstall the extension, or clear site data for the extension in Chrome settings</td></tr>
<tr><td>Decline the EULA</td><td>Click "Decline" on the EULA dialog — the extension remains inactive and collects no data</td></tr>
<tr><td>Request server-side data deletion</td><td>Email us at <a href="mailto:kaija.chang@gmail.com">kaija.chang@gmail.com</a> — since feedback data is anonymous (no user ID), provide the sender domains or URLs you submitted so we can locate and remove the records</td></tr>
</table>

<p>Because feedback data does not contain any user identifier, we cannot automatically associate server-side records with a specific user. If you wish to have specific feedback records removed, please contact us with the domain names you submitted.</p>

<h2>9. Permissions Explained</h2>

<table>
<tr><th>Permission</th><th>Why it's needed</th></tr>
<tr><td><code>storage</code></td><td>Save settings, categories, browsing history, domain cache, and EULA state locally</td></tr>
<tr><td><code>activeTab</code></td><td>Read the current tab's URL for browsing categorization and domain analysis</td></tr>
<tr><td><code>scripting</code></td><td>Inject the URL feedback widget on uncategorized pages and content scripts</td></tr>
<tr><td><code>alarms</code></td><td>Schedule weekly category sync, daily history cleanup, whitelist refresh, and time tracking flush</td></tr>
<tr><td><code>webNavigation</code></td><td>Detect page navigations for browsing analytics and domain security analysis</td></tr>
<tr><td><code>idle</code></td><td>Pause active time tracking when the user is away from the computer</td></tr>
<tr><td><code>tabs</code></td><td>Get active tab info for accurate browsing time attribution and domain analysis</td></tr>
<tr><td>Host permissions (<code>&lt;all_urls&gt;</code>)</td><td>Content scripts on Gmail/Outlook for email analysis; webNavigation across all sites for browsing analytics; domain security lookups; API calls to <code>aegis.penrose.services</code></td></tr>
</table>

<h2>10. Children's Privacy</h2>
<p>Aegis is not directed at children under 13. We do not knowingly collect personal information from children. If you believe a child under 13 has provided data through the extension, please contact us and we will promptly delete it.</p>

<h2>11. Changes to This Policy</h2>
<p>We may update this privacy policy from time to time. Changes will be reflected in the "Last updated" date at the top of this page. For significant changes that affect how your data is collected or used, we will notify users through the extension's update notes. Continued use of the extension after changes constitutes acceptance of the updated policy.</p>

<h2>12. Contact</h2>
<p>If you have questions about this privacy policy, want to request data deletion, or have concerns about the extension's data practices, please contact us at:</p>
<p>Email: <a href="mailto:kaija.chang@gmail.com">kaija.chang@gmail.com</a></p>

<div class="footer">
<p>Aegis Chrome Extension — Privacy Policy</p>
<p>&copy; 2026 Aegis. All rights reserved.</p>
</div>

</div>
</body>
</html>`;

export const handler = async (_event) => {
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=86400',
    },
    body: PRIVACY_HTML,
  };
};
