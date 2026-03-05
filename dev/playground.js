import { BlissSVGBuilder } from '../src/index.js';

// ── Constants ──

const STORAGE_KEY = 'bliss-dev-playground-cases';
const DEBOUNCE_MS = 200;

// ── State ──

let cases = [];

// ── DOM refs ──

const inputString = document.getElementById('input-string');
const defaultsInput = document.getElementById('defaults-input');
const overridesInput = document.getElementById('overrides-input');
const addBtn = document.getElementById('add-btn');
const addSetupBtn = document.getElementById('add-setup-btn');
const previewSvg = document.getElementById('preview-svg');
const previewError = document.getElementById('preview-error');
const caseList = document.getElementById('case-list');
const caseCount = document.getElementById('case-count');
const exportBtn = document.getElementById('export-btn');
const importBtn = document.getElementById('import-btn');
const clearBtn = document.getElementById('clear-btn');
const importDialog = document.getElementById('import-dialog');
const importTextarea = document.getElementById('import-textarea');
const importCancel = document.getElementById('import-cancel');
const importConfirm = document.getElementById('import-confirm');

// ── Helpers ──

// Parse a JSON-ish string into an object, returns null if empty/invalid
function parseObjectInput(str) {
  const trimmed = (str || '').trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    try {
      return JSON.parse(`{${trimmed}}`);
    } catch {
      throw new Error(`Invalid JSON: ${trimmed}`);
    }
  }
}

// Serialize an object for display (compact, or empty string)
function serializeObj(obj) {
  if (!obj || Object.keys(obj).length === 0) return '';
  return JSON.stringify(obj);
}

// ── Setup (define) ──

// Run all setup cards in order, so definitions are available for test cards that follow
function runAllSetups() {
  for (const item of cases) {
    if (item.type === 'setup' && item.define) {
      try {
        BlissSVGBuilder.define(item.define);
      } catch { /* shown on card */ }
    }
  }
}

// ── Rendering ──

function renderSvg(item) {
  const constructorOpts = {};
  if (item.defaults) constructorOpts.defaults = item.defaults;
  if (item.overrides) constructorOpts.overrides = item.overrides;

  const hasOpts = Object.keys(constructorOpts).length > 0;
  const builder = new BlissSVGBuilder(item.input, hasOpts ? constructorOpts : undefined);
  return builder.svgElement;
}

function updatePreview() {
  const input = inputString.value.trim();
  previewSvg.innerHTML = '';
  previewError.textContent = '';

  if (!input) return;

  try {
    const defaults = parseObjectInput(defaultsInput.value);
    const overrides = parseObjectInput(overridesInput.value);
    const svg = renderSvg({ input, defaults, overrides });
    previewSvg.appendChild(svg);
  } catch (e) {
    previewError.textContent = e.message;
  }
}

// ── Persistence ──

function saveToStorage() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cases));
}

async function loadFromFile() {
  try {
    const mod = await import('../temp/test-cases.js');
    return mod.default || [];
  } catch {
    return getBuiltinDefaults();
  }
}

function getBuiltinDefaults() {
  return [
    { input: 'B291', label: 'Basic glyph' },
    { input: 'B291/B291', label: 'Two glyphs' },
    { input: 'B291;B99', label: 'With indicator' },
  ];
}

async function loadCases() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try {
      cases = JSON.parse(stored);
      return;
    } catch { /* fall through */ }
  }
  cases = await loadFromFile();
  saveToStorage();
}

// ── Card Rendering ──

function renderSetupCard(item, index) {
  const card = document.createElement('div');
  card.className = 'case-card setup-card';
  card.dataset.index = index;

  // Index number
  const indexEl = document.createElement('span');
  indexEl.className = 'case-index';
  indexEl.textContent = index + 1;
  card.appendChild(indexEl);

  // Setup icon
  const iconEl = document.createElement('span');
  iconEl.className = 'setup-icon';
  iconEl.textContent = 'define()';
  card.appendChild(iconEl);

  // Info
  const info = document.createElement('div');
  info.className = 'case-info';

  const defineStr = JSON.stringify(item.define, null, 0);
  const defineEl = document.createElement('div');
  defineEl.className = 'case-code setup-define';
  defineEl.textContent = defineStr;
  defineEl.title = 'Click to edit definitions';
  defineEl.addEventListener('click', () => startInlineEdit(card, index, 'define'));
  info.appendChild(defineEl);

  // Show define result
  try {
    const result = BlissSVGBuilder.define(item.define);
    const parts = [];
    if (result.defined.length) parts.push(`defined: ${result.defined.join(', ')}`);
    if (result.skipped.length) parts.push(`skipped: ${result.skipped.join(', ')}`);
    if (result.errors.length) parts.push(`errors: ${result.errors.join('; ')}`);
    if (parts.length) {
      const resultEl = document.createElement('div');
      resultEl.className = result.errors.length ? 'case-error' : 'setup-result';
      resultEl.textContent = parts.join(' | ');
      info.appendChild(resultEl);
    }
  } catch (e) {
    const errorEl = document.createElement('div');
    errorEl.className = 'case-error';
    errorEl.textContent = e.message;
    info.appendChild(errorEl);
  }

  if (item.label) {
    const labelEl = document.createElement('div');
    labelEl.className = 'case-label';
    labelEl.textContent = item.label;
    info.appendChild(labelEl);
  }

  card.appendChild(info);

  // Actions
  card.appendChild(createActions(index));

  return card;
}

function renderTestCard(item, index) {
  const card = document.createElement('div');
  card.className = 'case-card';
  card.dataset.index = index;

  // Index number
  const indexEl = document.createElement('span');
  indexEl.className = 'case-index';
  indexEl.textContent = index + 1;
  card.appendChild(indexEl);

  // SVG preview
  const svgContainer = document.createElement('div');
  svgContainer.className = 'case-svg';
  try {
    const svg = renderSvg(item);
    svgContainer.appendChild(svg);
  } catch (e) {
    const errorEl = document.createElement('span');
    errorEl.className = 'case-error';
    errorEl.textContent = e.message;
    svgContainer.appendChild(errorEl);
  }
  card.appendChild(svgContainer);

  // Info (input + defaults + overrides + label)
  const info = document.createElement('div');
  info.className = 'case-info';

  const inputEl = document.createElement('div');
  inputEl.className = 'case-code';
  inputEl.textContent = item.input;
  inputEl.title = 'Click to edit';
  inputEl.addEventListener('click', () => startInlineEdit(card, index, 'input'));
  info.appendChild(inputEl);

  const defaultsStr = serializeObj(item.defaults);
  if (defaultsStr) {
    const defEl = document.createElement('div');
    defEl.className = 'case-defaults';
    defEl.textContent = `defaults: ${defaultsStr}`;
    defEl.title = 'Click to edit defaults';
    defEl.addEventListener('click', () => startInlineEdit(card, index, 'defaults'));
    info.appendChild(defEl);
  }

  const overridesStr = serializeObj(item.overrides);
  if (overridesStr) {
    const ovrEl = document.createElement('div');
    ovrEl.className = 'case-overrides';
    ovrEl.textContent = `overrides: ${overridesStr}`;
    ovrEl.title = 'Click to edit overrides';
    ovrEl.addEventListener('click', () => startInlineEdit(card, index, 'overrides'));
    info.appendChild(ovrEl);
  }

  if (item.label) {
    const labelEl = document.createElement('div');
    labelEl.className = 'case-label';
    labelEl.textContent = item.label;
    info.appendChild(labelEl);
  }

  card.appendChild(info);

  // Actions
  card.appendChild(createActions(index));

  return card;
}

function createActions(index) {
  const actions = document.createElement('div');
  actions.className = 'case-actions';

  const upBtn = document.createElement('button');
  upBtn.textContent = '\u2191';
  upBtn.title = 'Move up';
  upBtn.disabled = index === 0;
  upBtn.addEventListener('click', () => moveCase(index, -1));

  const downBtn = document.createElement('button');
  downBtn.textContent = '\u2193';
  downBtn.title = 'Move down';
  downBtn.disabled = index === cases.length - 1;
  downBtn.addEventListener('click', () => moveCase(index, 1));

  const editBtn = document.createElement('button');
  editBtn.textContent = '\u270E';
  editBtn.title = 'Load into input area';
  editBtn.addEventListener('click', () => loadToInput(index));

  const delBtn = document.createElement('button');
  delBtn.className = 'delete-btn';
  delBtn.textContent = '\u00D7';
  delBtn.title = 'Delete';
  delBtn.addEventListener('click', () => deleteCase(index));

  actions.append(upBtn, downBtn, editBtn, delBtn);
  return actions;
}

function renderCard(item, index) {
  if (item.type === 'setup') {
    return renderSetupCard(item, index);
  }
  return renderTestCard(item, index);
}

function renderAllCards() {
  caseList.innerHTML = '';
  cases.forEach((item, i) => {
    caseList.appendChild(renderCard(item, i));
  });
  caseCount.textContent = `${cases.length} case${cases.length !== 1 ? 's' : ''}`;
}

// ── Inline Editing ──

const fieldSelectors = {
  input: '.case-code',
  define: '.setup-define',
  defaults: '.case-defaults',
  overrides: '.case-overrides',
};

function startInlineEdit(card, index, field) {
  const item = cases[index];
  const el = card.querySelector(fieldSelectors[field]);
  if (!el) return;

  const isObjectField = field === 'defaults' || field === 'overrides' || field === 'define';

  const input = document.createElement('input');
  input.type = 'text';
  input.className = field === 'input' ? 'case-code-edit' : 'case-options-edit';

  if (isObjectField) {
    input.value = JSON.stringify(item[field] || {});
  } else {
    input.value = item[field] || '';
  }

  const commit = () => {
    const newVal = input.value.trim();
    if (field === 'input' && !newVal) {
      renderAllCards();
      return;
    }

    if (isObjectField) {
      try {
        item[field] = newVal ? JSON.parse(newVal) : null;
      } catch {
        renderAllCards();
        return;
      }
    } else {
      item[field] = newVal;
    }

    saveToStorage();
    renderAllCards();
  };

  input.addEventListener('blur', commit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') commit();
    if (e.key === 'Escape') renderAllCards();
  });

  el.replaceWith(input);
  input.focus();
  input.select();
}

// ── CRUD Operations ──

function addCase() {
  const input = inputString.value.trim();
  if (!input) return;

  let defaults = null;
  let overrides = null;
  try {
    defaults = parseObjectInput(defaultsInput.value);
    overrides = parseObjectInput(overridesInput.value);
  } catch (e) {
    previewError.textContent = e.message;
    return;
  }

  cases.push({
    input,
    defaults,
    overrides,
    label: '',
  });

  saveToStorage();
  renderAllCards();

  caseList.lastElementChild?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function addSetup() {
  const placeholder = {
    MYCODE: { codeString: 'B291;B99' },
  };

  cases.unshift({
    type: 'setup',
    define: placeholder,
    label: 'Custom definitions',
  });

  saveToStorage();
  renderAllCards();

  // Immediately start editing the define field
  const firstCard = caseList.firstElementChild;
  if (firstCard) {
    startInlineEdit(firstCard, 0, 'define');
  }
}

function deleteCase(index) {
  cases.splice(index, 1);
  saveToStorage();
  renderAllCards();
}

function moveCase(index, direction) {
  const newIndex = index + direction;
  if (newIndex < 0 || newIndex >= cases.length) return;

  const temp = cases[index];
  cases[index] = cases[newIndex];
  cases[newIndex] = temp;

  saveToStorage();
  renderAllCards();
}

function loadToInput(index) {
  const item = cases[index];
  if (item.type === 'setup') {
    // For setup cards, load the define JSON into the input field for easy copying
    inputString.value = JSON.stringify(item.define, null, 2);
    defaultsInput.value = '';
    overridesInput.value = '';
    previewSvg.innerHTML = '';
    previewError.textContent = '';
  } else {
    inputString.value = item.input;
    defaultsInput.value = serializeObj(item.defaults);
    overridesInput.value = serializeObj(item.overrides);
    updatePreview();
  }
  inputString.focus();
}

// ── Import / Export ──

function exportCases() {
  const json = JSON.stringify(cases, null, 2);
  navigator.clipboard.writeText(json).then(() => {
    exportBtn.textContent = 'Copied!';
    setTimeout(() => { exportBtn.textContent = 'Export'; }, 1500);
  }).catch(() => {
    importTextarea.value = json;
    importDialog.showModal();
  });
}

function openImportDialog() {
  importTextarea.value = '';
  importDialog.showModal();
}

function confirmImport() {
  try {
    const data = JSON.parse(importTextarea.value.trim());
    if (!Array.isArray(data)) throw new Error('Must be a JSON array');
    cases = data.map((item) => {
      if (item.type === 'setup') {
        return {
          type: 'setup',
          define: item.define || {},
          label: String(item.label || ''),
        };
      }
      return {
        input: String(item.input || ''),
        defaults: item.defaults || null,
        overrides: item.overrides || null,
        label: String(item.label || ''),
      };
    });
    saveToStorage();
    renderAllCards();
    importDialog.close();
  } catch (e) {
    alert(`Import failed: ${e.message}`);
  }
}

function resetToFile() {
  if (!confirm('Clear localStorage and reload test cases from file?')) return;
  localStorage.removeItem(STORAGE_KEY);
  loadFromFile().then((data) => {
    cases = data;
    saveToStorage();
    renderAllCards();
  });
}

// ── Event Listeners ──

let debounceTimer;
function onInputChange() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(updatePreview, DEBOUNCE_MS);
}

inputString.addEventListener('input', onInputChange);
defaultsInput.addEventListener('input', onInputChange);
overridesInput.addEventListener('input', onInputChange);

addBtn.addEventListener('click', addCase);
addSetupBtn.addEventListener('click', addSetup);
inputString.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) addCase();
});

exportBtn.addEventListener('click', exportCases);
importBtn.addEventListener('click', openImportDialog);
clearBtn.addEventListener('click', resetToFile);
importCancel.addEventListener('click', () => importDialog.close());
importConfirm.addEventListener('click', confirmImport);

// ── Init ──

loadCases().then(() => {
  runAllSetups();
  renderAllCards();
});
