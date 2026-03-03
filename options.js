let settings = {};

document.addEventListener('DOMContentLoaded', async () => {
  // Load all settings
  settings = await new Promise(resolve => chrome.storage.sync.get(null, resolve));

  // Set analysis mode radio
  const modeInputs = document.querySelectorAll('input[name="analysisMode"]');
  modeInputs.forEach(input => {
    if (input.value === (settings.analysisMode || 'local')) {
      input.checked = true;
    }
    input.addEventListener('change', () => {
      document.getElementById('aiSettingsSection').style.display =
        input.value === 'ai' ? 'block' : 'none';
    });
  });

  if (settings.analysisMode === 'ai') {
    document.getElementById('aiSettingsSection').style.display = 'block';
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

      // Append below the action group
      btn.parentElement.after(dumpArea);
    } else {
      statusEl.textContent = '❌ ' + (response.error || '不明錯誤');
      statusEl.style.color = '#cf222e';
    }
  });
}

function renderCategories(categories) {
  const container = document.getElementById('categoriesList');
  container.innerHTML = '';

  categories.forEach(cat => {
    const item = document.createElement('div');
    item.className = 'category-item';
    item.dataset.catId = cat.id;

    item.innerHTML = `
      <div class="category-header-bar">
        <span class="cat-emoji">${cat.emoji}</span>
        <span class="cat-name" style="color: ${cat.color}">${cat.name}</span>
        <span class="cat-count">${cat.keywords.length} 個關鍵字</span>
        <span class="cat-toggle">▼</span>
      </div>
      <div class="category-keywords" id="cat-body-${cat.id}">
        <div class="keywords-label">關鍵字</div>
        <div class="keywords-tags" id="tags-${cat.id}"></div>
        <div class="keyword-add-row">
          <input type="text" class="keyword-input" id="input-${cat.id}" placeholder="新增關鍵字...">
          <button class="keyword-add-btn" data-cat-id="${cat.id}">新增</button>
        </div>
      </div>
    `;

    container.appendChild(item);

    // Render keyword tags
    renderKeywordTags(cat);

    // Toggle expand
    const headerBar = item.querySelector('.category-header-bar');
    headerBar.addEventListener('click', () => {
      const body = item.querySelector('.category-keywords');
      const toggle = item.querySelector('.cat-toggle');
      body.classList.toggle('open');
      toggle.textContent = body.classList.contains('open') ? '▲' : '▼';
    });

    // Add keyword button
    item.querySelector('.keyword-add-btn').addEventListener('click', () => {
      addKeyword(cat.id);
    });

    // Add keyword on Enter
    item.querySelector(`#input-${cat.id}`).addEventListener('keydown', (e) => {
      if (e.key === 'Enter') addKeyword(cat.id);
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
      const catId = e.target.dataset.cat;
      const keyword = e.target.dataset.kw;
      removeKeyword(catId, keyword);
    });
  });

  // Update count
  const countEl = document.querySelector(`[data-cat-id="${cat.id}"] .cat-count`);
  if (countEl) countEl.textContent = `${cat.keywords.length} 個關鍵字`;
}

function addKeyword(catId) {
  const input = document.getElementById(`input-${catId}`);
  if (!input) return;
  const keyword = input.value.trim();
  if (!keyword) return;

  const cat = settings.categories.find(c => c.id === catId);
  if (cat && !cat.keywords.includes(keyword)) {
    cat.keywords.push(keyword);
    renderKeywordTags(cat);
  }
  input.value = '';
  input.focus();
}

function removeKeyword(catId, keyword) {
  const cat = settings.categories.find(c => c.id === catId);
  if (cat) {
    cat.keywords = cat.keywords.filter(k => k !== keyword);
    renderKeywordTags(cat);
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
