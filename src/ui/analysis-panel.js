'use strict';

class AnalysisPanel {
  constructor(platform) {
    this.platform = platform;
    this.panel = null;
  }

  show(groups, labels, options = {}) {
    this._filter = options.filter || 'unread';
    this._onFilterChange = options.onFilterChange || null;
    this.hide();
    this.panel = this._createPanel();
    this._render(groups, labels || [], options.isLoading);
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
        <div class="aegis-filter-toggle">
          <button class="aegis-filter-btn ${this._filter === 'unread' ? 'active' : ''}" data-filter="unread">未讀</button>
          <button class="aegis-filter-btn ${this._filter === 'all' ? 'active' : ''}" data-filter="all">全部</button>
        </div>
        <div class="aegis-spinner" id="aegis-spinner"></div>
        <button class="aegis-close-btn" id="aegis-panel-close">✕</button>
      </div>
      <div class="aegis-panel-body" id="aegis-panel-body"></div>
      <div class="aegis-panel-footer" id="aegis-panel-footer"></div>
    `;

    document.body.appendChild(panel);

    panel.querySelector('#aegis-panel-close').addEventListener('click', () => this.hide());

    panel.querySelectorAll('.aegis-filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const filter = btn.dataset.filter;
        if (filter === this._filter) return;
        this._filter = filter;
        panel.querySelectorAll('.aegis-filter-btn').forEach(b => b.classList.toggle('active', b === btn));
        if (this._onFilterChange) this._onFilterChange(filter);
      });
    });

    // Trigger open animation
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        panel.classList.add('aegis-panel-open');
      });
    });

    return panel;
  }

  _render(groups, labels, isLoading = false) {
    const body = this.panel.querySelector('#aegis-panel-body');
    const footer = this.panel.querySelector('#aegis-panel-footer');
    body.innerHTML = '';

    let totalEmails = 0;

    if (groups.size === 0) {
      if (isLoading) {
        body.innerHTML = `
          <div class="aegis-empty-state">
            <div class="aegis-empty-icon" style="animation: pulse 1.5s infinite">✨</div>
            <div>AI 正在認真閱讀與分類...</div>
            <div style="font-size: 12px; color: #5f6368; margin-top: 5px;">請稍候片刻</div>
          </div>
        `;
        footer.textContent = '載入中...';
      } else {
        body.innerHTML = `
          <div class="aegis-empty-state">
            <div class="aegis-empty-icon">📭</div>
            <div>沒有找到未讀郵件</div>
          </div>
        `;
        footer.textContent = '共 0 封未讀郵件';
      }
      return;
    }

    if (isLoading) {
      const loadingRow = document.createElement('div');
      loadingRow.className = 'aegis-loading-row';
      loadingRow.style.textAlign = 'center';
      loadingRow.style.padding = '15px';
      loadingRow.style.color = '#5f6368';
      loadingRow.style.fontSize = '13px';
      loadingRow.style.borderBottom = '1px solid #eee';
      loadingRow.innerHTML = '<span style="display:inline-block; animation: pulse 1.5s infinite">✨</span> AI 繼續分析剩餘郵件中...';
      body.appendChild(loadingRow);
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
      <span class="aegis-category-emoji" style="display:inline-flex;align-items:center;">${window.getPopupIconSvg ? window.getPopupIconSvg(category.emoji) : category.emoji}</span>
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

    const isOutlook = this.platform && this.platform.getName() === 'Outlook';

    // Only show "Move All" if the label actually exists in Gmail
    const labelExists = labels.find(l => l.name === category.name);
    const moveAllBtnHtml = labelExists
      ? `<button class="aegis-action-btn aegis-move-all-btn${isOutlook ? ' aegis-btn-disabled' : ''}" style="background: ${category.color}; color: white; border-color: ${category.color}; font-weight: bold;"${isOutlook ? ' disabled title="Outlook 暫不支援此功能"' : ''}>全部移至「${category.name}」標籤</button>`
      : '';

    actions.innerHTML = `
      ${moveAllBtnHtml}
      <button class="aegis-action-btn aegis-move-btn${isOutlook ? ' aegis-btn-disabled' : ''}"${isOutlook ? ' disabled title="Outlook 暫不支援此功能"' : ''}>移至其他標籤 ▼</button>
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
        this._showNotification('請先選擇要刪除的郵件', 'warning');
        return;
      }

      const rows = selectedItems.map(item => item._emailRow).filter(Boolean);

      let success = true;
      if (rows.length > 0 && this.platform) {
        success = await this.platform.deleteEmails(rows).catch(() => false);
      }

      if (success !== false) { // deletion was confirmed or there was nothing to delete
        selectedItems.forEach(item => item.remove());

        // Update count
        const remaining = list.querySelectorAll('.aegis-email-item').length;
        header.querySelector('.aegis-category-count').textContent = remaining;

        if (remaining === 0) group.remove();
      } else {
        const platformName = this.platform ? this.platform.getName() : '平台';
        this._showNotification(`郵件刪除操作異常，請檢查 ${platformName} 已正常完成刪除流程。`, 'error');
      }
    });

    // Wire up move all to category label button
    const moveAllBtn = actions.querySelector('.aegis-move-all-btn');
    if (moveAllBtn) {
      moveAllBtn.addEventListener('click', async () => {
        const targetLabelText = category.name;

        // 2. Check selections, auto-select all if none selected
        const allItems = [...list.querySelectorAll('.aegis-email-item')];
        let selectedItems = allItems.filter(item => item.querySelector('.aegis-email-checkbox').checked);

        if (selectedItems.length === 0) {
          // Auto select all
          allItems.forEach(item => {
            item.querySelector('.aegis-email-checkbox').checked = true;
          });
          const selectAllHeaderCb = header.querySelector('.aegis-select-all');
          if (selectAllHeaderCb) selectAllHeaderCb.checked = true;
          selectedItems = allItems; // use all
        }

        const rows = selectedItems.map(item => item._emailRow).filter(Boolean);
        if (rows.length === 0 || !this.platform) return;

        moveAllBtn.textContent = '移動中...';
        moveAllBtn.disabled = true;

        // 3. Perform move
        let success = true;
        try {
          success = await this.platform.moveToLabel(rows, targetLabelText);
        } catch (e) {
          success = false;
        }

        if (success !== false) {
          selectedItems.forEach(item => item.remove());
          const remaining = list.querySelectorAll('.aegis-email-item').length;
          header.querySelector('.aegis-category-count').textContent = remaining;
          if (remaining === 0) group.remove();
        } else {
          const platformName = this.platform ? this.platform.getName() : '平台';
          this._showNotification(`移動失敗。請再次確認 ${platformName} 中已有「${targetLabelText}」標籤。`, 'error');
        }

        moveAllBtn.textContent = `全部移至「${category.name}」標籤`;
        moveAllBtn.disabled = false;
      });
    }

    // Wire up move to label
    actions.querySelector('.aegis-move-btn').addEventListener('click', (e) => {
      const selectedItems = [...list.querySelectorAll('.aegis-email-item')]
        .filter(item => item.querySelector('.aegis-email-checkbox').checked);

      if (selectedItems.length === 0) {
        this._showNotification('請先選擇要移動的郵件', 'warning');
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
      const platformName = this.platform ? this.platform.getName() : '平台';
      this._showNotification(`未找到標籤/資料夾，請確認 ${platformName} 側欄已載入`, 'error');
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
        let success = true;
        if (rows.length > 0 && this.platform) {
          success = await this.platform.moveToLabel(rows, label.name).catch(() => false);
        }

        if (success !== false) {
          selectedItems.forEach(item => item.remove());
          const remaining = list.querySelectorAll('.aegis-email-item').length;
          header.querySelector('.aegis-category-count').textContent = remaining;
          if (remaining === 0) group.remove();
        } else {
          const platformName = this.platform ? this.platform.getName() : '平台';
          this._showNotification(`郵件移動操作異常，請檢查 ${platformName} 已正常完成流程。`, 'error');
        }
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

  _showNotification(message, type = 'info') {
    // Remove existing
    document.querySelectorAll('.aegis-notification').forEach(el => el.remove());

    const notif = document.createElement('div');
    notif.className = `aegis-notification aegis-notification-${type}`;

    let icon = 'ℹ️';
    if (type === 'warning') icon = '⚠️';
    if (type === 'error') icon = '❌';

    notif.innerHTML = `
      <div class="aegis-notification-icon">${icon}</div>
      <div class="aegis-notification-text">${this._escapeHtml(message).replace(/\\n/g, '<br>')}</div>
    `;

    document.body.appendChild(notif);

    // Trigger animation
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        notif.classList.add('aegis-notification-show');
      });
    });

    // Dismiss on click
    setTimeout(() => {
      const dismissHandler = () => {
        notif.classList.remove('aegis-notification-show');
        setTimeout(() => notif.remove(), 300);
        document.removeEventListener('click', dismissHandler, true);
      };
      document.addEventListener('click', dismissHandler, true);
    }, 50);
  }

  _escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
}

window.AnalysisPanel = AnalysisPanel;
