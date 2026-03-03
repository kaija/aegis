'use strict';

class BasePlatform {
  getName() {
    throw new Error('Not implemented');
  }

  isMatchingPage(url) {
    throw new Error('Not implemented');
  }

  getEmails(unreadOnly = true) {
    throw new Error('Not implemented');
  }

  getLabels() {
    throw new Error('Not implemented');
  }

  getEmailDetail() {
    throw new Error('Not implemented');
  }

  async deleteEmails(rows) {
    throw new Error('Not implemented');
  }

  async moveToLabel(rows, labelName) {
    throw new Error('Not implemented');
  }

  observeNavigate(callback) {
    throw new Error('Not implemented');
  }
}

window.BasePlatform = BasePlatform;
