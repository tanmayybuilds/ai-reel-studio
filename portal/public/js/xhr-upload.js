// Admin: send a file straight to the server with a progress bar.
// <form data-xhr-upload data-action="/url"> with one file input; other named fields go in the query string.
(() => {
  const csrf = document.querySelector('meta[name="csrf-token"]')?.content || '';
  document.querySelectorAll('[data-xhr-upload]').forEach((form) => {
    const bar = form.querySelector('[data-bar]');
    const msg = form.querySelector('[data-msg]');
    const btn = form.querySelector('button[type="submit"]');
    const say = (t) => { msg.hidden = false; msg.textContent = t; };

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const file = form.querySelector('input[type="file"]').files[0];
      if (!file) { say('Choose a file first.'); return; }
      const q = new URLSearchParams({ file: file.name });
      for (const el of form.elements) {
        if (el.name && el.type !== 'file' && el.name !== '_csrf') q.set(el.name, el.value.trim());
      }
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${form.dataset.action}?${q}`);
      xhr.setRequestHeader('Content-Type', 'application/octet-stream');
      xhr.setRequestHeader('X-CSRF-Token', csrf);
      bar.hidden = false;
      btn.disabled = true;
      const started = performance.now();
      xhr.upload.onprogress = (ev) => {
        if (!ev.total) return;
        const p = ev.loaded / ev.total;
        bar.firstElementChild.style.width = `${p * 100}%`;
        const secs = (performance.now() - started) / 1000;
        const left = p > 0.02 ? Math.round((secs / p) * (1 - p)) : 0;
        say(p < 1 ? `Uploading ${Math.floor(p * 100)}%${left ? ` · about ${left < 60 ? `${left}s` : `${Math.ceil(left / 60)} min`} left` : ''}` : 'Saving…');
      };
      xhr.onload = () => {
        let data = {};
        try { data = JSON.parse(xhr.responseText); } catch { /* ignore */ }
        if (xhr.status === 200 && data.redirect) { location.href = data.redirect; return; }
        say(data.error || 'Upload failed. Try again.');
        btn.disabled = false;
      };
      xhr.onerror = () => { say('Connection lost. Try again.'); btn.disabled = false; };
      window.addEventListener('beforeunload', (ev) => { if (xhr.readyState !== 4) { ev.preventDefault(); ev.returnValue = ''; } });
      xhr.send(file);
    });
  });
})();
