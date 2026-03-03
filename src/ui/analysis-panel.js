'use strict';

class AnalysisPanel {
  constructor(platform) {
    this.platform = platform;
    this.panel = null;
  }

  show(groups, labels) {
    this.hide();
    this.panel = this._createPanel();
    this._render(groups, labels || []);
  }

  hide() {
    if (this.panel) {
      this.panel.remove();
      this.panel = null;
    }
    const existing = document.getElementById('aegis-panel');
    if (existing) existing.remove();
  }

  _createPanel() {
    const panel = document.createElement('div');
    panel.id = 'aegis-panel';
    panel.innerHTML = `
      <div class="aegis-panel-header">
        <h3>📧 Aegis 郵件分析</h3>
        <div class="aegis-spinner" id="aegis-spinner"></div>
        <button class="aegis-close-btn" id="aegis-panel-close">✕</button>
      </div>
      <div class="aegis-panel-body" id="aegis-panel-body"></div>
      <div class="aegis-panel-footer" id="aegis-panel-footer"></div>
    `;

    document.body.appendChild(panel);

    panel.querySelector('#aegis-panel-close').addEventListener('click', () => this.hide());

    // Trigger open animation
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        panel.classList.add('aegis-panel-open');
      });
    });

    return panel;
  }

  _render(groups, labels) {
    const body = this.panel.querySelector('#aegis-panel-body');
    const footer = this.panel.querySelector('#aegis-panel-footer');
    body.innerHTML = '';

    let totalEmails = 0;

    if (groups.size === 0) {
      body.innerHTML = `
        <div class="aegis-empty-state">
          <div class="aegis-empty-icon">📭</div>
          <div>沒有找到未讀郵件</div>
        </div>
      `;
      footer.textContent = '共 0 封未讀郵件';
      return;
    }

    for (const [categoryId, { category, emails }] of groups) {
      totalEmails += emails.length;
      const groupEl = this._createCategoryGroup(category, emails, labels);
      body.appendChild(groupEl);
    }

    footer.textContent = `共 ${totalEmails} 封未讀郵件，${groups.size} 個分類`;
  }

  _createCategoryGroup(category, emails, labels) {
    const group = document.createElement('div');
    group.className = 'aegis-category-group';

    // Header
    const header = document.createElement('div');
    header.className = 'aegis-category-header';
    header.style.borderLeft = `3px solid ${category.color}`;
    header.innerHTML = `
      <input type="checkbox" class="aegis-select-all" title="全選">
      <span class="aegis-category-emoji">${category.emoji}</span>
      <span class="aegis-category-name">${category.name}</span>
      <span class="aegis-category-count">${emails.length}</span>
    `;

    // Email list
    const list = document.createElement('div');
    list.className = 'aegis-email-list';

    emails.forEach(email => {
      const item = document.createElement('div');
      item.className = 'aegis-email-item';
      item.dataset.emailId = email.id;
      const subject = email.subject.length > 40 ? email.subject.slice(0, 40) + '…' : email.subject;
      item.innerHTML = `
        <input type="checkbox" class="aegis-email-checkbox">
        <div class="aegis-email-info">
          <div class="aegis-email-subject">${this._escapeHtml(subject)}</div>
          <div class="aegis-email-sender">${this._escapeHtml(email.sender || email.senderEmail || '')}</div>
        </div>
        <div class="aegis-safety-dot" style="background: ${category.color}"></div>
      `;
      item.dataset.row = '';
      item._emailRow = email.row;
      list.appendChild(item);
    });

    // Actions
    const actions = document.createElement('div');
    actions.className = 'aegis-category-actions';
    actions.innerHTML = `
      <button class="aegis-action-btn aegis-move-btn">移至標籤 ▼</button>
      <button class="aegis-action-btn aegis-delete-btn">🗑 刪除</button>
    `;

    group.appendChild(header);
    group.appendChild(list);
    group.appendChild(actions);

    // Wire up select all
    const selectAll = header.querySelector('.aegis-select-all');
    selectAll.addEventListener('change', () => {
      list.querySelectorAll('.aegis-email-checkbox').forEach(cb => {
        cb.checked = selectAll.checked;
      });
    });

    // Wire up delete
    actions.querySelector('.aegis-delete-btn').addEventListener('click', async () => {
      const selectedItems = [...list.querySelectorAll('.aegis-email-item')]
        .filter(item => item.querySelector('.aegis-email-checkbox').checked);

      if (selectedItems.length === 0) {
        alert('請先選擇要刪除的郵件');
        return;
      }

      const rows = selectedItems.map(item => item._emailRow).filter(Boolean);

      if (rows.length > 0 && this.platform) {
        await this.platform.deleteEmails(rows);
      }

      selectedItems.forEach(item => item.remove());

      // Update count
      const remaining = list.querySelectorAll('.aegis-email-item').length;
      header.querySelector('.aegis-category-count').textContent = remaining;

      if (remaining === 0) group.remove();
    });

    // Wire up move to label
    actions.querySelector('.aegis-move-btn').addEventListener('click', (e) => {
      const selectedItems = [...list.querySelectorAll('.aegis-email-item')]
        .filter(item => item.querySelector('.aegis-email-checkbox').checked);

      if (selectedItems.length === 0) {
        alert('請先選擇要移動的郵件');
        return;
      }

      const rows = selectedItems.map(item => item._emailRow).filter(Boolean);
      this._showLabelPicker(e.target, rows, labels, selectedItems, header, list, group);
    });

    return group;
  }

  _showLabelPicker(button, rows, labels, selectedItems, header, list, group) {
    // Remove existing picker
    document.querySelectorAll('.aegis-label-picker').forEach(el => el.remove());

    if (labels.length === 0) {
      alert('未找到標籤，請確認 Gmail 側欄已載入');
      return;
    }

    const picker = document.createElement('div');
    picker.className = 'aegis-label-picker';

    labels.forEach(label => {
      const item = document.createElement('div');
      item.className = 'aegis-label-item';
      item.textContent = label.name;
      item.addEventListener('click', async () => {
        picker.remove();
        if (rows.length > 0 && this.platform) {
          await this.platform.moveToLabel(rows, label.name);
        }
        selectedItems.forEach(item => item.remove());
        const remaining = list.querySelectorAll('.aegis-email-item').length;
        header.querySelector('.aegis-category-count').textContent = remaining;
        if (remaining === 0) group.remove();
      });
      picker.appendChild(item);
    });

    const rect = button.getBoundingClientRect();
    picker.style.top = `${rect.bottom + window.scrollY + 4}px`;
    picker.style.right = `${window.innerWidth - rect.right}px`;
    document.body.appendChild(picker);

    setTimeout(() => {
      document.addEventListener('click', (e) => {
        if (!picker.contains(e.target)) picker.remove();
      }, { once: true });
    }, 10);
  }

  _escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
}

window.AnalysisPanel = AnalysisPanel;
