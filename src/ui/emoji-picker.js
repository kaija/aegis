'use strict';

/**
 * EmojiPicker Component
 * 
 * A simple emoji picker with a grid of common emojis and text input for custom emojis.
 * Follows IIFE module pattern used throughout the codebase.
 * 
 * Requirements: 6.1, 6.2, 6.3
 */
const EmojiPicker = (() => {
  /**
   * Get array of 30 common emojis for the picker grid
   * @returns {string[]} Array of emoji characters
   */
  function getCommonEmojis() {
    return [
      '📧', '💼', '🏠', '🛒', '💰',
      '✈️', '🏖️', '🎉', '📱', '💻',
      '📚', '🎓', '🏥', '🍔', '☕',
      '🚗', '🎵', '🎮', '⚽', '🎨',
      '📷', '🔔', '⭐', '❤️', '🎁',
      '📝', '🔒', '⚠️', '✅', '❌'
    ];
  }

  /**
   * Create an emoji picker with grid and text input
   * @param {string} initialEmoji - Initial emoji to display
   * @param {Function} onChange - Callback fired when emoji changes (receives emoji string)
   * @returns {HTMLElement} Container element with emoji grid and text input
   */
  function create(initialEmoji, onChange) {
    const container = document.createElement('div');
    container.className = 'aegis-emoji-picker';

    // Create text input for custom emoji
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'aegis-emoji-input';
    input.placeholder = 'Or type emoji...';
    input.value = initialEmoji || '';
    input.maxLength = 10; // Allow for emoji sequences

    // Create emoji grid container
    const grid = document.createElement('div');
    grid.className = 'aegis-emoji-grid';

    // Create emoji buttons
    const emojis = getCommonEmojis();
    emojis.forEach(emoji => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'aegis-emoji-button';
      button.textContent = emoji;
      button.title = `Select ${emoji}`;

      // Handle emoji button click
      button.addEventListener('click', (e) => {
        e.preventDefault();
        input.value = emoji;
        
        // Update selected state
        grid.querySelectorAll('.aegis-emoji-button').forEach(btn => {
          btn.classList.remove('selected');
        });
        button.classList.add('selected');

        if (onChange) {
          onChange(emoji);
        }
      });

      grid.appendChild(button);
    });

    // Handle text input changes
    input.addEventListener('input', (e) => {
      const emoji = e.target.value;
      
      // Clear selected state from buttons
      grid.querySelectorAll('.aegis-emoji-button').forEach(btn => {
        btn.classList.remove('selected');
      });

      if (onChange) {
        onChange(emoji);
      }
    });

    // Assemble the component
    container.appendChild(input);
    container.appendChild(grid);

    // Store references for getValue/setValue
    container._input = input;
    container._grid = grid;

    // Set initial selected state if initialEmoji matches a button
    if (initialEmoji) {
      const buttons = grid.querySelectorAll('.aegis-emoji-button');
      buttons.forEach(btn => {
        if (btn.textContent === initialEmoji) {
          btn.classList.add('selected');
        }
      });
    }

    return container;
  }

  /**
   * Get the current emoji value from an emoji picker
   * @param {HTMLElement} pickerElement - The emoji picker container element
   * @returns {string} Current emoji value
   */
  function getValue(pickerElement) {
    if (!pickerElement || !pickerElement._input) {
      console.warn('EmojiPicker.getValue: Invalid picker element');
      return '';
    }
    return pickerElement._input.value;
  }

  /**
   * Set the emoji value of an emoji picker
   * @param {HTMLElement} pickerElement - The emoji picker container element
   * @param {string} emoji - Emoji character or sequence
   */
  function setValue(pickerElement, emoji) {
    if (!pickerElement || !pickerElement._input) {
      console.warn('EmojiPicker.setValue: Invalid picker element');
      return;
    }

    pickerElement._input.value = emoji;

    // Update selected state in grid
    const buttons = pickerElement._grid.querySelectorAll('.aegis-emoji-button');
    buttons.forEach(btn => {
      if (btn.textContent === emoji) {
        btn.classList.add('selected');
      } else {
        btn.classList.remove('selected');
      }
    });
  }

  // Public API
  return {
    create,
    getValue,
    setValue,
    getCommonEmojis
  };
})();

// Export to window for use by other modules
window.EmojiPicker = EmojiPicker;
