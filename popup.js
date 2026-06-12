const DEFAULTS = { enabled: true, blockGifs: true, confirmReveal: true };
const statsEl = document.getElementById('stats');

const loadSettings = async () => {
  const stored = await chrome.storage.sync.get(DEFAULTS);
  for (const key of Object.keys(DEFAULTS)) {
    document.getElementById(key).checked = stored[key];
  }
};

document.addEventListener('change', (e) => {
  if (e.target.id in DEFAULTS) {
    chrome.storage.sync.set({ [e.target.id]: e.target.checked });
  }
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

document.getElementById('version').textContent = `v${chrome.runtime.getManifest().version}`;
loadSettings();
loadStats();
