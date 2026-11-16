import { html, timeAgo } from '../html.js';
import { humanSize } from '../storage.js';
import { config } from '../config.js';
import { page, icon } from './layout.js';

function credentialsCard(c) {
  const loginUrl = `${config.siteUrl}/login`;
  const message =
    `Hi ${c.name.split(' ')[0]}, here's your login for ${config.portalName}:\n\n` +
    `${loginUrl}\nEmail: ${c.email}\nPassword: ${c.password}\n\n` +
    `Sign in, click "New video" and upload your footage. I'll take it from there.`;
  return html`
  <section class="card creds" aria-live="polite">
    <div class="creds-head">
      <span class="creds-badge">${icon.check}</span>
      <div>
        <h2>${c.reset ? 'New password for' : 'Login ready for'} ${c.name}</h2>
        <p class="muted">This password is shown only once. Copy it now and send it to the client.</p>
      </div>
    </div>
    <dl class="creds-grid">
      <dt>Sign-in link</dt><dd><code>${loginUrl}</code></dd>
      <dt>Email</dt><dd><code>${c.email}</code></dd>
      <dt>Password</dt><dd><code class="creds-pw">${c.password}</code></dd>
    </dl>
    <textarea class="sr-only" id="creds-msg" readonly>${message}</textarea>
    <div class="row">
      <button class="btn btn-primary" type="button" data-copy="#creds-msg">${icon.copy} Copy message for client</button>
      <button class="btn btn-ghost" type="button" data-copy-text="${c.password}">Copy password only</button>
    </div>
  </section>`;
}

export function clientsPage(req, { clients, form = {}, error = '' }) {
  const creds = req.flash.find((f) => f.type === 'credentials');
  const active = clients.filter((c) => !c.disabled).length;
  return page({
    title: 'Clients',
    req,
    active: 'clients',
    body: html`
    <div class="page-head">
      <div>
        <h1>Clients</h1>
        <p class="muted">${clients.length ? `${active} active · ${clients.length - active} turned off` : 'Create a login for each client. Nobody can sign up on their own.'}</p>
      </div>
    </div>

    ${creds ? credentialsCard(creds) : ''}

    <div class="split">
      <section class="card">
        <h2 class="card-title">${icon.plus} Add a client</h2>
        ${error ? html`<div class="flash flash-error" role="alert">${error}</div>` : ''}
        <form method="post" action="/admin/clients" class="stack" autocomplete="off">
          <input type="hidden" name="_csrf" value="${req.csrf}">
          <label class="field"><span>Name</span>
            <input name="name" value="${form.name || ''}" required maxlength="80" placeholder="Priya Sharma"></label>
          <label class="field"><span>Email</span>
            <input type="email" name="email" value="${form.email || ''}" required placeholder="priya@brand.com"></label>
          <label class="field"><span>Company <em>optional</em></span>
            <input name="company" value="${form.company || ''}" maxlength="80" placeholder="Brand Co."></label>
          <label class="field"><span>Password <em>optional</em></span>
            <input name="password" minlength="8" maxlength="128" placeholder="Leave blank to generate one" autocomplete="new-password"></label>
          <button class="btn btn-primary" type="submit">Create client</button>
        </form>
      </section>

      <section class="card card-flush">
        ${clients.length ? html`
        <table class="table">
          <thead><tr><th>Client</th><th>Videos</th><th>Last sign-in</th><th>Status</th><th class="t-right">Actions</th></tr></thead>
          <tbody>
          ${clients.map((c) => html`
            <tr class="${c.disabled ? 'is-off' : ''}">
              <td>
                <div class="person">
                  <span class="avatar">${initials(c.name)}</span>
                  <div><strong>${c.name}</strong><div class="muted small">${c.email}${c.company ? ` · ${c.company}` : ''}</div></div>
                </div>
              </td>
              <td>${c.video_count}</td>
              <td class="muted">${timeAgo(c.last_login_at)}</td>
              <td>${c.disabled ? html`<span class="badge badge-off">Turned off</span>` : html`<span class="badge badge-ok">Active</span>`}</td>
              <td class="t-right">
                <div class="actions">
                  <form method="post" action="/admin/clients/${c.id}/reset" data-confirm="Make a new password for ${c.name}? Their old password stops working.">
                    <input type="hidden" name="_csrf" value="${req.csrf}">
                    <button class="btn btn-ghost btn-sm" type="submit">New password</button>
                  </form>
                  <form method="post" action="/admin/clients/${c.id}/toggle" ${c.disabled ? '' : html`data-confirm="Turn off ${c.name}'s login? They're signed out right away. Their videos are kept."`}>
                    <input type="hidden" name="_csrf" value="${req.csrf}">
                    <button class="btn btn-ghost btn-sm ${c.disabled ? '' : 'btn-danger-text'}" type="submit">${c.disabled ? 'Turn on' : 'Turn off'}</button>
                  </form>
                </div>
              </td>
            </tr>`)}
          </tbody>
        </table>` : html`
        <div class="empty-inline">
          <div class="empty-icon">${icon.plus}</div>
          <h3>No clients yet</h3>
          <p class="muted">Add your first client on the left. You'll get a login message you can paste into WhatsApp or email.</p>
        </div>`}
      </section>
    </div>`,
  });
}

export const initials = (name) =>
  String(name).split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');

// ---------- queue ----------

const clockTime = (ms) => new Date(ms).toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true });
const WORKING = ['editing', 'changes', 'exporting'];

export const QUEUE_FILTERS = [
  ['active', 'To do', ['editing', 'changes', 'exporting']],
  ['review', 'Waiting on client', ['review']],
  ['delivered', 'Delivered', ['delivered']],
  ['all', 'All', ['editing', 'changes', 'exporting', 'review', 'delivered']],
];

export function queueList(videos) {
  if (!videos.length) {
    return html`<div class="empty-inline"><div class="empty-icon">${icon.check}</div><h3>Nothing here</h3>
      <p class="muted">New videos from clients show up here straight away.</p></div>`;
  }
  return html`<ul class="queue">${videos.map((v) => html`
    <li>
      <a class="qrow ${v.unread ? 'has-unread' : ''}" href="/admin/videos/${v.id}">
        <span class="avatar">${initials(v.client_name)}</span>
        <div class="q-main">
          <div class="q-title"><strong>${v.title}</strong>${v.unread ? html`<span class="badge badge-msg">${v.unread} new</span>` : ''}</div>
          <div class="muted small">${v.client_name}${v.company ? ` · ${v.company}` : ''} · ${v.file_count ? `${v.file_count} file${v.file_count === 1 ? '' : 's'}` : ''}${v.file_count && v.drive_url ? ' + ' : ''}${v.drive_url ? 'Drive link' : ''} · sent <time data-ts="${v.submitted_at}">${clockTime(v.submitted_at)}</time></div>
        </div>
        <span class="q-status">${statusBadgeAdmin(v.status)}</span>
        ${WORKING.includes(v.status) && v.eta_at
          ? html`<span class="q-time" data-due="${v.eta_at}">${clockTime(v.eta_at)}</span>`
          : html`<span class="q-time muted">${timeAgo(v.updated_at)}</span>`}
      </a>
    </li>`)}</ul>`;
}

export function queuePage(req, { videos, filter, counts }) {
  return page({
    title: 'Queue',
    req,
    active: 'queue',
    body: html`
    <div class="page-head">
      <div><h1>Queue</h1><p class="muted">Every client video. This list refreshes itself.</p></div>
    </div>
    <nav class="filters">
      ${QUEUE_FILTERS.map(([key, label]) => html`<a href="/admin/queue?f=${key}" class="${key === filter ? 'on' : ''}">${label}<span>${counts[key] || 0}</span></a>`)}
    </nav>
    <section class="card card-flush" data-refresh="15000">${queueList(videos)}</section>`,
  });
}

// ---------- video workspace ----------

const STATUS_LABEL = {
  editing: ['Editing', 'accent'], review: ['Ready to review', 'ok'], changes: ['Changes requested', 'warn'],
  exporting: ['Preparing final', 'accent'], delivered: ['Delivered', 'done'], draft: ['Draft', 'muted'],
};
export const statusBadgeAdmin = (s) => html`<span class="badge badge-${(STATUS_LABEL[s] || STATUS_LABEL.draft)[1]}">${(STATUS_LABEL[s] || STATUS_LABEL.draft)[0]}</span>`;

export function workspacePage(req, { video, client, files, folderAbs, chat, canReveal, versions = [], final = null, changeRequest = null, exportsList = [] }) {
  const working = WORKING.includes(video.status);
  const by = (k) => files.filter((f) => f.kind === k);
  const fileRows = (list) => list.map((f) => html`
    <li>
      <span class="ws-ficon">${f.kind === 'voiceover' ? icon.mic : f.kind === 'asset' ? icon.image : icon.film}</span>
      <span class="ws-fname">${f.original_name}</span>
      <span class="muted small">${humanSize(f.size)}</span>
      <a class="icon-btn" href="/admin/files/${f.id}" aria-label="Download ${f.original_name}" title="Download">${icon.download}</a>
    </li>`);
  const etaForm = (value, label) => html`
    <form method="post" action="/admin/videos/${video.id}/eta">
      <input type="hidden" name="_csrf" value="${req.csrf}"><input type="hidden" name="change" value="${value}">
      <button class="btn btn-ghost btn-sm" type="submit">${label}</button>
    </form>`;

  return page({
    title: video.title,
    req,
    active: 'queue',
    body: html`
    <div class="ws-head">
      <a class="back" href="/admin/queue">← Queue</a>
      <div class="row"><h1>${video.title}</h1>${statusBadgeAdmin(video.status)}</div>
      <p class="muted">${client.name}${client.company ? ` · ${client.company}` : ''} · <a href="mailto:${video.notify_email}">${video.notify_email}</a> · sent <time data-ts="${video.submitted_at}">${clockTime(video.submitted_at)}</time></p>
    </div>

    <div class="ws" data-live data-status="${video.status}">
      <div class="ws-main">
        ${working ? html`
        <section class="card ws-eta" data-eta-card data-eta="${video.eta_at}" data-start="${video.submitted_at}">
          <div class="ws-eta-top">
            <div>
              <p class="eyebrow">Client sees ready at</p>
              <div class="ws-eta-clock"><strong data-eta-clock>${clockTime(video.eta_at)}</strong> <span class="ws-eta-left" data-countdown data-countdown-style="words"></span></div>
            </div>
            <div class="ws-eta-btns">
              ${etaForm('-15', '−15 min')}${etaForm('15', '+15 min')}${etaForm('30', '+30 min')}${etaForm('60', '+1 hr')}${etaForm('reset', '1 hr from now')}
            </div>
          </div>
          <div class="bar eta-bar"><span data-eta-progress></span></div>
        </section>` : ''}

        <section class="card">
          <h2 class="card-title">${icon.folder} Footage &amp; brief</h2>
          ${video.folder ? html`
          <div class="ws-folder">
            <code>${video.folder}/</code>
            <div class="row">
              <button class="btn btn-ghost btn-sm" type="button" data-copy-text="${folderAbs}">${icon.copy} Copy path</button>
              ${canReveal ? html`<form method="post" action="/admin/videos/${video.id}/reveal"><input type="hidden" name="_csrf" value="${req.csrf}"><button class="btn btn-ghost btn-sm" type="submit">${icon.folder} Show in Finder</button></form>` : ''}
            </div>
          </div>` : ''}
          <dl class="sent ws-sent">
            ${by('raw').length ? html`<dt>Raw footage</dt><dd><ul class="ws-files">${fileRows(by('raw'))}</ul></dd>` : ''}
            ${video.drive_url ? html`<dt>Google Drive</dt><dd><a href="${video.drive_url}" target="_blank" rel="noopener noreferrer">${video.drive_url}</a></dd>` : ''}
            ${video.reference_url ? html`<dt>Reference reel</dt><dd><a href="${video.reference_url}" target="_blank" rel="noopener noreferrer">${video.reference_url}</a></dd>` : ''}
            ${video.style_name ? html`<dt>Style picked</dt><dd>${video.style_id ? html`<a href="/styles/${video.style_id}/preview.mp4" target="_blank" rel="noopener">${video.style_name}</a>` : video.style_name}</dd>` : ''}
            ${by('voiceover').length ? html`<dt>Voiceover</dt><dd><ul class="ws-files">${fileRows(by('voiceover'))}</ul></dd>` : ''}
            ${by('asset').length ? html`<dt>Assets</dt><dd><ul class="ws-files">${fileRows(by('asset'))}</ul></dd>` : ''}
            ${video.notes ? html`<dt>Client notes</dt><dd class="pre">${video.notes}</dd>` : ''}
          </dl>
        </section>

        ${stageCards(req, { video, versions, final, changeRequest, exportsList })}
      </div>
      <div class="ws-side">${chat}</div>
    </div>
    <script src="/js/xhr-upload.js" defer></script>`,
  });
}

// ---------- workspace: send edits, deliver ----------

function exportOptions(list) {
  return list.map((e) => html`<option value="${e.rel}">${e.rel.replace(/^Exports\//, '')} · ${humanSize(e.size)} · ${timeAgo(e.mtime)}</option>`);
}

function uploadForm({ action, label, button, extra = '' }) {
  return html`
  <form class="stack xhr-upload" data-xhr-upload data-action="${action}">
    <label class="field"><span>${label}</span><input type="file" name="file" accept=".mp4,.mov,.m4v,.webm" required></label>
    ${extra}
    <div class="bar" hidden data-bar><span></span></div>
    <p class="muted small" data-msg hidden></p>
    <button class="btn btn-primary" type="submit">${button}</button>
  </form>`;
}

function versionsList(versions, approved) {
  if (!versions.length) return '';
  return html`
  <section class="card">
    <h2 class="card-title">${icon.film} Versions sent</h2>
    <ul class="ws-versions">${versions.slice().reverse().map((v) => html`
      <li>
        <video src="/admin/files/${v.file_id}/stream" preload="metadata" controls playsinline muted></video>
        <div class="ws-vmeta">
          <strong>v${v.number}</strong>${approved === v.number ? html` <span class="badge badge-ok">Approved</span>` : ''}
          <span class="muted small">Sent <time data-ts="${v.created_at}">${clockTime(v.created_at)}</time> · ${humanSize(v.size)}</span>
          ${v.note ? html`<p class="small pre">${v.note}</p>` : ''}
          <a class="small" href="/admin/files/${v.file_id}">${icon.download} Download</a>
        </div>
      </li>`)}
    </ul>
  </section>`;
}

function stageCards(req, { video, versions, final, changeRequest, exportsList }) {
  const csrf = html`<input type="hidden" name="_csrf" value="${req.csrf}">`;
  const next = (versions.at(-1)?.number || 0) + 1;
  const sendEdit = html`
  <section class="card ws-send">
    <h2 class="card-title">${icon.upload} ${versions.length ? `Send version ${next}` : 'Send the edit'}</h2>
    <p class="muted small">The client gets a review screen with the video, a changes box and an export button.</p>
    <div class="ws-send-grid">
      ${uploadForm({
        action: `/admin/videos/${video.id}/versions`,
        label: 'Upload from your computer',
        button: `Send v${next} for review`,
        extra: html`<label class="field"><span>Note for the client <em>optional</em></span><textarea name="note" rows="2" maxlength="2000" placeholder="e.g. Added the logo end card and tightened the intro."></textarea></label>`,
      })}
      <form method="post" action="/admin/videos/${video.id}/versions/from-exports" class="stack">
        ${csrf}
        <label class="field"><span>Or pick a render from Exports/</span>
          ${exportsList.length
            ? html`<select name="rel" required>${exportOptions(exportsList)}</select>`
            : html`<p class="muted small">Nothing new in <code>Exports/</code>. Renders from the editing skills show up here.</p>`}
        </label>
        ${exportsList.length ? html`
        <label class="field"><span>Note for the client <em>optional</em></span><textarea name="note" rows="2" maxlength="2000"></textarea></label>
        <button class="btn" type="submit">Send v${next} for review</button>` : ''}
      </form>
    </div>
  </section>`;

  if (video.status === 'editing') return html`${sendEdit}${versionsList(versions, video.approved_version)}`;

  if (video.status === 'changes') {
    return html`
    ${changeRequest ? html`
    <section class="card ws-changes">
      <h2 class="card-title">${icon.wand} Changes requested on v${versions.at(-1)?.number || 1}</h2>
      <blockquote class="pre">${changeRequest.body}</blockquote>
      <p class="muted small">Asked <time data-ts="${changeRequest.created_at}">${clockTime(changeRequest.created_at)}</time></p>
    </section>` : ''}
    ${sendEdit}${versionsList(versions, video.approved_version)}`;
  }

  if (video.status === 'review') {
    return html`
    <section class="card ws-wait">
      <h2 class="card-title">${icon.clock} Waiting for the client to review v${versions.at(-1)?.number}</h2>
      <p class="muted">They can ask for changes or approve it for export. You'll see it here and in the chat.</p>
    </section>
    ${versionsList(versions, video.approved_version)}
    <details class="card ws-more"><summary>Send another version anyway</summary>${sendEdit}</details>`;
  }

  if (video.status === 'exporting') {
    const approved = versions.find((v) => v.number === video.approved_version) || versions.at(-1);
    return html`
    <section class="card ws-deliver-card">
      <h2 class="card-title">${icon.check} Approved v${approved?.number}. Deliver the final</h2>
      <form method="post" action="/admin/videos/${video.id}/deliver" class="stack">
        ${csrf}
        <label class="field"><span>Final file</span>
          <select name="source">
            ${approved ? html`<option value="approved">Use approved v${approved.number} as the final (${humanSize(approved.size)})</option>` : ''}
            ${exportsList.length ? html`<optgroup label="A new render from Exports/">${exportsList.map((e) => html`<option value="exports:${e.rel}">${e.rel.replace(/^Exports\//, '')} · ${humanSize(e.size)}</option>`)}</optgroup>` : ''}
            <option value="none">No file, Google Drive link only</option>
          </select></label>
        <label class="field"><span>Google Drive link <em>optional</em></span>
          <div class="input-icon">${icon.drive}<input type="url" name="drive_url" placeholder="https://drive.google.com/…" inputmode="url"></div></label>
        <button class="btn btn-primary" type="submit">Deliver to client</button>
      </form>
      <details class="ws-more-inline"><summary>Or upload a separate final file</summary>
        ${uploadForm({
          action: `/admin/videos/${video.id}/deliver/upload`,
          label: 'Final file',
          button: 'Upload and deliver',
          extra: html`<label class="field"><span>Google Drive link <em>optional</em></span><input type="url" name="drive_url" placeholder="https://drive.google.com/…"></label>`,
        })}
      </details>
    </section>
    ${versionsList(versions, video.approved_version)}`;
  }

  if (video.status === 'delivered') {
    return html`
    <section class="card ws-delivered">
      <h2 class="card-title">${icon.check} Delivered <time data-ts="${video.delivered_at}">${clockTime(video.delivered_at)}</time></h2>
      <dl class="sent">
        ${final ? html`<dt>Final file</dt><dd><a href="/admin/files/${final.id}">${icon.download} ${final.original_name}</a> <span class="muted">${humanSize(final.size)}</span></dd>` : ''}
        ${video.final_drive_url ? html`<dt>Google Drive</dt><dd><a href="${video.final_drive_url}" target="_blank" rel="noopener noreferrer">${video.final_drive_url}</a></dd>` : ''}
      </dl>
    </section>
    ${versionsList(versions, video.approved_version)}`;
  }
  return '';
}
