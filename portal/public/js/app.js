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
})();
