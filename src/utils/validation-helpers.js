'use strict';

const ValidationHelpers = (() => {
  let _idCounter = 0;

  /**
   * Validates if a string is a valid color (hex, rgb, rgba)
   * @param {string} color - The color string to validate
   * @returns {boolean} - True if valid color, false otherwise
   */
  function isValidColor(color) {
    if (!color || typeof color !== 'string') {
      return false;
    }
    // Match #RRGGBB format or rgb/rgba formatted strings
    const hexColorRegex = /^#[0-9A-Fa-f]{3,6}$/;
    const rgbColorRegex = /^rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*(?:,\s*[\d.]+\s*)?\)$/i;
    return hexColorRegex.test(color) || rgbColorRegex.test(color);
  }

  /**
   * Validates if a string is a valid icon name or emoji character
   * @param {string} emoji - The string to validate
   * @returns {boolean} - True if valid icon/emoji, false otherwise
   */
  function isValidIconOrEmoji(emoji) {
    if (!emoji || typeof emoji !== 'string') {
      return false;
    }

    // Check for alphanumeric icon string (e.g., 'folder', 'shopping-cart')
    if (/^[a-z0-9\-]+$/.test(emoji)) {
      return true;
    }

    const emojiRegex = /^(?:[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F900}-\u{1F9FF}]|[\u{1FA70}-\u{1FAFF}]|[\u{1F018}-\u{1F270}]|[\u{238C}-\u{2454}]|[\u{20D0}-\u{20FF}]|[\u{FE0F}]|[\u{200D}]|[\u{1F3FB}-\u{1F3FF}]|[\u{2B50}]|[\u{2B55}]|[\u{231A}-\u{231B}]|[\u{23E9}-\u{23F3}]|[\u{25AA}-\u{25AB}]|[\u{25B6}]|[\u{25C0}]|[\u{25FB}-\u{25FE}]|[\u{2934}-\u{2935}]|[\u{2B05}-\u{2B07}]|[\u{3030}]|[\u{303D}]|[\u{3297}]|[\u{3299}])+$/u;
    return emojiRegex.test(emoji);
  }

  /**
   * Generates a unique category ID
   * Format: 'custom-' + timestamp + counter + random
   * @returns {string} - Unique category ID
   */
  function generateCategoryId() {
    const timestamp = Date.now();
    _idCounter = (_idCounter + 1) % 1000; // Counter wraps at 1000
    const random = Math.floor(Math.random() * 100).toString().padStart(2, '0');
    return `custom-${timestamp}-${_idCounter.toString().padStart(3, '0')}${random}`;
  }

  return {
    isValidColor,
    isValidIconOrEmoji,
    generateCategoryId
  };
})();

window.ValidationHelpers = ValidationHelpers;
