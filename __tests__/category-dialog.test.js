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

    test('should set title to "Add New Category" in create mode', () => {
      CategoryDialog.show('create', null);
      
      const title = document.querySelector('.aegis-dialog-title');
      expect(title.textContent).toBe('catDialogAddTitle');
    });

    test('should set title to "Edit Category" in edit mode', () => {
      const categoryData = {
        id: 'test-1',
        name: 'Test Category',
        emoji: 'folder',
        color: '#FF5252',
        bgColor: '#ffeeee'
      };
      
      CategoryDialog.show('edit', categoryData);
      
      const title = document.querySelector('.aegis-dialog-title');
      expect(title.textContent).toBe('catDialogEditTitle');
    });

    test('should set save button text to "Create Category" in create mode', () => {
      CategoryDialog.show('create', null);
      
      const saveBtn = document.querySelector('.aegis-dialog-btn-primary');
      expect(saveBtn.textContent).toBe('catDialogCreate');
    });

    test('should set save button text to "Save Changes" in edit mode', () => {
      const categoryData = {
        id: 'test-1',
        name: 'Test',
        emoji: 'folder',
        color: '#FF5252',
        bgColor: '#ffffff'
      };
      
      CategoryDialog.show('edit', categoryData);
      
      const saveBtn = document.querySelector('.aegis-dialog-btn-primary');
      expect(saveBtn.textContent).toBe('catDialogSave');
    });

    test('should populate form with category data in edit mode', () => {
      const categoryData = {
        id: 'test-1',
        name: 'Work',
        emoji: 'briefcase',
        color: '#448AFF',
        bgColor: '#e8f0fe'
      };
      
      CategoryDialog.show('edit', categoryData);
      
      const formData = CategoryDialog.getFormData();
      expect(formData.name).toBe('Work');
      expect(formData.emoji).toBe('briefcase');
      expect(formData.color).toBe('#448AFF');
    });

    test('should reset form with default values in create mode', () => {
      // First show with data
      CategoryDialog.show('edit', {
        id: 'test-1',
        name: 'Old Name',
        emoji: 'star',
        color: '#651FFF',
        bgColor: '#ffeeee'
      });
      
      // Then show in create mode
      CategoryDialog.show('create', null);
      
      const formData = CategoryDialog.getFormData();
      expect(formData.name).toBe('');
      expect(formData.emoji).toBe('folder'); // Default first icon
      expect(formData.color).toBe('#FF5252'); // Default first color
    });

    test('should clear any previous errors when showing', () => {
      CategoryDialog.show('create', null);
      
      // Manually add an error
      const formGroup = document.querySelector('[data-field="name"]');
      const errorMsg = formGroup.querySelector('.aegis-form-error');
      errorMsg.style.display = 'block';
      errorMsg.textContent = 'Test error';
      
      // Show again
      CategoryDialog.show('create', null);
      
      expect(errorMsg.style.display).toBe('none');
      expect(errorMsg.textContent).toBe('');
    });

    test('should create form with name input and icon/color selectors', () => {
      CategoryDialog.show('create', null);
      
      const nameInput = document.querySelector('#aegis-cat-name');
      const iconGrid = document.querySelector('.aegis-icon-grid');
      const colorGrid = document.querySelector('.aegis-color-grid');
      
      expect(nameInput).toBeTruthy();
      expect(iconGrid).toBeTruthy();
      expect(colorGrid).toBeTruthy();
    });

    test('should set name input attributes correctly', () => {
      CategoryDialog.show('create', null);
      
      const nameInput = document.querySelector('#aegis-cat-name');
      expect(nameInput.type).toBe('text');
      expect(nameInput.placeholder).toBeTruthy();
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
      const nameInput = document.querySelector('#aegis-cat-name');
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
      const errorMsg = formGroup.querySelector('.aegis-form-error');
      errorMsg.style.display = 'block';
      errorMsg.textContent = 'Error';
      
      CategoryDialog.hide();
      CategoryDialog.show('create', null);
      
      expect(errorMsg.style.display).toBe('none');
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
      
      const nameInput = document.querySelector('#aegis-cat-name');
      nameInput.value = 'Travel';
      
      const formData = CategoryDialog.getFormData();
      
      expect(formData).toBeTruthy();
      expect(formData.name).toBe('Travel');
      expect(formData.emoji).toBe('folder'); // Default icon
      expect(formData.color).toBe('#FF5252'); // Default color
      expect(formData.bgColor).toBeTruthy(); // Computed alpha color
    });

    test('should trim whitespace from name', () => {
      CategoryDialog.show('create', null);
      
      const nameInput = document.querySelector('#aegis-cat-name');
      nameInput.value = '  Shopping  ';
      
      const formData = CategoryDialog.getFormData();
      expect(formData.name).toBe('Shopping');
    });

    test('should return current icon selection as emoji', () => {
      CategoryDialog.show('create', null);
      
      // Click a different icon
      const iconItems = document.querySelectorAll('.aegis-icon-item');
      // Find the 'star' icon
      let starIcon = null;
      iconItems.forEach(item => {
        if (item.dataset.id === 'star') starIcon = item;
      });
      if (starIcon) starIcon.click();
      
      const formData = CategoryDialog.getFormData();
      expect(formData.emoji).toBe('star');
    });

    test('should return current color selection', () => {
      CategoryDialog.show('create', null);
      
      // Click a different color
      const colorBubbles = document.querySelectorAll('.aegis-color-bubble');
      // Click the second color (#FF9800)
      if (colorBubbles.length > 1) colorBubbles[1].click();
      
      const formData = CategoryDialog.getFormData();
      expect(formData.color).toBe('#FF9800');
    });

    test('should return object with all required fields', () => {
      CategoryDialog.show('create', null);
      
      const formData = CategoryDialog.getFormData();
      
      expect(formData).toHaveProperty('name');
      expect(formData).toHaveProperty('emoji');
      expect(formData).toHaveProperty('color');
      expect(formData).toHaveProperty('bgColor');
      expect(formData).toHaveProperty('keywords');
    });
  });

  describe('setFormData', () => {
    test('should populate form correctly', () => {
      CategoryDialog.show('create', null);
      
      const data = {
        name: 'Finance',
        emoji: 'credit-card',
        color: '#448AFF',
        keywords: ['invoice', 'payment']
      };
      
      CategoryDialog.setFormData(data);
      
      const formData = CategoryDialog.getFormData();
      expect(formData.name).toBe('Finance');
      expect(formData.emoji).toBe('credit-card');
      expect(formData.color).toBe('#448AFF');
      expect(formData.keywords).toEqual(['invoice', 'payment']);
    });

    test('should set name input value', () => {
      CategoryDialog.show('create', null);
      
      CategoryDialog.setFormData({ name: 'Health' });
      
      const nameInput = document.querySelector('#aegis-cat-name');
      expect(nameInput.value).toBe('Health');
    });

    test('should handle empty data object', () => {
      CategoryDialog.show('create', null);
      
      expect(() => {
        CategoryDialog.setFormData({});
      }).not.toThrow();
    });

    test('should throw if dialog not initialized', () => {
      // setFormData requires dialog to be initialized (shown at least once)
      eval(categoryDialogCode);
      expect(() => {
        CategoryDialog.setFormData({ name: 'Test' });
      }).toThrow();
    });
  });

  describe('cancel button', () => {
    test('**Validates: Requirements 2.5** - cancel button closes without saving', () => {
      let saveCalled = false;
      CategoryDialog.onSave(() => { saveCalled = true; });
      
      CategoryDialog.show('create', null);
      
      // Fill in form
      const nameInput = document.querySelector('#aegis-cat-name');
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
      expect(cancelBtn.textContent).toBe('catDialogCancel');
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
      
      const nameInput = document.querySelector('#aegis-cat-name');
      nameInput.value = 'New Category';
      
      const saveBtn = document.querySelector('.aegis-dialog-btn-primary');
      saveBtn.click();
      
      expect(savedData).toBeTruthy();
      expect(savedData.name).toBe('New Category');
    });

    test('should close dialog after successful save', () => {
      CategoryDialog.onSave(() => {});
      
      CategoryDialog.show('create', null);
      
      const nameInput = document.querySelector('#aegis-cat-name');
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
      
      expect(errorMsg.style.display).toBe('block');
      expect(errorMsg.textContent).toContain('catDialogNameRequired');
    });

    test('should clear previous errors before validating', () => {
      CategoryDialog.show('create', null);
      
      // First validation failure
      const saveBtn = document.querySelector('.aegis-dialog-btn-primary');
      saveBtn.click();
      
      const nameGroup = document.querySelector('[data-field="name"]');
      const errorMsg = nameGroup.querySelector('.aegis-form-error');
      expect(errorMsg.style.display).toBe('block');
      
      // Fix the error
      const nameInput = document.querySelector('#aegis-cat-name');
      nameInput.value = 'Valid Name';
      
      // Try again
      saveBtn.click();
      
      // Dialog should close on success
      const overlay = document.querySelector('.aegis-dialog-overlay');
      expect(overlay.style.display).toBe('none');
    });
  });

  describe('close button', () => {
    test('should close dialog when close button is clicked', () => {
      CategoryDialog.show('create', null);
      
      const closeBtn = document.querySelector('.aegis-dialog-close');
      closeBtn.click();
      
      const overlay = document.querySelector('.aegis-dialog-overlay');
      expect(overlay.style.display).toBe('none');
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
      const nameInput = document.querySelector('#aegis-cat-name');
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
      
      const nameInput = document.querySelector('#aegis-cat-name');
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
      expect(formGroups.length).toBeGreaterThanOrEqual(3); // name, color, icon, keywords
      
      formGroups.forEach(group => {
        const label = group.querySelector('.aegis-form-label');
        expect(label).toBeTruthy();
      });
    });

    test('should have data-field attribute on name group', () => {
      CategoryDialog.show('create', null);
      
      const nameGroup = document.querySelector('[data-field="name"]');
      expect(nameGroup).toBeTruthy();
    });

    test('should have color grid with color bubbles', () => {
      CategoryDialog.show('create', null);
      
      const colorGrid = document.querySelector('.aegis-color-grid');
      const bubbles = colorGrid.querySelectorAll('.aegis-color-bubble');
      expect(bubbles.length).toBeGreaterThanOrEqual(4);
    });

    test('should have icon grid with icon items', () => {
      CategoryDialog.show('create', null);
      
      const iconGrid = document.querySelector('.aegis-icon-grid');
      const items = iconGrid.querySelectorAll('.aegis-icon-item');
      expect(items.length).toBeGreaterThan(0);
    });
  });

  describe('integration', () => {
    test('should handle complete create workflow', () => {
      let savedData = null;
      CategoryDialog.onSave((result) => { savedData = result; });
      
      // Show dialog
      CategoryDialog.show('create', null);
      
      // Fill form
      const nameInput = document.querySelector('#aegis-cat-name');
      nameInput.value = 'Shopping';
      
      // Select a different icon
      const iconItems = document.querySelectorAll('.aegis-icon-item');
      let cartIcon = null;
      iconItems.forEach(item => {
        if (item.dataset.id === 'shopping-cart') cartIcon = item;
      });
      if (cartIcon) cartIcon.click();
      
      // Select a different color
      const colorBubbles = document.querySelectorAll('.aegis-color-bubble');
      if (colorBubbles.length > 1) colorBubbles[1].click();
      
      // Save
      const saveBtn = document.querySelector('.aegis-dialog-btn-primary');
      saveBtn.click();
      
      // Verify
      expect(savedData).toBeTruthy();
      expect(savedData.name).toBe('Shopping');
      expect(savedData.emoji).toBe('shopping-cart');
      expect(savedData.color).toBe('#FF9800');
      
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
        emoji: 'briefcase',
        color: '#448AFF',
        bgColor: '#e8f0fe'
      });
      
      // Modify name
      const nameInput = document.querySelector('#aegis-cat-name');
      nameInput.value = 'Work & Business';
      
      // Save
      const saveBtn = document.querySelector('.aegis-dialog-btn-primary');
      saveBtn.click();
      
      // Verify
      expect(savedData).toBeTruthy();
      expect(savedData.name).toBe('Work & Business');
      expect(savedData.emoji).toBe('briefcase');
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
      const nameInput = document.querySelector('#aegis-cat-name');
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
      expect(typeof window.CategoryDialog.getIconSvg).toBe('function');
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
        'onCancel',
        'getIconSvg'
      ].sort());
    });
  });
});
