'use strict';

const OUTLOOK_ACTIONS = {
  trash: {
    tooltips: ['Delete', '刪除'],
    ariaLabels: ['Delete', '刪除'],
    classes: ['button[name="Delete"]', 'button[data-icon-name="Delete"]']
  },
  archive: {
    tooltips: ['Archive', '封存'],
    ariaLabels: ['Archive', '封存'],
    classes: ['button[name="Archive"]']
  },
  moveTo: {
    tooltips: ['Move to', '移至'],
    ariaLabels: ['Move to', '移至'],
    classes: ['button[name="Move to"]', 'button[data-icon-name="MoveToFolder"]']
  }
};

class OutlookPlatform extends BasePlatform {
  getName() {
    return 'Outlook';
  }

  isMatchingPage(url) {
    return url.includes('outlook.live.com') || url.includes('outlook.office.com') || url.includes('outlook.office365.com');
  }

  getEmails(unreadOnly = true) {
    // 1. Identify the central message list container to reliably exclude sidebar folders
    const listContainer = document.querySelector('[aria-label="Message list" i], [aria-label*="Messages" i][role="grid"], [role="listbox"][aria-label*="Message" i]');
    
    let rawRows = [];
    if (listContainer) {
      rawRows = Array.from(listContainer.querySelectorAll('[role="row"], [role="option"], [data-convid]'));
    } else {
      // Fallback: exclude navigation containers
      const allRows = document.querySelectorAll('div[data-convid], div[role="option"], div[role="row"]');
      rawRows = Array.from(allRows).filter(r => !r.closest('[role="navigation"], [role="tree"], nav'));
    }

    // De-duplicate rows just in case
    rawRows = [...new Set(rawRows)];
    const emails = [];
    
    rawRows.forEach((row, index) => {
      // 2. Identify unread status
      const ariaLabel = row.getAttribute('aria-label') || '';
      const isUnread = ariaLabel.includes('Unread') || ariaLabel.includes('未讀') || !!row.querySelector('[data-icon-name="CircleRing"]');
      
      if (unreadOnly && !isUnread) return;

      // 3. Extract Sender and Subject
      let subject = '(無主旨)';
      let sender = '';
      let senderEmail = '';

      // The provided snippet: <span title="smart_leave@trendmicro.com">Taiwan Leave System</span>
      const titleSpans = Array.from(row.querySelectorAll('span[title], div[title]'));
      
      if (titleSpans.length > 0) {
        // Assume first or the one with an '@' in the title is the sender
        const senderSpan = titleSpans.find(span => span.getAttribute('title').includes('@')) || titleSpans[0];
        sender = senderSpan.textContent.trim();
        const possibleEmail = senderSpan.getAttribute('title');
        if (possibleEmail && possibleEmail.includes('@')) {
          senderEmail = possibleEmail.trim();
        }

        // Subject is usually another title span
        const otherSpans = titleSpans.filter(s => s !== senderSpan);
        if (otherSpans.length > 0) {
          subject = otherSpans[0].textContent.trim() || otherSpans[0].getAttribute('title') || subject;
        } else {
           // Look for spans that have robust text content
           const allSpans = Array.from(row.querySelectorAll('span')).filter(s => s.textContent.trim().length > 3);
           const otherTextSpans = allSpans.filter(s => s !== senderSpan && !s.contains(senderSpan) && !senderSpan.contains(s));
           if (otherTextSpans.length > 0) {
             subject = otherTextSpans[0].textContent.trim();
           }
        }
      }

      // Check if aria-label has the info (Strong fallback)
      if (!sender && ariaLabel) {
        const parts = ariaLabel.split(',').map(p => p.trim());
        const offset = (parts[0].includes('Unread') || parts[0].includes('未讀')) ? 1 : 0;
        if (parts.length >= (offset + 2)) {
          sender = parts[offset].replace('From', '').replace('寄件者', '').trim();
          subject = parts[offset + 1].replace('Subject', '').replace('主旨', '').trim();
        }
      }

      // Add to list if we at least matched something that looks like an email row
      if (sender || titleSpans.length > 0) {
        emails.push({
          row,
          subject,
          sender: sender || '(未知寄件者)',
          senderEmail,
          id: `email-${index}-${Date.now()}`
        });
      }
    });

    return emails;
  }

  getLabels() {
    const labels = [];
    const seen = new Set();
    const systemLabels = new Set([
      'Inbox', 'Sent Items', 'Drafts', 'Deleted Items', 'Archive', 'Junk Email',
      '收件匣', '寄件備份', '草稿', '刪除的郵件', '封存', '垃圾郵件'
    ]);

    // Navigation sidebar folders typically have role="treeitem"
    const els = document.querySelectorAll('div[role="treeitem"]');
    for (const el of els) {
      let name = el.getAttribute('title') || el.getAttribute('aria-label') || el.textContent || '';
      name = name.trim();
      
      // Strip screen-reader additions like "19unread", "1item", "selected", or trailing numbers
      name = name.replace(/(^\d+\s*unread\s*)|(^\d+\s*items?\s*)/i, '');
      name = name.replace(/^selected\s+/i, '');
      name = name.replace(/\s*\d+$/, '');
      name = name.trim();

      if (name && !seen.has(name) && !systemLabels.has(name) && name.length > 0 && name.length < 50) {
        seen.add(name);
        labels.push({ name, element: el });
      }
    }
    return labels;
  }

  getEmailDetail() {
    // Reading pane — body container is the most reliable anchor
    const bodyEl = document.querySelector(
      '[aria-label="Message body"], div.BodyFragment, [data-test-id="mailMessageBodyContainer"]'
    );

    // ── Subject ──────────────────────────────────────────────────────────
    // The subject span[title] sits inside [role="main"] (Reading Pane)
    // but ABOVE the ConversationContainer.  We must search from [role="main"].
    let subjectEl = document.querySelector('[data-automationid="subject"]');
    if (!subjectEl) {
      const readingPane = document.querySelector('[role="main"][aria-label="Reading Pane"]')
        || (bodyEl ? bodyEl.closest('[role="main"]') : null);

      if (readingPane) {
        const candidates = readingPane.querySelectorAll('span[title]');
        for (const c of candidates) {
          if (bodyEl && bodyEl.contains(c)) continue;
          const t = c.getAttribute('title') || '';
          if (t.length >= 2 && c.textContent.trim() === t) {
            subjectEl = c;
            break;
          }
        }
      }
    }

    if (!subjectEl && !bodyEl) return null;

    const subject = subjectEl ? subjectEl.textContent.trim() : '';

    // ── Sender ───────────────────────────────────────────────────────────
    let sender = '';
    let senderEmail = '';

    // Try automation id first
    let senderEl = document.querySelector('[data-automationid="sender"]');
    if (senderEl) {
      sender = senderEl.textContent.trim();
      const personEl = senderEl.querySelector('[data-log-name="Person"]');
      if (personEl) {
        senderEmail = personEl.getAttribute('aria-label') || personEl.textContent.trim();
      }
    }

    // Fallback: scan spans near the subject / above the body for an email address
    if (!senderEmail) {
      const readingPane = document.querySelector('[role="main"][aria-label="Reading Pane"]')
        || (bodyEl ? bodyEl.closest('[role="main"]') : null);

      if (readingPane) {
        const spans = readingPane.querySelectorAll('span');
        for (const s of spans) {
          if (bodyEl && bodyEl.contains(s)) continue;
          const txt = s.textContent.trim();
          // Pattern 1: plain email "user@domain.com"
          if (txt.includes('@') && txt.includes('.') && txt.length < 100 && !txt.includes(' ')) {
            senderEmail = txt;
            if (!sender) sender = txt;
            break;
          }
          // Pattern 2: "Display Name<user@domain.com>" (Outlook combines them)
          const angleMatch = txt.match(/^(.+?)<([^@\s]+@[^>\s]+)>$/);
          if (angleMatch) {
            if (!sender) sender = angleMatch[1].trim();
            senderEmail = angleMatch[2].trim();
            break;
          }
        }
      }
    }

    // ── Body & Links ─────────────────────────────────────────────────────
    const body = bodyEl ? bodyEl.textContent.trim().slice(0, 2000) : '';

    const linkEls = bodyEl
      ? bodyEl.querySelectorAll('a[href]')
      : document.querySelectorAll('[aria-label="Message body"] a[href], div.BodyFragment a[href]');
    const links = [];
    linkEls.forEach(a => {
      let href = a.getAttribute('href');
      if (!href || href.startsWith('mailto:')) return;

      // Outlook Safe Links: unwrap the real URL from the wrapper
      // Format: https://*.safelinks.protection.outlook.com/?url=<encoded>&data=...
      if (href.includes('safelinks.protection.outlook.com')) {
        // Prefer the originalsrc attribute Outlook adds to the <a> element
        const original = a.getAttribute('originalsrc');
        if (original) {
          href = original;
        } else {
          try {
            const parsed = new URL(href);
            const realUrl = parsed.searchParams.get('url');
            if (realUrl) href = realUrl;
          } catch { /* keep original href */ }
        }
      }

      const isImageLink = /\.(?:png|jpe?g|gif|webp|svg|bmp|ico|tiff?)(?:[\?#].*)?$/i.test(href);
      if (!isImageLink && links.length < 20) {
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

    // Fallback: Delete key
    document.body.focus();
    document.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Delete', keyCode: 46, bubbles: true, cancelable: true,
    }));
    return true;
  }

  async moveToLabel(rows, labelName) {
    if (!rows || rows.length === 0) return true;

    await this._uncheckAll();
    await this._selectRows(rows);

    // Try keyboard shortcut 'v' for Move To menu (fastest and most reliable in OWA)
    document.body.focus();
    document.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'v', keyCode: 86, bubbles: true, cancelable: true,
    }));
    await this._sleep(500);

    const target = labelName.trim().toLowerCase();
    
    let result = await this._findAndClickFolder(target);
    
    if (result) return true;

    // Fallback: If 'v' hotkey is disabled or failed, try finding the Move To button in toolbar
    const moveBtn = await this._waitForElement(this._buildActionSelectors('moveTo'), 1000);
    if (moveBtn) {
      this._clickElement(moveBtn);
      await this._sleep(500);
      result = await this._findAndClickFolder(target);
      if (result) return true;
    }
    
    return false;
  }

  async _findAndClickFolder(target) {
    const isTarget = (el) => {
      let text = el.textContent.trim().toLowerCase();
      text = text.replace(/(^\d+\s*unread\s*)|(^\d+\s*items?\s*)/i, '').replace(/^selected\s+/i, '').replace(/\s*\d+$/, '').trim();
      const title = (el.getAttribute('title') || '').trim().toLowerCase();
      if (text.includes('different folder') || text.includes('不同的') || text.includes('其他')) return false;
      return title === target || text === target || text.includes(target);
    };

    let menuItem = await this._waitForElement(
      ['button[role="menuitem"]', 'div[role="menuitem"]', 'span[role="menuitem"]', 'button.ms-ContextMenuItem', 'button.ms-Button', 'li'],
      2000,
      isTarget
    );

    if (menuItem) {
      menuItem.scrollIntoView({ block: 'nearest', behavior: 'instant' });
      await this._sleep(100);
      this._clickElement(menuItem);
      return true;
    }

    // Attempt to click "Move to a different folder" if MRU hides the folder
    const differentBtn = await this._waitForElement(
      ['button[role="menuitem"]', 'div[role="menuitem"]', 'span[role="menuitem"]', 'button.ms-ContextMenuItem', 'button.ms-Button', 'li'],
      2000,
      el => {
        const text = el.textContent.trim().toLowerCase();
        return text.includes('different folder') || text.includes('不同的') || text.includes('其他');
      }
    );

    if (differentBtn) {
      this._clickElement(differentBtn);
      await this._sleep(1000); // Wait for modal/dropdown to load

      menuItem = await this._waitForElement(
        ['div[role="treeitem"]', 'button[role="menuitem"]', 'div[role="menuitem"]', 'button.ms-ContextMenuItem', 'button.ms-Button', 'li'],
        3000,
        isTarget
      );

      if (menuItem) {
        menuItem.scrollIntoView({ block: 'nearest', behavior: 'instant' });
        await this._sleep(100);
        this._clickElement(menuItem);
        return true;
      }
    }

    return false;
  }

  _buildActionSelectors(actionKey) {
    const cfg = OUTLOOK_ACTIONS[actionKey];
    if (!cfg) return [];

    const selectors = [];
    (cfg.tooltips || []).forEach(t => selectors.push(`[title*="${t}"]`));
    (cfg.ariaLabels || []).forEach(t => selectors.push(`[aria-label*="${t}"]`));
    (cfg.classes || []).forEach(cls => selectors.push(cls));
    return selectors;
  }

  async _uncheckAll() {
    // Find selected checkboxes/rows
    const selectedRows = document.querySelectorAll('[aria-selected="true"], [aria-checked="true"]');
    for (const el of Array.from(selectedRows)) {
      if (el.getAttribute('role') === 'checkbox') {
        this._clickElement(el);
      } else {
        const avatar = el.querySelector('[id*="avatar" i], [class*="avatar" i]');
        if (avatar) this._clickElement(avatar);
      }
      await this._sleep(100);
    }
    await this._sleep(300);
  }

  async _selectRows(rows) {
    for (const row of rows) {
      row.scrollIntoView({ block: 'nearest', behavior: 'instant' });
      await this._sleep(50);

      // Prefer explicitly clicking the accessible checkbox or the avatar circle
      const checkbox = row.querySelector('[role="checkbox"], div[data-automationid="Avatar"], [id*="avatar" i], [class*="avatar" i]');
      if (checkbox) {
        this._clickElement(checkbox);
        await this._sleep(120);
      } else {
        // Fallback: Ctrl+Click the row directly to select it without opening the email
        const evOpts = { bubbles: true, cancelable: true, ctrlKey: true, metaKey: true };
        row.dispatchEvent(new MouseEvent('mousedown', evOpts));
        row.dispatchEvent(new MouseEvent('mouseup', evOpts));
        row.dispatchEvent(new MouseEvent('click', evOpts));
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
    // Outlook is an SPA — clicking an email changes the URL pathname
    // (e.g. /mail/inbox/id/...) but does NOT change the page title or
    // add/remove direct children of <body>.  A subtree MutationObserver
    // on body is too noisy, so we poll the URL instead.
    let lastUrl = location.href;
    console.log('[Aegis] OutlookPlatform.observeNavigate started. Initial URL:', lastUrl.slice(-50));

    setInterval(() => {
      if (location.href !== lastUrl) {
        console.log('[Aegis] OutlookPlatform poll detected URL change:', location.href.slice(-50));
        lastUrl = location.href;
        callback();
      }
    }, 500);

    // Also handle back/forward navigation
    window.addEventListener('popstate', () => {
      if (location.href !== lastUrl) {
        console.log('[Aegis] OutlookPlatform popstate detected URL change');
        lastUrl = location.href;
        callback();
      }
    });
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

window.OutlookPlatform = OutlookPlatform;
