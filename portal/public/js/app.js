// Small progressive enhancements shared by every page.
(() => {
  function toast(text) {
    let el = document.querySelector('.toast');
    if (!el) {
      el = document.createElement('div');
      el.className = 'toast';
      el.setAttribute('role', 'status');
      document.body.append(el);
    }
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('show'), 1800);
  }
  window.portalToast = toast;

  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = Object.assign(document.createElement('textarea'), { value: text });
      document.body.append(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    toast('Copied');
  }

  document.addEventListener('click', (e) => {
    const copyBtn = e.target.closest('[data-copy], [data-copy-text]');
    if (copyBtn) {
      const src = copyBtn.dataset.copy ? document.querySelector(copyBtn.dataset.copy) : null;
      copy(src ? src.value ?? src.textContent : copyBtn.dataset.copyText);
      return;
    }
    const toggle = e.target.closest('[data-toggle-password]');
    if (toggle) {
      const input = toggle.parentElement.querySelector('input');
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      toggle.textContent = show ? 'Hide' : 'Show';
      toggle.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    }
  });

  document.addEventListener('submit', (e) => {
    const form = e.target;
    if (e.defaultPrevented) return;
    if (form.dataset.confirm && !confirm(form.dataset.confirm)) {
      e.preventDefault();
      return;
    }
    // Stop double submits.
    const btn = form.querySelector('button[type="submit"]');
    if (btn) setTimeout(() => (btn.disabled = true), 0);
  });

  // ---------- installable app ----------
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
  }

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
  };
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const card = document.querySelector('[data-install]');
  let deferred = null;

  if (card && !standalone && store.get('install-dismissed') !== '1') {
    const go = card.querySelector('[data-install-go]');
    const hint = card.querySelector('[data-install-hint]');
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

    // Android / desktop Chrome: the browser offers a real install prompt.
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferred = e;
      card.hidden = false;
    });
    // iPhone / iPad: no prompt exists, so show the two taps instead.
    if (isIOS) {
      hint.innerHTML = 'Tap <strong>Share</strong> <span aria-hidden="true">⬆︎</span> then <strong>Add to Home Screen</strong>.';
      go.hidden = true;
      card.hidden = false;
    }
    go.addEventListener('click', async () => {
      if (!deferred) return;
      deferred.prompt();
      const choice = await deferred.userChoice.catch(() => null);
      deferred = null;
      if (choice?.outcome === 'accepted') card.hidden = true;
    });
    card.querySelector('[data-install-close]').addEventListener('click', () => {
      card.hidden = true;
      store.set('install-dismissed', '1');
    });
    window.addEventListener('appinstalled', () => { card.hidden = true; });
  }
})();
