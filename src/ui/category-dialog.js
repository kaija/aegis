'use strict';

/**
 * CategoryDialog Component
 * 
 * Modal dialog for creating and editing categories.
 * Features:
 * - Clean UI matching new templates
 * - Color swatches selection
 * - SVG icon picker with search
 * - Smart Matching Keywords manager
 */
const CategoryDialog = (() => {
  let dialogElement = null;
  let currentMode = null; // 'create' or 'edit'
  let currentCategoryId = null;
  let onSaveCallback = null;
  let onCancelCallback = null;
  let onDeleteCallback = null;

  // Selected state
  let selectedColor = '#FF5252';
  let selectedIcon = 'folder';
  let currentKeywords = [];

  const CATEGORY_COLORS = [
    '#FF5252', '#FF9800', '#FFC107', '#00BFA5',
    '#448AFF', '#651FFF', '#D500F9', '#F50057'
  ];

  const ICONS = [
    { id: 'folder', name: 'Folder', svg: '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>' },
    { id: 'tag', name: 'Tag', svg: '<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path><line x1="7" y1="7" x2="7.01" y2="7"></line>' },
    { id: 'star', name: 'Star', svg: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>' },
    { id: 'flag', name: 'Flag', svg: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path><line x1="4" y1="22" x2="4" y2="15"></line>' },
    { id: 'shopping-cart', name: 'Shopping Cart', svg: '<circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>' },
    { id: 'briefcase', name: 'Briefcase', svg: '<rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path>' },
    { id: 'home', name: 'Home', svg: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline>' },
    { id: 'user', name: 'User', svg: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle>' },
    { id: 'file-text', name: 'Receipt', svg: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline>' },
    { id: 'book', name: 'Education', svg: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>' },
    { id: 'send', name: 'Plane', svg: '<line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>' },
    { id: 'credit-card', name: 'Credit card', svg: '<rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect><line x1="1" y1="10" x2="23" y2="10"></line>' },
    { id: 'mail', name: 'Mail', svg: '<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline>' },
    { id: 'clock', name: 'Clock', svg: '<circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline>' },
    { id: 'lock', name: 'Lock', svg: '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path>' },
    { id: 'paperclip', name: 'Attach', svg: '<path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path>' },
    { id: 'calendar', name: 'Event', svg: '<rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line>' },
    { id: 'alert-triangle', name: 'Alert', svg: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line>' },
    { id: 'heart', name: 'Favorite', svg: '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>' },
    { id: 'check-circle', name: 'Done', svg: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline>' },
    { id: 'image', name: 'Photo', svg: '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline>' },
    { id: 'bar-chart', name: 'Analytics', svg: '<line x1="12" y1="20" x2="12" y2="10"></line><line x1="18" y1="20" x2="18" y2="4"></line><line x1="6" y1="20" x2="6" y2="16"></line>' },
    { id: 'shield', name: 'Security', svg: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>' },
    { id: 'phone', name: 'Contact', svg: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>' },
    { id: 'globe', name: 'Network', svg: '<circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>' },
    { id: 'video', name: 'Media', svg: '<polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>' },
    { id: 'coffee', name: 'Break', svg: '<path d="M18 8h1a4 4 0 0 1 0 8h-1"></path><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"></path><line x1="6" y1="1" x2="6" y2="4"></line><line x1="10" y1="1" x2="10" y2="4"></line><line x1="14" y1="1" x2="14" y2="4"></line>' },
    { id: 'gift', name: 'Promo', svg: '<polyline points="20 12 20 22 4 22 4 12"></polyline><rect x="2" y="7" width="20" height="5"></rect><line x1="12" y1="22" x2="12" y2="7"></line><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"></path><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"></path>' },
    { id: 'package', name: 'Shipping', svg: '<line x1="16.5" y1="9.4" x2="7.5" y2="4.21"></line><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line>' },
    { id: 'trash', name: 'Spam', svg: '<polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>' }
  ];

  function getAlphaColor(hex, alpha) {
    hex = hex.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  function initializeDialog() {
    if (dialogElement) return;

    // Create modal overlay
    const overlay = document.createElement('div');
    overlay.className = 'aegis-dialog-overlay';
    overlay.style.display = 'none';

    // Create dialog container
    const dialog = document.createElement('div');
    dialog.className = 'aegis-category-dialog';

    // Header
    const header = document.createElement('div');
    header.className = 'aegis-dialog-header';

    const headerText = document.createElement('div');
    const title = document.createElement('h3');
    title.className = 'aegis-dialog-title';
    title.textContent = 'Add New Category';
    const subtitle = document.createElement('p');
    subtitle.className = 'aegis-dialog-subtitle';
    subtitle.textContent = 'Organize your emails with intelligent classification.';
    headerText.appendChild(title);
    headerText.appendChild(subtitle);

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'aegis-dialog-close';
    closeBtn.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
    closeBtn.addEventListener('click', hide);

    header.appendChild(headerText);
    header.appendChild(closeBtn);

    // Body
    const body = document.createElement('div');
    body.className = 'aegis-dialog-body';

    // Form Fields
    const form = document.createElement('div');
    form.className = 'aegis-category-form';

    // 1. Category Name
    const nameLabel = document.createElement('label');
    nameLabel.className = 'aegis-form-label';
    nameLabel.textContent = 'Category Name';

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.id = 'aegis-cat-name';
    nameInput.className = 'aegis-form-input aegis-cat-name-input';
    nameInput.placeholder = 'e.g., Invoices, Client Feedback, Urgent';

    const nameGroup = document.createElement('div');
    nameGroup.className = 'aegis-form-group';
    nameGroup.dataset.field = 'name';
    nameGroup.appendChild(nameLabel);
    nameGroup.appendChild(nameInput);

    const errorMsg = document.createElement('div');
    errorMsg.className = 'aegis-form-error';
    nameGroup.appendChild(errorMsg);
    form.appendChild(nameGroup);

    // 2. Category Color
    const colorLabel = document.createElement('label');
    colorLabel.className = 'aegis-form-label';
    colorLabel.textContent = 'Category Color';

    const colorGrid = document.createElement('div');
    colorGrid.className = 'aegis-color-grid';

    CATEGORY_COLORS.forEach(color => {
      const bubble = document.createElement('div');
      bubble.className = 'aegis-color-bubble';
      bubble.dataset.color = color;
      bubble.style.backgroundColor = color;

      bubble.addEventListener('click', () => {
        // Remove active class from all
        colorGrid.querySelectorAll('.aegis-color-bubble').forEach(b => {
          b.classList.remove('active');
          b.style.boxShadow = 'none';
        });
        bubble.classList.add('active');
        bubble.style.boxShadow = `0 0 0 3px white, 0 0 0 5px ${color}`;
        selectedColor = color;
        renderKeywords(); // update badge colors
      });

      colorGrid.appendChild(bubble);
    });

    const colorGroup = document.createElement('div');
    colorGroup.className = 'aegis-form-group';
    colorGroup.appendChild(colorLabel);
    colorGroup.appendChild(colorGrid);
    form.appendChild(colorGroup);

    // 3. Icon Selector
    const iconLabel = document.createElement('label');
    iconLabel.className = 'aegis-form-label';
    iconLabel.textContent = 'Icon Selector';

    const iconSearchContainer = document.createElement('div');
    iconSearchContainer.className = 'aegis-icon-search-container';

    const iconSearchInput = document.createElement('input');
    iconSearchInput.type = 'text';
    iconSearchInput.className = 'aegis-form-input aegis-icon-search';
    iconSearchInput.placeholder = 'Search icons...';

    const iconSearchIcon = document.createElement('div');
    iconSearchIcon.className = 'aegis-icon-search-icon';
    iconSearchIcon.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>';

    iconSearchContainer.appendChild(iconSearchIcon);
    iconSearchContainer.appendChild(iconSearchInput);

    const iconGrid = document.createElement('div');
    iconGrid.className = 'aegis-icon-grid';

    const renderIcons = (searchTerm = '') => {
      iconGrid.innerHTML = '';
      const filtered = ICONS.filter(i => i.name.toLowerCase().includes(searchTerm.toLowerCase()));

      filtered.forEach(icon => {
        const iconItem = document.createElement('div');
        iconItem.className = 'aegis-icon-item';
        iconItem.dataset.id = icon.id;
        iconItem.title = icon.name;
        iconItem.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${icon.svg}</svg>`;

        if (icon.id === selectedIcon) {
          iconItem.classList.add('active');
          iconItem.style.backgroundColor = selectedColor;
          iconItem.style.color = '#fff';
        }

        iconItem.addEventListener('click', () => {
          selectedIcon = icon.id;
          renderIcons(iconSearchInput.value); // Re-render to update active state
        });

        iconGrid.appendChild(iconItem);
      });
    };

    iconSearchInput.addEventListener('input', (e) => {
      renderIcons(e.target.value);
    });

    const iconGroup = document.createElement('div');
    iconGroup.className = 'aegis-form-group';
    iconGroup.appendChild(iconLabel);
    iconGroup.appendChild(iconSearchContainer);
    iconGroup.appendChild(iconGrid);
    form.appendChild(iconGroup);

    // 4. Smart Matching Keywords
    const keywordLabel = document.createElement('label');
    keywordLabel.className = 'aegis-form-label';
    keywordLabel.textContent = 'Smart Matching Keywords';

    const keywordContainer = document.createElement('div');
    keywordContainer.className = 'aegis-keyword-container';
    keywordContainer.id = 'aegis-keyword-preview-container';

    const keywordInput = document.createElement('input');
    keywordInput.type = 'text';
    keywordInput.className = 'aegis-keyword-inner-input';
    keywordInput.placeholder = 'Type and press enter...';

    keywordContainer.appendChild(keywordInput);

    keywordInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const val = keywordInput.value.trim();
        if (val && !currentKeywords.includes(val)) {
          currentKeywords.push(val);
          renderKeywords();
        }
        keywordInput.value = '';
      }
    });

    const keywordGroup = document.createElement('div');
    keywordGroup.className = 'aegis-form-group';
    keywordGroup.dataset.field = 'keywords';
    keywordGroup.appendChild(keywordLabel);
    keywordGroup.appendChild(keywordContainer);

    const keywordErrorMsg = document.createElement('div');
    keywordErrorMsg.className = 'aegis-form-error';
    keywordGroup.appendChild(keywordErrorMsg);

    form.appendChild(keywordGroup);

    body.appendChild(form);

    // Footer
    const footer = document.createElement('div');
    footer.className = 'aegis-dialog-footer';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'aegis-dialog-btn aegis-dialog-btn-secondary';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', hide);

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'aegis-dialog-btn aegis-dialog-btn-danger';
    deleteBtn.style.marginRight = 'auto'; // Push to left
    deleteBtn.style.color = '#ef4444';
    deleteBtn.style.background = 'transparent';
    deleteBtn.style.border = 'none';
    deleteBtn.textContent = 'Delete';
    deleteBtn.addEventListener('click', () => {
      if (onDeleteCallback && currentCategoryId) {
        onDeleteCallback(currentCategoryId);
        hide();
      }
    });

    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'aegis-dialog-btn aegis-dialog-btn-primary';
    saveBtn.textContent = 'Create Category';
    saveBtn.addEventListener('click', handleFormSubmit);

    footer.appendChild(deleteBtn);
    footer.appendChild(cancelBtn);
    footer.appendChild(saveBtn);

    // Assemble
    dialog.appendChild(header);
    dialog.appendChild(body);
    dialog.appendChild(footer);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    dialogElement = overlay;

    // Default init selection
    colorGrid.querySelector(`[data-color="${CATEGORY_COLORS[0]}"]`).click();

    // Close handlers
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) hide();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && dialogElement && dialogElement.style.display !== 'none') {
        hide();
      }
    });
  }

  function renderKeywords() {
    const container = dialogElement.querySelector('#aegis-keyword-preview-container');
    const input = container.querySelector('.aegis-keyword-inner-input');

    // Remove existing tags
    container.querySelectorAll('.aegis-keyword-tag').forEach(tag => tag.remove());

    currentKeywords.forEach(kw => {
      const tag = document.createElement('div');
      tag.className = 'aegis-keyword-tag';
      tag.style.color = selectedColor;
      tag.style.backgroundColor = getAlphaColor(selectedColor, 0.15);

      const text = document.createElement('span');
      text.textContent = kw;

      const remove = document.createElement('span');
      remove.className = 'aegis-keyword-remove';
      remove.innerHTML = '&times;';
      remove.addEventListener('click', () => {
        currentKeywords = currentKeywords.filter(k => k !== kw);
        renderKeywords();
      });

      tag.appendChild(text);
      tag.appendChild(remove);
      container.insertBefore(tag, input);
    });
  }

  function show(mode, categoryData, callback, onDelete) {
    if (callback) onSaveCallback = callback;
    if (onDelete) onDeleteCallback = onDelete;
    initializeDialog();

    currentMode = mode;
    currentCategoryId = categoryData ? categoryData.id : null;

    // Update UI for mode
    const title = dialogElement.querySelector('.aegis-dialog-title');
    title.textContent = mode === 'create' ? 'Add New Category' : 'Edit Category';

    const saveBtn = dialogElement.querySelector('.aegis-dialog-btn-primary');
    saveBtn.textContent = mode === 'create' ? 'Create Category' : 'Save Changes';

    const deleteBtn = dialogElement.querySelector('.aegis-dialog-btn-danger');
    if (deleteBtn) {
      deleteBtn.style.display = mode === 'edit' ? 'block' : 'none';
    }

    clearErrors();

    if (mode === 'edit' && categoryData) {
      setFormData(categoryData);
    } else {
      // Default state
      dialogElement.querySelector('#aegis-cat-name').value = '';
      currentKeywords = [];
      dialogElement.querySelector('.aegis-icon-search').value = '';
      const defaultColor = CATEGORY_COLORS[0];
      const bubble = dialogElement.querySelector(`[data-color="${defaultColor}"]`);
      if (bubble) bubble.click();
      selectedIcon = ICONS[0].id;
      // Re-render icons to default
      dialogElement.querySelector('.aegis-icon-search').dispatchEvent(new Event('input'));
    }

    renderKeywords();
    dialogElement.style.display = 'flex';
  }

  function hide() {
    if (!dialogElement) return;
    dialogElement.style.display = 'none';
    currentMode = null;
    currentCategoryId = null;
    clearErrors();
    if (onCancelCallback) onCancelCallback();
  }

  function getFormData() {
    const nameInput = dialogElement.querySelector('#aegis-cat-name');

    // We store background color logic in options.css and render functions, 
    // but data model expects 'color' and 'bgColor'. Let's synthesize.
    const bgColor = getAlphaColor(selectedColor, 0.1);

    return {
      name: nameInput ? nameInput.value.trim() : '',
      emoji: selectedIcon, // Store icon ID in emoji field for compatibility
      color: selectedColor,
      bgColor: bgColor,
      keywords: [...currentKeywords]
    };
  }

  function setFormData(data) {
    dialogElement.querySelector('#aegis-cat-name').value = data.name || '';

    selectedColor = data.color || CATEGORY_COLORS[0];
    const bubble = dialogElement.querySelector(`[data-color="${selectedColor}"]`);
    if (bubble) bubble.click();
    else {
      // If a custom color not in list, fallback to first
      dialogElement.querySelector(`.aegis-color-bubble`).click();
    }

    selectedIcon = data.emoji || 'folder';
    dialogElement.querySelector('.aegis-icon-search').dispatchEvent(new Event('input'));

    currentKeywords = data.keywords ? [...data.keywords] : [];
    renderKeywords();
  }

  function handleFormSubmit(e) {
    if (e) e.preventDefault();
    clearErrors();

    const formData = getFormData();
    if (!formData.name) {
      showFieldError('name', 'Category name is required');
      return;
    }

    if (onSaveCallback) {
      onSaveCallback(formData); // the original options.js callback expects the raw mapped data
    }
    hide();
  }

  function showFieldError(fieldName, message) {
    const formGroup = dialogElement.querySelector(`[data-field="${fieldName}"]`);
    if (!formGroup) return;

    const errorMsg = formGroup.querySelector('.aegis-form-error');
    if (errorMsg) {
      errorMsg.textContent = message;
      errorMsg.style.display = 'block';
    }
  }

  function clearErrors() {
    dialogElement.querySelectorAll('.aegis-form-error').forEach(el => {
      el.style.display = 'none';
      el.textContent = '';
    });
  }

  function onSave(callback) {
    onSaveCallback = callback;
  }

  function onCancel(callback) {
    onCancelCallback = callback;
  }

  function getIconSvg(id) {
    const icon = ICONS.find(i => i.id === id);
    if (!icon) return '';
    return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${icon.svg}</svg>`;
  }

  return {
    show, hide, getFormData, setFormData, onSave, onCancel, getIconSvg
  };
})();

window.CategoryDialog = CategoryDialog;
