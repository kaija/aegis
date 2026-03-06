'use strict';

const { describe, test, expect, beforeEach, afterEach } = require('@jest/globals');
const fs = require('fs');
const path = require('path');

// Load required modules
const colorPickerCode = fs.readFileSync(path.join(__dirname, '../src/ui/color-picker.js'), 'utf8');
const emojiPickerCode = fs.readFileSync(path.join(__dirname, '../src/ui/emoji-picker.js'), 'utf8');
const categoryDialogCode = fs.readFileSync(path.join(__dirname, '../src/ui/category-dialog.js'), 'utf8');

describe('CategoryDialog', () => {
  beforeEach(() => {
    // Reset DOM
    document.body.innerHTML = '';
    
    // Re-evaluate modules to ensure clean state
    eval(colorPickerCode);
    eval(emojiPickerCode);
    eval(categoryDialogCode);
  });

  afterEach(() => {
    // Clean up any dialogs
    const overlay = document.querySelector('.aegis-dialog-overlay');
    if (overlay) {
      overlay.remove();
    }
  });

  describe('show', () => {
    test('should display modal when show() is called', () => {
      CategoryDialog.show('create', null);
      
      const overlay = document.querySelector('.aegis-dialog-overlay');
      expect(overlay).toBeTruthy();
      expect(overlay.style.display).toBe('flex');
    });

    test('should create dialog elements on first show', () => {
      CategoryDialog.show('create', null);
      
      const overlay = document.querySelector('.aegis-dialog-overlay');
      const dialog = overlay.querySelector('.aegis-category-dialog');
      const header = dialog.querySelector('.aegis-dialog-header');
      const body = dialog.querySelector('.aegis-dialog-body');
      const footer = dialog.querySelector('.aegis-dialog-footer');
      
      expect(dialog).toBeTruthy();
      expect(header).toBeTruthy();
      expect(body).toBeTruthy();
      expect(footer).toBeTruthy();
    });

    test('should reuse existing dialog on subsequent shows', () => {
      CategoryDialog.show('create', null);
      const firstOverlay = document.querySelector('.aegis-dialog-overlay');
      
      CategoryDialog.hide();
      CategoryDialog.show('create', null);
      const secondOverlay = document.querySelector('.aegis-dialog-overlay');
      
      expect(firstOverlay).toBe(secondOverlay);
    });

    test('should set title to "Add Category" in create mode', () => {
      CategoryDialog.show('create', null);
      
      const title = document.querySelector('.aegis-dialog-title');
      expect(title.textContent).toBe('Add Category');
    });

    test('should set title to "Edit Category" in edit mode', () => {
      const categoryData = {
        id: 'test-1',
        name: 'Test Category',
        emoji: '📧',
        color: '#ff0000',
        bgColor: '#ffeeee'
      };
      
      CategoryDialog.show('edit', categoryData);
      
      const title = document.querySelector('.aegis-dialog-title');
      expect(title.textContent).toBe('Edit Category');
    });

    test('should set save button text to "Create" in create mode', () => {
      CategoryDialog.show('create', null);
      
      const saveBtn = document.querySelector('.aegis-dialog-btn-primary');
      expect(saveBtn.textContent).toBe('Create');
    });

    test('should set save button text to "Save Changes" in edit mode', () => {
      const categoryData = {
        id: 'test-1',
        name: 'Test',
        emoji: '📧',
        color: '#000000',
        bgColor: '#ffffff'
      };
      
      CategoryDialog.show('edit', categoryData);
      
      const saveBtn = document.querySelector('.aegis-dialog-btn-primary');
      expect(saveBtn.textContent).toBe('Save Changes');
    });

    test('should populate form with category data in edit mode', () => {
      const categoryData = {
        id: 'test-1',
        name: 'Work',
        emoji: '💼',
        color: '#4285f4',
        bgColor: '#e8f0fe'
      };
      
      CategoryDialog.show('edit', categoryData);
      
      const formData = CategoryDialog.getFormData();
      expect(formData.name).toBe('Work');
      expect(formData.emoji).toBe('💼');
      expect(formData.color).toBe('#4285f4');
      expect(formData.bgColor).toBe('#e8f0fe');
    });

    test('should reset form with default values in create mode', () => {
      // First show with data
      CategoryDialog.show('edit', {
        id: 'test-1',
        name: 'Old Name',
        emoji: '🎨',
        color: '#ff0000',
        bgColor: '#ffeeee'
      });
      
      // Then show in create mode
      CategoryDialog.show('create', null);
      
      const formData = CategoryDialog.getFormData();
      expect(formData.name).toBe('');
      expect(formData.emoji).toBe('📧');
      expect(formData.color).toBe('#4285f4');
      expect(formData.bgColor).toBe('#e8f0fe');
    });

    test('should clear any previous errors when showing', () => {
      CategoryDialog.show('create', null);
      
      // Manually add an error
      const formGroup = document.querySelector('[data-field="name"]');
      formGroup.classList.add('aegis-form-group-error');
      const errorMsg = formGroup.querySelector('.aegis-form-error');
      errorMsg.style.display = 'block';
      errorMsg.textContent = 'Test error';
      
      // Show again
      CategoryDialog.show('create', null);
      
      expect(formGroup.classList.contains('aegis-form-group-error')).toBe(false);
      expect(errorMsg.style.display).toBe('none');
      expect(errorMsg.textContent).toBe('');
    });

    test('should create form with all required fields', () => {
      CategoryDialog.show('create', null);
      
      const nameInput = document.querySelector('input[name="name"]');
      const emojiPicker = document.querySelector('.aegis-emoji-picker');
      const colorPickers = document.querySelectorAll('.aegis-color-picker');
      
      expect(nameInput).toBeTruthy();
      expect(emojiPicker).toBeTruthy();
      expect(colorPickers.length).toBe(2); // Text color and background color
    });

    test('should set name input attributes correctly', () => {
      CategoryDialog.show('create', null);
      
      const nameInput = document.querySelector('input[name="name"]');
      expect(nameInput.type).toBe('text');
      expect(nameInput.maxLength).toBe(20);
      expect(nameInput.required).toBe(true);
      expect(nameInput.placeholder).toContain('Work');
    });
  });

  describe('hide', () => {
    test('should close modal when hide() is called', () => {
      CategoryDialog.show('create', null);
      const overlay = document.querySelector('.aegis-dialog-overlay');
      
      CategoryDialog.hide();
      
      expect(overlay.style.display).toBe('none');
    });

    test('should reset form when hiding', () => {
      CategoryDialog.show('create', null);
      
      // Fill in some data
      const nameInput = document.querySelector('input[name="name"]');
      nameInput.value = 'Test Category';
      
      CategoryDialog.hide();
      CategoryDialog.show('create', null);
      
      const formData = CategoryDialog.getFormData();
      expect(formData.name).toBe('');
    });

    test('should clear errors when hiding', () => {
      CategoryDialog.show('create', null);
      
      // Add an error
      const formGroup = document.querySelector('[data-field="name"]');
      formGroup.classList.add('aegis-form-group-error');
      
      CategoryDialog.hide();
      CategoryDialog.show('create', null);
      
      expect(formGroup.classList.contains('aegis-form-group-error')).toBe(false);
    });

    test('should work when called without showing first', () => {
      expect(() => {
        CategoryDialog.hide();
      }).not.toThrow();
    });

    test('should call onCancel callback when hiding', () => {
      let cancelCalled = false;
      CategoryDialog.onCancel(() => { cancelCalled = true; });
      
      CategoryDialog.show('create', null);
      CategoryDialog.hide();
      
      expect(cancelCalled).toBe(true);
    });
  });

  describe('getFormData', () => {
    test('should extract correct values from form', () => {
      CategoryDialog.show('create', null);
      
      const nameInput = document.querySelector('input[name="name"]');
      nameInput.value = 'Travel';
      
      const formData = CategoryDialog.getFormData();
      
      expect(formData).toBeTruthy();
      expect(formData.name).toBe('Travel');
      expect(formData.emoji).toBe('📧'); // Default
      expect(formData.color).toBe('#4285f4'); // Default
      expect(formData.bgColor).toBe('#e8f0fe'); // Default
    });

    test('should trim whitespace from name', () => {
      CategoryDialog.show('create', null);
      
      const nameInput = document.querySelector('input[name="name"]');
      nameInput.value = '  Shopping  ';
      
      const formData = CategoryDialog.getFormData();
      expect(formData.name).toBe('Shopping');
    });

    test('should return current emoji picker value', () => {
      CategoryDialog.show('create', null);
      
      const emojiPicker = document.querySelector('.aegis-emoji-picker');
      window.EmojiPicker.setValue(emojiPicker, '✈️');
      
      const formData = CategoryDialog.getFormData();
      expect(formData.emoji).toBe('✈️');
    });

    test('should return current color picker values', () => {
      CategoryDialog.show('create', null);
      
      const colorPickers = document.querySelectorAll('.aegis-color-picker');
      window.ColorPicker.setValue(colorPickers[0], '#ff0000');
      window.ColorPicker.setValue(colorPickers[1], '#ffeeee');
      
      const formData = CategoryDialog.getFormData();
      expect(formData.color).toBe('#ff0000');
      expect(formData.bgColor).toBe('#ffeeee');
    });

    test('should return null if dialog not initialized', () => {
      const formData = CategoryDialog.getFormData();
      expect(formData).toBeNull();
    });

    test('should return object with all required fields', () => {
      CategoryDialog.show('create', null);
      
      const formData = CategoryDialog.getFormData();
      
      expect(formData).toHaveProperty('name');
      expect(formData).toHaveProperty('emoji');
      expect(formData).toHaveProperty('color');
      expect(formData).toHaveProperty('bgColor');
    });
  });

  describe('setFormData', () => {
    test('should populate form correctly', () => {
      CategoryDialog.show('create', null);
      
      const data = {
        name: 'Finance',
        emoji: '💰',
        color: '#00ff00',
        bgColor: '#eeffee'
      };
      
      CategoryDialog.setFormData(data);
      
      const formData = CategoryDialog.getFormData();
      expect(formData.name).toBe('Finance');
      expect(formData.emoji).toBe('💰');
      expect(formData.color).toBe('#00ff00');
      expect(formData.bgColor).toBe('#eeffee');
    });

    test('should set name input value', () => {
      CategoryDialog.show('create', null);
      
      CategoryDialog.setFormData({ name: 'Health' });
      
      const nameInput = document.querySelector('input[name="name"]');
      expect(nameInput.value).toBe('Health');
    });

    test('should set emoji picker value', () => {
      CategoryDialog.show('create', null);
      
      CategoryDialog.setFormData({ emoji: '🏥' });
      
      const emojiPicker = document.querySelector('.aegis-emoji-picker');
      const emoji = window.EmojiPicker.getValue(emojiPicker);
      expect(emoji).toBe('🏥');
    });

    test('should set color picker values', () => {
      CategoryDialog.show('create', null);
      
      CategoryDialog.setFormData({
        color: '#0000ff',
        bgColor: '#eeeeff'
      });
      
      const colorPickers = document.querySelectorAll('.aegis-color-picker');
      const textColor = window.ColorPicker.getValue(colorPickers[0]);
      const bgColor = window.ColorPicker.getValue(colorPickers[1]);
      
      expect(textColor).toBe('#0000ff');
      expect(bgColor).toBe('#eeeeff');
    });

    test('should handle partial data', () => {
      CategoryDialog.show('create', null);
      
      // Set initial values
      CategoryDialog.setFormData({
        name: 'Initial',
        emoji: '🎨',
        color: '#111111',
        bgColor: '#222222'
      });
      
      // Update only name
      CategoryDialog.setFormData({ name: 'Updated' });
      
      const formData = CategoryDialog.getFormData();
      expect(formData.name).toBe('Updated');
      // Other fields should remain unchanged
      expect(formData.emoji).toBe('🎨');
      expect(formData.color).toBe('#111111');
      expect(formData.bgColor).toBe('#222222');
    });

    test('should handle empty data object', () => {
      CategoryDialog.show('create', null);
      
      expect(() => {
        CategoryDialog.setFormData({});
      }).not.toThrow();
    });

    test('should do nothing if dialog not initialized', () => {
      expect(() => {
        CategoryDialog.setFormData({ name: 'Test' });
      }).not.toThrow();
    });
  });

  describe('cancel button', () => {
    test('**Validates: Requirements 2.5** - cancel button closes without saving', () => {
      let saveCalled = false;
      CategoryDialog.onSave(() => { saveCalled = true; });
      
      CategoryDialog.show('create', null);
      
      // Fill in form
      const nameInput = document.querySelector('input[name="name"]');
      nameInput.value = 'Test Category';
      
      // Click cancel button
      const cancelBtn = document.querySelector('.aegis-dialog-btn-secondary');
      cancelBtn.click();
      
      // Dialog should be hidden
      const overlay = document.querySelector('.aegis-dialog-overlay');
      expect(overlay.style.display).toBe('none');
      
      // Save callback should not be called
      expect(saveCalled).toBe(false);
    });

    test('cancel button should have correct text', () => {
      CategoryDialog.show('create', null);
      
      const cancelBtn = document.querySelector('.aegis-dialog-btn-secondary');
      expect(cancelBtn.textContent).toBe('Cancel');
    });

    test('cancel button should have correct type', () => {
      CategoryDialog.show('create', null);
      
      const cancelBtn = document.querySelector('.aegis-dialog-btn-secondary');
      expect(cancelBtn.type).toBe('button');
    });
  });

  describe('save button', () => {
    test('should call onSave callback with form data', () => {
      let savedData = null;
      CategoryDialog.onSave((result) => { savedData = result; });
      
      CategoryDialog.show('create', null);
      
      const nameInput = document.querySelector('input[name="name"]');
      nameInput.value = 'New Category';
      
      const saveBtn = document.querySelector('.aegis-dialog-btn-primary');
      saveBtn.click();
      
      expect(savedData).toBeTruthy();
      expect(savedData.mode).toBe('create');
      expect(savedData.data.name).toBe('New Category');
    });

    test('should include mode in save callback', () => {
      let savedResult = null;
      CategoryDialog.onSave((result) => { savedResult = result; });
      
      CategoryDialog.show('edit', {
        id: 'test-1',
        name: 'Test',
        emoji: '📧',
        color: '#000000',
        bgColor: '#ffffff'
      });
      
      const nameInput = document.querySelector('input[name="name"]');
      nameInput.value = 'Updated';
      
      const saveBtn = document.querySelector('.aegis-dialog-btn-primary');
      saveBtn.click();
      
      expect(savedResult.mode).toBe('edit');
      expect(savedResult.categoryId).toBe('test-1');
    });

    test('should close dialog after successful save', () => {
      CategoryDialog.onSave(() => {});
      
      CategoryDialog.show('create', null);
      
      const nameInput = document.querySelector('input[name="name"]');
      nameInput.value = 'Valid Name';
      
      const saveBtn = document.querySelector('.aegis-dialog-btn-primary');
      saveBtn.click();
      
      const overlay = document.querySelector('.aegis-dialog-overlay');
      expect(overlay.style.display).toBe('none');
    });

    test('should validate form before calling onSave', () => {
      let saveCalled = false;
      CategoryDialog.onSave(() => { saveCalled = true; });
      
      CategoryDialog.show('create', null);
      
      // Leave name empty (invalid)
      const saveBtn = document.querySelector('.aegis-dialog-btn-primary');
      saveBtn.click();
      
      // Save should not be called
      expect(saveCalled).toBe(false);
      
      // Dialog should remain open
      const overlay = document.querySelector('.aegis-dialog-overlay');
      expect(overlay.style.display).toBe('flex');
    });

    test('should display validation errors', () => {
      CategoryDialog.show('create', null);
      
      // Leave name empty
      const saveBtn = document.querySelector('.aegis-dialog-btn-primary');
      saveBtn.click();
      
      const nameGroup = document.querySelector('[data-field="name"]');
      const errorMsg = nameGroup.querySelector('.aegis-form-error');
      
      expect(nameGroup.classList.contains('aegis-form-group-error')).toBe(true);
      expect(errorMsg.style.display).toBe('block');
      expect(errorMsg.textContent).toContain('required');
    });

    test('should validate name length', () => {
      CategoryDialog.show('create', null);
      
      const nameInput = document.querySelector('input[name="name"]');
      nameInput.value = 'This is a very long category name that exceeds twenty characters';
      
      const saveBtn = document.querySelector('.aegis-dialog-btn-primary');
      saveBtn.click();
      
      const nameGroup = document.querySelector('[data-field="name"]');
      const errorMsg = nameGroup.querySelector('.aegis-form-error');
      
      expect(errorMsg.style.display).toBe('block');
      expect(errorMsg.textContent).toContain('20 characters');
    });

    test('should validate emoji is required', () => {
      CategoryDialog.show('create', null);
      
      const nameInput = document.querySelector('input[name="name"]');
      nameInput.value = 'Valid Name';
      
      // Clear emoji
      const emojiPicker = document.querySelector('.aegis-emoji-picker');
      window.EmojiPicker.setValue(emojiPicker, '');
      
      const saveBtn = document.querySelector('.aegis-dialog-btn-primary');
      saveBtn.click();
      
      const emojiGroup = document.querySelector('[data-field="emoji"]');
      const errorMsg = emojiGroup.querySelector('.aegis-form-error');
      
      expect(errorMsg.style.display).toBe('block');
      expect(errorMsg.textContent).toContain('required');
    });

    test('should clear previous errors before validating', () => {
      CategoryDialog.show('create', null);
      
      // First validation failure
      const saveBtn = document.querySelector('.aegis-dialog-btn-primary');
      saveBtn.click();
      
      const nameGroup = document.querySelector('[data-field="name"]');
      expect(nameGroup.classList.contains('aegis-form-group-error')).toBe(true);
      
      // Fix the error
      const nameInput = document.querySelector('input[name="name"]');
      nameInput.value = 'Valid Name';
      
      // Try again
      saveBtn.click();
      
      // Error should be cleared (dialog closes on success)
      const overlay = document.querySelector('.aegis-dialog-overlay');
      expect(overlay.style.display).toBe('none');
    });
  });

  describe('close button', () => {
    test('should close dialog when X button is clicked', () => {
      CategoryDialog.show('create', null);
      
      const closeBtn = document.querySelector('.aegis-dialog-close');
      closeBtn.click();
      
      const overlay = document.querySelector('.aegis-dialog-overlay');
      expect(overlay.style.display).toBe('none');
    });

    test('close button should have correct content', () => {
      CategoryDialog.show('create', null);
      
      const closeBtn = document.querySelector('.aegis-dialog-close');
      expect(closeBtn.innerHTML).toBe('×');
    });

    test('close button should have correct type', () => {
      CategoryDialog.show('create', null);
      
      const closeBtn = document.querySelector('.aegis-dialog-close');
      expect(closeBtn.type).toBe('button');
    });
  });

  describe('overlay click', () => {
    test('should close dialog when clicking overlay background', () => {
      CategoryDialog.show('create', null);
      
      const overlay = document.querySelector('.aegis-dialog-overlay');
      overlay.click();
      
      expect(overlay.style.display).toBe('none');
    });

    test('should not close when clicking dialog content', () => {
      CategoryDialog.show('create', null);
      
      const dialog = document.querySelector('.aegis-category-dialog');
      dialog.click();
      
      const overlay = document.querySelector('.aegis-dialog-overlay');
      expect(overlay.style.display).toBe('flex');
    });
  });

  describe('keyboard shortcuts', () => {
    test('should close dialog on Escape key', () => {
      CategoryDialog.show('create', null);
      
      const event = new KeyboardEvent('keydown', { key: 'Escape' });
      document.dispatchEvent(event);
      
      const overlay = document.querySelector('.aegis-dialog-overlay');
      expect(overlay.style.display).toBe('none');
    });

    test('should not close on other keys', () => {
      CategoryDialog.show('create', null);
      
      const event = new KeyboardEvent('keydown', { key: 'Enter' });
      document.dispatchEvent(event);
      
      const overlay = document.querySelector('.aegis-dialog-overlay');
      expect(overlay.style.display).toBe('flex');
    });

    test('should not respond to Escape when dialog is hidden', () => {
      CategoryDialog.show('create', null);
      CategoryDialog.hide();
      
      const overlay = document.querySelector('.aegis-dialog-overlay');
      const initialDisplay = overlay.style.display;
      
      const event = new KeyboardEvent('keydown', { key: 'Escape' });
      document.dispatchEvent(event);
      
      expect(overlay.style.display).toBe(initialDisplay);
    });
  });

  describe('callbacks', () => {
    test('should set onSave callback', () => {
      let called = false;
      CategoryDialog.onSave(() => { called = true; });
      
      CategoryDialog.show('create', null);
      const nameInput = document.querySelector('input[name="name"]');
      nameInput.value = 'Test';
      
      const saveBtn = document.querySelector('.aegis-dialog-btn-primary');
      saveBtn.click();
      
      expect(called).toBe(true);
    });

    test('should set onCancel callback', () => {
      let called = false;
      CategoryDialog.onCancel(() => { called = true; });
      
      CategoryDialog.show('create', null);
      CategoryDialog.hide();
      
      expect(called).toBe(true);
    });

    test('should work without callbacks set', () => {
      CategoryDialog.show('create', null);
      
      const nameInput = document.querySelector('input[name="name"]');
      nameInput.value = 'Test';
      
      expect(() => {
        const saveBtn = document.querySelector('.aegis-dialog-btn-primary');
        saveBtn.click();
      }).not.toThrow();
      
      expect(() => {
        CategoryDialog.hide();
      }).not.toThrow();
    });
  });

  describe('form structure', () => {
    test('should create form groups with labels', () => {
      CategoryDialog.show('create', null);
      
      const formGroups = document.querySelectorAll('.aegis-form-group');
      expect(formGroups.length).toBeGreaterThanOrEqual(4); // name, emoji, color, bgColor
      
      formGroups.forEach(group => {
        const label = group.querySelector('.aegis-form-label');
        expect(label).toBeTruthy();
      });
    });

    test('should create error message containers', () => {
      CategoryDialog.show('create', null);
      
      const formGroups = document.querySelectorAll('.aegis-form-group');
      
      formGroups.forEach(group => {
        const errorMsg = group.querySelector('.aegis-form-error');
        expect(errorMsg).toBeTruthy();
        expect(errorMsg.style.display).toBe('none'); // Initially hidden
      });
    });

    test('should have data-field attributes on form groups', () => {
      CategoryDialog.show('create', null);
      
      const nameGroup = document.querySelector('[data-field="name"]');
      const emojiGroup = document.querySelector('[data-field="emoji"]');
      const colorGroup = document.querySelector('[data-field="color"]');
      const bgColorGroup = document.querySelector('[data-field="bgColor"]');
      
      expect(nameGroup).toBeTruthy();
      expect(emojiGroup).toBeTruthy();
      expect(colorGroup).toBeTruthy();
      expect(bgColorGroup).toBeTruthy();
    });
  });

  describe('integration', () => {
    test('should handle complete create workflow', () => {
      let savedData = null;
      CategoryDialog.onSave((result) => { savedData = result; });
      
      // Show dialog
      CategoryDialog.show('create', null);
      
      // Fill form
      const nameInput = document.querySelector('input[name="name"]');
      nameInput.value = 'Shopping';
      
      const emojiPicker = document.querySelector('.aegis-emoji-picker');
      window.EmojiPicker.setValue(emojiPicker, '🛒');
      
      const colorPickers = document.querySelectorAll('.aegis-color-picker');
      window.ColorPicker.setValue(colorPickers[0], '#ff6600');
      window.ColorPicker.setValue(colorPickers[1], '#fff0e6');
      
      // Save
      const saveBtn = document.querySelector('.aegis-dialog-btn-primary');
      saveBtn.click();
      
      // Verify
      expect(savedData).toBeTruthy();
      expect(savedData.mode).toBe('create');
      expect(savedData.data.name).toBe('Shopping');
      expect(savedData.data.emoji).toBe('🛒');
      expect(savedData.data.color).toBe('#ff6600');
      expect(savedData.data.bgColor).toBe('#fff0e6');
      
      // Dialog should be closed
      const overlay = document.querySelector('.aegis-dialog-overlay');
      expect(overlay.style.display).toBe('none');
    });

    test('should handle complete edit workflow', () => {
      let savedData = null;
      CategoryDialog.onSave((result) => { savedData = result; });
      
      // Show dialog with existing data
      CategoryDialog.show('edit', {
        id: 'work-123',
        name: 'Work',
        emoji: '💼',
        color: '#4285f4',
        bgColor: '#e8f0fe'
      });
      
      // Modify name
      const nameInput = document.querySelector('input[name="name"]');
      nameInput.value = 'Work & Business';
      
      // Save
      const saveBtn = document.querySelector('.aegis-dialog-btn-primary');
      saveBtn.click();
      
      // Verify
      expect(savedData).toBeTruthy();
      expect(savedData.mode).toBe('edit');
      expect(savedData.categoryId).toBe('work-123');
      expect(savedData.data.name).toBe('Work & Business');
      expect(savedData.data.emoji).toBe('💼');
    });

    test('should handle validation error and retry', () => {
      let saveCount = 0;
      CategoryDialog.onSave(() => { saveCount++; });
      
      CategoryDialog.show('create', null);
      
      // First attempt - invalid (empty name)
      const saveBtn = document.querySelector('.aegis-dialog-btn-primary');
      saveBtn.click();
      
      expect(saveCount).toBe(0);
      
      // Fix error
      const nameInput = document.querySelector('input[name="name"]');
      nameInput.value = 'Valid Name';
      
      // Second attempt - valid
      saveBtn.click();
      
      expect(saveCount).toBe(1);
    });
  });

  describe('module exports', () => {
    test('should export CategoryDialog to window', () => {
      eval(categoryDialogCode);
      expect(window.CategoryDialog).toBeDefined();
      expect(typeof window.CategoryDialog.show).toBe('function');
      expect(typeof window.CategoryDialog.hide).toBe('function');
      expect(typeof window.CategoryDialog.getFormData).toBe('function');
      expect(typeof window.CategoryDialog.setFormData).toBe('function');
      expect(typeof window.CategoryDialog.onSave).toBe('function');
      expect(typeof window.CategoryDialog.onCancel).toBe('function');
    });

    test('should have correct public API', () => {
      eval(categoryDialogCode);
      const api = window.CategoryDialog;
      
      expect(Object.keys(api).sort()).toEqual([
        'show',
        'hide',
        'getFormData',
        'setFormData',
        'onSave',
        'onCancel'
      ].sort());
    });
  });
});
