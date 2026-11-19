import { html } from '../html.js';
import { page, icon, asset } from './layout.js';
import { MAX_STYLES } from '../styles.js';

const poster = (s) => (s.dir ? `/styles/${s.id}/poster.jpg` : '');

// ---------- admin: style library ----------

export function stylesPage(req, { styles, approved, active }) {
  const unused = approved.filter((r) => !r.used);
  const csrf = html`<input type="hidden" name="_csrf" value="${req.csrf}">`;
  return page({
    title: 'Styles',
    req,
    active: 'styles',
    body: html`
    <div class="page-head">
      <div>
        <h1>Styles</h1>
        <p class="muted">Clients without a reference reel pick one of these. Show 2 to ${MAX_STYLES}. <strong class="${active < 2 ? 'warn-text' : ''}">${active} of ${MAX_STYLES} shown.</strong></p>
      </div>
    </div>

    ${styles.length ? html`
    <div class="style-admin-grid">
      ${styles.map((s, i) => html`
      <section class="card style-admin ${s.active ? '' : 'is-hidden'}">
        <div class="style-video">
          <video src="/styles/${s.id}/preview.mp4" poster="${poster(s)}" controls muted playsinline preload="none"></video>
          ${s.active ? '' : html`<span class="badge badge-muted style-hidden-badge">Hidden from clients</span>`}
        </div>
        <form method="post" action="/admin/styles/${s.id}" class="stack">
          ${csrf}
          <label class="field"><span>Name</span><input name="name" value="${s.name}" maxlength="60" required></label>
          <label class="field"><span>What makes it different</span><textarea name="description" rows="3" maxlength="240">${s.description || ''}</textarea></label>
          <button class="btn btn-sm" type="submit">Save</button>
        </form>
        <p class="muted small style-src">From ${s.source_name || 'an upload'}</p>
        <div class="style-actions">
          <form method="post" action="/admin/styles/${s.id}/move">${csrf}<input type="hidden" name="dir" value="up"><button class="icon-btn" type="submit" aria-label="Move earlier" ${i === 0 ? 'disabled' : ''}>↑</button></form>
          <form method="post" action="/admin/styles/${s.id}/move">${csrf}<input type="hidden" name="dir" value="down"><button class="icon-btn" type="submit" aria-label="Move later" ${i === styles.length - 1 ? 'disabled' : ''}>↓</button></form>
          <form method="post" action="/admin/styles/${s.id}/toggle">${csrf}<button class="btn btn-ghost btn-sm" type="submit">${s.active ? 'Hide' : 'Show'}</button></form>
          <form method="post" action="/admin/styles/${s.id}/delete" data-confirm="Remove “${s.name}” from the style list? Your original reel isn’t touched.">${csrf}<button class="btn btn-ghost btn-sm btn-danger-text" type="submit">Remove</button></form>
        </div>
      </section>`)}
    </div>` : html`
    <section class="card empty-inline"><div class="empty-icon">${icon.film}</div><h3>No styles yet</h3>
      <p class="muted">Add 2 to ${MAX_STYLES} reels you've edited. Clients pick one when they don't have a reference.</p></section>`}

    <h2 class="section-title">Add a style</h2>
    <div class="split-even">
      <section class="card">
        <h3 class="card-title">${icon.upload} Upload a reel</h3>
        <form class="stack" data-chunk-upload data-purpose="style">
          <label class="field"><span>Name</span><input name="name" maxlength="60" required placeholder="e.g. Bright & punchy"></label>
          <label class="field"><span>What makes it different <em>optional</em></span><textarea name="description" rows="2" maxlength="240" placeholder="e.g. Colour hero words, website cards, fast cuts"></textarea></label>
          <label class="field"><span>Video</span><input type="file" name="file" accept=".mp4,.mov,.m4v,.webm" required></label>
          <div class="bar" hidden data-bar><span></span></div>
          <p class="muted small" data-msg>A light preview is made for clients. Your file is kept as it is.</p>
          <button class="btn btn-primary" type="submit">Add style</button>
        </form>
      </section>
      <section class="card">
        <h3 class="card-title">${icon.film} From Approved Videos</h3>
        ${unused.length ? html`<ul class="approved-list">${unused.map((r) => html`
          <li>
            <form method="post" action="/admin/styles/from-approved" class="approved-row">
              ${csrf}
              <input type="hidden" name="folder" value="${r.folder}"><input type="hidden" name="file" value="${r.file}">
              <div class="approved-name"><strong>${r.folder}</strong><span class="muted small">${r.file}</span></div>
              <input name="name" placeholder="Style name" maxlength="60" required aria-label="Style name for ${r.folder}">
              <button class="btn btn-sm" type="submit">Use</button>
            </form>
          </li>`)}</ul>` : html`<p class="muted">Every reel in <code>Approved Videos/</code> is already a style, or the folder is empty.</p>`}
      </section>
    </div>
    <script src="${asset('/js/xhr-upload.js')}" defer></script>`,
  });
}

// ---------- client: reference or style ----------

export function referencePicker({ styles, form }) {
  const mode = form.ref_mode === 'style' && styles.length ? 'style' : 'reference';
  return html`
  <div class="refpick" data-refpick>
    <input type="hidden" name="ref_mode" value="${mode}">
    ${styles.length ? html`
    <div class="seg" role="tablist" aria-label="Reference or style">
      <button type="button" role="tab" data-ref-tab="reference" aria-selected="${String(mode === 'reference')}">${icon.link} Reference reel</button>
      <button type="button" role="tab" data-ref-tab="style" aria-selected="${String(mode === 'style')}">${icon.wand} Pick our style</button>
    </div>` : ''}

    <div data-ref-panel="reference" ${mode === 'reference' ? '' : 'hidden'}>
      <label class="field"><span>Reference reel link</span>
        <div class="input-icon">${icon.link}<input type="url" name="reference_url" value="${form.reference_url || ''}" placeholder="https://www.instagram.com/reel/…"
          inputmode="url" autocomplete="off" autocapitalize="off" spellcheck="false"></div>
        <small class="help">A reel whose style you like: Instagram, TikTok, YouTube or anywhere else.${styles.length ? ' No reference? Tap “Pick our style”.' : ''}</small></label>
    </div>

    ${styles.length ? html`
    <div data-ref-panel="style" ${mode === 'style' ? '' : 'hidden'}>
      <p class="muted small style-intro">Reels we've edited. Tap one to play it, then pick the look you want.</p>
      <div class="style-grid" role="radiogroup" aria-label="Editing style">
        ${styles.map((s) => html`
        <label class="style-card">
          <input type="radio" name="style_id" value="${s.id}" ${String(form.style_id) === String(s.id) ? 'checked' : ''}>
          <span class="style-media" data-style-media>
            <video src="/styles/${s.id}/preview.mp4" poster="${poster(s)}" muted loop playsinline preload="none"></video>
            <span class="style-play" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/></svg></span>
            <span class="style-tick" aria-hidden="true">${icon.check}</span>
          </span>
          <span class="style-name">${s.name}</span>
          ${s.description ? html`<span class="style-desc">${s.description}</span>` : ''}
        </label>`)}
      </div>
    </div>` : ''}
  </div>`;
}
