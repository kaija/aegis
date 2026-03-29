/**
 * URL Analytics Page
 * Renders trend chart, prediction, and category pie chart using Canvas API
 */

// ---- Storage helpers (direct, no module dependency) ----

const STORAGE_KEY = 'aegis_url_history';
const USER_LABELS_KEY = 'aegis_url_user_labels';
const SETTINGS_KEY = 'aegis_url_tracker_settings';
const CATEGORIES_DATA_KEY = 'aegis_url_categories_data';
const TIME_KEY = 'aegis_url_time';

let _categoriesData = null;

function getDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

async function loadCategoriesData() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'GET_URL_CATEGORIES' }, (response) => {
      if (response && response.data) {
        _categoriesData = response.data;
        resolve(response.data);
      } else {
        resolve(null);
      }
    });
  });
}

async function getDailyViews(days) {
  const result = [];
  const now = new Date();
  const keys = [];

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateKey = getDateKey(d);
    keys.push({
      storageKey: `${STORAGE_KEY}_${dateKey}`,
      date: dateKey,
      dayOfWeek: d.getDay()
    });
  }

  const storageKeys = keys.map(k => k.storageKey);
  const data = await new Promise((resolve) => {
    chrome.storage.local.get(storageKeys, resolve);
  });

  for (const k of keys) {
    const dayData = data[k.storageKey];
    result.push({
      date: k.date,
      count: dayData ? dayData.totalCount : 0,
      dayOfWeek: k.dayOfWeek
    });
  }
  return result;
}

async function getCategoryBreakdown(days) {
  const now = new Date();
  const keys = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    keys.push(`${STORAGE_KEY}_${getDateKey(d)}`);
  }

  const data = await new Promise((resolve) => {
    chrome.storage.local.get(keys, resolve);
  });

  const counts = {};
  for (const key of keys) {
    const dayData = data[key];
    if (!dayData || !dayData.views) continue;
    for (const v of dayData.views) {
      counts[v.category] = (counts[v.category] || 0) + 1;
    }
  }

  const categories = _categoriesData ? _categoriesData.categories : [];
  const breakdown = [];
  for (const [catId, count] of Object.entries(counts)) {
    const cat = categories.find(c => c.id === catId);
    breakdown.push({
      categoryId: catId,
      name: cat ? cat.name : (catId === 'uncategorized' ? 'Uncategorized' : catId),
      emoji: cat ? cat.emoji : '?',
      color: cat ? cat.color : '#9e9e9e',
      bgColor: cat ? cat.bgColor : '#f5f5f5',
      count
    });
  }
  breakdown.sort((a, b) => b.count - a.count);
  return breakdown;
}

async function predictToday() {
  const now = new Date();
  const todayKey = `${STORAGE_KEY}_${getDateKey(now)}`;

  const todayData = await new Promise((resolve) => {
    chrome.storage.local.get([todayKey], resolve);
  });
  const currentCount = todayData[todayKey] ? todayData[todayKey].totalCount : 0;

  const sameDayCounts = [];
  for (let w = 1; w <= 4; w++) {
    const d = new Date(now);
    d.setDate(d.getDate() - (w * 7));
    const key = `${STORAGE_KEY}_${getDateKey(d)}`;
    const data = await new Promise((resolve) => {
      chrome.storage.local.get([key], resolve);
    });
    if (data[key]) {
      sameDayCounts.push(data[key].totalCount);
    }
  }

  let predicted = currentCount;
  if (sameDayCounts.length > 0) {
    const avg = sameDayCounts.reduce((a, b) => a + b, 0) / sameDayCounts.length;
    const hoursElapsed = now.getHours() + now.getMinutes() / 60;
    if (hoursElapsed > 1) {
      const paceProjection = (currentCount / hoursElapsed) * 24;
      predicted = Math.round((avg * 0.4) + (paceProjection * 0.6));
    } else {
      predicted = Math.round(avg);
    }
  }

  return {
    current: currentCount,
    predicted: Math.max(predicted, currentCount),
    historicalAvg: sameDayCounts.length > 0
      ? Math.round(sameDayCounts.reduce((a, b) => a + b, 0) / sameDayCounts.length)
      : 0,
    sampleWeeks: sameDayCounts.length
  };
}

async function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get([SETTINGS_KEY], (result) => {
      resolve(result[SETTINGS_KEY] || { feedbackEnabled: true });
    });
  });
}

async function saveSettings(settings) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [SETTINGS_KEY]: settings }, resolve);
  });
}

async function getUserLabels() {
  return new Promise((resolve) => {
    chrome.storage.local.get([USER_LABELS_KEY], (result) => {
      resolve(result[USER_LABELS_KEY] || {});
    });
  });
}

async function saveUserLabel(domain, categoryId) {
  const labels = await getUserLabels();
  labels[domain] = categoryId;
  return new Promise((resolve) => {
    chrome.storage.local.set({ [USER_LABELS_KEY]: labels }, resolve);
  });
}

async function getFullHistory(days) {
  const now = new Date();
  const keys = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    keys.push(`${STORAGE_KEY}_${getDateKey(d)}`);
  }
  const data = await new Promise((resolve) => {
    chrome.storage.local.get(keys, resolve);
  });
  const allViews = [];
  for (const key of keys) {
    if (data[key] && data[key].views) {
      allViews.push(...data[key].views);
    }
  }
  return allViews;
}

// ---- Time Data Helpers ----

async function getTimeData(days) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'GET_TIME_DATA', days }, (response) => {
      resolve(response && response.timeData ? response.timeData : {});
    });
  });
}

function formatDuration(ms) {
  if (ms < 60000) return Math.round(ms / 1000) + 's';
  const totalMin = Math.floor(ms / 60000);
  if (totalMin < 60) return totalMin + 'm';
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m > 0 ? h + 'h ' + m + 'm' : h + 'h';
}

function formatDurationShort(ms) {
  if (ms < 60000) return Math.round(ms / 1000) + 's';
  const totalMin = Math.floor(ms / 60000);
  if (totalMin < 60) return totalMin + 'm';
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m > 0 ? h + 'h' + m : h + 'h';
}

function getDailyTimeFromData(timeData) {
  const result = [];
  const sortedDates = Object.keys(timeData).sort();
  for (const date of sortedDates) {
    const d = new Date(date + 'T00:00:00');
    result.push({
      date,
      totalMs: timeData[date].totalMs || 0,
      dayOfWeek: d.getDay()
    });
  }
  return result;
}

function getTimeCategoryBreakdown(timeData) {
  const catTotals = {};
  for (const dayData of Object.values(timeData)) {
    if (!dayData.categories) continue;
    for (const [rawCatId, ms] of Object.entries(dayData.categories)) {
      // Treat null/undefined/empty keys as uncategorized
      const catId = (!rawCatId || rawCatId === 'null' || rawCatId === 'undefined') ? 'uncategorized' : rawCatId;
      catTotals[catId] = (catTotals[catId] || 0) + ms;
    }
  }

  const categories = _categoriesData ? _categoriesData.categories : [];
  const breakdown = [];
  for (const [catId, ms] of Object.entries(catTotals)) {
    const cat = categories.find(c => c.id === catId);
    breakdown.push({
      categoryId: catId,
      name: cat ? cat.name : (catId === 'uncategorized' ? 'Uncategorized' : catId),
      emoji: cat ? cat.emoji : '?',
      color: cat ? cat.color : '#9e9e9e',
      bgColor: cat ? cat.bgColor : '#f5f5f5',
      ms
    });
  }
  breakdown.sort((a, b) => b.ms - a.ms);
  return breakdown;
}

// ---- Chart Drawing ----

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function drawTrendChart(canvas, dailyData) {
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.parentElement.getBoundingClientRect();
  const w = rect.width;
  const h = 200;

  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  ctx.scale(dpr, dpr);

  const padding = { top: 20, right: 20, bottom: 36, left: 40 };
  const chartW = w - padding.left - padding.right;
  const chartH = h - padding.top - padding.bottom;

  const maxVal = Math.max(...dailyData.map(d => d.count), 1);
  const gridLines = 4;

  // Background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);

  // Grid lines
  ctx.strokeStyle = '#f1f3f4';
  ctx.lineWidth = 1;
  for (let i = 0; i <= gridLines; i++) {
    const y = padding.top + (chartH / gridLines) * i;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(w - padding.right, y);
    ctx.stroke();

    // Y-axis labels
    const val = Math.round(maxVal - (maxVal / gridLines) * i);
    ctx.fillStyle = '#80868b';
    ctx.font = '11px -apple-system, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(val, padding.left - 8, y + 4);
  }

  if (dailyData.length === 0) return;

  const barWidth = Math.min(32, (chartW / dailyData.length) * 0.6);
  const gap = chartW / dailyData.length;

  // Bars
  for (let i = 0; i < dailyData.length; i++) {
    const d = dailyData[i];
    const x = padding.left + gap * i + (gap - barWidth) / 2;
    const barH = (d.count / maxVal) * chartH;
    const y = padding.top + chartH - barH;

    // Bar
    const isToday = i === dailyData.length - 1;
    const gradient = ctx.createLinearGradient(x, y, x, padding.top + chartH);
    if (isToday) {
      gradient.addColorStop(0, '#1a73e8');
      gradient.addColorStop(1, '#4285f4');
    } else {
      gradient.addColorStop(0, '#a8c7fa');
      gradient.addColorStop(1, '#c5dafb');
    }
    ctx.fillStyle = gradient;

    // Rounded top
    const radius = Math.min(4, barWidth / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + barWidth - radius, y);
    ctx.quadraticCurveTo(x + barWidth, y, x + barWidth, y + radius);
    ctx.lineTo(x + barWidth, padding.top + chartH);
    ctx.lineTo(x, padding.top + chartH);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.fill();

    // Value on top
    if (d.count > 0) {
      ctx.fillStyle = isToday ? '#1a73e8' : '#80868b';
      ctx.font = `${isToday ? 'bold' : 'normal'} 11px -apple-system, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(d.count, x + barWidth / 2, y - 6);
    }

    // X-axis label
    const label = isToday ? 'Today' : DAY_NAMES[d.dayOfWeek];
    ctx.fillStyle = isToday ? '#1a73e8' : '#5f6368';
    ctx.font = `${isToday ? '600' : '400'} 11px -apple-system, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(label, x + barWidth / 2, h - padding.bottom + 16);

    // Date below day name
    const dateLabel = d.date.slice(5); // MM-DD
    ctx.fillStyle = '#80868b';
    ctx.font = '10px -apple-system, sans-serif';
    ctx.fillText(dateLabel, x + barWidth / 2, h - padding.bottom + 28);
  }
}

function drawPieChart(canvas, breakdownData) {
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const size = 180;

  canvas.width = size * dpr;
  canvas.height = size * dpr;
  canvas.style.width = size + 'px';
  canvas.style.height = size + 'px';
  ctx.scale(dpr, dpr);

  const cx = size / 2;
  const cy = size / 2;
  const outerR = size / 2 - 4;
  const innerR = outerR * 0.55; // Donut

  const total = breakdownData.reduce((sum, d) => sum + d.count, 0);
  if (total === 0) {
    // Empty state
    ctx.beginPath();
    ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
    ctx.arc(cx, cy, innerR, 0, Math.PI * 2, true);
    ctx.fillStyle = '#f1f3f4';
    ctx.fill();

    ctx.fillStyle = '#80868b';
    ctx.font = '13px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('No data', cx, cy + 5);
    return;
  }

  let startAngle = -Math.PI / 2;

  for (const item of breakdownData) {
    const sliceAngle = (item.count / total) * Math.PI * 2;

    ctx.beginPath();
    ctx.arc(cx, cy, outerR, startAngle, startAngle + sliceAngle);
    ctx.arc(cx, cy, innerR, startAngle + sliceAngle, startAngle, true);
    ctx.closePath();
    ctx.fillStyle = item.color;
    ctx.fill();

    // Thin white separator
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();

    startAngle += sliceAngle;
  }

  // Center text
  ctx.fillStyle = '#202124';
  ctx.font = 'bold 22px -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(total, cx, cy + 2);
  ctx.fillStyle = '#80868b';
  ctx.font = '11px -apple-system, sans-serif';
  ctx.fillText('views', cx, cy + 18);
}

function drawTimeTrendChart(canvas, dailyTimeData) {
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.parentElement.getBoundingClientRect();
  const w = rect.width;
  const h = 200;

  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  ctx.scale(dpr, dpr);

  const padding = { top: 20, right: 20, bottom: 36, left: 44 };
  const chartW = w - padding.left - padding.right;
  const chartH = h - padding.top - padding.bottom;

  const maxVal = Math.max(...dailyTimeData.map(d => d.totalMs), 60000); // min 1 minute
  const gridLines = 4;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);

  // Grid lines + Y labels (time format)
  ctx.strokeStyle = '#f1f3f4';
  ctx.lineWidth = 1;
  for (let i = 0; i <= gridLines; i++) {
    const y = padding.top + (chartH / gridLines) * i;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(w - padding.right, y);
    ctx.stroke();

    const val = maxVal - (maxVal / gridLines) * i;
    ctx.fillStyle = '#80868b';
    ctx.font = '10px -apple-system, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(formatDurationShort(val), padding.left - 6, y + 4);
  }

  if (dailyTimeData.length === 0) return;

  const barWidth = Math.min(32, (chartW / dailyTimeData.length) * 0.6);
  const gap = chartW / dailyTimeData.length;

  for (let i = 0; i < dailyTimeData.length; i++) {
    const d = dailyTimeData[i];
    const x = padding.left + gap * i + (gap - barWidth) / 2;
    const barH = (d.totalMs / maxVal) * chartH;
    const y = padding.top + chartH - barH;

    const isToday = i === dailyTimeData.length - 1;
    const gradient = ctx.createLinearGradient(x, y, x, padding.top + chartH);
    if (isToday) {
      gradient.addColorStop(0, '#34a853');
      gradient.addColorStop(1, '#57bb6d');
    } else {
      gradient.addColorStop(0, '#a8dab5');
      gradient.addColorStop(1, '#c5e8cf');
    }
    ctx.fillStyle = gradient;

    const radius = Math.min(4, barWidth / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + barWidth - radius, y);
    ctx.quadraticCurveTo(x + barWidth, y, x + barWidth, y + radius);
    ctx.lineTo(x + barWidth, padding.top + chartH);
    ctx.lineTo(x, padding.top + chartH);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.fill();

    // Value on top
    if (d.totalMs >= 1000) {
      ctx.fillStyle = isToday ? '#34a853' : '#80868b';
      ctx.font = `${isToday ? 'bold' : 'normal'} 10px -apple-system, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(formatDurationShort(d.totalMs), x + barWidth / 2, y - 6);
    }

    // X-axis label
    const label = isToday ? 'Today' : DAY_NAMES[d.dayOfWeek];
    ctx.fillStyle = isToday ? '#34a853' : '#5f6368';
    ctx.font = `${isToday ? '600' : '400'} 11px -apple-system, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(label, x + barWidth / 2, h - padding.bottom + 16);

    const dateLabel = d.date.slice(5);
    ctx.fillStyle = '#80868b';
    ctx.font = '10px -apple-system, sans-serif';
    ctx.fillText(dateLabel, x + barWidth / 2, h - padding.bottom + 28);
  }
}

function drawTimePieChart(canvas, timeBreakdown) {
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const size = 180;

  canvas.width = size * dpr;
  canvas.height = size * dpr;
  canvas.style.width = size + 'px';
  canvas.style.height = size + 'px';
  ctx.scale(dpr, dpr);

  const cx = size / 2;
  const cy = size / 2;
  const outerR = size / 2 - 4;
  const innerR = outerR * 0.55;

  const totalMs = timeBreakdown.reduce((sum, d) => sum + d.ms, 0);
  if (totalMs === 0) {
    ctx.beginPath();
    ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
    ctx.arc(cx, cy, innerR, 0, Math.PI * 2, true);
    ctx.fillStyle = '#f1f3f4';
    ctx.fill();
    ctx.fillStyle = '#80868b';
    ctx.font = '13px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('No data', cx, cy + 5);
    return;
  }

  let startAngle = -Math.PI / 2;
  for (const item of timeBreakdown) {
    const sliceAngle = (item.ms / totalMs) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(cx, cy, outerR, startAngle, startAngle + sliceAngle);
    ctx.arc(cx, cy, innerR, startAngle + sliceAngle, startAngle, true);
    ctx.closePath();
    ctx.fillStyle = item.color;
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();
    startAngle += sliceAngle;
  }

  // Center text
  ctx.fillStyle = '#202124';
  ctx.font = 'bold 18px -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(formatDuration(totalMs), cx, cy + 2);
  ctx.fillStyle = '#80868b';
  ctx.font = '11px -apple-system, sans-serif';
  ctx.fillText('total', cx, cy + 18);
}

function renderTimeLegend(container, timeBreakdown) {
  const totalMs = timeBreakdown.reduce((sum, d) => sum + d.ms, 0);
  container.innerHTML = '';

  for (const item of timeBreakdown) {
    const pct = totalMs > 0 ? ((item.ms / totalMs) * 100).toFixed(1) : '0.0';
    const div = document.createElement('div');
    div.className = 'legend-item';
    div.innerHTML = `
      <span class="legend-dot" style="background:${item.color}"></span>
      <span class="legend-name">${item.emoji} ${item.name}</span>
      <span class="legend-count">${formatDuration(item.ms)}</span>
      <span class="legend-pct">${pct}%</span>
    `;
    container.appendChild(div);
  }
}

function renderLegend(container, breakdown) {
  const total = breakdown.reduce((sum, d) => sum + d.count, 0);
  container.innerHTML = '';

  for (const item of breakdown) {
    const pct = total > 0 ? ((item.count / total) * 100).toFixed(1) : '0.0';
    const div = document.createElement('div');
    div.className = 'legend-item';
    div.innerHTML = `
      <span class="legend-dot" style="background:${item.color}"></span>
      <span class="legend-name">${item.emoji} ${item.name}</span>
      <span class="legend-count">${item.count}</span>
      <span class="legend-pct">${pct}%</span>
    `;
    container.appendChild(div);
  }
}

// ---- Uncategorized URLs ----

async function getUncategorizedDomains(days) {
  const now = new Date();
  const keys = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    keys.push(`${STORAGE_KEY}_${getDateKey(d)}`);
  }

  const data = await new Promise((resolve) => {
    chrome.storage.local.get(keys, resolve);
  });

  // Aggregate by domain: { domain -> { count, lastUrl, lastTitle } }
  const domainMap = {};
  for (const key of keys) {
    const dayData = data[key];
    if (!dayData || !dayData.views) continue;
    for (const v of dayData.views) {
      if (v.category && v.category !== 'uncategorized' && v.category !== 'null') continue;
      if (!domainMap[v.domain]) {
        domainMap[v.domain] = { count: 0, lastUrl: v.url, lastTitle: v.title };
      }
      domainMap[v.domain].count++;
      domainMap[v.domain].lastUrl = v.url;
      domainMap[v.domain].lastTitle = v.title;
    }
  }

  // Sort by count descending
  return Object.entries(domainMap)
    .map(([domain, info]) => ({ domain, ...info }))
    .sort((a, b) => b.count - a.count);
}

function renderUncategorizedList(container, domains, categories, onSave) {
  const emptyEl = document.getElementById('uncategorizedEmpty');
  const countBadge = document.getElementById('uncategorizedCount');

  if (domains.length === 0) {
    emptyEl.style.display = '';
    countBadge.textContent = '0';
    // Remove all rows but keep empty state
    container.querySelectorAll('.uncat-row').forEach(el => el.remove());
    return;
  }

  emptyEl.style.display = 'none';
  countBadge.textContent = domains.length;

  // Clear existing rows
  container.querySelectorAll('.uncat-row').forEach(el => el.remove());

  const optionsHtml = categories.map(c =>
    `<option value="${escapeHtml(c.id)}">${c.emoji} ${escapeHtml(c.name)}</option>`
  ).join('');

  for (const item of domains) {
    const row = document.createElement('div');
    row.className = 'uncat-row';
    row.dataset.domain = item.domain;
    row.innerHTML = `
      <div class="uncat-domain">
        <span class="uncat-domain-name" title="${escapeHtml(item.lastUrl)}">${escapeHtml(item.domain)}</span>
        <span class="uncat-domain-meta">${item.count} view${item.count > 1 ? 's' : ''}</span>
      </div>
      <select class="uncat-select">
        <option value="">-- Select --</option>
        ${optionsHtml}
      </select>
      <button class="uncat-save" disabled>Save</button>
    `;

    const select = row.querySelector('.uncat-select');
    const saveBtn = row.querySelector('.uncat-save');

    select.addEventListener('change', () => {
      saveBtn.disabled = !select.value;
    });

    saveBtn.addEventListener('click', async () => {
      if (!select.value) return;
      const selectedCatId = select.value;
      const selectedText = select.options[select.selectedIndex].text;
      saveBtn.disabled = true;
      saveBtn.textContent = '...';

      try {
        await onSave(item.domain, selectedCatId);
      } catch (e) {
        console.error('[Aegis] Save label failed:', e);
      }

      // Replace select+button with saved indicator
      select.remove();
      saveBtn.remove();
      const saved = document.createElement('span');
      saved.className = 'uncat-saved';
      saved.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> ${escapeHtml(selectedText)}`;
      row.appendChild(saved);

      // Update count badge
      const remaining = container.querySelectorAll('.uncat-select').length;
      countBadge.textContent = remaining;
      if (remaining === 0) {
        emptyEl.style.display = '';
      }
    });

    container.appendChild(row);
  }
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
}

// ---- Export Functions ----

function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function exportLabelsAsJson() {
  const labels = await getUserLabels();
  const content = JSON.stringify(labels, null, 2);
  downloadFile(content, `aegis-url-labels-${getDateKey(new Date())}.json`, 'application/json');
}

async function exportHistoryAsCsv() {
  const views = await getFullHistory(30);
  const header = 'timestamp,date,domain,category,title,url\n';
  const rows = views.map(v => {
    const date = new Date(v.timestamp).toISOString();
    const title = (v.title || '').replace(/"/g, '""');
    const url = (v.url || '').replace(/"/g, '""');
    return `${v.timestamp},"${date}","${v.domain}","${v.category}","${title}","${url}"`;
  }).join('\n');
  downloadFile(header + rows, `aegis-url-history-${getDateKey(new Date())}.csv`, 'text/csv');
}

// ---- Main ----

document.addEventListener('DOMContentLoaded', async () => {
  const trendCanvas = document.getElementById('trendChart');
  const timeTrendCanvas = document.getElementById('timeTrendChart');
  const pieCanvas = document.getElementById('categoryPieChart');
  const timePieCanvas = document.getElementById('timePieChart');
  const legendContainer = document.getElementById('categoryLegend');
  const timeLegendContainer = document.getElementById('timeLegend');
  const currentViewsEl = document.getElementById('currentViews');
  const predictedViewsEl = document.getElementById('predictedViews');
  const predictionMetaEl = document.getElementById('predictionMeta');
  const feedbackToggle = document.getElementById('feedbackToggle');
  const exportBtn = document.getElementById('exportBtn');
  const exportDialog = document.getElementById('exportDialog');
  const exportLabelsBtn = document.getElementById('exportLabels');
  const exportHistoryBtn = document.getElementById('exportHistory');
  const exportCloseBtn = document.getElementById('exportClose');

  const uncategorizedSection = document.getElementById('uncategorizedSection');
  const uncategorizedList = document.getElementById('uncategorizedList');

  // Load categories
  await loadCategoriesData();

  // Load settings
  const settings = await getSettings();
  feedbackToggle.checked = settings.feedbackEnabled || false;

  // Category list for dropdowns
  const categoryOptions = _categoriesData
    ? _categoriesData.categories.map(c => ({ id: c.id, name: c.name, emoji: c.emoji }))
    : [];

  // Refresh helper: re-renders pie charts and legends after label save
  async function refreshAfterSave() {
    const newBreakdown = await getCategoryBreakdown(8);
    drawPieChart(pieCanvas, newBreakdown);
    renderLegend(legendContainer, newBreakdown);

    // Also refresh time pie chart
    const newTimeData = await getTimeData(8);
    const newTimeBreakdown = getTimeCategoryBreakdown(newTimeData);
    drawTimePieChart(timePieCanvas, newTimeBreakdown);
    renderTimeLegend(timeLegendContainer, newTimeBreakdown);
  }

  // Show/hide uncategorized section based on feedback toggle
  async function updateUncategorizedSection() {
    if (feedbackToggle.checked) {
      uncategorizedSection.style.display = '';
      const domains = await getUncategorizedDomains(8);
      renderUncategorizedList(uncategorizedList, domains, categoryOptions, async (domain, categoryId) => {
        // Save label via background (updates history + time data + invalidates lookup)
        try {
          await new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({
              type: 'SAVE_URL_LABEL',
              domain,
              categoryId,
              url: `https://${domain}`
            }, (response) => {
              if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
              } else {
                resolve(response);
              }
            });
          });
        } catch (e) {
          console.warn('[Aegis] Background save failed, saving locally:', e.message);
          await saveUserLabel(domain, categoryId);
        }
        await refreshAfterSave();
      });
    } else {
      uncategorizedSection.style.display = 'none';
    }
  }

  await updateUncategorizedSection();

  feedbackToggle.addEventListener('change', async () => {
    const s = await getSettings();
    s.feedbackEnabled = feedbackToggle.checked;
    await saveSettings(s);
    await updateUncategorizedSection();
  });

  // Fetch time data (triggers flush of current session)
  const timeData = await getTimeData(8);
  const dailyTime = getDailyTimeFromData(timeData);
  const todayDateKey = getDateKey(new Date());
  const todayTime = timeData[todayDateKey] || { totalMs: 0 };

  // Prediction card — views + today's active time
  const prediction = await predictToday();
  currentViewsEl.textContent = prediction.current;
  if (prediction.sampleWeeks > 0) {
    predictedViewsEl.textContent = prediction.predicted;
    predictionMetaEl.textContent = `${prediction.sampleWeeks}w avg: ${prediction.historicalAvg} views | Active today: ${formatDuration(todayTime.totalMs)}`;
  } else {
    predictedViewsEl.textContent = '--';
    predictionMetaEl.textContent = `Active today: ${formatDuration(todayTime.totalMs)}`;
  }

  // Page views trend chart (past 7 days + today = 8)
  const dailyViews = await getDailyViews(8);
  drawTrendChart(trendCanvas, dailyViews);

  // Browsing time trend chart
  drawTimeTrendChart(timeTrendCanvas, dailyTime);

  // Category pie chart (by views)
  const breakdown = await getCategoryBreakdown(8);
  drawPieChart(pieCanvas, breakdown);
  renderLegend(legendContainer, breakdown);

  // Time pie chart (by active time)
  const timeBreakdown = getTimeCategoryBreakdown(timeData);
  drawTimePieChart(timePieCanvas, timeBreakdown);
  renderTimeLegend(timeLegendContainer, timeBreakdown);

  // Export dialog
  exportBtn.addEventListener('click', () => {
    exportDialog.style.display = 'flex';
  });

  exportCloseBtn.addEventListener('click', () => {
    exportDialog.style.display = 'none';
  });

  exportDialog.addEventListener('click', (e) => {
    if (e.target === exportDialog) exportDialog.style.display = 'none';
  });

  exportLabelsBtn.addEventListener('click', async () => {
    await exportLabelsAsJson();
    exportDialog.style.display = 'none';
  });

  exportHistoryBtn.addEventListener('click', async () => {
    await exportHistoryAsCsv();
    exportDialog.style.display = 'none';
  });

  // Handle window resize
  let resizeTimeout;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      drawTrendChart(trendCanvas, dailyViews);
      drawTimeTrendChart(timeTrendCanvas, dailyTime);
    }, 100);
  });
});
