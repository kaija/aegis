let settings = {};
let keywordSaveTimeout = null;

// Debounced save function for keywords
function debouncedSaveKeywords() {
  clearTimeout(keywordSaveTimeout);
  keywordSaveTimeout = setTimeout(async () => {
    try {
      await chrome.storage.sync.set({ categories: settings.categories });
      console.log('[Aegis Options] Keywords saved');
    } catch (error) {
      console.error('[Aegis Options] Error saving keywords:', error);
      showErrorMessage('儲存關鍵字失敗');
    }
  }, 500);
}

document.addEventListener('DOMContentLoaded', async () => {
  // Load all settings
  settings = await new Promise(resolve => chrome.storage.sync.get(null, resolve));

  // Load whitelist URL from sync storage
  const whitelistUrlEl = document.getElementById('whitelistUrl');
  if (settings.whitelistUrl) whitelistUrlEl.value = settings.whitelistUrl;

  // Load debug toggle
  document.getElementById('analysisDebug').checked = !!settings.analysisDebug;

  // Handle data feedback section visibility and toggle state
  const dataFeedbackSection = document.getElementById('dataFeedbackSection');
  const dataFeedbackToggle = document.getElementById('dataFeedbackToggle');
  if (settings.eulaAccepted === true) {
    dataFeedbackSection.style.display = '';
    dataFeedbackToggle.checked = !!settings.dataFeedbackEnabled;
  } else {
    dataFeedbackSection.style.display = 'none';
  }

  // Load and show whitelist status
  loadWhitelistStatus();

  document.getElementById('updateWhitelistBtn').addEventListener('click', updateWhitelistNow);

  // Set analysis mode radio
  const modeInputs = document.querySelectorAll('input[name="analysisMode"]');
  modeInputs.forEach(input => {
    if (input.value === (settings.analysisMode || 'local')) {
      input.checked = true;
    }
    input.addEventListener('change', () => {
      const nanoStatusSection = document.getElementById('nanoStatusSection');
      if (input.value === 'nano') {
        document.getElementById('aiSettingsSection').style.display = 'none';
        document.getElementById('categoriesSection').style.display = 'none';
        nanoStatusSection.style.display = 'block';
        checkNanoAvailability();
      } else if (input.value === 'ai') {
        document.getElementById('aiSettingsSection').style.display = 'block';
        document.getElementById('categoriesSection').style.display = 'none';
        nanoStatusSection.style.display = 'none';
      } else {
        document.getElementById('aiSettingsSection').style.display = 'none';
        document.getElementById('categoriesSection').style.display = 'block';
        nanoStatusSection.style.display = 'none';
      }
    });
  });

  if (settings.analysisMode === 'ai') {
    document.getElementById('aiSettingsSection').style.display = 'block';
    document.getElementById('categoriesSection').style.display = 'none';
  } else if (settings.analysisMode === 'nano') {
    document.getElementById('aiSettingsSection').style.display = 'none';
    document.getElementById('categoriesSection').style.display = 'none';
    document.getElementById('nanoStatusSection').style.display = 'block';
    checkNanoAvailability();
  }

  // Set AI settings values
  if (settings.aiSettings) {
    document.getElementById('aiBaseUrl').value = settings.aiSettings.baseUrl || '';
    document.getElementById('aiApiKey').value = settings.aiSettings.apiKey || '';
    document.getElementById('aiModel').value = settings.aiSettings.model || '';
  }

  // Render categories
  if (settings.categories && settings.categories.length > 0) {
    renderCategories(settings.categories);
  }

  // Save button
  document.getElementById('saveBtn').addEventListener('click', saveSettings);

  // Test AI Connection button
  const testBtn = document.getElementById('testAiBtn');
  if (testBtn) testBtn.addEventListener('click', testAiConnection);

  // Add Category button
  document.getElementById('addCategoryBtn').addEventListener('click', showAddCategoryDialog);

  // Auto-fetch models on blur
  const baseUrlInput = document.getElementById('aiBaseUrl');
  const apiKeyInput = document.getElementById('aiApiKey');
  baseUrlInput.addEventListener('blur', autoFetchModelsIfChanged);
  apiKeyInput.addEventListener('blur', autoFetchModelsIfChanged);

  // Initial load of cached models
  loadCachedModels();

  // Wire Nano download button
  const nanoDownloadBtn = document.getElementById('nanoDownloadBtn');
  if (nanoDownloadBtn) nanoDownloadBtn.addEventListener('click', triggerNanoDownload);
});

async function testAiConnection() {
  const statusEl = document.getElementById('testAiStatus');
  const btn = document.getElementById('testAiBtn');

  const baseUrl = document.getElementById('aiBaseUrl').value.trim() || 'https://api.openai.com/v1';
  const apiKey = document.getElementById('aiApiKey').value.trim();
  const model = document.getElementById('aiModel').value.trim() || 'gpt-5-nano-2025-08-07';

  if (!apiKey) {
    statusEl.textContent = '❌ 請先輸入 API Key';
    statusEl.style.color = '#cf222e';
    return;
  }

  statusEl.textContent = '⏳ 測試連線中...';
  statusEl.style.color = '#0969da';
  btn.disabled = true;

  chrome.runtime.sendMessage({
    type: 'TEST_AI_API',
    settings: { baseUrl, apiKey, model }
  }, (response) => {
    btn.disabled = false;

    // Cleanup any old test output textarea
    const oldDump = document.getElementById('testRawOutput');
    if (oldDump) oldDump.remove();

    if (chrome.runtime.lastError || !response) {
      statusEl.textContent = '❌ 背景連線錯誤';
      statusEl.style.color = '#cf222e';
    } else if (response.success) {
      statusEl.textContent = '✅ API 成功回傳！請查看下方原始資料：';
      statusEl.style.color = '#1a7f37';

      const dumpArea = document.createElement('textarea');
      dumpArea.id = 'testRawOutput';
      dumpArea.style.width = '100%';
      dumpArea.style.height = '200px';
      dumpArea.style.marginTop = '15px';
      dumpArea.style.padding = '10px';
      dumpArea.style.fontFamily = 'monospace';
      dumpArea.style.border = '1px solid #d0d7de';
      dumpArea.style.borderRadius = '6px';
      dumpArea.readOnly = true;
      dumpArea.value = response.message;

      // Append below the test status so it doesn't break the flex row layout.
      document.getElementById('testAiStatus').after(dumpArea);
    } else {
      statusEl.textContent = '❌ ' + (response.error || '不明錯誤');
      statusEl.style.color = '#cf222e';
    }
  });
}

async function autoFetchModelsIfChanged() {
  const statusEl = document.getElementById('fetchModelsStatus');
  const datalist = document.getElementById('aiModelList');

  const baseUrl = document.getElementById('aiBaseUrl').value.trim() || 'https://api.openai.com/v1';
  const apiKey = document.getElementById('aiApiKey').value.trim();

  if (!apiKey) return;

  // Check if we already fetched for this exact pair
  const cachedData = await new Promise(resolve => chrome.storage.local.get(['modelCache'], resolve));
  const cache = cachedData.modelCache || {};

  if (cache.baseUrl === baseUrl && cache.apiKey === apiKey && cache.models && cache.models.length > 0) {
    // Already cached, just ensure it's loaded
    renderModelList(cache.models);
    return;
  }

  statusEl.textContent = '⏳ 取得模型中...';
  statusEl.style.color = '#0969da';

  chrome.runtime.sendMessage({
    type: 'FETCH_AI_MODELS',
    settings: { baseUrl, apiKey }
  }, (response) => {
    if (chrome.runtime.lastError || !response) {
      statusEl.textContent = '❌ 背景連線錯誤';
      statusEl.style.color = '#cf222e';
    } else if (response.success && response.models) {
      statusEl.textContent = `✅ 成功取得 ${response.models.length} 個模型`;
      statusEl.style.color = '#1a7f37';

      renderModelList(response.models);

      // Save to local cache
      chrome.storage.local.set({
        modelCache: {
          baseUrl,
          apiKey,
          models: response.models
        }
      });
    } else {
      statusEl.textContent = '❌ ' + (response.error || '不明錯誤');
      statusEl.style.color = '#cf222e';
    }
  });
}

async function loadCachedModels() {
  const cachedData = await new Promise(resolve => chrome.storage.local.get(['modelCache'], resolve));
  if (cachedData.modelCache && cachedData.modelCache.models) {
    renderModelList(cachedData.modelCache.models);
    const statusEl = document.getElementById('fetchModelsStatus');
    statusEl.textContent = `✅ 已載入 ${cachedData.modelCache.models.length} 個模型`;
    statusEl.style.color = '#1a7f37';
  } else {
    // If no cache but we have credentials from sync storage, try fetching
    autoFetchModelsIfChanged();
  }
}

function renderModelList(models) {
  const datalist = document.getElementById('aiModelList');
  datalist.innerHTML = '';
  models.forEach(modelName => {
    const option = document.createElement('option');
    option.value = modelName;
    datalist.appendChild(option);
  });
}

function renderCategories(categories) {
  const container = document.getElementById('categoriesList');

  // Use document fragment for better performance
  const fragment = document.createDocumentFragment();

  categories.forEach(cat => {
    const item = document.createElement('div');
    item.className = 'category-item';
    item.dataset.catId = cat.id;

    item.innerHTML = `
      <div class="category-header-bar">
        <div class="cat-icon-wrapper" style="background-color: ${cat.bgColor || '#f0f0f0'}; color: ${cat.color};">
          ${window.CategoryDialog.getIconSvg(cat.emoji) || `<span class="cat-emoji-fallback">${cat.emoji}</span>`}
        </div>
        <div class="cat-title-stack">
          <span class="cat-name">${cat.name}</span>
          <span class="cat-count">${cat.keywords.length} active keywords</span>
        </div>
        <div class="category-actions-inline">
          <button class="category-edit-btn" data-cat-id="${cat.id}" title="Edit Category">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
          </button>
          <span class="cat-toggle">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
          </span>
        </div>
      </div>
      <div class="category-keywords" id="cat-body-${cat.id}">
        <div class="keywords-tags" id="tags-${cat.id}"></div>
        <button class="keyword-add-btn" data-cat-id="${cat.id}">+ Add keyword</button>
      </div>
    `;

    fragment.appendChild(item);
  });

  // Clear and append all at once
  container.innerHTML = '';
  container.appendChild(fragment);

  // Attach event listeners after DOM insertion
  categories.forEach(cat => {
    const item = container.querySelector(`[data-cat-id="${cat.id}"]`);
    if (!item) return;

    // Render keyword tags
    renderKeywordTags(cat);

    // Toggle expand
    const headerBar = item.querySelector('.category-header-bar');
    headerBar.addEventListener('click', (e) => {
      // Don't toggle if clicking on action buttons
      if (e.target.closest('.category-actions-inline')) return;

      const body = item.querySelector('.category-keywords');
      const toggle = item.querySelector('.cat-toggle svg');
      body.classList.toggle('open');
      item.classList.toggle('expanded');

      if (body.classList.contains('open')) {
        toggle.innerHTML = '<polyline points="18 15 12 9 6 15"></polyline>';
      } else {
        toggle.innerHTML = '<polyline points="6 9 12 15 18 9"></polyline>';
      }
    });

    // Edit button
    item.querySelector('.category-edit-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      editCategory(cat.id);
    });

    // Remove delete button event listener as it's not in the inline actions anymore
    // We will add it inside the edit dialog or keep it. Wait, mockup doesn't have delete icon on the main card.
    // Let's assume delete is accessed inside "Edit" dialog. Wait, the edit dialog doesn't have a delete button in my implementation.
    // For now I won't add it back directly, maybe we add a delete button next to save in the dialog if needed, but for now just comment it out.
    // item.querySelector('.category-delete-btn').addEventListener('click', ...);

    // Add keyword button
    item.querySelector('.keyword-add-btn').addEventListener('click', () => {
      // Toggle the line edit or prompt for a simple keyword?
      // Since it's inline in the mockup: "+ Add keyword" button is next to tags
      const currentLabel = item.querySelector('.keyword-add-btn').textContent;
      if (currentLabel === '+ Add keyword') {
        item.querySelector('.keyword-add-btn').outerHTML = `
            <div class="keyword-add-row inline-add-row" style="display:inline-flex;">
              <input type="text" class="keyword-input" id="input-${cat.id}" placeholder="Type keyword...">
              <button class="keyword-save-btn" data-cat-id="${cat.id}">Add</button>
            </div>
          `;

        const input = item.querySelector(`#input-${cat.id}`);
        const saveBtn = item.querySelector(`.keyword-save-btn[data-cat-id="${cat.id}"]`);

        input.focus();

        saveBtn.addEventListener('click', () => {
          addKeyword(cat.id);
        });

        input.addEventListener('keydown', (e) => {
          if (e.isComposing || e.keyCode === 229) return;
          if (e.key === 'Enter') addKeyword(cat.id);
          if (e.key === 'Escape') renderCategories(settings.categories); // reset render
        });
      }
    });
  });
}

function renderKeywordTags(cat) {
  const container = document.getElementById(`tags-${cat.id}`);
  if (!container) return;
  container.innerHTML = cat.keywords.map(kw => `
    <span class="keyword-tag">
      ${escapeHtml(kw)}
      <span class="keyword-remove" data-cat="${cat.id}" data-kw="${escapeHtml(kw)}">×</span>
    </span>
  `).join('');

  container.querySelectorAll('.keyword-remove').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const catId = e.currentTarget.dataset.cat;
      const keyword = e.currentTarget.dataset.kw;
      removeKeyword(catId, keyword);
    });
  });

  // Update count
  const countEl = document.querySelector(`[data-cat-id="${cat.id}"] .cat-count`);
  if (countEl) countEl.textContent = `${cat.keywords.length} active keywords`;
}

function addKeyword(catId) {
  const input = document.getElementById(`input-${catId}`);
  if (!input) return;
  const keyword = input.value.trim();
  if (!keyword) return;

  const cat = settings.categories.find(c => c.id === catId);
  if (cat && !cat.keywords.includes(keyword)) {
    cat.keywords.push(keyword);
    // Render the new tag to the UI immediately
    renderKeywordTags(cat);
    // Clear the input so the user can easily add the next one
    input.value = '';
    input.focus();
    debouncedSaveKeywords();
  } else {
    // If invalid or exists, just clear the input
    input.value = '';
    input.focus();
  }
}

function removeKeyword(catId, keyword) {
  const cat = settings.categories.find(c => c.id === catId);
  if (cat) {
    cat.keywords = cat.keywords.filter(k => k !== keyword);
    renderKeywordTags(cat);
    debouncedSaveKeywords(); // Debounced save
  }
}

async function saveSettings() {
  const checkedMode = document.querySelector('input[name="analysisMode"]:checked');
  const mode = checkedMode ? checkedMode.value : 'local';

  const newSettings = {
    analysisMode: mode,
    aiSettings: {
      baseUrl: document.getElementById('aiBaseUrl').value.trim() || 'https://api.openai.com/v1',
      apiKey: document.getElementById('aiApiKey').value.trim(),
      model: document.getElementById('aiModel').value.trim() || 'gpt-5-nano-2025-08-07'
    },
    whitelistUrl: document.getElementById('whitelistUrl').value.trim(),
    analysisDebug: document.getElementById('analysisDebug').checked,
    dataFeedbackEnabled: document.getElementById('dataFeedbackToggle').checked,
    categories: settings.categories
  };

  await new Promise(resolve => chrome.storage.sync.set(newSettings, resolve));

  settings = { ...settings, ...newSettings };

  const status = document.getElementById('saveStatus');
  status.textContent = '✓ 設定已儲存';
  setTimeout(() => { status.textContent = ''; }, 2500);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function loadWhitelistStatus() {
  chrome.runtime.sendMessage({ type: 'GET_WHITELIST_STATUS' }, (res) => {
    if (chrome.runtime.lastError || !res) return;
    const infoEl = document.getElementById('whitelistInfo');
    if (!infoEl) return;
    const parts = [];
    if (res.serviceCount) parts.push(`${res.serviceCount} 個服務`);
    if (res.shortUrlCount) parts.push(`${res.shortUrlCount} 個短網址服務`);
    if (res.lastUpdated) {
      const d = new Date(res.lastUpdated);
      parts.push(`上次更新：${d.toLocaleString('zh-TW')}`);
    }
    infoEl.textContent = parts.join(' | ');
  });
}

async function updateWhitelistNow() {
  const btn = document.getElementById('updateWhitelistBtn');
  const statusEl = document.getElementById('whitelistStatus');
  const url = document.getElementById('whitelistUrl').value.trim();

  if (!url) {
    statusEl.textContent = '❌ 請先填寫白名單 URL';
    statusEl.style.color = '#cf222e';
    return;
  }

  btn.disabled = true;
  statusEl.textContent = '⏳ 下載中...';
  statusEl.style.color = '#0969da';

  chrome.runtime.sendMessage({ type: 'FETCH_WHITELIST', url }, (res) => {
    btn.disabled = false;
    if (chrome.runtime.lastError || !res) {
      statusEl.textContent = '❌ 背景連線錯誤';
      statusEl.style.color = '#cf222e';
      return;
    }
    if (res.success) {
      statusEl.textContent = `✅ 更新成功（${res.serviceCount} 個服務）`;
      statusEl.style.color = '#1a7f37';
      loadWhitelistStatus();
    } else {
      statusEl.textContent = `❌ ${res.error || '下載失敗'}`;
      statusEl.style.color = '#cf222e';
    }
  });
}

// Category Management Functions

function showAddCategoryDialog() {
  if (!window.CategoryDialog) {
    showErrorMessage('CategoryDialog module not loaded');
    return;
  }

  window.CategoryDialog.show('create', null, async (formData) => {
    try {
      const newCategory = await window.CategoryManager.createCategory(formData);
      // Reload categories from storage to ensure sync
      const updatedSettings = await new Promise(resolve => chrome.storage.sync.get(['categories'], resolve));
      settings.categories = updatedSettings.categories || [];
      renderCategories(settings.categories);
      showSuccessMessage('分類已新增');
    } catch (error) {
      showErrorMessage(error.message);
    }
  });
}

function editCategory(categoryId) {
  const category = settings.categories.find(c => c.id === categoryId);
  if (!category) {
    showErrorMessage('找不到分類');
    return;
  }

  if (!window.CategoryDialog) {
    showErrorMessage('CategoryDialog module not loaded');
    return;
  }

  window.CategoryDialog.show('edit', category, async (formData) => {
    try {
      const updated = await window.CategoryManager.updateCategory(categoryId, formData);
      // Reload categories from storage to ensure sync
      const updatedSettings = await new Promise(resolve => chrome.storage.sync.get(['categories'], resolve));
      settings.categories = updatedSettings.categories || [];
      renderCategories(settings.categories);
      showSuccessMessage('分類已更新');
    } catch (error) {
      showErrorMessage(error.message);
    }
  }, async (catId) => {
    await deleteCategory(catId);
  });
}

async function deleteCategory(categoryId) {
  const category = settings.categories.find(c => c.id === categoryId);
  if (!category) {
    showErrorMessage('找不到分類');
    return;
  }

  // Show confirmation dialog
  let message = `確定要刪除「${category.name}」分類嗎？`;
  if (category.keywords.length > 0) {
    message += `\n\n此分類包含 ${category.keywords.length} 個關鍵字，刪除後將無法復原。`;
  }

  // Warn if deleting last category
  if (settings.categories.length === 1) {
    message += '\n\n⚠️ 這是最後一個分類，刪除後郵件分類功能將無法運作。';
  }

  const confirmed = await showConfirmDialog('刪除分類', message);
  if (!confirmed) return;

  try {
    const success = await window.CategoryManager.deleteCategory(categoryId);
    if (success) {
      // Reload categories from storage to ensure sync
      const updatedSettings = await new Promise(resolve => chrome.storage.sync.get(['categories'], resolve));
      settings.categories = updatedSettings.categories || [];
      renderCategories(settings.categories);
      showSuccessMessage('分類已刪除');
    }
  } catch (error) {
    showErrorMessage(error.message);
  }
}

function showConfirmDialog(title, message) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'aegis-confirm-overlay';
    overlay.innerHTML = `
      <div class="aegis-confirm-dialog">
        <h3>${escapeHtml(title)}</h3>
        <p style="white-space: pre-line;">${escapeHtml(message)}</p>
        <div class="aegis-confirm-actions">
          <button class="aegis-confirm-cancel">取消</button>
          <button class="aegis-confirm-ok">確定</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    overlay.querySelector('.aegis-confirm-cancel').addEventListener('click', () => {
      overlay.remove();
      resolve(false);
    });

    overlay.querySelector('.aegis-confirm-ok').addEventListener('click', () => {
      overlay.remove();
      resolve(true);
    });

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.remove();
        resolve(false);
      }
    });
  });
}

function showErrorMessage(message) {
  const notification = document.createElement('div');
  notification.className = 'aegis-notification aegis-notification-error';
  notification.textContent = message;
  document.body.appendChild(notification);

  setTimeout(() => notification.classList.add('show'), 10);

  const dismiss = () => {
    notification.classList.remove('show');
    setTimeout(() => notification.remove(), 300);
  };

  notification.addEventListener('click', dismiss);
  setTimeout(dismiss, 5000);
}

function showSuccessMessage(message) {
  const notification = document.createElement('div');
  notification.className = 'aegis-notification aegis-notification-success';
  notification.textContent = message;
  document.body.appendChild(notification);

  setTimeout(() => notification.classList.add('show'), 10);

  setTimeout(() => {
    notification.classList.remove('show');
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}


// Nano AI availability and download functions

async function checkNanoAvailability() {
  const statusEl = document.getElementById('nanoStatus');
  const downloadBtn = document.getElementById('nanoDownloadBtn');
  const progressContainer = document.getElementById('nanoProgressContainer');

  // Hide download controls by default
  downloadBtn.style.display = 'none';
  progressContainer.style.display = 'none';

  if (typeof LanguageModel === 'undefined') {
    updateNanoStatus('red', 'Prompt API is not available in this browser. Enable chrome://flags/#optimization-guide-on-device-model and chrome://flags/#prompt-api-for-gemini-nano');
    return;
  }

  try {
    const status = await LanguageModel.availability();
    switch (status) {
      case 'available':
        updateNanoStatus('green', 'Gemini Nano is ready');
        break;
      case 'downloadable':
        updateNanoStatus('amber', 'Gemini Nano needs to be downloaded');
        downloadBtn.style.display = 'inline-block';
        break;
      case 'downloading':
        updateNanoStatus('amber', 'Gemini Nano is downloading...');
        progressContainer.style.display = 'block';
        break;
      case 'unavailable':
      default:
        updateNanoStatus('red', 'Gemini Nano is not supported on this device');
        break;
    }
  } catch (e) {
    updateNanoStatus('red', 'Failed to check Gemini Nano availability: ' + e.message);
  }
}

function updateNanoStatus(color, message) {
  const statusEl = document.getElementById('nanoStatus');
  const colorMap = { green: '#1a7f37', amber: '#9a6700', red: '#cf222e' };
  statusEl.style.color = colorMap[color] || '#5f6368';
  statusEl.textContent = message;
}

async function triggerNanoDownload() {
  const downloadBtn = document.getElementById('nanoDownloadBtn');
  const progressContainer = document.getElementById('nanoProgressContainer');
  const progressBar = document.getElementById('nanoProgressBar');

  downloadBtn.disabled = true;
  progressContainer.style.display = 'block';
  updateNanoStatus('amber', 'Downloading Gemini Nano...');

  try {
    await LanguageModel.create({
      monitor(m) {
        m.addEventListener('downloadprogress', (e) => {
          const pct = e.total > 0 ? Math.round((e.loaded / e.total) * 100) : 0;
          progressBar.style.width = pct + '%';
          progressBar.textContent = pct + '%';
        });
      }
    });
    updateNanoStatus('green', 'Gemini Nano is ready');
    progressContainer.style.display = 'none';
    downloadBtn.style.display = 'none';
  } catch (e) {
    updateNanoStatus('red', 'Download failed: ' + e.message);
    downloadBtn.disabled = false;
    progressContainer.style.display = 'none';
  }
}
