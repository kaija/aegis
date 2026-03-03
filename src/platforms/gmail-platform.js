'use strict';

class GmailPlatform extends BasePlatform {
  getName() {
    return 'Gmail';
  }

  isMatchingPage(url) {
    return url.includes('mail.google.com');
  }

  getUnreadEmails() {
    const rows = document.querySelectorAll('tr.zA.zE');
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
    // Try multiple selectors for Gmail labels in sidebar
    const selectors = [
      '[data-tooltip][aria-label]',
      '.aim .nU',
      'nav .aHS-bnt',
      '[role="navigation"] .aT4',
      'li[role="treeitem"] .n3'
    ];
    for (const sel of selectors) {
      const els = document.querySelectorAll(sel);
      els.forEach(el => {
        const name = (el.getAttribute('aria-label') || el.getAttribute('data-tooltip') || el.textContent || '').trim();
        if (name && !seen.has(name) && name.length > 0 && name.length < 50) {
          seen.add(name);
          labels.push({ name, element: el });
        }
      });
      if (labels.length > 0) break;
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
      if (href && !href.startsWith('mailto:') && links.length < 20) {
        links.push(href);
      }
    });

    return { subject, sender, senderEmail, body, links };
  }

  async deleteEmails(rows) {
    if (!rows || rows.length === 0) return;

    // Select each row by clicking its checkbox
    for (const row of rows) {
      const checkbox = row.querySelector('[role="checkbox"], div.oZ-jc, td.xY.aJ5');
      if (checkbox) {
        checkbox.click();
        await this._sleep(100);
      }
    }

    await this._sleep(400);

    // Click trash button in toolbar
    const trashSelectors = [
      '.bkJ[data-tooltip]',
      '[data-tooltip="Move to Trash"]',
      '[data-tooltip="移至垃圾桶"]',
      '[aria-label="Move to Trash"]',
      '[aria-label="移至垃圾桶"]',
      '.bkJ',
      '[act="10"]'
    ];

    for (const sel of trashSelectors) {
      const btn = document.querySelector(sel);
      if (btn) {
        btn.click();
        return;
      }
    }

    // Fallback: try keyboard shortcut
    const focused = document.activeElement;
    document.dispatchEvent(new KeyboardEvent('keydown', { key: '#', bubbles: true }));
  }

  async moveToLabel(rows, labelName) {
    if (!rows || rows.length === 0) return;

    // Select each row
    for (const row of rows) {
      const checkbox = row.querySelector('[role="checkbox"], div.oZ-jc, td.xY.aJ5');
      if (checkbox) {
        checkbox.click();
        await this._sleep(100);
      }
    }

    await this._sleep(400);

    // Find "Move to" button
    const moveSelectors = [
      '[data-tooltip="Move to"]',
      '[aria-label="Move to"]',
      '[data-tooltip*="Move"]',
      '.ns7Hcb',
      '[act="3"]'
    ];

    let moveBtn = null;
    for (const sel of moveSelectors) {
      moveBtn = document.querySelector(sel);
      if (moveBtn) break;
    }

    if (!moveBtn) return;
    moveBtn.click();

    await this._sleep(300);

    // Find label in dropdown
    const menuItems = document.querySelectorAll('[role="menuitem"], [role="option"], .J-N');
    for (const item of menuItems) {
      if (item.textContent.trim().toLowerCase() === labelName.toLowerCase()) {
        item.click();
        return;
      }
    }
  }

  observeNavigate(callback) {
    // Watch title changes (Gmail SPA navigation)
    const titleEl = document.querySelector('title');
    if (titleEl) {
      const observer = new MutationObserver(() => {
        callback();
      });
      observer.observe(titleEl, { childList: true });
    }

    // Also watch hashchange
    window.addEventListener('hashchange', callback);

    // Watch URL changes via MutationObserver on document
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
}

window.GmailPlatform = GmailPlatform;
