import { html, timeAgo } from '../html.js';
import { humanSize } from '../storage.js';
import { config } from '../config.js';
import { page, icon, asset } from './layout.js';

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
                  <a class="btn btn-ghost btn-sm" href="/admin/clients/${c.id}">Edit</a>
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

export function workspacePage(req, { video, client, files, chat, versions = [], changeRequest = null }) {
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
          ${video.drive_url ? html`
          <div class="ws-footage">
            <a class="btn btn-primary" href="${video.drive_url}" target="_blank" rel="noopener noreferrer">${icon.drive} Open the footage in Google Drive</a>
            <button class="btn btn-ghost" type="button" data-copy-text="${video.drive_url}">${icon.copy} Copy link</button>
          </div>` : ''}
          <dl class="sent ws-sent">
            ${by('raw').length ? html`<dt>Uploaded footage</dt><dd><ul class="ws-files">${fileRows(by('raw'))}</ul></dd>` : ''}
            ${video.reference_url ? html`<dt>Reference reel</dt><dd><a href="${video.reference_url}" target="_blank" rel="noopener noreferrer">${video.reference_url}</a></dd>` : ''}
            ${video.style_name ? html`<dt>Style picked</dt><dd>${video.style_id ? html`<a href="/styles/${video.style_id}/preview.mp4" target="_blank" rel="noopener">${video.style_name}</a>` : video.style_name}</dd>` : ''}
            ${by('voiceover').length ? html`<dt>Voiceover</dt><dd><ul class="ws-files">${fileRows(by('voiceover'))}</ul></dd>` : ''}
            ${by('asset').length ? html`<dt>Assets</dt><dd><ul class="ws-files">${fileRows(by('asset'))}</ul></dd>` : ''}
            ${video.notes ? html`<dt>Client notes</dt><dd class="pre">${video.notes}</dd>` : ''}
          </dl>
        </section>

        ${stageCards(req, { video, client, versions, changeRequest })}
      </div>
      <div class="ws-side">${chat}</div>
    </div>`,
  });
}

// ---------- workspace: send edits, deliver, share ----------

const enc = encodeURIComponent;
const first = (name) => String(name || '').split(' ')[0] || 'there';

/**
 * "Send via Gmail" (opens Gmail with the email written), "WhatsApp" (opens WhatsApp with the message),
 * and "Copy message". Works even before the portal's own email is set up.
 */
function shareRow({ to, subject, body }) {
  const gmail = `https://mail.google.com/mail/?view=cm&fs=1&to=${enc(to)}&su=${enc(subject)}&body=${enc(body)}`;
  const whatsapp = `https://wa.me/?text=${enc(body)}`;
  return html`
  <div class="share-row">
    <a class="btn btn-sm" href="${gmail}" target="_blank" rel="noopener noreferrer">${icon.mail} Send via Gmail</a>
    <a class="btn btn-sm" href="${whatsapp}" target="_blank" rel="noopener noreferrer">${icon.chat} WhatsApp</a>
    <button class="btn btn-ghost btn-sm" type="button" data-copy-text="${body}">${icon.copy} Copy message</button>
  </div>`;
}

function versionMessage(video, client, v) {
  const url = `${config.siteUrl}/videos/${video.id}`;
  return {
    to: video.notify_email,
    subject: v.number === 1 ? `Your video “${video.title}” is ready` : `Version ${v.number} of “${video.title}” is ready`,
    body: `Hi ${first(client.name)},\n\n${v.number === 1 ? 'Your video' : `Version ${v.number} of`} “${video.title}” is ready. Watch it here, then approve it or ask for changes:\n${url}\n\n${v.note ? `${v.note}\n\n` : ''}${config.portalName}`,
  };
}

function deliveredMessage(video, client) {
  const url = `${config.siteUrl}/videos/${video.id}`;
  return {
    to: video.notify_email,
    subject: `Your final video “${video.title}” is ready`,
    body: `Hi ${first(client.name)},\n\nYour final video “${video.title}” is ready to download:\n${url}\n\nGoogle Drive: ${video.final_drive_url}\n\n${config.portalName}`,
  };
}

const driveField = (name, label, placeholder = 'https://drive.google.com/file/d/…') => html`
  <label class="field"><span>${label}</span>
    <div class="input-icon">${icon.drive}<input type="url" name="${name}" required inputmode="url" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${placeholder}"></div>
    <small class="help">Share it as <strong>Anyone with the link</strong> first. A file link plays inside the client's portal.</small></label>`;

function versionsList(video, client, versions, approved) {
  if (!versions.length) return '';
  return html`
  <section class="card">
    <h2 class="card-title">${icon.film} Versions sent</h2>
    <ul class="ws-versions">${versions.slice().reverse().map((v) => html`
      <li>
        ${v.file_id && !v.link ? html`<video src="/admin/files/${v.file_id}/stream" preload="metadata" controls playsinline muted></video>` : ''}
        <div class="ws-vmeta">
          <div><strong>v${v.number}</strong>${approved === v.number ? html` <span class="badge badge-ok">Approved</span>` : ''}
            <span class="muted small">· sent <time data-ts="${v.created_at}">${clockTime(v.created_at)}</time></span></div>
          ${v.note ? html`<p class="small pre">${v.note}</p>` : ''}
          ${v.link ? html`<a class="small" href="${v.link}" target="_blank" rel="noopener noreferrer">${icon.drive} Open in Google Drive</a>` : html`<a class="small" href="/admin/files/${v.file_id}">${icon.download} Download</a>`}
          ${v.number === versions.at(-1).number && video.status === 'review' ? html`
          <p class="muted small share-label">The client has been told by email. Message them yourself too:</p>
          ${shareRow(versionMessage(video, client, v))}` : ''}
        </div>
      </li>`)}
    </ul>
  </section>`;
}

function stageCards(req, { video, client, versions, changeRequest }) {
  const csrf = html`<input type="hidden" name="_csrf" value="${req.csrf}">`;
  const next = (versions.at(-1)?.number || 0) + 1;
  const sendEdit = html`
  <section class="card ws-send">
    <h2 class="card-title">${icon.send} ${versions.length ? `Send version ${next}` : 'Send the edit'}</h2>
    <p class="muted small">Upload the edit to Google Drive, share it, and paste the link. The client gets an email and a review screen that plays it.</p>
    <form method="post" action="/admin/videos/${video.id}/versions" class="stack">
      ${csrf}
      ${driveField('link', 'Google Drive link to the edited video')}
      <label class="field"><span>Note for the client <em>optional</em></span>
        <textarea name="note" rows="2" maxlength="2000" placeholder="e.g. Added the logo end card and tightened the intro."></textarea></label>
      <button class="btn btn-primary" type="submit">Send v${next} for review</button>
    </form>
  </section>`;

  if (video.status === 'editing') return html`${sendEdit}${versionsList(video, client, versions, video.approved_version)}`;

  if (video.status === 'changes') {
    return html`
    ${changeRequest ? html`
    <section class="card ws-changes">
      <h2 class="card-title">${icon.wand} Changes requested on v${versions.at(-1)?.number || 1}</h2>
      <blockquote class="pre">${changeRequest.body}</blockquote>
      <p class="muted small">Asked <time data-ts="${changeRequest.created_at}">${clockTime(changeRequest.created_at)}</time></p>
    </section>` : ''}
    ${sendEdit}${versionsList(video, client, versions, video.approved_version)}`;
  }

  if (video.status === 'review') {
    return html`
    <section class="card ws-wait">
      <h2 class="card-title">${icon.clock} Waiting for the client to review v${versions.at(-1)?.number}</h2>
      <p class="muted">They can ask for changes or approve it. You'll see it here and in the chat.</p>
    </section>
    ${versionsList(video, client, versions, video.approved_version)}
    <details class="card ws-more"><summary>Send another version anyway</summary>${sendEdit}</details>`;
  }

  if (video.status === 'exporting') {
    const approved = versions.find((v) => v.number === video.approved_version) || versions.at(-1);
    return html`
    <section class="card ws-deliver-card">
      <h2 class="card-title">${icon.check} Approved v${approved?.number}. Deliver the final</h2>
      ${approved?.link ? html`
      <form method="post" action="/admin/videos/${video.id}/deliver" class="stack">
        ${csrf}<input type="hidden" name="source" value="approved">
        <p class="muted small">Same file as the approved version? Deliver it as it is:</p>
        <button class="btn btn-primary" type="submit">${icon.check} Deliver v${approved.number} as the final</button>
      </form>
      <div class="or"><span>or a different file</span></div>` : ''}
      <form method="post" action="/admin/videos/${video.id}/deliver" class="stack">
        ${csrf}<input type="hidden" name="source" value="new">
        ${driveField('drive_url', 'Google Drive link to the final video')}
        <button class="btn ${approved?.link ? '' : 'btn-primary'}" type="submit">Deliver this link</button>
      </form>
    </section>
    ${versionsList(video, client, versions, video.approved_version)}`;
  }

  if (video.status === 'delivered') {
    return html`
    <section class="card ws-delivered">
      <h2 class="card-title">${icon.check} Delivered <time data-ts="${video.delivered_at}">${clockTime(video.delivered_at)}</time></h2>
      ${video.final_drive_url ? html`
      <p><a href="${video.final_drive_url}" target="_blank" rel="noopener noreferrer">${icon.drive} ${video.final_drive_url}</a></p>
      <p class="muted small share-label">The client has been told by email. Message them yourself too:</p>
      ${shareRow(deliveredMessage(video, client))}` : ''}
    </section>
    ${versionsList(video, client, versions, video.approved_version)}`;
  }
  return '';
}

// ---------- edit one client ----------

export function clientEditPage(req, { client, videos, form, error = '' }) {
  return page({
    title: `Edit ${client.name}`,
    req,
    active: 'clients',
    body: html`
    <div class="ws-head">
      <a class="back" href="/admin/clients">← Clients</a>
      <h1>${client.name}</h1>
      <p class="muted">Client since <time data-ts="${client.created_at}">${clockTime(client.created_at)}</time> · last sign-in ${timeAgo(client.last_login_at)}</p>
    </div>
    <div class="split">
      <section class="card">
        <h2 class="card-title">Details</h2>
        ${error ? html`<div class="flash flash-error" role="alert">${error}</div>` : ''}
        <form method="post" action="/admin/clients/${client.id}" class="stack">
          <input type="hidden" name="_csrf" value="${req.csrf}">
          <label class="field"><span>Name</span><input name="name" value="${form.name || ''}" maxlength="80" required></label>
          <label class="field"><span>Email <em>also their sign-in</em></span><input type="email" name="email" value="${form.email || ''}" required></label>
          <label class="field"><span>Company <em>optional</em></span><input name="company" value="${form.company || ''}" maxlength="80"></label>
          <button class="btn btn-primary" type="submit">Save</button>
        </form>
        <p class="muted small">Changing the email changes how they sign in. Tell them. Their password stays the same.</p>
      </section>
      <section class="card card-flush">
        ${videos.length ? html`<ul class="queue">${videos.map((v) => html`
          <li><a class="qrow qrow-compact" href="/admin/videos/${v.id}">
            <div class="q-main"><div class="q-title"><strong>${v.title}</strong></div>
              <div class="muted small">Sent <time data-ts="${v.submitted_at}">${clockTime(v.submitted_at)}</time></div></div>
            <span class="q-status">${statusBadgeAdmin(v.status)}</span>
          </a></li>`)}</ul>`
          : html`<div class="empty-inline"><h3>No videos yet</h3><p class="muted">Their videos will be listed here.</p></div>`}
      </section>
    </div>`,
  });
}
