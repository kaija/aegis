'use strict';

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
    const { category, tags, safetyScore, safetyLevel, safetyColor, issues, linkResults } = analysis;

    const popup = document.createElement('div');
    popup.id = 'aegis-email-popup';

    // Safety ring SVG
    const circumference = 2 * Math.PI * 30; // r=30
    const dashArray = (safetyScore / 100) * circumference;
    const safetyLevelText = safetyLevel === 'safe' ? '安全' : safetyLevel === 'caution' ? '注意' : '危險';

    // Issues HTML
    const issuesHtml = issues && issues.length > 0 ? `
      <div class="aegis-issues-list">
        <div class="aegis-issues-title">⚠️ 安全警示</div>
        ${issues.map(issue => `<div class="aegis-issue-item">• ${this._escapeHtml(issue)}</div>`).join('')}
      </div>
    ` : '';

    // Links HTML
    const linksHtml = linkResults && linkResults.length > 0 ? `
      <div class="aegis-links-section">
        <div class="aegis-links-title" onclick="this.nextElementSibling.classList.toggle('open'); this.querySelector('.aegis-links-toggle').textContent = this.nextElementSibling.classList.contains('open') ? '▲' : '▼'">
          🔗 連結分析 (${linkResults.length})
          <span class="aegis-links-toggle">▼</span>
        </div>
        <div class="aegis-links-body">
          ${linkResults.map(lr => `
            <div class="aegis-link-item">
              <span class="aegis-link-url" title="${this._escapeHtml(lr.url)}">${this._escapeHtml(lr.url.slice(0, 40))}${lr.url.length > 40 ? '…' : ''}</span>
              <span class="aegis-link-risk ${lr.isSuspicious ? 'risky' : 'safe'}">${lr.isSuspicious ? '⚠ 可疑' : '✓ 正常'}</span>
            </div>
          `).join('')}
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
        <span class="aegis-popup-title">🛡 Aegis 分析</span>
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
        <span>${category.emoji || '📂'}</span>
        <span>${category.name}</span>
      </div>
      ${tagsHtml}
      ${issuesHtml}
      ${linksHtml}
    `;

    popup.querySelector('.aegis-popup-close').addEventListener('click', () => this.hide());

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

  _escapeHtml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
}

window.EmailPopup = EmailPopup;
