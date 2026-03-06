'use strict';

const { describe, test, expect, beforeEach } = require('@jest/globals');
const fs = require('fs');
const path = require('path');

// Load ColorPicker module
const colorPickerCode = fs.readFileSync(path.join(__dirname, '../src/ui/color-picker.js'), 'utf8');

describe('ColorPicker', () => {
  beforeEach(() => {
    // Reset DOM
    document.body.innerHTML = '';
    
    // Re-evaluate module to ensure clean state
    eval(colorPickerCode);
  });

  describe('create', () => {
    test('should create color picker with default color', () => {
      const picker = ColorPicker.create();
      
      expect(picker).toBeTruthy();
      expect(picker.className).toBe('aegis-color-picker');
      expect(picker._input).toBeTruthy();
      expect(picker._input.type).toBe('color');
      expect(picker._input.value).toBe('#4285f4'); // Default color
    });

    test('should create color picker with initial color', () => {
      const initialColor = '#ff0000';
      const picker = ColorPicker.create(initialColor);
      
      expect(picker._input.value).toBe(initialColor);
      expect(picker._preview.style.backgroundColor).toBe('rgb(255, 0, 0)'); // Browser converts to rgb
      expect(picker._label.textContent).toBe(initialColor);
    });

    test('should create all required elements', () => {
      const picker = ColorPicker.create('#00ff00');
      
      // Check container
      expect(picker.className).toBe('aegis-color-picker');
      
      // Check input
      const input = picker.querySelector('.aegis-color-input');
      expect(input).toBeTruthy();
      expect(input.type).toBe('color');
      
      // Check preview
      const preview = picker.querySelector('.aegis-color-preview');
      expect(preview).toBeTruthy();
      
      // Check label
      const label = picker.querySelector('.aegis-color-label');
      expect(label).toBeTruthy();
      expect(label.textContent).toBe('#00ff00');
    });

    test('should store references to internal elements', () => {
      const picker = ColorPicker.create('#123456');
      
      expect(picker._input).toBeTruthy();
      expect(picker._preview).toBeTruthy();
      expect(picker._label).toBeTruthy();
      expect(picker._input.tagName).toBe('INPUT');
      expect(picker._preview.tagName).toBe('DIV');
      expect(picker._label.tagName).toBe('SPAN');
    });

    test('should update preview when color changes', () => {
      const picker = ColorPicker.create('#000000');
      const input = picker._input;
      
      // Simulate color change
      input.value = '#ff00ff';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      
      expect(picker._preview.style.backgroundColor).toBe('rgb(255, 0, 255)');
      expect(picker._label.textContent).toBe('#ff00ff');
    });

    test('should fire onChange callback when color changes', () => {
      let callbackFired = false;
      let callbackColor = null;
      
      const onChange = (color) => {
        callbackFired = true;
        callbackColor = color;
      };
      
      const picker = ColorPicker.create('#000000', onChange);
      const input = picker._input;
      
      // Simulate color change
      input.value = '#abcdef';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      
      expect(callbackFired).toBe(true);
      expect(callbackColor).toBe('#abcdef');
    });

    test('should work without onChange callback', () => {
      const picker = ColorPicker.create('#000000');
      const input = picker._input;
      
      // Should not throw error when onChange is not provided
      expect(() => {
        input.value = '#123456';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }).not.toThrow();
    });

    test('should fire onChange callback multiple times', () => {
      const colors = [];
      const onChange = (color) => colors.push(color);
      
      const picker = ColorPicker.create('#000000', onChange);
      const input = picker._input;
      
      // Change color multiple times
      input.value = '#111111';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      
      input.value = '#222222';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      
      input.value = '#333333';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      
      expect(colors).toEqual(['#111111', '#222222', '#333333']);
    });
  });

  describe('getValue', () => {
    test('should return current color value', () => {
      const picker = ColorPicker.create('#ff0000');
      const value = ColorPicker.getValue(picker);
      
      expect(value).toBe('#ff0000');
    });

    test('should return updated color after change', () => {
      const picker = ColorPicker.create('#000000');
      
      // Change color
      picker._input.value = '#ffffff';
      
      const value = ColorPicker.getValue(picker);
      expect(value).toBe('#ffffff');
    });

    test('should return default color for invalid picker element', () => {
      const value = ColorPicker.getValue(null);
      expect(value).toBe('#000000');
    });

    test('should return default color for element without _input', () => {
      const invalidPicker = document.createElement('div');
      const value = ColorPicker.getValue(invalidPicker);
      expect(value).toBe('#000000');
    });

    test('should log warning for invalid picker element', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      ColorPicker.getValue(null);
      
      expect(consoleSpy).toHaveBeenCalledWith('ColorPicker.getValue: Invalid picker element');
      consoleSpy.mockRestore();
    });
  });

  describe('setValue', () => {
    test('should set color value', () => {
      const picker = ColorPicker.create('#000000');
      
      ColorPicker.setValue(picker, '#ff0000');
      
      expect(picker._input.value).toBe('#ff0000');
    });

    test('should update preview when setting value', () => {
      const picker = ColorPicker.create('#000000');
      
      ColorPicker.setValue(picker, '#00ff00');
      
      expect(picker._preview.style.backgroundColor).toBe('rgb(0, 255, 0)');
    });

    test('should update label when setting value', () => {
      const picker = ColorPicker.create('#000000');
      
      ColorPicker.setValue(picker, '#0000ff');
      
      expect(picker._label.textContent).toBe('#0000ff');
    });

    test('should update all elements at once', () => {
      const picker = ColorPicker.create('#000000');
      
      ColorPicker.setValue(picker, '#abcdef');
      
      expect(picker._input.value).toBe('#abcdef');
      expect(picker._preview.style.backgroundColor).toBe('rgb(171, 205, 239)');
      expect(picker._label.textContent).toBe('#abcdef');
    });

    test('should reject invalid color format', () => {
      const picker = ColorPicker.create('#000000');
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      ColorPicker.setValue(picker, 'red'); // Invalid format
      
      expect(picker._input.value).toBe('#000000'); // Should not change
      expect(consoleSpy).toHaveBeenCalledWith('ColorPicker.setValue: Invalid color format:', 'red');
      consoleSpy.mockRestore();
    });

    test('should reject color without hash', () => {
      const picker = ColorPicker.create('#000000');
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      ColorPicker.setValue(picker, 'ff0000'); // Missing #
      
      expect(picker._input.value).toBe('#000000');
      expect(consoleSpy).toHaveBeenCalledWith('ColorPicker.setValue: Invalid color format:', 'ff0000');
      consoleSpy.mockRestore();
    });

    test('should reject short hex format', () => {
      const picker = ColorPicker.create('#000000');
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      ColorPicker.setValue(picker, '#fff'); // Short format
      
      expect(picker._input.value).toBe('#000000');
      expect(consoleSpy).toHaveBeenCalledWith('ColorPicker.setValue: Invalid color format:', '#fff');
      consoleSpy.mockRestore();
    });

    test('should accept uppercase hex values', () => {
      const picker = ColorPicker.create('#000000');
      
      ColorPicker.setValue(picker, '#ABCDEF');
      
      // HTML5 color input normalizes to lowercase
      expect(picker._input.value).toBe('#abcdef');
    });

    test('should accept lowercase hex values', () => {
      const picker = ColorPicker.create('#000000');
      
      ColorPicker.setValue(picker, '#abcdef');
      
      expect(picker._input.value).toBe('#abcdef');
    });

    test('should accept mixed case hex values', () => {
      const picker = ColorPicker.create('#000000');
      
      ColorPicker.setValue(picker, '#AbCdEf');
      
      // HTML5 color input normalizes to lowercase
      expect(picker._input.value).toBe('#abcdef');
    });

    test('should handle null picker element gracefully', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      expect(() => {
        ColorPicker.setValue(null, '#ff0000');
      }).not.toThrow();
      
      expect(consoleSpy).toHaveBeenCalledWith('ColorPicker.setValue: Invalid picker element');
      consoleSpy.mockRestore();
    });

    test('should handle picker without _input gracefully', () => {
      const invalidPicker = document.createElement('div');
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      expect(() => {
        ColorPicker.setValue(invalidPicker, '#ff0000');
      }).not.toThrow();
      
      expect(consoleSpy).toHaveBeenCalledWith('ColorPicker.setValue: Invalid picker element');
      consoleSpy.mockRestore();
    });

    test('should not fire onChange callback when using setValue', () => {
      let callbackFired = false;
      const onChange = () => { callbackFired = true; };
      
      const picker = ColorPicker.create('#000000', onChange);
      
      ColorPicker.setValue(picker, '#ff0000');
      
      // setValue should not trigger onChange callback
      expect(callbackFired).toBe(false);
    });
  });

  describe('preview updates', () => {
    test('**Validates: Requirements 5.2** - preview displays live color changes', () => {
      const picker = ColorPicker.create('#000000');
      const preview = picker._preview;
      
      // Initial state
      expect(preview.style.backgroundColor).toBe('rgb(0, 0, 0)');
      
      // Change color via input event
      picker._input.value = '#ff0000';
      picker._input.dispatchEvent(new Event('input', { bubbles: true }));
      
      // Preview should update immediately
      expect(preview.style.backgroundColor).toBe('rgb(255, 0, 0)');
    });

    test('**Validates: Requirements 5.2** - preview updates with each color selection', () => {
      const picker = ColorPicker.create('#000000');
      const preview = picker._preview;
      
      const testColors = [
        { hex: '#ff0000', rgb: 'rgb(255, 0, 0)' },
        { hex: '#00ff00', rgb: 'rgb(0, 255, 0)' },
        { hex: '#0000ff', rgb: 'rgb(0, 0, 255)' },
        { hex: '#ffff00', rgb: 'rgb(255, 255, 0)' },
        { hex: '#ff00ff', rgb: 'rgb(255, 0, 255)' }
      ];
      
      testColors.forEach(({ hex, rgb }) => {
        picker._input.value = hex;
        picker._input.dispatchEvent(new Event('input', { bubbles: true }));
        expect(preview.style.backgroundColor).toBe(rgb);
      });
    });

    test('**Validates: Requirements 5.2** - preview matches selected color exactly', () => {
      const picker = ColorPicker.create('#123456');
      
      // Preview should match initial color
      expect(picker._preview.style.backgroundColor).toBe('rgb(18, 52, 86)');
      
      // Change to another color
      picker._input.value = '#abcdef';
      picker._input.dispatchEvent(new Event('input', { bubbles: true }));
      
      // Preview should match new color
      expect(picker._preview.style.backgroundColor).toBe('rgb(171, 205, 239)');
    });

    test('**Validates: Requirements 5.2** - label displays hex value of selected color', () => {
      const picker = ColorPicker.create('#000000');
      const label = picker._label;
      
      // Initial state
      expect(label.textContent).toBe('#000000');
      
      // Change color
      picker._input.value = '#ff8800';
      picker._input.dispatchEvent(new Event('input', { bubbles: true }));
      
      // Label should update
      expect(label.textContent).toBe('#ff8800');
    });
  });

  describe('integration', () => {
    test('should work with multiple pickers independently', () => {
      const picker1 = ColorPicker.create('#ff0000');
      const picker2 = ColorPicker.create('#00ff00');
      
      expect(ColorPicker.getValue(picker1)).toBe('#ff0000');
      expect(ColorPicker.getValue(picker2)).toBe('#00ff00');
      
      ColorPicker.setValue(picker1, '#0000ff');
      
      expect(ColorPicker.getValue(picker1)).toBe('#0000ff');
      expect(ColorPicker.getValue(picker2)).toBe('#00ff00'); // Should not change
    });

    test('should maintain state after DOM manipulation', () => {
      const picker = ColorPicker.create('#ff0000');
      document.body.appendChild(picker);
      
      ColorPicker.setValue(picker, '#00ff00');
      
      expect(ColorPicker.getValue(picker)).toBe('#00ff00');
      expect(picker._preview.style.backgroundColor).toBe('rgb(0, 255, 0)');
    });

    test('should handle rapid color changes', () => {
      const colors = [];
      const onChange = (color) => colors.push(color);
      const picker = ColorPicker.create('#000000', onChange);
      
      // Rapidly change colors
      for (let i = 0; i < 10; i++) {
        const color = `#${i}${i}${i}${i}${i}${i}`;
        picker._input.value = color;
        picker._input.dispatchEvent(new Event('input', { bubbles: true }));
      }
      
      expect(colors.length).toBe(10);
      expect(ColorPicker.getValue(picker)).toBe('#999999');
    });
  });

  describe('module exports', () => {
    test('should export ColorPicker to window', () => {
      eval(colorPickerCode);
      expect(window.ColorPicker).toBeDefined();
      expect(typeof window.ColorPicker.create).toBe('function');
      expect(typeof window.ColorPicker.getValue).toBe('function');
      expect(typeof window.ColorPicker.setValue).toBe('function');
    });

    test('should have correct public API', () => {
      eval(colorPickerCode);
      const api = window.ColorPicker;
      
      expect(Object.keys(api)).toEqual(['create', 'getValue', 'setValue']);
    });
  });
});
