// Admin uploads (edited versions, finals, style reels): resumable, in verified chunks, with progress.
// <form data-chunk-upload data-purpose="version|final|style" data-video-id="12"> with one file input.
// Every other named field (note, drive_url, name, description) is sent when the upload finishes.
(() => {
  const csrf = document.querySelector('meta[name="csrf-token"]')?.content || '';
  const canHash = !!(window.crypto && crypto.subtle);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let uploading = 0;

  window.addEventListener('beforeunload', (e) => { if (uploading) { e.preventDefault(); e.returnValue = ''; } });

  async function api(method, url, body) {
    const res = await fetch(url, {
      method, headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.error || `Request failed (${res.status})`), { status: res.status });
    return data;
  }

  function putChunk(url, buf, hash, onProgress) {
    return new Promise((resolve) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', url);
      xhr.setRequestHeader('Content-Type', 'application/octet-stream');
      xhr.setRequestHeader('X-CSRF-Token', csrf);
      if (hash) xhr.setRequestHeader('X-Chunk-SHA256', hash);
      xhr.upload.onprogress = (e) => onProgress(e.loaded);
      const done = () => {
        let data = {};
        try { data = JSON.parse(xhr.responseText); } catch { /* network error */ }
        resolve({ status: xhr.status, data });
      };
      xhr.onload = done;
      xhr.onerror = done;
      xhr.send(buf);
    });
  }

  async function sha256(buf) {
    const d = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, '0')).join('');
  }

  const human = (s) => (s < 60 ? `${Math.max(1, Math.round(s))}s` : `${Math.ceil(s / 60)} min`);

  document.querySelectorAll('[data-chunk-upload]').forEach((form) => {
    const bar = form.querySelector('[data-bar]');
    const msg = form.querySelector('[data-msg]');
    const btn = form.querySelector('button[type="submit"]');
    const say = (t) => { msg.hidden = false; msg.textContent = t; };

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const file = form.querySelector('input[type="file"]').files[0];
      if (!file) { say('Choose a file first.'); return; }
      const extra = {};
      for (const el of form.elements) if (el.name && el.type !== 'file' && el.name !== '_csrf') extra[el.name] = el.value.trim();
      if (form.dataset.purpose === 'style' && !extra.name) { say('Give the style a name.'); return; }

      btn.disabled = true;
      bar.hidden = false;
      uploading += 1;
      try {
        const up = await api('POST', '/admin/api/uploads', {
          purpose: form.dataset.purpose, videoId: form.dataset.videoId || null, name: file.name, size: file.size,
        });
        let offset = up.received;
        let failures = 0;
        const started = performance.now();
        const startOffset = offset;
        while (offset < file.size) {
          const buf = await file.slice(offset, Math.min(offset + up.chunkSize, file.size)).arrayBuffer();
          const r = await putChunk(`/admin/api/uploads/${up.id}?offset=${offset}`, buf, canHash ? await sha256(buf) : '', (loaded) => {
            const sent = offset + loaded;
            const p = sent / file.size;
            bar.firstElementChild.style.width = `${p * 100}%`;
            const secs = (performance.now() - started) / 1000;
            const rate = secs > 1 ? (sent - startOffset) / secs : 0;
            say(`Uploading ${Math.floor(p * 100)}%${rate ? ` · about ${human((file.size - sent) / rate)} left` : ''}`);
          });
          if (r.status === 200) { offset = r.data.received; failures = 0; continue; }
          if (r.status === 409 && typeof r.data.received === 'number') { offset = r.data.received; continue; }
          if ([401, 403, 404, 413, 415].includes(r.status)) throw new Error(r.data.error || 'Upload stopped.');
          failures += 1;
          if (failures > 12) throw new Error('The connection keeps dropping. Choose the file again to continue where it stopped.');
          if (!navigator.onLine) {
            say('You’re offline. The upload continues when you’re back.');
            await new Promise((r2) => window.addEventListener('online', r2, { once: true }));
          } else {
            const wait = Math.min(30, 2 ** failures);
            say(`Connection hiccup. Retrying in ${wait}s…`);
            await sleep(wait * 1000);
          }
        }
        say(form.dataset.purpose === 'style' ? 'Making the preview… (about 10–30 seconds)' : 'Saving…');
        const done = await api('POST', `/admin/api/uploads/${up.id}/finish`, extra);
        uploading -= 1;
        location.href = done.redirect;
      } catch (err) {
        uploading = Math.max(0, uploading - 1);
        say(err.message || 'Upload failed. Try again.');
        btn.disabled = false;
      }
    });
  });
})();
