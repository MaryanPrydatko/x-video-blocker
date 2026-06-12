// Hides X/Twitter posts that contain videos behind a click-to-reveal
// placeholder with an "are you sure?" confirmation step.
(() => {
  const TWEET = 'article[data-testid="tweet"]';
  const VIDEO = 'video, [data-testid="videoPlayer"], [data-testid="videoComponent"]';

  // Tweet ids the user confirmed they want to see. Session-only on purpose —
  // after a reload everything is hidden again.
  const revealedIds = new Set();

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
    const isGif = !!article.querySelector('[data-testid="tweetGif"]');
    return { name, handle, text, isGif };
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
  };

  const buildPlaceholder = (article, id, key, info) => {
    const kind = info.isGif ? 'GIF' : 'video';

    const root = document.createElement('div');
    root.className = 'tvb-placeholder';
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
    const author = [info.name, info.handle].filter(Boolean).join(' ');
    if (author) {
      const authorEl = document.createElement('div');
      authorEl.className = 'tvb-author';
      authorEl.textContent = author;
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

    if (!article.querySelector(VIDEO)) {
      // DOM node recycled by the virtualized timeline for a video-less tweet.
      if (state) article.removeAttribute('data-tvb-state');
      delete article.dataset.tvbRevealedId;
      if (placeholder) placeholder.remove();
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
    article.appendChild(buildPlaceholder(article, id, key, info));
    pauseVideos(article);
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

  observer.observe(document.documentElement, { childList: true, subtree: true });
  scan();
})();
