'use strict';

const POPUP_ICONS = [
  { id: 'folder', svg: '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>' },
  { id: 'shopping-cart', svg: '<circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>' },
  { id: 'credit-card', svg: '<rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect><line x1="1" y1="10" x2="23" y2="10"></line>' },
  { id: 'briefcase', svg: '<rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path>' },
  { id: 'user', svg: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle>' },
  { id: 'tag', svg: '<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path><line x1="7" y1="7" x2="7.01" y2="7"></line>' },
  { id: 'lock', svg: '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path>' },
  { id: 'clock', svg: '<circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline>' },
  { id: 'star', svg: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>' },
  { id: 'heart', svg: '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>' },
  { id: 'trash', svg: '<polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>' },
  { id: 'flag', svg: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path><line x1="4" y1="22" x2="4" y2="15"></line>' },
  { id: 'calendar', svg: '<rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line>' },
  { id: 'alert-triangle', svg: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line>' },
  { id: 'heart', svg: '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>' },
  { id: 'check-circle', svg: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline>' },
  { id: 'image', svg: '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline>' },
  { id: 'bar-chart', svg: '<line x1="12" y1="20" x2="12" y2="10"></line><line x1="18" y1="20" x2="18" y2="4"></line><line x1="6" y1="20" x2="6" y2="16"></line>' },
  { id: 'shield', svg: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>' },
  { id: 'phone', svg: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>' },
  { id: 'globe', svg: '<circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>' },
  { id: 'video', svg: '<polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>' },
  { id: 'coffee', svg: '<path d="M18 8h1a4 4 0 0 1 0 8h-1"></path><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"></path><line x1="6" y1="1" x2="6" y2="4"></line><line x1="10" y1="1" x2="10" y2="4"></line><line x1="14" y1="1" x2="14" y2="4"></line>' },
  { id: 'gift', svg: '<polyline points="20 12 20 22 4 22 4 12"></polyline><rect x="2" y="7" width="20" height="5"></rect><line x1="12" y1="22" x2="12" y2="7"></line><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"></path><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"></path>' },
  { id: 'package', svg: '<line x1="16.5" y1="9.4" x2="7.5" y2="4.21"></line><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line>' },
  { id: 'trash', svg: '<polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>' },
  { id: 'book', svg: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>' },
  { id: 'send', svg: '<line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>' },
  { id: 'mail', svg: '<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline>' },
  { id: 'paperclip', svg: '<path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path>' },
  { id: 'file-text', svg: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline>' }
];

function getPopupIconSvg(id) {
  const icon = POPUP_ICONS.find(i => i.id === id);
  if (!icon) return '📂'; // Fallback text icon if not found
  return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;margin-right:2px;">${icon.svg}</svg>`;
}

class EmailPopup {
  constructor() {
    this.popup = null;
    this._isDragging = false;
    this._dragOffsetX = 0;
    this._dragOffsetY = 0;
  }

  show(analysis) {
    this.hide();
    this.popup = this._createPopup(analysis);
    document.body.appendChild(this.popup);
    this._makeDraggable(this.popup);
  }

  hide() {
    if (this.popup) {
      this.popup.remove();
      this.popup = null;
    }
    const existing = document.getElementById('aegis-email-popup');
    if (existing) existing.remove();
  }

  _createPopup(analysis) {
    const { category, tags, safetyScore, safetyLevel, safetyColor, issues, linkResults, suspiciousKeywords } = analysis;

    const popup = document.createElement('div');
    popup.id = 'aegis-email-popup';

    // Safety ring SVG
    const circumference = 2 * Math.PI * 30; // r=30
    const dashArray = (safetyScore / 100) * circumference;
    const safetyLevelText = safetyLevel === 'safe' ? t('safetyLevelSafe') : safetyLevel === 'caution' ? t('safetyLevelCaution') : t('safetyLevelDanger');

    // Process issues to add keyword details
    const processedIssues = issues.map(issue => {
      // Check if this is the suspicious keywords issue
      const match = issue.match(/內容含 (\d+) 個可疑關鍵字/) || issue.match(/Content contains (\d+) suspicious keywords/);
      if (match && suspiciousKeywords && suspiciousKeywords.length > 0) {
        // Add keywords with color coding
        const keywordTags = suspiciousKeywords.map((kw, idx) => {
          const colors = ['#cf222e', '#d1242f', '#e85d75', '#fb8500', '#ff9500'];
          const color = colors[idx % colors.length];
          return `<span style="display:inline-block;background:${color};color:white;padding:2px 6px;border-radius:3px;margin:0 3px;font-size:11px;">${this._escapeHtml(kw)}</span>`;
        }).join('');
        return `${issue}：${keywordTags}`;
      }
      return issue;
    });

    // Issues HTML
    const issuesHtml = processedIssues && processedIssues.length > 0 ? `
      <div class="aegis-issues-list">
        <div class="aegis-issues-title">⚠️ ${t('safetyWarnings')}</div>
        ${processedIssues.map(issue => `<div class="aegis-issue-item">• ${issue}</div>`).join('')}
      </div>
    ` : '';

    // Links HTML
    const linksHtml = linkResults && linkResults.length > 0 ? `
      <div class="aegis-links-section">
        <div class="aegis-links-title">
          🔗 ${t('linkAnalysis', linkResults.length)}
          <span class="aegis-links-toggle">▼</span>
        </div>
        <div class="aegis-links-body">
          ${linkResults.map(lr => {
      let riskClass, riskLabel;
      if (lr.isWhitelisted) {
        riskClass = 'whitelisted';
        riskLabel = '✓ ' + (lr.whitelistService ? t('riskWhitelisted', lr.whitelistService) : t('riskWhitelistFallback'));
      } else if (lr.isOffWhitelist) {
        riskClass = 'off-whitelist';
        riskLabel = '⚠ ' + t('riskOffWhitelist');
      } else if (lr.isSuspicious) {
        riskClass = 'risky';
        riskLabel = '⚠ ' + t('riskSuspicious');
      } else {
        riskClass = 'safe';
        riskLabel = '✓ ' + t('riskSafe');
      }
      return `
            <div class="aegis-link-item">
              <span class="aegis-link-url" title="${this._escapeHtml(lr.url)}">${this._escapeHtml(lr.url.slice(0, 40))}${lr.url.length > 40 ? '…' : ''}</span>
              <span class="aegis-link-risk ${riskClass}">${riskLabel}</span>
            </div>`;
    }).join('')}
        </div>
      </div>
    ` : '';

    // Tags HTML
    const tagsHtml = tags && tags.length > 0 ? `
      <div class="aegis-tags">
        ${tags.map(tag => `<span class="aegis-tag">${this._escapeHtml(tag)}</span>`).join('')}
      </div>
    ` : '';

    popup.innerHTML = `
      <div class="aegis-popup-header">
        <span class="aegis-popup-title">🛡 ${t('popupTitle')}</span>
        <button class="aegis-popup-close">✕</button>
      </div>
      <div class="aegis-safety-ring">
        <div class="aegis-safety-score-wrap">
          <svg class="aegis-safety-svg" width="80" height="80" viewBox="0 0 80 80">
            <circle class="aegis-safety-bg" cx="40" cy="40" r="30"/>
            <circle class="aegis-safety-arc" cx="40" cy="40" r="30"
              stroke="${safetyColor}"
              stroke-dasharray="${dashArray.toFixed(1)} ${circumference.toFixed(1)}"
              stroke-dashoffset="0"/>
          </svg>
          <span class="aegis-score-number" style="color: ${safetyColor}">${safetyScore}</span>
        </div>
        <span class="aegis-safety-label" style="color: ${safetyColor}">${safetyLevelText}</span>
      </div>
      <div class="aegis-category-badge" style="background: ${category.bgColor || '#f5f5f5'}; color: ${category.color || '#333'}">
        <span>${getPopupIconSvg(category.emoji)}</span>
        <span>${category.name}</span>
      </div>
      ${tagsHtml}
      ${issuesHtml}
      ${linksHtml}
    `;

    popup.querySelector('.aegis-popup-close').addEventListener('click', () => this.hide());

    const linksTitle = popup.querySelector('.aegis-links-title');
    if (linksTitle) {
      linksTitle.addEventListener('click', () => {
        const body = linksTitle.nextElementSibling;
        const toggle = linksTitle.querySelector('.aegis-links-toggle');
        body.classList.toggle('open');
        toggle.textContent = body.classList.contains('open') ? '▲' : '▼';
      });
    }

    return popup;
  }

  _makeDraggable(el) {
    const header = el.querySelector('.aegis-popup-header');
    if (!header) return;

    header.addEventListener('mousedown', (e) => {
      if (e.target.classList.contains('aegis-popup-close')) return;
      this._isDragging = true;
      const rect = el.getBoundingClientRect();
      this._dragOffsetX = e.clientX - rect.left;
      this._dragOffsetY = e.clientY - rect.top;
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!this._isDragging) return;
      const x = e.clientX - this._dragOffsetX;
      const y = e.clientY - this._dragOffsetY;
      el.style.left = `${Math.max(0, x)}px`;
      el.style.top = `${Math.max(0, y)}px`;
      el.style.right = 'auto';
    });

    document.addEventListener('mouseup', () => {
      this._isDragging = false;
    });
  }

  showReplyOptions(replyData, onOptionClick) {
    this.hideReplyOptions();
    if (!this.popup) return;

    const panel = document.createElement('div');
    panel.className = 'aegis-reply-panel';

    const typeLabel = document.createElement('div');
    typeLabel.className = 'aegis-reply-type-label';
    typeLabel.textContent = '\u{1F4E7} ' + replyData.emailType.toUpperCase();
    panel.appendChild(typeLabel);

    const btnContainer = document.createElement('div');
    btnContainer.className = 'aegis-reply-btn-container';

    replyData.replyOptions.forEach(option => {
      const btn = document.createElement('button');
      btn.className = 'aegis-reply-btn';
      btn.textContent = option.label;
      btn.addEventListener('click', () => {
        onOptionClick(option.prefix, btn);
      });
      btnContainer.appendChild(btn);
    });

    panel.appendChild(btnContainer);
    this.popup.appendChild(panel);
  }

  showReplyLoading() {
    this.hideReplyOptions();
    if (!this.popup) return;

    const panel = document.createElement('div');
    panel.className = 'aegis-reply-panel';

    const loading = document.createElement('div');
    loading.className = 'aegis-reply-loading';
    loading.textContent = 'Generating reply suggestions...';
    panel.appendChild(loading);

    this.popup.appendChild(panel);
  }

  hideReplyOptions() {
    if (!this.popup) return;
    const existing = this.popup.querySelector('.aegis-reply-panel');
    if (existing) existing.remove();
  }

  _escapeHtml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
}

window.EmailPopup = EmailPopup;
window.getPopupIconSvg = getPopupIconSvg;
