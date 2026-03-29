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
<p class="subtitle">Last updated: March 29, 2026</p>

<h2>1. Overview</h2>
<p>Aegis is a Chrome extension that provides email categorization, email security analysis, and browsing analytics. This policy explains what data the extension collects, how it is used, and how you can control it.</p>
<p>We are committed to transparency and minimal data collection. The extension is designed with a privacy-first approach: all core functionality works locally in your browser without sending data to any server.</p>

<h2>2. Data We Collect</h2>

<h3>2.1 Data stored locally (never transmitted)</h3>
<p>The following data is stored only in your browser using Chrome's storage APIs and is never sent to any server:</p>
<ul>
<li>Email categorization results and settings (analysis mode, custom categories, keywords)</li>
<li>Email security analysis scores and phishing detection results</li>
<li>Browsing history for URL analytics (page URLs, domains, titles, timestamps) — stored for up to 30 days</li>
<li>Active browsing time per website category</li>
<li>User-defined URL category labels</li>
<li>AI model configuration (API endpoint, API key, model name)</li>
<li>EULA acceptance status and timestamp</li>
</ul>

<h3>2.2 Data transmitted to Aegis servers (opt-out)</h3>
<p>When anonymous data feedback is enabled (opt-out, controlled in Settings), the extension sends the following to <code>aegis.penrose.services</code>:</p>

<table>
<tr><th>Data</th><th>Example</th><th>Purpose</th></tr>
<tr><td>Sender email domain</td><td><code>notifications.amazon.com</code></td><td>Build sender-to-domain mappings</td></tr>
<tr><td>URL domains from email links</td><td><code>amazon.com</code></td><td>Improve URL categorization</td></tr>
<tr><td>Company name (if available)</td><td><code>Amazon</code></td><td>Associate domains with companies</td></tr>
<tr><td>URL category corrections</td><td><code>shop.example.com → shopping</code></td><td>Community-driven category improvements</td></tr>
<tr><td>Extension version</td><td><code>1.0.0</code></td><td>Version tracking for compatibility</td></tr>
</table>

<h3>2.3 Data we NEVER collect</h3>
<ul>
<li>Email subject lines or body content</li>
<li>Full email addresses (only the domain portion, e.g. <code>example.com</code> not <code>user@example.com</code>)</li>
<li>Recipient information</li>
<li>Email attachments or attachment metadata</li>
<li>Full browsing URLs (only domains for feedback)</li>
<li>Passwords, form data, or authentication tokens</li>
<li>Personal identification information (name, phone, address)</li>
<li>Browsing history (stays local, never transmitted)</li>
</ul>

<h3>2.4 Data transmitted to third-party AI services (optional)</h3>
<p>If you enable AI mode and configure an API key in Settings, the extension sends email metadata (subject line and sender name) to your chosen AI provider (e.g. OpenAI, Google Gemini) for classification. This is entirely optional and requires explicit user configuration. The extension does not provide a default API key — you must supply your own.</p>

<h2>3. How We Use Your Data</h2>
<ul>
<li>Anonymous feedback data is aggregated to improve the community URL category database, which all users can sync</li>
<li>Sender-domain mappings help build a shared knowledge base of which domains are associated with which email senders</li>
<li>No data is sold, shared with advertisers, or used for profiling</li>
<li>No data is used for purposes unrelated to the extension's functionality</li>
</ul>

<h2>4. Data Retention</h2>
<ul>
<li>Local browsing history: automatically deleted after 30 days</li>
<li>Local settings and preferences: retained until you uninstall the extension or clear Chrome storage</li>
<li>Server-side feedback data: retained indefinitely for aggregation purposes (contains only anonymous domain-level data)</li>
</ul>

<h2>5. Your Controls</h2>

<table>
<tr><th>Control</th><th>How</th></tr>
<tr><td>Disable anonymous feedback</td><td>Settings page → toggle off "Anonymous Data Feedback"</td></tr>
<tr><td>Disable AI mode</td><td>Settings page → select "Local Rules" analysis engine</td></tr>
<tr><td>Export your data</td><td>URL Analytics page → Export button (JSON labels or CSV history)</td></tr>
<tr><td>Delete all local data</td><td>Uninstall the extension, or clear site data for the extension in Chrome settings</td></tr>
<tr><td>Decline the EULA</td><td>Click "Decline" on the EULA dialog — the extension remains inactive and collects no data</td></tr>
</table>

<h2>6. Permissions Explained</h2>

<table>
<tr><th>Permission</th><th>Why it's needed</th></tr>
<tr><td><code>storage</code></td><td>Save settings, categories, browsing history, and EULA state locally</td></tr>
<tr><td><code>activeTab</code></td><td>Read the current tab's URL for browsing categorization</td></tr>
<tr><td><code>scripting</code></td><td>Inject the URL feedback widget on uncategorized pages</td></tr>
<tr><td><code>alarms</code></td><td>Schedule weekly category sync, daily history cleanup, and time tracking flush</td></tr>
<tr><td><code>webNavigation</code></td><td>Detect page navigations for browsing analytics</td></tr>
<tr><td><code>idle</code></td><td>Pause time tracking when the user is away</td></tr>
<tr><td><code>tabs</code></td><td>Get active tab info for accurate browsing time attribution</td></tr>
<tr><td>Host permissions</td><td>Content scripts on Gmail; webNavigation across all sites; API calls to aegis.penrose.services</td></tr>
</table>

<h2>7. Security</h2>
<ul>
<li>All API communication uses HTTPS</li>
<li>No user credentials or authentication tokens are stored on our servers</li>
<li>AI API keys are stored locally in Chrome's encrypted sync storage and never transmitted to Aegis servers</li>
<li>The extension does not execute any remote code — only JSON data is fetched from servers</li>
</ul>

<h2>8. Children's Privacy</h2>
<p>Aegis is not directed at children under 13. We do not knowingly collect personal information from children.</p>

<h2>9. Changes to This Policy</h2>
<p>We may update this privacy policy from time to time. Changes will be reflected in the "Last updated" date at the top of this page. Continued use of the extension after changes constitutes acceptance of the updated policy.</p>

<h2>10. Contact</h2>
<p>If you have questions about this privacy policy or the extension's data practices, please contact us at: <a href="mailto:kaija.chang@gmail.com">kaija.chang@gmail.com</a></p>

<div class="footer">
<p>Aegis Chrome Extension — Privacy Policy</p>
<p>© 2026 Aegis. All rights reserved.</p>
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
