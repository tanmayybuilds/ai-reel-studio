import path from 'node:path';
import express from 'express';
import { config } from './src/config.js';
import './src/db.js';
import { sessionMiddleware, csrfCheck, ensureAdmin, purgeExpiredSessions } from './src/auth.js';
import { authRoutes } from './src/routes/auth.js';
import { adminRoutes } from './src/routes/admin.js';
import { clientRoutes } from './src/routes/client.js';
import { uploadRoutes } from './src/routes/uploads.js';
import { styleRoutes } from './src/routes/styles.js';
import { emailRoutes } from './src/routes/emails.js';
import { mailStatus } from './src/mailer.js';
import { errorPage } from './src/views/layout.js';

await ensureAdmin();
purgeExpiredSessions();
setInterval(purgeExpiredSessions, 60 * 60e3).unref();

const app = express();
app.disable('x-powered-by');
// cloudflared (going-live option A) connects from this machine, so trust X-Forwarded-For from loopback only.
app.set('trust proxy', 'loopback');

app.use((req, res, next) => {
  res.set({
    'Content-Security-Policy':
      "default-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; style-src 'self'; script-src 'self'; " +
      "connect-src 'self'; frame-ancestors 'none'; form-action 'self'; base-uri 'none'; object-src 'none'",
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'same-origin',
    'X-Frame-Options': 'DENY',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  });
  next();
});

app.use(express.static(path.join(config.portalDir, 'public'), { maxAge: 0, index: false }));

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

app.use(authRoutes);
app.use(adminRoutes);
app.use(clientRoutes);
app.use(uploadRoutes);
app.use(styleRoutes);
app.use(emailRoutes);

app.use((req, res) => {
  res.status(404).send(errorPage(req, 404, 'Page not found', 'This page doesn’t exist, or you don’t have access to it.'));
});

app.use((err, req, res, _next) => {
  console.error(err);
  res.status(500).send(errorPage(req, 500, 'Something went wrong', 'Please try again. If it keeps happening, message your editor.'));
});

app.listen(config.port, config.host, () => {
  console.log(`${config.portalName} portal running at http://${config.host === '0.0.0.0' ? 'localhost' : config.host}:${config.port}`);
  console.log(`Uploads go to ${path.join(config.studioRoot, 'Raw')}`);
  const mail = mailStatus();
  console.log(mail.mode === 'off' ? 'Email is off: emails are saved to data/outbox/ (see Admin → Emails).' : `Email is on (${mail.mode}), sending as ${mail.sender}.`);
});
