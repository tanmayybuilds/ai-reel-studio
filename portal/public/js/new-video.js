// New video form: reference-or-style tabs, style previews, a live Drive-link check, and friendly
// inline errors before anything is sent. The server checks everything again.
(() => {
  const form = document.getElementById('new-video');
  if (!form) return;

  // ---------- reference link or one of our styles ----------
  function selectRef(mode) {
    form.elements.ref_mode.value = mode;
    form.querySelectorAll('[data-ref-tab]').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.refTab === mode)));
    form.querySelectorAll('[data-ref-panel]').forEach((p) => { p.hidden = p.dataset.refPanel !== mode; });
    if (mode !== 'style') form.querySelectorAll('.style-card video').forEach((v) => v.pause());
    clearError('look');
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

  // ---------- Drive link: say what we see as they paste ----------
  const driveInput = form.elements.drive_url;
  const driveHint = form.querySelector('[data-drive-hint]');
  const driveDefault = driveHint.textContent;
  function driveKind(value) {
    try {
      const u = new URL(value.trim());
      if (u.protocol !== 'https:' || !/^(drive|docs)\.google\.com$/.test(u.hostname)) return null;
      if (/\/folders\/[\w-]{10,}/.test(u.pathname)) return 'folder';
      if (/\/d\/[\w-]{10,}/.test(u.pathname) || /^[\w-]{10,}$/.test(u.searchParams.get('id') || '')) return 'file';
      return null;
    } catch {
      return null;
    }
  }
  function updateDriveHint() {
    const v = driveInput.value.trim();
    const kind = driveKind(v);
    driveHint.classList.toggle('help-ok', !!kind);
    driveHint.classList.toggle('help-bad', !!v && !kind);
    driveHint.textContent = !v ? driveDefault
      : kind === 'folder' ? '✓ Google Drive folder link'
        : kind === 'file' ? '✓ Google Drive file link'
          : 'This doesn’t look like a Google Drive link yet.';
  }
  driveInput.addEventListener('input', updateDriveHint);
  updateDriveHint();

  // ---------- inline errors ----------
  function showError(field, message) {
    const section = form.querySelector(`[data-field="${field}"]`);
    if (!section) return;
    section.classList.add('is-invalid');
    let note = section.querySelector('.field-error');
    if (!note) {
      note = document.createElement('p');
      note.className = 'field-error';
      note.setAttribute('role', 'alert');
      section.append(note);
    }
    note.textContent = message;
  }
  function clearError(field) {
    const section = form.querySelector(`[data-field="${field}"]`);
    section?.classList.remove('is-invalid');
    section?.querySelector('.field-error')?.remove();
  }
  form.addEventListener('input', (e) => {
    const sec = e.target.closest('[data-field]');
    if (sec) clearError(sec.dataset.field);
    if (e.target.name === 'shared') clearError('shared');
  });
  form.addEventListener('change', (e) => {
    if (e.target.name === 'style_id') clearError('look');
    if (e.target.name === 'shared') { clearError('shared'); clearError('drive'); }
  });

  const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  const isHttp = (v) => { try { return /^https?:$/.test(new URL(v).protocol); } catch { return false; } };

  form.addEventListener('submit', (e) => {
    const f = form.elements;
    const problems = [];
    // Start clean: fields fixed since the last tap shouldn't keep their old error.
    form.querySelectorAll('[data-field]').forEach((sec) => clearError(sec.dataset.field));
    if (!f.title.value.trim()) problems.push(['title', 'Give the video a title.']);
    if (f.ref_mode.value === 'style') {
      if (!form.querySelector('input[name="style_id"]:checked')) problems.push(['look', 'Tap one of our styles to choose it.']);
    } else if (!f.reference_url.value.trim()) {
      problems.push(['look', form.querySelector('[data-ref-tab]') ? 'Paste a reference reel link, or tap “Pick our style”.' : 'Paste a reference reel link.']);
    } else if (!isHttp(f.reference_url.value.trim())) {
      problems.push(['look', 'The reference link should start with https://']);
    }
    if (!driveKind(f.drive_url.value)) problems.push(['drive', 'Paste the Google Drive link to your footage.']);
    if (!f.shared.checked) problems.push(['shared', 'Tick this box once the link is set to “Anyone with the link”.']);
    if (!isEmail(f.notify_email.value.trim())) problems.push(['email', 'Add the email where we should tell you it’s ready.']);

    if (problems.length) {
      e.preventDefault();
      problems.forEach(([field, msg]) => showError(field, msg));
      const first = form.querySelector(`[data-field="${problems[0][0]}"]`);
      first.scrollIntoView({ behavior: 'smooth', block: 'center' });
      first.querySelector('input:not([type=hidden]), textarea')?.focus({ preventScroll: true });
      return;
    }
    const btn = form.querySelector('[data-submit]');
    btn.textContent = 'Checking your Drive link…';
  });

  // After a server-side error, bring the problem into view.
  const serverError = document.querySelector('[data-error-field]');
  if (serverError?.dataset.errorField) {
    form.querySelector(`[data-field="${serverError.dataset.errorField}"]`)?.scrollIntoView({ block: 'center' });
  }
})();
