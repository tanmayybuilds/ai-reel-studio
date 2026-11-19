import { html, raw } from '../html.js';
import { config } from '../config.js';
import { db } from '../db.js';

const BUILD = Date.now().toString(36); // changes on every restart, so browsers fetch fresh CSS/JS
/** URL for a file in public/ that's safe to cache: the ?v= changes on every restart. */
export const asset = (p) => `${p}?v=${BUILD}`;

export const logoMark = raw(`<svg class="logo-mark" viewBox="0 0 32 32" aria-hidden="true">
  <rect x="5" y="2" width="22" height="28" rx="6" fill="none" stroke="currentColor" stroke-width="2.4"/>
  <path d="M13 11.5v9l7.5-4.5z" fill="var(--accent)"/>
</svg>`);

export const icon = {
  plus: raw('<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" fill="none"/></svg>'),
  copy: raw('<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" fill="none" stroke="currentColor" stroke-width="2"/></svg>'),
  upload: raw('<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V4m0 0-4.5 4.5M12 4l4.5 4.5M4 16v2.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>'),
  wand: raw('<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 20 11-11M14 4v3M18.5 5.5l-2 2M20 10h-3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'),
  link: raw('<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'),
  drive: raw('<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.5 3.5h7l6 10.5-3.5 6h-12L2.5 14z M8.5 3.5 15 14.5H2.5M15.5 3.5 9 14.5M6 20l3.2-5.5h12.3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>'),
  film: raw('<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4" stroke="currentColor" stroke-width="2"/></svg>'),
  mic: raw('<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'),
  image: raw('<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2.5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="9" cy="10" r="1.8" fill="currentColor"/><path d="m4 18 5-5 4 4 3-3 4 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>'),
  clock: raw('<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 7.5V12l3 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'),
  send: raw('<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 12 20 4.5 15.5 20l-3.2-6.3z M12.3 13.7 20 4.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>'),
  folder: raw('<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 7.5A2 2 0 0 1 5.5 5.5h4l2 2h7a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>'),
  download: raw('<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M4 17v1.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>'),
  mail: raw('<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="m4 7 8 6 8-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>'),
  chat: raw('<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 0 1-11.6 7.1L4 20l1-4.2A8 8 0 1 1 20 12z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>'),
  home: raw('<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 11.5 12 5l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5H15v-5h-6v5H5.5A1.5 1.5 0 0 1 4 19z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>'),
  user: raw('<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8.5" r="3.8" fill="none" stroke="currentColor" stroke-width="2"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'),
  list: raw('<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>'),
  users: raw('<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="9" r="3.3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3 19.5a6 6 0 0 1 12 0M16 5.8a3.3 3.3 0 0 1 0 6.4M18 19.5a6 6 0 0 0-2.5-4.9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'),
  x: raw('<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>'),
  check: raw('<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>'),
};

function flashes(list) {
  return list
    .filter((f) => f.msg)
    .map((f) => html`<div class="flash flash-${f.type}" role="status">${f.msg}</div>`);
}

/**
 * Full HTML document.
 * @param {object} o
 * @param {string} o.title
 * @param {import('express').Request} o.req
 * @param {any} o.body
 * @param {'app'|'auth'} [o.shell]
 * @param {string} [o.active] admin nav key to highlight
 * @param {string} [o.tab] client tab to highlight ('videos' | 'new' | 'account')
 */
export function page({ title, req, body, shell = 'app', active = '', tab = '' }) {
  const user = req.user;
  const isAdmin = user?.role === 'admin';
  const todo = isAdmin
    ? db.prepare("SELECT COUNT(*) AS n FROM videos WHERE status IN ('queued','editing','changes','exporting')").get().n
      + db.prepare("SELECT COUNT(DISTINCT m.video_id) AS n FROM messages m JOIN videos v ON v.id = m.video_id WHERE m.read_by_admin = 0 AND v.status NOT IN ('queued','editing','changes','exporting')").get().n
    : 0;
  const nav = isAdmin
    ? [['queue', '/admin/queue', 'Queue', todo], ['clients', '/admin/clients', 'Clients'], ['styles', '/admin/styles', 'Styles'], ['emails', '/admin/emails', 'Emails']]
    : [];

  // Bottom tab bar on phones: the app's main navigation, within thumb reach.
  const tabs = !user || shell !== 'app' ? [] : isAdmin
    ? [['queue', '/admin/queue', 'Queue', icon.list, todo], ['clients', '/admin/clients', 'Clients', icon.users],
      ['styles', '/admin/styles', 'Styles', icon.film], ['emails', '/admin/emails', 'Emails', icon.mail]]
    : [['videos', '/dashboard', 'Videos', icon.home], ['new', '/videos/new', 'New', icon.plus], ['account', '/account', 'Account', icon.user]];
  const current = isAdmin ? active : tab;
  const tabbar = tabs.length ? html`
    <nav class="tabbar" aria-label="Main">
      ${tabs.map(([key, href, label, ic, count]) => html`
      <a href="${href}" class="${key === current ? 'on' : ''} ${key === 'new' ? 'tab-new' : ''}" ${key === current ? html`aria-current="page"` : ''}>
        <span class="tab-icon">${ic}${count ? html`<span class="tab-count">${count}</span>` : ''}</span><span class="tab-label">${label}</span>
      </a>`)}
    </nav>` : '';

  const header = shell === 'app' && user ? html`
    <header class="topbar">
      <a class="brand" href="${isAdmin ? '/admin' : '/dashboard'}">${logoMark}<span>${config.portalName}</span>${isAdmin ? html`<span class="pill pill-admin">Admin</span>` : ''}</a>
      ${nav.length ? html`<nav class="nav">${nav.map(([key, href, label, count]) => html`<a href="${href}" class="${key === active ? 'on' : ''}">${label}${count ? html`<span class="nav-count" title="${count} to do">${count}</span>` : ''}</a>`)}</nav>` : ''}
      <div class="who">
        ${isAdmin ? html`<span class="who-name">${user.name}</span>` : html`<a class="who-link" href="/account" title="Your account">${user.name}</a>`}
        <form method="post" action="/logout">
          <input type="hidden" name="_csrf" value="${req.csrf}">
          <button class="btn btn-ghost btn-sm" type="submit">Sign out</button>
        </form>
      </div>
    </header>` : '';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#0a0b0e">
<meta name="color-scheme" content="dark">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="${html`${config.portalName}`}">
<meta name="format-detection" content="telephone=no">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
<meta name="csrf-token" content="${req.csrf}">
<meta name="server-now" content="${Date.now()}">
<title>${html`${title ? `${title} · ` : ''}${config.portalName}`}</title>
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/css/app.css?v=${BUILD}">
<link rel="stylesheet" href="/theme.css?v=${BUILD}">
<script src="/js/app.js?v=${BUILD}" defer></script>
<script src="/js/live.js?v=${BUILD}" defer></script>
<script src="/js/drive-player.js?v=${BUILD}" defer></script>
</head>
<body class="shell-${shell} ${tabs.length ? 'has-tabbar' : ''}">
${header}
<main class="${shell === 'auth' ? 'auth-main' : 'main'}">
${flashes(req.flash)}
${body}
</main>
${tabbar}
</body>
</html>`;
}

export function errorPage(req, status, heading, text) {
  return page({
    title: heading,
    req,
    shell: req.user ? 'app' : 'auth',
    body: html`<section class="empty-state">
      <div class="big-num">${status}</div>
      <h1>${heading}</h1>
      <p class="muted">${text}</p>
      <a class="btn" href="/">Go to my dashboard</a>
    </section>`,
  });
}
