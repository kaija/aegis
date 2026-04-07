'use strict';

/**
 * EulaDialog Component
 *
 * Full-screen modal overlay presenting the End User License Agreement.
 * Must be accepted before the extension activates. On acceptance,
 * persists eulaAccepted, eulaAcceptedAt, and dataFeedbackEnabled
 * to chrome.storage.sync.
 */
class EulaDialog {
  constructor() {
    this._overlay = null;
    this._onDecline = null;
    this._escapeHandler = null;
  }

  /**
   * Show the EULA modal overlay.
   * @param {Object} options
   * @param {Function} options.onAccept - called after acceptance is persisted
   * @param {Function} options.onDecline - called when user declines
   */
  show({ onAccept, onDecline }) {
    this.hide();

    this._onDecline = onDecline;
    this._overlay = this._createOverlay(onAccept, onDecline);
    document.body.appendChild(this._overlay);

    this._escapeHandler = (e) => {
      if (e.key === 'Escape') {
        this._handleDecline(onDecline);
      }
    };
    document.addEventListener('keydown', this._escapeHandler);
  }

  /** Remove the dialog from the DOM and clean up listeners */
  hide() {
    if (this._escapeHandler) {
      document.removeEventListener('keydown', this._escapeHandler);
      this._escapeHandler = null;
    }
    if (this._overlay) {
      this._overlay.remove();
      this._overlay = null;
    }
  }

  /**
   * Build the full overlay DOM structure.
   * @param {Function} onAccept
   * @param {Function} onDecline
   * @returns {HTMLElement}
   */
  _createOverlay(onAccept, onDecline) {
    const overlay = document.createElement('div');
    overlay.id = 'aegis-eula-overlay';
    overlay.className = 'aegis-eula-overlay';

    const dialog = document.createElement('div');
    dialog.className = 'aegis-eula-dialog';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', 'aegis-eula-title');

    // Prevent overlay clicks from dismissing — user must explicitly choose
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        e.stopPropagation();
      }
    });

    dialog.innerHTML = `
      <h2 id="aegis-eula-title" class="aegis-eula-title">${t('eulaTitle')}</h2>
      <div class="aegis-eula-body">
        <p>${t('eulaIntro')}</p>
        <p>${t('eulaAgree')}</p>
        <p>${t('eulaClause1')}</p>
        <p>${t('eulaClause2')}</p>
        <p>${t('eulaClause3')}</p>
        <p>${t('eulaClause4')}</p>
        <p>${t('eulaClause5')}</p>
        <p>${t('eulaClause6')}</p>
      </div>
      <div class="aegis-eula-disclosure">
        <h3 class="aegis-eula-disclosure-title">${t('eulaDisclosureTitle')}</h3>
        <p>${t('eulaDisclosureIntro')}</p>
        <ul class="aegis-eula-disclosure-list">
          <li>${t('eulaDisclosureItem1')}</li>
          <li>${t('eulaDisclosureItem2')}</li>
          <li>${t('eulaDisclosureItem3')}</li>
          <li>${t('eulaDisclosureItem4')}</li>
        </ul>
        <p>${t('eulaDisclosureNever')}</p>
        <p>${t('eulaDisclosureThirdParty')}</p>
        <p class="aegis-eula-privacy-link">${t('eulaDisclosurePrivacyLink')}</p>
      </div>
      <label class="aegis-eula-consent-checkbox">
        <input type="checkbox" id="aegis-eula-feedback-consent">
        <span>${t('eulaConsentCheckbox')}</span>
      </label>
      <p class="aegis-eula-notice">${t('eulaNotice')}</p>
      <div class="aegis-eula-actions">
        <button class="aegis-eula-btn aegis-eula-btn-decline">${t('eulaDecline')}</button>
        <button class="aegis-eula-btn aegis-eula-btn-accept">${t('eulaAccept')}</button>
      </div>
    `;

    // Wire up button handlers
    const acceptBtn = dialog.querySelector('.aegis-eula-btn-accept');
    const declineBtn = dialog.querySelector('.aegis-eula-btn-decline');

    acceptBtn.addEventListener('click', () => this._handleAccept(onAccept));
    declineBtn.addEventListener('click', () => this._handleDecline(onDecline));

    overlay.appendChild(dialog);
    return overlay;
  }

  /**
   * Handle Accept: persist state to chrome.storage.sync, then call onAccept.
   * On storage write failure, do NOT call onAccept — log warning instead.
   * @param {Function} onAccept
   */
  _handleAccept(onAccept) {
    const checkbox = this._overlay
      ? this._overlay.querySelector('#aegis-eula-feedback-consent')
      : null;
    const data = {
      eulaAccepted: true,
      eulaAcceptedAt: new Date().toISOString(),
      dataFeedbackEnabled: !!(checkbox && checkbox.checked)
    };

    chrome.storage.sync.set(data, () => {
      if (chrome.runtime.lastError) {
        console.warn('Aegis: Failed to persist EULA acceptance:', chrome.runtime.lastError.message);
        return;
      }
      this.hide();
      if (typeof onAccept === 'function') {
        onAccept();
      }
    });
  }

  /**
   * Handle Decline: remove dialog from DOM, call onDecline.
   * @param {Function} onDecline
   */
  _handleDecline(onDecline) {
    this.hide();
    if (typeof onDecline === 'function') {
      onDecline();
    }
  }
}

window.EulaDialog = EulaDialog;
