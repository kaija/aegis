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
});

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
      model: document.getElementById('aiModel').value.trim() || 'gpt-4o-mini'
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
