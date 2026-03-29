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
      <h2 id="aegis-eula-title" class="aegis-eula-title">End User License Agreement</h2>
      <div class="aegis-eula-body">
        <p>Please read the following End User License Agreement carefully before using the Aegis Mail extension.</p>
        <p>By using this extension, you agree to the following terms:</p>
        <p>1. <strong>License Grant.</strong> You are granted a non-exclusive, non-transferable license to use the Aegis Mail Chrome Extension for personal, non-commercial purposes.</p>
        <p>2. <strong>Data Collection.</strong> The extension may collect anonymous category-level data (such as email category labels and domain names) to improve classification accuracy. No personal email content, subject lines, full email addresses, or attachment data is ever collected.</p>
        <p>3. <strong>Privacy.</strong> Your privacy is important to us. All data processing occurs locally in your browser unless you have opted in to anonymous data feedback. You may disable data feedback at any time from the Settings page.</p>
        <p>4. <strong>No Warranty.</strong> This extension is provided "as is" without warranty of any kind, express or implied.</p>
        <p>5. <strong>Limitation of Liability.</strong> In no event shall the developers be liable for any damages arising from the use of this extension.</p>
        <p>6. <strong>Modifications.</strong> We reserve the right to modify these terms at any time. Continued use of the extension constitutes acceptance of modified terms.</p>
      </div>
      <p class="aegis-eula-notice">By accepting, anonymous category data feedback will be enabled by default. You can disable this in Settings at any time.</p>
      <div class="aegis-eula-actions">
        <button class="aegis-eula-btn aegis-eula-btn-decline">Decline</button>
        <button class="aegis-eula-btn aegis-eula-btn-accept">Accept</button>
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
    const data = {
      eulaAccepted: true,
      eulaAcceptedAt: new Date().toISOString(),
      dataFeedbackEnabled: true
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
