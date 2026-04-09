'use strict';

const REPLY_SELECTORS = {
  ariaLabels: ['Reply', '回覆'],
  tooltips: ['Reply', '回覆'],
  classes: ['.T-I.J-J5-Ji[data-tooltip]'],
  tooltipContains: ['Reply', '回覆']
};

const GMAIL_ACTIONS = {
  trash: {
    tooltips: ['Move to Trash', '移至垃圾桶'],
    ariaLabels: ['Move to Trash', '移至垃圾桶', '刪除'],
    classes: ['.bkJ'],
    attrs: ['[act="10"]'],
    tooltipContains: ['Trash', '垃圾桶', '刪除']
  },
  moveTo: {
    tooltips: ['Move to', '移至'],
    ariaLabels: ['Move to', '移至'],
    classes: ['.ns7Hcb'],
    attrs: ['[act="3"]'],
    tooltipContains: ['Move', '移至']
  }
};

class GmailPlatform extends BasePlatform {
  getName() {
    return 'Gmail';
  }

  isMatchingPage(url) {
    return url.includes('mail.google.com');
  }

  getEmails(unreadOnly = true) {
    const selector = unreadOnly ? 'tr.zA.zE' : 'tr.zA';
    const rows = document.querySelectorAll(selector);
    const emails = [];
    rows.forEach((row, index) => {
      const subjectEl = row.querySelector('span.bog');
      const senderNameEl = row.querySelector('span.zF');
      const senderEmailEl = row.querySelector('span[email]');
      emails.push({
        row,
        subject: subjectEl ? subjectEl.textContent.trim() : '(無主旨)',
        sender: senderNameEl ? senderNameEl.textContent.trim() : '',
        senderEmail: senderEmailEl ? senderEmailEl.getAttribute('email') : '',
        id: `email-${index}-${Date.now()}`
      });
    });
    return emails;
  }

  getLabels() {
    const labels = [];
    const seen = new Set();
    const systemLabels = new Set([
      '收件匣', '已加星號', '已延後', '重要郵件', '寄件備份', '草稿', '垃圾郵件', '垃圾桶',
      '所有郵件', '排定時間', '論壇', '社群網路', '最新快訊', '購物交易', '促銷內容',
      '[Imap]/寄件備份', '[Imap]/草稿', '建立新的', '管理標籤', '更多', '較少',
      'Inbox', 'Starred', 'Snoozed', 'Important', 'Sent', 'Drafts', 'Spam', 'Trash',
      'All Mail', 'Scheduled', 'Forums', 'Updates', 'Promotions', 'Social'
    ]);

    // Selectors for specific label item parts in the navigation sidebar
    const selectors = [
      'a[href*="#label/"]',
      'a[href*="#inbox"]',
      '.aim .nU',
      'nav .aHS-bnt',
      '[role="navigation"] .aT4',
      'li[role="treeitem"] .n3'
    ];

    for (const sel of selectors) {
      const els = document.querySelectorAll(sel);
      els.forEach(el => {
        // title usually holds the raw label name without unread counts.
        // Fallbacks: aria-label (cleanup needed) or just textContent.
        let name = el.getAttribute('title') || el.textContent || '';

        name = name.trim();

        // Strip ending unread count (e.g. "Work 2") if we fell back to textContent without a cleaner title
        if (!el.getAttribute('title') && /\d+$/.test(name)) {
          // If the element has a child that specifically holds the name, use that.
          const nameContainer = el.querySelector('.nU') || el;
          name = nameContainer.textContent.replace(/\s*\d+$/, '').trim();
        }

        if (name && !seen.has(name) && !systemLabels.has(name) && name.length > 0 && name.length < 50) {
          seen.add(name);
          labels.push({ name, element: el });
        }
      });
      // We don't break early anymore so we can composite both #inbox and #labels 
      // accurately.
    }
    return labels;
  }

  getEmailDetail() {
    const subjectEl = document.querySelector('h2.hP');
    const senderEl = document.querySelector('.gD');
    const bodyEl = document.querySelector('.a3s.aiL');

    if (!subjectEl && !bodyEl) return null;

    const subject = subjectEl ? subjectEl.textContent.trim() : '';
    const sender = senderEl ? (senderEl.getAttribute('name') || senderEl.textContent.trim()) : '';
    const senderEmail = senderEl ? (senderEl.getAttribute('email') || '') : '';
    const body = bodyEl ? bodyEl.textContent.trim().slice(0, 2000) : '';

    const linkEls = document.querySelectorAll('.a3s.aiL a[href]');
    const links = [];
    linkEls.forEach(a => {
      const href = a.getAttribute('href');
      const isImageLink = /\.(?:png|jpe?g|gif|webp|svg|bmp|ico|tiff?)(?:[\?#].*)?$/i.test(href);
      if (href && !href.startsWith('mailto:') && !isImageLink && links.length < 20) {
        links.push(href);
      }
    });

    return { subject, sender, senderEmail, body, links };
  }

  async deleteEmails(rows) {
    if (!rows || rows.length === 0) return true;

    await this._uncheckAll();
    await this._selectRows(rows);

    const trashBtn = await this._waitForElement(this._buildActionSelectors('trash'), 3000);
    if (trashBtn) {
      this._clickElement(trashBtn);
      return true;
    }

    // Fallback: Gmail keyboard shortcut '#' (Shift+3)
    document.body.focus();
    document.dispatchEvent(new KeyboardEvent('keydown', {
      key: '#', keyCode: 51, shiftKey: true, bubbles: true, cancelable: true,
    }));
    return true;
  }

  async moveToLabel(rows, labelName) {
    if (!rows || rows.length === 0) return true;

    await this._uncheckAll();
    await this._selectRows(rows);

    const moveBtn = await this._waitForElement(this._buildActionSelectors('moveTo'), 3000);
    if (!moveBtn) return false;
    this._clickElement(moveBtn);

    const target = labelName.trim().toLowerCase();
    const menuItem = await this._waitForElement(
      ['[role="menuitem"]', '[role="option"]', '.J-N'],
      3000,
      el => {
        const text = el.textContent.trim().toLowerCase();
        const title = (el.getAttribute('title') || '').trim().toLowerCase();
        return title === target || text === target || text.endsWith(target) || text.includes(target);
      }
    );

    if (menuItem) {
      menuItem.scrollIntoView({ block: 'nearest', behavior: 'instant' });
      await this._sleep(100);
      this._clickElement(menuItem);
      return true;
    }
    return false;
  }

  _buildActionSelectors(actionKey) {
    const cfg = GMAIL_ACTIONS[actionKey];
    if (!cfg) return [];

    const selectors = [];
    (cfg.tooltips || []).forEach(t => selectors.push(`[data-tooltip="${t}"]`));
    (cfg.ariaLabels || []).forEach(t => selectors.push(`[aria-label="${t}"]`));
    (cfg.classes || []).forEach(cls => selectors.push(cls));
    (cfg.attrs || []).forEach(attr => selectors.push(attr));
    (cfg.tooltipContains || []).forEach(t => selectors.push(`[data-tooltip*="${t}"]`));
    return selectors;
  }

  async _uncheckAll() {
    const checkedBoxes = document.querySelectorAll('tr.zA [role="checkbox"][aria-checked="true"]');
    if (checkedBoxes.length > 0) {
      checkedBoxes.forEach(cb => this._clickElement(cb));
      await this._sleep(300);
    }
  }

  async _selectRows(rows) {
    for (const row of rows) {
      row.scrollIntoView({ block: 'nearest', behavior: 'instant' });
      await this._sleep(50);

      row.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
      row.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      await this._sleep(80);

      const checkbox = row.querySelector('[role="checkbox"]') ||
        row.querySelector('td.WA div') ||
        row.querySelector('td.xY div[aria-checked]');
      if (checkbox) {
        this._clickElement(checkbox);
        await this._sleep(120);
      }
    }
    await this._sleep(300);
  }

  _clickElement(el) {
    if (!el) return;
    try {
      const ev = { bubbles: true, cancelable: true };
      el.dispatchEvent(new MouseEvent('mousedown', ev));
      el.dispatchEvent(new MouseEvent('mouseup', ev));
      el.click();
    } catch (err) {
      // Fallback to simple click
      el.click();
    }
  }

  _waitForElement(selectors, timeout = 3000, predicate = null) {
    return new Promise(resolve => {
      const start = Date.now();
      const check = () => {
        for (const sel of selectors) {
          for (const el of document.querySelectorAll(sel)) {
            const rect = el.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              if (!predicate || predicate(el)) { resolve(el); return; }
            }
          }
        }
        if (Date.now() - start < timeout) setTimeout(check, 100);
        else resolve(null);
      };
      check();
    });
  }

  observeNavigate(callback) {
    const titleEl = document.querySelector('title');
    if (titleEl) {
      const observer = new MutationObserver(() => callback());
      observer.observe(titleEl, { childList: true });
    }
    window.addEventListener('hashchange', callback);
    let lastUrl = location.href;
    const urlObserver = new MutationObserver(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        callback();
      }
    });
    urlObserver.observe(document.body, { childList: true, subtree: true });
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  clickReplyButton() {
    const selectors = [];
    (REPLY_SELECTORS.ariaLabels || []).forEach(l => selectors.push(`[aria-label="${l}"]`));
    (REPLY_SELECTORS.tooltips || []).forEach(t => selectors.push(`[data-tooltip="${t}"]`));
    (REPLY_SELECTORS.classes || []).forEach(cls => selectors.push(cls));
    (REPLY_SELECTORS.tooltipContains || []).forEach(t => selectors.push(`[data-tooltip*="${t}"]`));

    for (const sel of selectors) {
      const els = document.querySelectorAll(sel);
      for (const el of els) {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          this._clickElement(el);
          return true;
        }
      }
    }
    return false;
  }

  waitForComposeBox(timeout = 3000) {
    return this._waitForElement(
      ['[role="textbox"][aria-label]', 'div[contenteditable="true"]'],
      timeout
    );
  }

  insertReplyContent(composeBox, text) {
    composeBox.innerHTML = text;
    composeBox.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

window.GmailPlatform = GmailPlatform;
