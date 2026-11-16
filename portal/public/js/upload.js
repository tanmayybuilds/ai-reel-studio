// New-video form: tabs, drag-and-drop, and resumable chunked uploads.
// Each chunk is hashed (SHA-256) in the browser and checked by the server, so the file stored
// in the studio is byte-for-byte the client's original. Nothing is ever re-encoded.
(() => {
  const form = document.getElementById('new-video');
  if (!form) return;

  const csrf = document.querySelector('meta[name="csrf-token"]').content;
  const chunkSize = Number(form.dataset.chunkSize);
  const videoIdInput = form.elements.video_id;
  const submitBtn = form.querySelector('[data-submit]');
  const submitNote = form.querySelector('[data-submit-note]');
  const submitNoteDefault = submitNote.textContent;
  const canHash = !!(window.crypto && crypto.subtle);
  const SLOW_SECONDS = 30 * 60;
  const BIG_FILE = 5 * 1024 ** 3;

  const ALLOWED = {
    raw: ['mp4', 'mov', 'm4v', 'mkv', 'webm', 'mts', 'avi'],
    voiceover: ['wav', 'mp3', 'm4a', 'aac', 'aif', 'aiff', 'flac'],
    asset: ['png', 'jpg', 'jpeg', 'webp', 'heic', 'gif', 'mp4', 'mov', 'm4v', 'webm'],
  };
  const ICONS = {
    raw: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4" stroke="currentColor" stroke-width="2"/></svg>',
    voiceover: form.querySelector('[data-dropzone="voiceover"] .dz-icon').innerHTML,
    asset: form.querySelector('[data-dropzone="asset"] .dz-icon').innerHTML,
  };
  const CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const X = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';

  const queue = []; // jobs waiting
  let active = null; // job uploading now

  // ---------- helpers ----------

  const ext = (name) => (name.split('.').pop() || '').toLowerCase();
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function human(bytes) {
    if (!bytes) return '0 B';
    const u = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.min(u.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
    const v = bytes / 1024 ** i;
    return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)} ${u[i]}`;
  }
  function duration(sec) {
    if (!isFinite(sec)) return '';
    if (sec < 60) return 'under a minute';
    const m = Math.round(sec / 60);
    if (m < 60) return `about ${m} min`;
    const h = Math.floor(m / 60);
    return `about ${h} hr${m % 60 >= 10 ? ` ${m % 60} min` : ''}`;
  }

  async function api(method, url, body) {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.error || `Request failed (${res.status})`), { status: res.status, data });
    return data;
  }

  function putChunk(job, url, buf, hash, onProgress) {
    return new Promise((resolve) => {
      const xhr = new XMLHttpRequest();
      job.xhr = xhr;
      xhr.open('PUT', url);
      xhr.setRequestHeader('Content-Type', 'application/octet-stream');
      xhr.setRequestHeader('X-CSRF-Token', csrf);
      if (hash) xhr.setRequestHeader('X-Chunk-SHA256', hash);
      xhr.upload.onprogress = (e) => onProgress(e.loaded);
      const done = () => {
        job.xhr = null;
        let data = {};
        try { data = JSON.parse(xhr.responseText); } catch { /* network error */ }
        resolve({ status: xhr.status, data });
      };
      xhr.onload = done;
      xhr.onerror = done;
      xhr.onabort = done;
      xhr.send(buf);
    });
  }

  async function sha256(buf) {
    const digest = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
  }

  // ---------- rows ----------

  function setBar(row, pct) {
    row.querySelector('.bar span').style.width = `${Math.max(0, Math.min(100, pct))}%`;
  }
  function setStatus(row, state, text, withIcon) {
    row.classList.remove('is-done', 'is-paused', 'is-up', 'is-error', 'is-queued');
    row.classList.add(`is-${state}`);
    row.querySelector('.frow-status').innerHTML = (withIcon ? CHECK + ' ' : '') + '<span></span>';
    row.querySelector('.frow-status span').textContent = text;
  }

  function makeRow(kind, file) {
    const li = document.createElement('li');
    li.className = 'frow is-queued';
    li.dataset.name = file.name;
    li.dataset.size = String(file.size);
    li.innerHTML = `
      <span class="frow-icon">${ICONS[kind]}</span>
      <div class="frow-main">
        <div class="frow-top"><span class="frow-name"></span><span class="frow-size"></span></div>
        <div class="bar"><span></span></div>
        <div class="frow-status">Waiting…</div>
      </div>
      <button type="button" class="icon-btn" data-remove>${X}</button>`;
    li.querySelector('.frow-name').textContent = file.name;
    li.querySelector('.frow-size').textContent = human(file.size);
    li.querySelector('[data-remove]').setAttribute('aria-label', `Remove ${file.name}`);
    form.querySelector(`[data-list="${kind}"]`).append(li);
    return li;
  }

  // ---------- adding files ----------

  function addFiles(kind, fileList) {
    for (const file of fileList) {
      if (!ALLOWED[kind].includes(ext(file.name))) {
        window.portalToast?.(`${file.name} can't go here`);
        continue;
      }
      if (!file.size) {
        window.portalToast?.(`${file.name} is empty`);
        continue;
      }
      const list = form.querySelector(`[data-list="${kind}"]`);
      const same = [...list.children].find((li) => li.dataset.name === file.name && li.dataset.size === String(file.size));
      if (same?.dataset.complete) {
        window.portalToast?.(`${file.name} is already uploaded`);
        continue;
      }
      if (same && (same === active?.row || queue.some((j) => j.row === same))) continue;
      const row = same || makeRow(kind, file);
      if (same) setStatus(row, 'queued', 'Resuming…');
      queue.push({ kind, file, row, cancelled: false });
      if (kind === 'raw' && file.size > BIG_FILE) showDriveTip(`This file is ${human(file.size)}.`);
    }
    refreshSubmit();
    pump();
  }

  async function pump() {
    if (active || !queue.length) return;
    active = queue.shift();
    try {
      await upload(active);
    } catch (err) {
      if (!active.cancelled) {
        setStatus(active.row, 'error', `${err.message} `);
        const retry = document.createElement('button');
        retry.type = 'button';
        retry.className = 'linkish';
        retry.textContent = 'Try again';
        const job = active;
        retry.onclick = () => { queue.push({ ...job, cancelled: false }); setStatus(job.row, 'queued', 'Waiting…'); refreshSubmit(); pump(); };
        active.row.querySelector('.frow-status').append(retry);
      }
    }
    active = null;
    refreshSubmit();
    pump();
  }

  async function upload(job) {
    const { file, kind, row } = job;
    setStatus(row, 'up', 'Starting…');
    const meta = await api('POST', '/api/uploads', {
      kind, name: file.name, size: file.size, lastModified: file.lastModified,
      videoId: videoIdInput.value || null, title: form.elements.title.value,
    });
    videoIdInput.value = meta.videoId;
    row.dataset.fileId = meta.fileId;
    job.fileId = meta.fileId;
    if (meta.complete) return finish(job, meta);

    let offset = meta.received;
    const started = performance.now();
    const startOffset = offset;
    let failures = 0;

    while (offset < file.size) {
      if (job.cancelled) return;
      const end = Math.min(offset + chunkSize, file.size);
      const buf = await file.slice(offset, end).arrayBuffer();
      const hash = canHash ? await sha256(buf) : '';
      if (job.cancelled) return;

      const r = await putChunk(job, `/api/uploads/${meta.fileId}?offset=${offset}`, buf, hash, (loaded) => {
        const sent = offset + loaded;
        const secs = (performance.now() - started) / 1000;
        const rate = secs > 1 ? (sent - startOffset) / secs : 0;
        const left = rate ? (file.size - sent) / rate : Infinity;
        setBar(row, (sent / file.size) * 100);
        setStatus(row, 'up', `Uploading ${Math.floor((sent / file.size) * 100)}%${rate ? ` · ${human(rate)}/s · ${duration(left)} left` : ''}`);
        if (kind === 'raw' && secs > 8 && left > SLOW_SECONDS) showDriveTip(`About ${duration(left).replace('about ', '')} left at your current speed.`);
      });
      if (job.cancelled) return;

      if (r.status === 200) {
        offset = r.data.received;
        failures = 0;
        continue;
      }
      if (r.status === 409 && typeof r.data.received === 'number') { offset = r.data.received; continue; }
      if (r.status === 401 || r.status === 403 || r.status === 404) throw new Error(r.data.error || 'Upload stopped.');
      // Network drop, server restart or damaged chunk: wait and retry the same chunk.
      failures += 1;
      if (failures > 12) throw new Error('The connection keeps dropping.');
      if (!navigator.onLine) {
        setStatus(row, 'paused', 'You’re offline. The upload continues when you’re back.');
        await new Promise((r2) => window.addEventListener('online', r2, { once: true }));
      } else {
        const wait = Math.min(30, 2 ** failures);
        setStatus(row, 'paused', `Connection hiccup. Retrying in ${wait}s…`);
        await sleep(wait * 1000);
      }
    }

    setStatus(row, 'up', 'Checking the file…');
    const done = await api('POST', `/api/uploads/${meta.fileId}/complete`);
    finish(job, done);
  }

  function finish(job, meta) {
    job.row.dataset.complete = '1';
    setBar(job.row, 100);
    setStatus(job.row, 'done', canHash || meta.sha256 ? 'Uploaded. Identical to your original' : 'Uploaded', true);
  }

  // ---------- removing ----------

  form.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-remove]');
    if (!btn) return;
    const row = btn.closest('.frow');
    const job = active?.row === row ? active : queue.find((j) => j.row === row);
    if (job) {
      job.cancelled = true;
      job.xhr?.abort();
      const i = queue.indexOf(job);
      if (i >= 0) queue.splice(i, 1);
    }
    const id = row.dataset.fileId;
    row.remove();
    refreshSubmit();
    if (id) {
      // Wait for an aborted chunk to settle on the server before deleting.
      for (let i = 0; i < 5; i++) {
        try { await api('DELETE', `/api/uploads/${id}`); break; } catch (err) { if (err.status !== 409) break; await sleep(600); }
      }
    }
  });

  // ---------- drop zones ----------

  form.querySelectorAll('[data-dropzone]').forEach((zone) => {
    const kind = zone.dataset.dropzone;
    const input = zone.querySelector('input[type="file"]');
    zone.addEventListener('click', () => input.click());
    zone.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); }
    });
    input.addEventListener('change', () => { addFiles(kind, input.files); input.value = ''; });
    zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('is-over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('is-over'));
    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      zone.classList.remove('is-over');
      addFiles(kind, e.dataTransfer.files);
    });
  });
  // A file dropped anywhere else shouldn't navigate away from the form.
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => e.preventDefault());

  // ---------- tabs ----------

  function selectTab(name) {
    form.elements.source.value = name;
    form.querySelectorAll('[data-tab][role="tab"]').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.tab === name)));
    form.querySelectorAll('[data-panel]').forEach((p) => { p.hidden = p.dataset.panel !== name; });
    if (name === 'drive') form.elements.drive_url.focus();
  }
  form.addEventListener('click', (e) => {
    const tab = e.target.closest('[data-tab]');
    if (tab) selectTab(tab.dataset.tab);
  });

  // ---------- reference link or one of our styles ----------

  function selectRef(mode) {
    form.elements.ref_mode.value = mode;
    form.querySelectorAll('[data-ref-tab]').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.refTab === mode)));
    form.querySelectorAll('[data-ref-panel]').forEach((p) => { p.hidden = p.dataset.refPanel !== mode; });
    if (mode !== 'style') form.querySelectorAll('.style-card video').forEach((v) => v.pause());
  }
  form.addEventListener('click', (e) => {
    const t = e.target.closest('[data-ref-tab]');
    if (t) selectRef(t.dataset.refTab);
  });
  // Tapping a style plays its preview (and selects it); only one plays at a time.
  form.querySelectorAll('[data-style-media]').forEach((media) => {
    const video = media.querySelector('video');
    media.addEventListener('click', () => {
      form.querySelectorAll('.style-card video').forEach((v) => { if (v !== video) { v.pause(); v.closest('.style-card').classList.remove('is-playing'); } });
      if (video.paused) { video.play().catch(() => {}); media.closest('.style-card').classList.add('is-playing'); }
      else { video.pause(); media.closest('.style-card').classList.remove('is-playing'); }
    });
  });

  function showDriveTip(text) {
    const tip = form.querySelector('[data-drive-tip]');
    tip.querySelector('[data-drive-tip-text]').textContent = text;
    tip.hidden = false;
  }

  // ---------- submit ----------

  const pending = () => (active ? 1 : 0) + queue.length;

  function refreshSubmit() {
    const n = pending();
    submitBtn.disabled = n > 0;
    submitBtn.textContent = n ? `Uploading… (${n} file${n === 1 ? '' : 's'} left)` : 'Continue';
    submitNote.textContent = n ? 'Keep this window open until uploads finish.' : submitNoteDefault;
  }

  form.addEventListener('submit', (e) => {
    if (pending()) {
      e.preventDefault();
      window.portalToast?.('Wait for uploads to finish');
    }
  });

  window.addEventListener('beforeunload', (e) => {
    if (pending()) { e.preventDefault(); e.returnValue = ''; }
  });

  // Paint progress bars rendered by the server (CSP blocks inline styles).
  form.querySelectorAll('.bar span[data-p]').forEach((s) => { s.style.width = `${s.dataset.p}%`; });
})();
