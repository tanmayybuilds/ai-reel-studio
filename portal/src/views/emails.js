import { html, timeAgo } from '../html.js';
import { page, icon } from './layout.js';

const STATUS = {
  sent: ['Sent', 'ok'],
  logged: ['Saved (email off)', 'muted'],
  failed: ['Failed', 'danger'],
  sending: ['Sending…', 'accent'],
};
const KIND = {
  'version-ready': 'Client · video ready',
  delivered: 'Client · final ready',
  'admin-new': 'You · new video',
  'admin-changes': 'You · changes requested',
  'admin-approved': 'You · approved',
  test: 'Test',
};

function setupCard(req, status) {
  const csrf = html`<input type="hidden" name="_csrf" value="${req.csrf}">`;
  const on = status.mode !== 'off';
  return html`
  <section class="card mail-setup ${on ? 'is-on' : ''}">
    <div class="mail-setup-head">
      <span class="mail-dot"></span>
      <div>
        <h2>${on ? html`Email is on: sending as <strong>${status.sender}</strong>` : 'Email is off'}</h2>
        <p class="muted">${on
          ? html`Clients get "your video is ready" emails. Your alerts go to <strong>${status.alertTo || 'nobody: set ALERT_EMAIL'}</strong>.`
          : 'Nothing is sent yet. Every email is saved below so you can preview it. Set up Gmail to start sending.'}</p>
      </div>
      <form method="post" action="/admin/emails/test">${csrf}<button class="btn ${on ? '' : 'btn-ghost'}" type="submit">Send test email</button></form>
    </div>
    ${on ? '' : html`
    <ol class="mail-steps">
      <li>Turn on <strong>2-Step Verification</strong> for your Google account (Google Account → Security).</li>
      <li>Open <strong>App passwords</strong> (search for it in your Google Account), create one called “Reel portal” and copy the 16 letters.</li>
      <li>Add these lines to <code>portal/.env</code>, then restart the portal:
        <pre>GMAIL_USER=you@gmail.com
GMAIL_APP_PASSWORD=abcd efgh ijkl mnop
ALERT_EMAIL=you@gmail.com</pre></li>
      <li>Come back here and click <strong>Send test email</strong>.</li>
    </ol>`}
  </section>`;
}

export function emailsPage(req, { emails, status }) {
  const csrf = html`<input type="hidden" name="_csrf" value="${req.csrf}">`;
  return page({
    title: 'Emails',
    req,
    active: 'emails',
    body: html`
    <div class="page-head"><div><h1>Emails</h1><p class="muted">Everything the portal has sent or saved, newest first.</p></div></div>
    ${setupCard(req, status)}
    <section class="card card-flush">
      ${emails.length ? html`
      <table class="table mail-table">
        <thead><tr><th>Email</th><th>To</th><th>Status</th><th class="t-right"></th></tr></thead>
        <tbody>${emails.map((e) => html`
          <tr>
            <td><strong>${e.subject}</strong><div class="muted small">${KIND[e.kind] || e.kind}${e.video_title ? ` · ${e.video_title}` : ''} · ${timeAgo(e.created_at)}</div>
              ${e.error ? html`<div class="small mail-error">${e.error}</div>` : ''}</td>
            <td class="small">${e.to_addr}</td>
            <td><span class="badge badge-${(STATUS[e.status] || STATUS.sending)[1]}">${(STATUS[e.status] || STATUS.sending)[0]}</span></td>
            <td class="t-right"><div class="actions">
              <a class="btn btn-ghost btn-sm" href="/admin/emails/${e.id}/preview" target="_blank" rel="noopener">Preview</a>
              <form method="post" action="/admin/emails/${e.id}/resend">${csrf}<button class="btn btn-ghost btn-sm" type="submit">Resend</button></form>
            </div></td>
          </tr>`)}</tbody>
      </table>` : html`
      <div class="empty-inline"><div class="empty-icon">${icon.send}</div><h3>No emails yet</h3>
        <p class="muted">They appear when a client sends a video, when you send an edit, and when you deliver.</p></div>`}
    </section>`,
  });
}
