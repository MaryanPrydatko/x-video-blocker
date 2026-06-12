const DEFAULTS = {
  enabled: true,
  blockGifs: true,
  confirmReveal: true,
  mode: 'all',
  whitelist: [],
  blocklist: [],
};
const TOGGLES = ['enabled', 'blockGifs', 'confirmReveal'];

let state = { ...DEFAULTS };
const statsEl = document.getElementById('stats');

const activeListKey = () => (state.mode === 'list' ? 'blocklist' : 'whitelist');

const renderList = () => {
  const isBlock = state.mode === 'list';
  document.getElementById('listTitle').textContent = isBlock
    ? 'Blocked accounts'
    : 'Always allow these accounts';
  const chips = document.getElementById('chips');
  chips.textContent = '';
  const list = state[activeListKey()];
  if (!list.length) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = isBlock
      ? 'No accounts blocked yet — videos play everywhere'
      : 'No exceptions yet — all video posts are hidden';
    chips.appendChild(empty);
    return;
  }
  for (const handle of list) {
    const chip = document.createElement('span');
    chip.className = 'chip';
    const text = document.createElement('span');
    text.textContent = `@${handle}`;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = '×';
    remove.setAttribute('aria-label', `Remove @${handle}`);
    remove.addEventListener('click', () =>
      save({ [activeListKey()]: state[activeListKey()].filter((h) => h !== handle) })
    );
    chip.append(text, remove);
    chips.appendChild(chip);
  }
};

const render = () => {
  for (const key of TOGGLES) document.getElementById(key).checked = state[key];
  document.querySelectorAll('input[name="mode"]').forEach((r) => {
    r.checked = r.value === state.mode;
  });
  renderList();
};

const save = async (patch) => {
  Object.assign(state, patch);
  await chrome.storage.sync.set(patch);
  render();
};

document.addEventListener('change', (e) => {
  if (TOGGLES.includes(e.target.id)) save({ [e.target.id]: e.target.checked });
  if (e.target.name === 'mode') save({ mode: e.target.value });
});

document.getElementById('addForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = document.getElementById('addInput');
  const handle = input.value.replace(/^@/, '').trim().toLowerCase();
  if (!/^\w{1,15}$/.test(handle)) {
    input.select();
    return;
  }
  const key = activeListKey();
  if (!state[key].includes(handle)) save({ [key]: [...state[key], handle] });
  input.value = '';
});

const loadStats = async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const onX = /^https:\/\/([a-z]+\.)?(x|twitter)\.com\//.test(tab?.url || '');
    if (!tab?.id || !onX) {
      statsEl.textContent = 'Open x.com to see stats';
      return;
    }
    const r = await chrome.tabs.sendMessage(tab.id, { type: 'tvb-stats' });
    statsEl.textContent = `${r.hidden} hidden on this page · ${r.revealed} revealed`;
  } catch {
    // Content script not loaded yet (e.g. tab opened before install).
    statsEl.textContent = 'Reload x.com to see stats';
  }
};

const init = async () => {
  state = await chrome.storage.sync.get(DEFAULTS);
  render();
  loadStats();
  document.getElementById('version').textContent = `v${chrome.runtime.getManifest().version}`;
};

init();
