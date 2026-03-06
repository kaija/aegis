'use strict';

const { describe, test, expect, beforeEach } = require('@jest/globals');
const fs = require('fs');
const path = require('path');

// Load EmojiPicker module
const emojiPickerCode = fs.readFileSync(path.join(__dirname, '../src/ui/emoji-picker.js'), 'utf8');

describe('EmojiPicker', () => {
  beforeEach(() => {
    // Reset DOM
    document.body.innerHTML = '';
    
    // Re-evaluate module to ensure clean state
    eval(emojiPickerCode);
  });

  describe('getCommonEmojis', () => {
    test('should return array of 30 emojis', () => {
      const emojis = EmojiPicker.getCommonEmojis();
      
      expect(Array.isArray(emojis)).toBe(true);
      expect(emojis.length).toBe(30);
    });

    test('should return consistent emoji list', () => {
      const emojis1 = EmojiPicker.getCommonEmojis();
      const emojis2 = EmojiPicker.getCommonEmojis();
      
      expect(emojis1).toEqual(emojis2);
    });

    test('should include common emojis', () => {
      const emojis = EmojiPicker.getCommonEmojis();
      
      // Check for some expected emojis
      expect(emojis).toContain('📧');
      expect(emojis).toContain('💼');
      expect(emojis).toContain('✈️');
      expect(emojis).toContain('❤️');
    });

    test('should return all unique emojis', () => {
      const emojis = EmojiPicker.getCommonEmojis();
      const uniqueEmojis = [...new Set(emojis)];
      
      expect(uniqueEmojis.length).toBe(emojis.length);
    });
  });

  describe('create', () => {
    test('should create emoji picker with empty initial value', () => {
      const picker = EmojiPicker.create();
      
      expect(picker).toBeTruthy();
      expect(picker.className).toBe('aegis-emoji-picker');
      expect(picker._input).toBeTruthy();
      expect(picker._input.value).toBe('');
    });

    test('should create emoji picker with initial emoji', () => {
      const initialEmoji = '🎉';
      const picker = EmojiPicker.create(initialEmoji);
      
      expect(picker._input.value).toBe(initialEmoji);
    });

    test('should create all required elements', () => {
      const picker = EmojiPicker.create('📧');
      
      // Check container
      expect(picker.className).toBe('aegis-emoji-picker');
      
      // Check input
      const input = picker.querySelector('.aegis-emoji-input');
      expect(input).toBeTruthy();
      expect(input.type).toBe('text');
      expect(input.placeholder).toBe('Or type emoji...');
      
      // Check grid
      const grid = picker.querySelector('.aegis-emoji-grid');
      expect(grid).toBeTruthy();
    });

    test('should create 30 emoji buttons', () => {
      const picker = EmojiPicker.create();
      const buttons = picker.querySelectorAll('.aegis-emoji-button');
      
      expect(buttons.length).toBe(30);
    });

    test('should store references to internal elements', () => {
      const picker = EmojiPicker.create('🎨');
      
      expect(picker._input).toBeTruthy();
      expect(picker._grid).toBeTruthy();
      expect(picker._input.tagName).toBe('INPUT');
      expect(picker._grid.tagName).toBe('DIV');
    });

    test('should set maxLength on input', () => {
      const picker = EmojiPicker.create();
      
      expect(picker._input.maxLength).toBe(10);
    });

    test('**Validates: Requirements 6.2** - should set emoji when button is clicked', () => {
      const picker = EmojiPicker.create();
      const buttons = picker.querySelectorAll('.aegis-emoji-button');
      const firstButton = buttons[0];
      const emoji = firstButton.textContent;
      
      // Click the button
      firstButton.click();
      
      expect(picker._input.value).toBe(emoji);
    });

    test('**Validates: Requirements 6.2** - should fire onChange callback when button clicked', () => {
      let callbackFired = false;
      let callbackEmoji = null;
      
      const onChange = (emoji) => {
        callbackFired = true;
        callbackEmoji = emoji;
      };
      
      const picker = EmojiPicker.create('', onChange);
      const buttons = picker.querySelectorAll('.aegis-emoji-button');
      const button = buttons[5]; // Pick a button
      const emoji = button.textContent;
      
      button.click();
      
      expect(callbackFired).toBe(true);
      expect(callbackEmoji).toBe(emoji);
    });

    test('should add selected class to clicked button', () => {
      const picker = EmojiPicker.create();
      const buttons = picker.querySelectorAll('.aegis-emoji-button');
      const button = buttons[3];
      
      button.click();
      
      expect(button.classList.contains('selected')).toBe(true);
    });

    test('should remove selected class from other buttons when one is clicked', () => {
      const picker = EmojiPicker.create();
      const buttons = picker.querySelectorAll('.aegis-emoji-button');
      
      // Click first button
      buttons[0].click();
      expect(buttons[0].classList.contains('selected')).toBe(true);
      
      // Click second button
      buttons[1].click();
      expect(buttons[0].classList.contains('selected')).toBe(false);
      expect(buttons[1].classList.contains('selected')).toBe(true);
    });

    test('should set initial selected state if emoji matches button', () => {
      const emojis = EmojiPicker.getCommonEmojis();
      const testEmoji = emojis[5]; // Pick an emoji from the list
      
      const picker = EmojiPicker.create(testEmoji);
      const buttons = picker.querySelectorAll('.aegis-emoji-button');
      
      let selectedCount = 0;
      buttons.forEach(btn => {
        if (btn.classList.contains('selected')) {
          selectedCount++;
          expect(btn.textContent).toBe(testEmoji);
        }
      });
      
      expect(selectedCount).toBe(1);
    });

    test('**Validates: Requirements 6.3** - should fire onChange when text input changes', () => {
      let callbackEmoji = null;
      const onChange = (emoji) => { callbackEmoji = emoji; };
      
      const picker = EmojiPicker.create('', onChange);
      const input = picker._input;
      
      input.value = '🚀';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      
      expect(callbackEmoji).toBe('🚀');
    });

    test('should clear selected buttons when typing in input', () => {
      const picker = EmojiPicker.create();
      const buttons = picker.querySelectorAll('.aegis-emoji-button');
      
      // Click a button first
      buttons[0].click();
      expect(buttons[0].classList.contains('selected')).toBe(true);
      
      // Type in input
      picker._input.value = '🎯';
      picker._input.dispatchEvent(new Event('input', { bubbles: true }));
      
      // Selected class should be cleared
      expect(buttons[0].classList.contains('selected')).toBe(false);
    });

    test('should work without onChange callback', () => {
      const picker = EmojiPicker.create();
      const buttons = picker.querySelectorAll('.aegis-emoji-button');
      
      // Should not throw error when onChange is not provided
      expect(() => {
        buttons[0].click();
      }).not.toThrow();
    });

    test('should prevent default on button click', () => {
      const picker = EmojiPicker.create();
      const button = picker.querySelectorAll('.aegis-emoji-button')[0];
      
      const event = new MouseEvent('click', { bubbles: true, cancelable: true });
      button.dispatchEvent(event);
      
      // Button should have type="button" to prevent form submission
      expect(button.type).toBe('button');
    });

    test('should set title attribute on emoji buttons', () => {
      const picker = EmojiPicker.create();
      const buttons = picker.querySelectorAll('.aegis-emoji-button');
      
      buttons.forEach(button => {
        expect(button.title).toContain('Select');
        expect(button.title).toContain(button.textContent);
      });
    });
  });

  describe('getValue', () => {
    test('should return current emoji value', () => {
      const picker = EmojiPicker.create('🎉');
      const value = EmojiPicker.getValue(picker);
      
      expect(value).toBe('🎉');
    });

    test('should return updated emoji after button click', () => {
      const picker = EmojiPicker.create('');
      const buttons = picker.querySelectorAll('.aegis-emoji-button');
      const emoji = buttons[0].textContent;
      
      buttons[0].click();
      
      const value = EmojiPicker.getValue(picker);
      expect(value).toBe(emoji);
    });

    test('should return updated emoji after text input', () => {
      const picker = EmojiPicker.create('');
      
      picker._input.value = '🌟';
      
      const value = EmojiPicker.getValue(picker);
      expect(value).toBe('🌟');
    });

    test('should return empty string for invalid picker element', () => {
      const value = EmojiPicker.getValue(null);
      expect(value).toBe('');
    });

    test('should return empty string for element without _input', () => {
      const invalidPicker = document.createElement('div');
      const value = EmojiPicker.getValue(invalidPicker);
      expect(value).toBe('');
    });

    test('should log warning for invalid picker element', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      EmojiPicker.getValue(null);
      
      expect(consoleSpy).toHaveBeenCalledWith('EmojiPicker.getValue: Invalid picker element');
      consoleSpy.mockRestore();
    });
  });

  describe('setValue', () => {
    test('should set emoji value', () => {
      const picker = EmojiPicker.create('');
      
      EmojiPicker.setValue(picker, '🎨');
      
      expect(picker._input.value).toBe('🎨');
    });

    test('should update selected state when setting value to button emoji', () => {
      const picker = EmojiPicker.create('');
      const emojis = EmojiPicker.getCommonEmojis();
      const testEmoji = emojis[10];
      
      EmojiPicker.setValue(picker, testEmoji);
      
      const buttons = picker.querySelectorAll('.aegis-emoji-button');
      let foundSelected = false;
      buttons.forEach(btn => {
        if (btn.textContent === testEmoji) {
          expect(btn.classList.contains('selected')).toBe(true);
          foundSelected = true;
        } else {
          expect(btn.classList.contains('selected')).toBe(false);
        }
      });
      
      expect(foundSelected).toBe(true);
    });

    test('should clear selected state when setting custom emoji', () => {
      const picker = EmojiPicker.create('');
      const buttons = picker.querySelectorAll('.aegis-emoji-button');
      
      // Click a button first
      buttons[0].click();
      expect(buttons[0].classList.contains('selected')).toBe(true);
      
      // Set a custom emoji not in the grid
      EmojiPicker.setValue(picker, '🦄');
      
      // All buttons should be unselected
      buttons.forEach(btn => {
        expect(btn.classList.contains('selected')).toBe(false);
      });
    });

    test('should handle null picker element gracefully', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      expect(() => {
        EmojiPicker.setValue(null, '🎉');
      }).not.toThrow();
      
      expect(consoleSpy).toHaveBeenCalledWith('EmojiPicker.setValue: Invalid picker element');
      consoleSpy.mockRestore();
    });

    test('should handle picker without _input gracefully', () => {
      const invalidPicker = document.createElement('div');
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      expect(() => {
        EmojiPicker.setValue(invalidPicker, '🎉');
      }).not.toThrow();
      
      expect(consoleSpy).toHaveBeenCalledWith('EmojiPicker.setValue: Invalid picker element');
      consoleSpy.mockRestore();
    });

    test('should not fire onChange callback when using setValue', () => {
      let callbackFired = false;
      const onChange = () => { callbackFired = true; };
      
      const picker = EmojiPicker.create('', onChange);
      
      EmojiPicker.setValue(picker, '🎯');
      
      // setValue should not trigger onChange callback
      expect(callbackFired).toBe(false);
    });

    test('should handle emoji sequences', () => {
      const picker = EmojiPicker.create('');
      const emojiSequence = '👨‍👩‍👧‍👦'; // Family emoji (multi-codepoint)
      
      EmojiPicker.setValue(picker, emojiSequence);
      
      expect(picker._input.value).toBe(emojiSequence);
    });
  });

  describe('emoji button grid', () => {
    test('**Validates: Requirements 6.1** - should display grid of common emojis', () => {
      const picker = EmojiPicker.create();
      const buttons = picker.querySelectorAll('.aegis-emoji-button');
      const emojis = EmojiPicker.getCommonEmojis();
      
      expect(buttons.length).toBe(emojis.length);
      
      buttons.forEach((button, index) => {
        expect(button.textContent).toBe(emojis[index]);
      });
    });

    test('should render all emojis in correct order', () => {
      const picker = EmojiPicker.create();
      const buttons = picker.querySelectorAll('.aegis-emoji-button');
      const emojis = EmojiPicker.getCommonEmojis();
      
      for (let i = 0; i < emojis.length; i++) {
        expect(buttons[i].textContent).toBe(emojis[i]);
      }
    });

    test('should have correct CSS classes on buttons', () => {
      const picker = EmojiPicker.create();
      const buttons = picker.querySelectorAll('.aegis-emoji-button');
      
      buttons.forEach(button => {
        expect(button.className).toContain('aegis-emoji-button');
        expect(button.tagName).toBe('BUTTON');
      });
    });
  });

  describe('integration', () => {
    test('should work with multiple pickers independently', () => {
      const picker1 = EmojiPicker.create('🎉');
      const picker2 = EmojiPicker.create('🎨');
      
      expect(EmojiPicker.getValue(picker1)).toBe('🎉');
      expect(EmojiPicker.getValue(picker2)).toBe('🎨');
      
      EmojiPicker.setValue(picker1, '🚀');
      
      expect(EmojiPicker.getValue(picker1)).toBe('🚀');
      expect(EmojiPicker.getValue(picker2)).toBe('🎨'); // Should not change
    });

    test('should maintain state after DOM manipulation', () => {
      const picker = EmojiPicker.create('🎉');
      document.body.appendChild(picker);
      
      EmojiPicker.setValue(picker, '🎨');
      
      expect(EmojiPicker.getValue(picker)).toBe('🎨');
    });

    test('should handle rapid emoji changes', () => {
      const emojis = [];
      const onChange = (emoji) => emojis.push(emoji);
      const picker = EmojiPicker.create('', onChange);
      const buttons = picker.querySelectorAll('.aegis-emoji-button');
      
      // Rapidly click buttons
      for (let i = 0; i < 10; i++) {
        buttons[i].click();
      }
      
      expect(emojis.length).toBe(10);
    });

    test('should switch between button selection and text input', () => {
      const picker = EmojiPicker.create('');
      const buttons = picker.querySelectorAll('.aegis-emoji-button');
      
      // Click a button
      buttons[0].click();
      expect(EmojiPicker.getValue(picker)).toBe(buttons[0].textContent);
      expect(buttons[0].classList.contains('selected')).toBe(true);
      
      // Type in input
      picker._input.value = '🦄';
      picker._input.dispatchEvent(new Event('input', { bubbles: true }));
      expect(EmojiPicker.getValue(picker)).toBe('🦄');
      expect(buttons[0].classList.contains('selected')).toBe(false);
      
      // Click another button
      buttons[5].click();
      expect(EmojiPicker.getValue(picker)).toBe(buttons[5].textContent);
      expect(buttons[5].classList.contains('selected')).toBe(true);
    });

    test('should handle empty input value', () => {
      const picker = EmojiPicker.create('🎉');
      
      picker._input.value = '';
      picker._input.dispatchEvent(new Event('input', { bubbles: true }));
      
      expect(EmojiPicker.getValue(picker)).toBe('');
    });
  });

  describe('module exports', () => {
    test('should export EmojiPicker to window', () => {
      eval(emojiPickerCode);
      expect(window.EmojiPicker).toBeDefined();
      expect(typeof window.EmojiPicker.create).toBe('function');
      expect(typeof window.EmojiPicker.getValue).toBe('function');
      expect(typeof window.EmojiPicker.setValue).toBe('function');
      expect(typeof window.EmojiPicker.getCommonEmojis).toBe('function');
    });

    test('should have correct public API', () => {
      eval(emojiPickerCode);
      const api = window.EmojiPicker;
      
      expect(Object.keys(api).sort()).toEqual(['create', 'getCommonEmojis', 'getValue', 'setValue'].sort());
    });
  });
});
