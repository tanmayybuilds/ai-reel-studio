import { html, timeAgo } from '../html.js';
import { page, icon, asset } from './layout.js';

const KIND = {
  'new-video': ['New project', icon.plus],
  message: ['Message', icon.chat],
  changes: ['Changes', icon.wand],
  approved: ['Approved', icon.check],
  footage: ['Footage', icon.drive],
};

export function notificationsPage(req, { items, devices, publicKey }) {
  const unread = items.filter((n) => !n.read_at).length;
  return page({
    title: 'Notifications',
    req,
    active: 'notifications',
    body: html`
    <div class="page-head">
      <div><h1>Notifications</h1>
        <p class="muted">${unread ? `${unread} new` : 'You’re all caught up.'}</p></div>
      ${unread ? html`<form method="post" action="/admin/notifications/read-all"><input type="hidden" name="_csrf" value="${req.csrf}">
        <button class="btn btn-ghost btn-sm" type="submit">${icon.check} Mark all as read</button></form>` : ''}
    </div>

    <section class="card push-card" data-push-card data-key="${publicKey}" data-devices="${devices}">
      <div class="push-head">
        <span class="push-icon">${icon.bell}</span>
        <div>
          <h2>Phone notifications</h2>
          <p class="muted small" data-push-status>Get a notification on this device for every new project, client message, change request and approval, even when the app is closed.</p>
        </div>
      </div>
      <div class="row push-actions">
        <button class="btn btn-primary" type="button" data-push-on>Turn on for this device</button>
        <button class="btn btn-ghost btn-sm" type="button" data-push-test hidden>Send a test</button>
        <button class="btn btn-ghost btn-sm" type="button" data-push-off hidden>Turn off here</button>
      </div>
      <p class="muted small push-ios" data-push-ios hidden>On iPhone: first add <strong>Studio Admin</strong> to your home screen (Share → Add to Home Screen), open it from there, then turn notifications on.</p>
    </section>

    <section class="card card-flush">
      ${items.length ? html`<ul class="notif-list">${items.map((n) => {
        const [label, ic] = KIND[n.kind] || ['Update', icon.bell];
        return html`
        <li class="${n.read_at ? '' : 'is-unread'}">
          <a href="/admin/notifications/${n.id}/open">
            <span class="notif-icon notif-${n.kind}">${ic}</span>
            <span class="notif-main">
              <span class="notif-top"><strong>${n.title}</strong><span class="muted small">${timeAgo(n.created_at)}</span></span>
              ${n.body ? html`<span class="notif-body muted small">${n.body}</span>` : ''}
              <span class="notif-kind small">${label}${n.video_title ? ` · ${n.video_title}` : ''}</span>
            </span>
          </a>
        </li>`;
      })}</ul>` : html`
      <div class="empty-inline"><div class="empty-icon">${icon.bell}</div><h3>No notifications yet</h3>
        <p class="muted">New projects, client messages, change requests and approvals will show up here.</p></div>`}
    </section>
    <script src="${asset('/js/push.js')}" defer></script>`,
  });
}
