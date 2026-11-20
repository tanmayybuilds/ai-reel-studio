import path from 'node:path';
import express from 'express';
import { config, configProblems } from './src/config.js';
import { db } from './src/db.js';
import { sessionMiddleware, csrfCheck, ensureAdmin } from './src/auth.js';
import { authRoutes } from './src/routes/auth.js';
import { adminRoutes } from './src/routes/admin.js';
import { clientRoutes } from './src/routes/client.js';
import { styleRoutes } from './src/routes/styles.js';
import { emailRoutes } from './src/routes/emails.js';
import { accountRoutes } from './src/routes/account.js';
import { notificationRoutes } from './src/routes/notifications.js';
import { mailStatus } from './src/mailer.js';
import { runMaintenance } from './src/maintenance.js';
import { errorPage } from './src/views/layout.js';

// ---------- refuse to run a public portal with unsafe settings ----------
const problems = configProblems();
if (problems.length) {
  const list = problems.map((p) => `  - ${p}`).join('\n');
  if (config.isProduction) {
    console.error(`Not starting: fix these settings first (environment variables or portal/.env):\n${list}`);
    process.exit(1);
  }
  console.warn(`! Fix before going live:\n${list}`);
}

await ensureAdmin();
await runMaintenance();
const maintenance = setInterval(runMaintenance, 60 * 60e3);
maintenance.unref();

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', config.trustProxy);

app.use((req, res, next) => {
  res.set({
    'Content-Security-Policy':
      "default-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; style-src 'self'; script-src 'self'; " +
      "connect-src 'self'; frame-src https://drive.google.com https://docs.google.com https://accounts.google.com https://*.google.com https://*.googleusercontent.com; worker-src 'self'; manifest-src 'self'; " +
      "frame-ancestors 'none'; form-action 'self'; base-uri 'none'; object-src 'none'",
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'same-origin',
    'X-Frame-Options': 'DENY',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
    // A private portal: keep every page out of search engines.
    'X-Robots-Tag': 'noindex, nofollow',
  });
  if (config.secureCookies) res.set('Strict-Transport-Security', 'max-age=31536000');
  next();
});

// ---------- endpoints that need no session ----------
app.get('/healthz', (req, res) => {
  try {
    db.prepare('SELECT 1').get();
    res.set('Cache-Control', 'no-store').json({ ok: true });
  } catch {
    res.status(503).json({ ok: false });
  }
});
app.get('/robots.txt', (req, res) => res.type('text').send('User-agent: *\nDisallow: /\n'));
app.get('/favicon.ico', (req, res) => res.redirect(301, '/favicon.svg'));
// The installable app: the service worker must never be cached long, or updates would get stuck.
app.get('/sw.js', (req, res) => {
  res.set({ 'Cache-Control': 'no-cache', 'Service-Worker-Allowed': '/' });
  res.sendFile(path.join(config.portalDir, 'public', 'sw.js'), { dotfiles: 'allow' });
});
app.get('/manifest.webmanifest', (req, res) => {
  // The admin address installs as its own app that opens on the queue.
  const admin = config.splitHosts && req.hostname.toLowerCase() === config.adminHost;
  const shortName = config.portalName.length > 12 ? config.portalName.replace(/^AI\s+/i, '') : config.portalName;
  res.type('application/manifest+json').set('Cache-Control', 'no-cache').send(JSON.stringify({
    id: admin ? '/admin' : '/',
    name: admin ? `${config.portalName} Admin` : config.portalName,
    short_name: admin ? 'Studio Admin' : shortName,
    description: admin ? 'The studio side: queue, clients, styles and emails.' : 'Send your footage, watch your edit, ask for changes and download the final reel.',
    start_url: admin ? '/admin?source=app' : '/?source=app',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0a0b0e',
    theme_color: '#0a0b0e',
    categories: ['productivity', 'photo', 'business'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: admin ? [{ name: 'Queue', url: '/admin/queue', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] }]
      : [{ name: 'New video', url: '/videos/new', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] }],
  }));
});

// Asset URLs carry ?v=<build>, so they can be cached; a restart changes the build id.
app.use(express.static(path.join(config.portalDir, 'public'), { maxAge: config.isProduction ? '7d' : 0, index: false }));

app.get('/theme.css', (req, res) => {
  res.type('css').set('Cache-Control', 'no-cache').send(`:root{--accent:${config.accent};}`);
});

app.use(express.urlencoded({ extended: false, limit: '100kb' }));
app.use(express.json({ limit: '100kb' }));
app.use(sessionMiddleware);
app.use(csrfCheck);
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store'); // pages are private and per-user
  next();
});

// Two addresses (SITE_URL for clients, ADMIN_SITE_URL for the studio): each side only answers on
// its own. Any other host (the server's IP, localhost) serves both, for setup and testing.
const CLIENT_PATHS = /^\/(dashboard|videos|account|api\/videos)(\/|$)/;
app.use((req, res, next) => {
  if (!config.splitHosts) return next();
  const host = req.hostname.toLowerCase();
  const adminPath = req.path === '/admin' || req.path.startsWith('/admin/');
  if (host === config.siteHost && adminPath) {
    return res.status(404).send(errorPage(req, 404, 'Page not found', 'This page doesn\u2019t exist, or you don\u2019t have access to it.'));
  }
  if (host === config.adminHost && CLIENT_PATHS.test(req.path)) return res.redirect(302, config.siteUrl + req.originalUrl);
  next();
});

app.use(authRoutes);
app.use(accountRoutes);
app.use(adminRoutes);
app.use(notificationRoutes);
app.use(clientRoutes);
app.use(styleRoutes);
app.use(emailRoutes);

app.use((req, res) => {
  res.status(404).send(errorPage(req, 404, 'Page not found', 'This page doesn’t exist, or you don’t have access to it.'));
});

app.use((err, req, res, next) => {
  console.error(`${req.method} ${req.originalUrl}:`, err);
  if (res.headersSent) return next(err); // mid-stream (e.g. a video): let Express close the connection
  if (err.type === 'entity.too.large') return res.status(413).send(errorPage(req, 413, 'Too much text', 'That form was too large. Shorten it and try again.'));
  res.status(500).send(errorPage(req, 500, 'Something went wrong', 'Please try again. If it keeps happening, message your editor.'));
});

process.on('unhandledRejection', (err) => console.error('Unhandled promise rejection:', err));

const server = app.listen(config.port, config.host, () => {
  console.log(`${config.portalName} portal running at http://${config.host === '0.0.0.0' ? 'localhost' : config.host}:${config.port} (clients: ${config.siteUrl}${config.splitHosts ? `, studio: ${config.adminUrl}` : ''})`);
  console.log(`Briefs go to ${path.join(config.studioRoot, 'Raw')}. Video files stay in Google Drive.`);
  const mail = mailStatus();
  console.log(mail.mode === 'off' ? 'Email is off: emails are saved to data/outbox/ (see Admin → Emails).' : `Email is on (${mail.mode}), sending as ${mail.sender}.`);
});
// A 16 MB chunk on a slow phone connection can take a few minutes; don't cut it off.
server.requestTimeout = 20 * 60e3;
server.headersTimeout = 65e3;
server.keepAliveTimeout = 61e3;

// ---------- clean shutdown (hosts send SIGTERM on every deploy) ----------
let stopping = false;
function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  console.log(`${signal} received: finishing open requests, then stopping.`);
  clearInterval(maintenance);
  server.close(() => {
    try { db.close(); } catch { /* already closed */ }
    process.exit(0);
  });
  server.closeIdleConnections?.();
  setTimeout(() => process.exit(0), 15e3).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
