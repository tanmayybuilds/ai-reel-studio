import { html } from '../html.js';
import { page, icon } from './layout.js';
import { MAX_STYLES } from '../styles.js';
import { drivePlayer } from './drive-player.js';

const poster = (s) => (s.dir ? `/styles/${s.id}/poster.jpg` : '');
const preview = (s) => s.drive_url ? drivePlayer(s.drive_url, `${s.name} sample`)
  : html`<video src="/styles/${s.id}/preview.mp4" poster="${poster(s)}" controls muted playsinline preload="none" aria-label="${s.name} sample"></video>`;

export function stylesPage(req, { styles, active }) {
  const csrf = html`<input type="hidden" name="_csrf" value="${req.csrf}">`;
  return page({ title: 'Styles', req, active: 'styles', body: html`
    <div class="page-head"><div><h1>Styles</h1>
      <p class="muted">Clients choose one when they don't have a reference. ${active} of ${MAX_STYLES} shown.</p>
    </div></div>
    <section class="card drive-style-add">
      <h2 class="card-title">${icon.drive} Add a Google Drive sample</h2>
      <p class="muted small">Upload the sample to your Drive and allow anyone with the link to view and download it.</p>
      <form class="stack" method="post" action="/admin/styles/drive">${csrf}
        <label class="field"><span>Name</span><input name="name" maxlength="60" required placeholder="e.g. Bright & punchy"></label>
        <label class="field"><span>Google Drive video link</span><input name="drive_url" type="url" required placeholder="https://drive.google.com/file/d/…"></label>
        <label class="field"><span>What makes it different</span><textarea name="description" rows="2" maxlength="240"></textarea></label>
        <button class="btn btn-primary" type="submit">Verify and add style</button>
      </form>
    </section>
    ${styles.length ? html`<div class="style-admin-grid">${styles.map((s, i) => html`
      <section class="card style-admin ${s.active ? '' : 'is-hidden'}">
        <div class="style-video">${preview(s)}</div>
        ${s.drive_url ? html`<p class="small"><a href="${s.drive_url}" target="_blank" rel="noopener noreferrer">Open sample in Google Drive</a></p>` : html`<p class="muted small">Existing local sample. Add its Drive link below to switch playback to Drive. Your original stays untouched.</p>`}
        <form class="stack" method="post" action="/admin/styles/${s.id}">${csrf}
          <label class="field"><span>Name</span><input name="name" value="${s.name}" maxlength="60" required></label>
          <label class="field"><span>Google Drive video link</span><input type="url" name="drive_url" value="${s.drive_url || ''}" placeholder="https://drive.google.com/file/d/…"></label>
          <label class="field"><span>Description</span><textarea name="description" rows="2" maxlength="240">${s.description || ''}</textarea></label>
          <button class="btn btn-sm" type="submit">Save</button>
        </form>
        <div class="style-actions">
          <form method="post" action="/admin/styles/${s.id}/move">${csrf}<input type="hidden" name="dir" value="up"><button class="icon-btn" type="submit" aria-label="Move earlier" ${i === 0 ? 'disabled' : ''}>↑</button></form>
          <form method="post" action="/admin/styles/${s.id}/move">${csrf}<input type="hidden" name="dir" value="down"><button class="icon-btn" type="submit" aria-label="Move later" ${i === styles.length - 1 ? 'disabled' : ''}>↓</button></form>
          <form method="post" action="/admin/styles/${s.id}/toggle">${csrf}<button class="btn btn-ghost btn-sm" type="submit">${s.active ? 'Hide' : 'Show'}</button></form>
          <form method="post" action="/admin/styles/${s.id}/delete" data-confirm="Remove this sample from the style list? Your original Drive video is kept.">${csrf}<button class="btn btn-ghost btn-sm btn-danger-text" type="submit">Remove</button></form>
        </div>
      </section>`)}</div>` : html`<section class="card"><p class="muted">Add your first sample above.</p></section>`}
  ` });
}

export function referencePicker({ styles, form }) {
  const mode = form.ref_mode === 'style' && styles.length ? 'style' : 'reference';
  return html`<div class="refpick" data-refpick>
    <input type="hidden" name="ref_mode" value="${mode}">
    ${styles.length ? html`<div class="seg" role="tablist" aria-label="Reference or style">
      <button type="button" role="tab" data-ref-tab="reference" aria-selected="${String(mode === 'reference')}">${icon.link} Reference reel</button>
      <button type="button" role="tab" data-ref-tab="style" aria-selected="${String(mode === 'style')}">${icon.wand} Pick our style</button>
    </div>` : ''}
    <div data-ref-panel="reference" ${mode === 'reference' ? '' : 'hidden'}>
      <label class="field"><span>Reference reel link</span>
        <input type="url" name="reference_url" value="${form.reference_url || ''}" placeholder="https://www.instagram.com/reel/…" inputmode="url" autocomplete="off" autocapitalize="off" spellcheck="false">
        <small class="help">A reel whose style you like.${styles.length ? ' No reference? Tap “Pick our style”.' : ''}</small>
      </label>
    </div>
    ${styles.length ? html`<div data-ref-panel="style" ${mode === 'style' ? '' : 'hidden'}>
      <p class="muted small">Watch a sample, then select the style below it.</p>
      <div class="style-grid" role="radiogroup" aria-label="Editing style">${styles.map((s) => html`
        <div class="style-choice">
          <div class="style-video">${preview(s)}</div>
          ${s.drive_url ? html`<a class="small" href="${s.drive_url}" target="_blank" rel="noopener noreferrer">Open sample in Google Drive</a>` : ''}
          <label class="style-card">
            <input type="radio" name="style_id" value="${s.id}" ${String(form.style_id) === String(s.id) ? 'checked' : ''}>
            <span class="style-name">${s.name}</span>
            ${s.description ? html`<span class="style-desc">${s.description}</span>` : ''}
            <span class="style-select">Select this style</span>
          </label>
        </div>`)}</div>
    </div>` : ''}
  </div>`;
}
