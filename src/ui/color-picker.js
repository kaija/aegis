'use strict';

/**
 * ColorPicker Component
 * 
 * A simple wrapper around HTML5 color input with live preview.
 * Follows IIFE module pattern used throughout the codebase.
 * 
 * Requirements: 5.1, 5.2
 */
const ColorPicker = (() => {
  /**
   * Create a color picker with live preview
   * @param {string} initialColor - Initial color in #RRGGBB format
   * @param {Function} onChange - Callback fired when color changes (receives color string)
   * @returns {HTMLElement} Container element with color input and preview
   */
  function create(initialColor, onChange) {
    const container = document.createElement('div');
    container.className = 'aegis-color-picker';

    // Create color input
    const input = document.createElement('input');
    input.type = 'color';
    input.className = 'aegis-color-input';
    input.value = initialColor || '#4285f4';

    // Create preview div
    const preview = document.createElement('div');
    preview.className = 'aegis-color-preview';
    preview.style.backgroundColor = input.value;

    // Create label to show hex value
    const label = document.createElement('span');
    label.className = 'aegis-color-label';
    label.textContent = input.value;

    // Update preview and label on color change
    input.addEventListener('input', (e) => {
      const color = e.target.value;
      preview.style.backgroundColor = color;
      label.textContent = color;
      if (onChange) {
        onChange(color);
      }
    });

    // Assemble the component
    container.appendChild(input);
    container.appendChild(preview);
    container.appendChild(label);

    // Store references for getValue/setValue
    container._input = input;
    container._preview = preview;
    container._label = label;

    return container;
  }

  /**
   * Get the current color value from a color picker
   * @param {HTMLElement} pickerElement - The color picker container element
   * @returns {string} Current color in #RRGGBB format
   */
  function getValue(pickerElement) {
    if (!pickerElement || !pickerElement._input) {
      console.warn('ColorPicker.getValue: Invalid picker element');
      return '#000000';
    }
    return pickerElement._input.value;
  }

  /**
   * Set the color value of a color picker
   * @param {HTMLElement} pickerElement - The color picker container element
   * @param {string} color - Color in #RRGGBB format
   */
  function setValue(pickerElement, color) {
    if (!pickerElement || !pickerElement._input) {
      console.warn('ColorPicker.setValue: Invalid picker element');
      return;
    }

    // Validate color format
    if (!/^#[0-9A-Fa-f]{6}$/.test(color)) {
      console.warn('ColorPicker.setValue: Invalid color format:', color);
      return;
    }

    pickerElement._input.value = color;
    pickerElement._preview.style.backgroundColor = color;
    pickerElement._label.textContent = color;
  }

  // Public API
  return {
    create,
    getValue,
    setValue
  };
})();

// Export to window for use by other modules
window.ColorPicker = ColorPicker;
