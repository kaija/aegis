/**
 * URL Feedback Widget
 * Injected into pages when feedback mode is ON and the URL is uncategorized.
 * Shows a small floating bar letting the user assign a category.
 */
(() => {
  // Prevent double injection
  if (document.getElementById('aegis-url-feedback')) return;

  const categories = (window.__aegisFeedbackCategories || []);
  const domain = window.__aegisFeedbackDomain || '';
  const url = window.__aegisFeedbackUrl || location.href;

  if (!categories.length) return;

  // Build the widget
  const container = document.createElement('div');
  container.id = 'aegis-url-feedback';
  container.innerHTML = `
    <div class="aegis-uf-inner">
      <div class="aegis-uf-icon">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
          <line x1="7" y1="7" x2="7.01" y2="7"/>
        </svg>
      </div>
      <span class="aegis-uf-text">Categorize <strong>${_escHtml(domain)}</strong></span>
      <select class="aegis-uf-select" id="aegis-uf-category">
        <option value="">-- Select --</option>
        ${categories.map(c => `<option value="${_escHtml(c.id)}">${c.emoji} ${_escHtml(c.name)}</option>`).join('')}
      </select>
      <button class="aegis-uf-save" id="aegis-uf-save" disabled>Save</button>
      <button class="aegis-uf-dismiss" id="aegis-uf-dismiss" title="Dismiss">&times;</button>
    </div>
  `;

  // Inject styles
  const style = document.createElement('style');
  style.textContent = `
    #aegis-url-feedback {
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 2147483647;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 13px;
      animation: aegis-uf-slidein 0.3s ease-out;
    }
    @keyframes aegis-uf-slidein {
      from { transform: translateY(20px); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }
    @keyframes aegis-uf-slideout {
      from { transform: translateY(0); opacity: 1; }
      to { transform: translateY(20px); opacity: 0; }
    }
    .aegis-uf-inner {
      display: flex;
      align-items: center;
      gap: 8px;
      background: #ffffff;
      border: 1px solid #e0e0e0;
      border-radius: 12px;
      padding: 8px 12px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.12), 0 1px 4px rgba(0,0,0,0.08);
    }
    .aegis-uf-icon {
      color: #1a73e8;
      display: flex;
      align-items: center;
      flex-shrink: 0;
    }
    .aegis-uf-text {
      color: #5f6368;
      white-space: nowrap;
      max-width: 200px;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .aegis-uf-text strong {
      color: #202124;
    }
    .aegis-uf-select {
      padding: 5px 8px;
      border: 1px solid #e0e0e0;
      border-radius: 6px;
      font-size: 13px;
      background: #f8f9fa;
      cursor: pointer;
      max-width: 180px;
      color: #202124;
    }
    .aegis-uf-select:focus {
      outline: none;
      border-color: #1a73e8;
    }
    .aegis-uf-save {
      background: #1a73e8;
      color: #fff;
      border: none;
      border-radius: 6px;
      padding: 5px 14px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.15s;
      white-space: nowrap;
    }
    .aegis-uf-save:hover:not(:disabled) {
      background: #1557b0;
    }
    .aegis-uf-save:disabled {
      background: #a8c7fa;
      cursor: not-allowed;
    }
    .aegis-uf-dismiss {
      background: none;
      border: none;
      color: #80868b;
      font-size: 18px;
      cursor: pointer;
      padding: 0 2px;
      line-height: 1;
      transition: color 0.15s;
    }
    .aegis-uf-dismiss:hover {
      color: #202124;
    }
  `;

  document.documentElement.appendChild(style);
  document.documentElement.appendChild(container);

  // Interactions
  const select = document.getElementById('aegis-uf-category');
  const saveBtn = document.getElementById('aegis-uf-save');
  const dismissBtn = document.getElementById('aegis-uf-dismiss');

  select.addEventListener('change', () => {
    saveBtn.disabled = !select.value;
  });

  saveBtn.addEventListener('click', () => {
    if (!select.value) return;
    chrome.runtime.sendMessage({
      type: 'SAVE_URL_LABEL',
      domain: domain,
      categoryId: select.value,
      url: url
    }, () => {
      _showSaved();
    });
  });

  dismissBtn.addEventListener('click', _dismiss);

  function _dismiss() {
    container.style.animation = 'aegis-uf-slideout 0.2s ease-in forwards';
    setTimeout(() => {
      container.remove();
      style.remove();
    }, 200);
  }

  function _showSaved() {
    const inner = container.querySelector('.aegis-uf-inner');
    const selectedText = select.options[select.selectedIndex].text;
    inner.innerHTML = `
      <div class="aegis-uf-icon" style="color:#34a853;">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      </div>
      <span class="aegis-uf-text" style="color:#34a853;font-weight:600;">Saved as ${_escHtml(selectedText)}</span>
    `;
    setTimeout(_dismiss, 1500);
  }

  function _escHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  // Auto-dismiss after 30 seconds if ignored
  setTimeout(() => {
    if (document.getElementById('aegis-url-feedback')) {
      _dismiss();
    }
  }, 30000);
})();
