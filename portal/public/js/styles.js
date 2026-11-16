// Admin: upload a sample reel to the style library.
(() => {
  const form = document.querySelector('[data-style-upload]');
  if (!form) return;
  const csrf = document.querySelector('meta[name="csrf-token"]').content;
  const bar = form.querySelector('[data-style-bar]');
  const msg = form.querySelector('[data-style-msg]');
  const btn = form.querySelector('button[type="submit"]');

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const file = form.elements.file.files[0];
    const name = form.elements.name.value.trim();
    if (!file || !name) { msg.textContent = 'Add a name and choose a video.'; return; }

    const q = new URLSearchParams({ name, description: form.elements.description.value.trim(), file: file.name });
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/admin/styles/upload?${q}`);
    xhr.setRequestHeader('Content-Type', 'application/octet-stream');
    xhr.setRequestHeader('X-CSRF-Token', csrf);
    bar.hidden = false;
    btn.disabled = true;
    xhr.upload.onprogress = (ev) => {
      const p = ev.total ? (ev.loaded / ev.total) * 100 : 0;
      bar.firstElementChild.style.width = `${p}%`;
      msg.textContent = p < 100 ? `Uploading ${Math.floor(p)}%…` : 'Making the preview… (about 10–30 seconds)';
    };
    xhr.onload = () => {
      let data = {};
      try { data = JSON.parse(xhr.responseText); } catch { /* ignore */ }
      if (xhr.status === 200) { location.reload(); return; }
      msg.textContent = data.error || 'Upload failed. Try again.';
      btn.disabled = false;
    };
    xhr.onerror = () => { msg.textContent = 'Connection lost. Try again.'; btn.disabled = false; };
    xhr.send(file);
  });
})();
