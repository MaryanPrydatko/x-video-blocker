// Hides X/Twitter posts that contain videos behind a click-to-reveal
// placeholder with an "are you sure?" confirmation step.
(() => {
  const TWEET = 'article[data-testid="tweet"]';
  const PLAYER = '[data-testid="videoPlayer"], [data-testid="videoComponent"]';
  const GIF = '[data-testid="tweetGif"]';

  // Mirrors chrome.storage.sync; defaults apply before the first sync
  // resolves and in storage-less contexts (the fixture test).
  const settings = { enabled: true, blockGifs: true, confirmReveal: true };

  // Tweet ids the user confirmed they want to see. Session-only on purpose —
  // after a reload everything is hidden again.
  const revealedIds = new Set();
  const hiddenEver = new Set(); // unique keys hidden on this page, for stats
  let revealedCount = 0;

  const getTweetId = (article) => {
    const links = article.querySelectorAll('a[href*="/status/"]');
    let fallback = '';
    for (const a of links) {
      const m = (a.getAttribute('href') || '').match(/\/status\/(\d+)/);
      if (!m) continue;
      // The permalink anchor wraps the timestamp; prefer it over other
      // /status/ links (quoted tweets, analytics links, ...).
      if (a.querySelector('time')) return m[1];
      if (!fallback) fallback = m[1];
    }
    if (fallback) return fallback;
    // Main tweet on a status page has no self-link. Only the focal article
    // (tabindex="-1") may borrow the URL id — otherwise an id-less promoted
    // tweet on the same page would share reveal state with the main tweet.
    if (article.getAttribute('tabindex') === '-1') {
      const m = location.pathname.match(/\/status\/(\d+)/);
      if (m) return m[1];
    }
    return '';
  };

  // textContent (not innerText) so this also works while the post is
  // already display:none'd and we are rebuilding the placeholder.
  const getInfo = (article) => {
    const nameEl = article.querySelector('[data-testid="User-Name"]');
    const nameText = nameEl?.textContent || '';
    // Handle comes from the profile link, not from text matching — display
    // names may themselves contain @-words.
    const profileHref = nameEl?.querySelector('a[href^="/"]')?.getAttribute('href') || '';
    const handle = profileHref ? `@${profileHref.split('/')[1] || ''}`.replace(/^@$/, '') : '';
    const idx = handle ? nameText.indexOf(handle) : -1;
    const name = (idx > 0 ? nameText.slice(0, idx) : nameText.split('·')[0]).trim();
    let text = (article.querySelector('[data-testid="tweetText"]')?.textContent || '').trim();
    const chars = [...text];
    if (chars.length > 500) text = `${chars.slice(0, 500).join('')}…`;
    return { name, handle, text };
  };

  const isDarkTheme = () => {
    const m = (getComputedStyle(document.body).backgroundColor || '').match(/\d+/g);
    if (!m) return true;
    const [r, g, b] = m.map(Number);
    return 0.299 * r + 0.587 * g + 0.114 * b < 128;
  };

  const pauseVideos = (article) => {
    article.querySelectorAll('video').forEach((v) => {
      try {
        v.pause();
      } catch {
        // player may already be detached
      }
    });
  };

  const reveal = (article, id, key) => {
    if (id) revealedIds.add(id);
    // Also marked on the element itself so id-less tweets stay revealed.
    article.dataset.tvbRevealedId = key;
    article.setAttribute('data-tvb-state', 'revealed');
    article.querySelectorAll('.tvb-placeholder').forEach((el) => el.remove());
    revealedCount++;
  };

  const unhide = (article) => {
    article.removeAttribute('data-tvb-state');
    delete article.dataset.tvbRevealedId;
    article.querySelectorAll('.tvb-placeholder').forEach((el) => el.remove());
  };

  const buildPlaceholder = (article, id, key, info, kind) => {
    const root = document.createElement('div');
    root.className = `tvb-placeholder ${isDarkTheme() ? 'tvb-dark' : 'tvb-light'}`;
    root.dataset.tvbKey = key;

    const row = document.createElement('div');
    row.className = 'tvb-row';

    const icon = document.createElement('span');
    icon.className = 'tvb-icon';
    icon.innerHTML =
      '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M10.66 5H14a2 2 0 0 1 2 2v3.34l1 1L23 7v10"/>' +
      '<path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h3.66"/>' +
      '<line x1="1" y1="1" x2="23" y2="23"/></svg>';

    const texts = document.createElement('div');
    texts.className = 'tvb-texts';

    const title = document.createElement('div');
    title.className = 'tvb-title';
    title.textContent = `1 post hidden — contains a ${kind}`;
    texts.appendChild(title);

    // User content goes in via textContent only — never innerHTML.
    if (info.name || info.handle) {
      const authorEl = document.createElement('div');
      authorEl.className = 'tvb-author';
      if (info.name) {
        const nameEl = document.createElement('span');
        nameEl.className = 'tvb-name';
        nameEl.textContent = info.name;
        authorEl.appendChild(nameEl);
      }
      if (info.name && info.handle) authorEl.appendChild(document.createTextNode(' '));
      if (info.handle) {
        const handleEl = document.createElement('span');
        handleEl.className = 'tvb-handle';
        handleEl.textContent = info.handle;
        authorEl.appendChild(handleEl);
      }
      texts.appendChild(authorEl);
    }

    const showBtn = document.createElement('button');
    showBtn.type = 'button';
    showBtn.className = 'tvb-show';
    showBtn.textContent = `Show ${kind}`;

    row.append(icon, texts, showBtn);
    root.appendChild(row);

    if (info.text) {
      const details = document.createElement('details');
      details.className = 'tvb-details';
      const summary = document.createElement('summary');
      summary.textContent = "What's it about?";
      const p = document.createElement('p');
      p.className = 'tvb-text';
      p.textContent = info.text;
      details.append(summary, p);
      root.appendChild(details);
    }

    const confirm = document.createElement('div');
    confirm.className = 'tvb-confirm';
    confirm.hidden = true;
    const question = document.createElement('span');
    question.className = 'tvb-question';
    question.textContent = `Are you sure you want to see this ${kind}?`;
    const yes = document.createElement('button');
    yes.type = 'button';
    yes.className = 'tvb-yes';
    yes.textContent = 'Yes, show it';
    const no = document.createElement('button');
    no.type = 'button';
    no.className = 'tvb-no';
    no.textContent = 'Cancel';
    confirm.append(question, yes, no);
    root.appendChild(confirm);

    // Keep clicks inside the placeholder from triggering X's
    // open-the-tweet handler on the article.
    root.addEventListener('click', (e) => e.stopPropagation());

    showBtn.addEventListener('click', () => {
      if (!settings.confirmReveal) {
        reveal(article, id, key);
        return;
      }
      showBtn.hidden = true;
      confirm.hidden = false;
    });
    no.addEventListener('click', () => {
      confirm.hidden = true;
      showBtn.hidden = false;
    });
    yes.addEventListener('click', () => reveal(article, id, key));

    return root;
  };

  const processTweet = (article) => {
    const state = article.getAttribute('data-tvb-state');
    const placeholder = article.querySelector('.tvb-placeholder');

    const hasPlayer = !!article.querySelector(PLAYER);
    const hasGif = !!article.querySelector(GIF);
    const hasAnyVideo = hasPlayer || hasGif || !!article.querySelector('video');
    const gifOnly = hasGif && !hasPlayer;
    const shouldHide = settings.enabled && hasAnyVideo && !(gifOnly && !settings.blockGifs);

    if (!shouldHide) {
      // Blocking disabled, GIFs exempted, or a node recycled by the
      // virtualized timeline for a video-less tweet.
      if (state || placeholder) unhide(article);
      return;
    }

    const id = getTweetId(article);
    const info = getInfo(article);
    // Identity for id-less tweets falls back to a content fingerprint so two
    // different id-less tweets sharing a recycled node never match each other.
    const key = id || `fp:${info.handle}|${[...info.text].slice(0, 80).join('')}`;

    const isRevealed =
      (id && revealedIds.has(id)) ||
      (state === 'revealed' && article.dataset.tvbRevealedId === key);

    if (isRevealed) {
      if (state !== 'revealed') article.setAttribute('data-tvb-state', 'revealed');
      article.dataset.tvbRevealedId = key;
      if (placeholder) placeholder.remove();
      return;
    }

    // Already hidden with a matching placeholder — nothing to do.
    if (state === 'hidden' && placeholder && placeholder.dataset.tvbKey === key) return;

    if (placeholder) placeholder.remove();
    delete article.dataset.tvbRevealedId;
    article.setAttribute('data-tvb-state', 'hidden');
    article.appendChild(buildPlaceholder(article, id, key, info, gifOnly ? 'GIF' : 'video'));
    pauseVideos(article);
    hiddenEver.add(key);
  };

  const scan = () => document.querySelectorAll(TWEET).forEach(processTweet);

  let scheduled = false;
  const observer = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      scan();
    });
  });

  const start = () => {
    observer.observe(document.documentElement, { childList: true, subtree: true });
    scan();
  };

  // Popup asks for per-page stats over runtime messaging.
  globalThis.chrome?.runtime?.onMessage?.addListener((msg, _sender, sendResponse) => {
    if (msg?.type !== 'tvb-stats') return;
    sendResponse({
      hidden: document.querySelectorAll('article[data-tvb-state="hidden"]').length,
      revealed: revealedCount,
      totalSeen: hiddenEver.size,
    });
  });

  const storage = globalThis.chrome?.storage?.sync;
  if (storage) {
    globalThis.chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'sync') return;
      let touched = false;
      for (const [k, v] of Object.entries(changes)) {
        if (k in settings) {
          settings[k] = v.newValue;
          touched = true;
        }
      }
      if (touched) scan();
    });
    storage
      .get(settings)
      .then((stored) => Object.assign(settings, stored))
      .catch(() => {})
      .finally(start);
  } else {
    start();
  }
})();
