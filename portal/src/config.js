import path from 'node:path';
import { fileURLToPath } from 'node:url';

const portalDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || 4400);
const siteUrl = (process.env.SITE_URL || `http://localhost:${port}`).replace(/\/+$/, '');
const accent = /^#[0-9a-f]{6}$/i.test(process.env.PORTAL_ACCENT || '') ? process.env.PORTAL_ACCENT : '#2dd4bf';

export const config = {
  portalDir,
  // Uploads land in <studioRoot>/Raw/<Client>/<Video>/ so the studio skills can pick them up.
  studioRoot: path.resolve(process.env.STUDIO_ROOT || path.join(portalDir, '..')),
  // PORTAL_DATA_DIR lets the end-to-end test run against a throwaway database.
  dataDir: process.env.PORTAL_DATA_DIR ? path.resolve(process.env.PORTAL_DATA_DIR) : path.join(portalDir, 'data'),
  port,
  host: process.env.HOST || '127.0.0.1',
  siteUrl,
  secureCookies: siteUrl.startsWith('https://'),
  portalName: process.env.PORTAL_NAME || 'AI Reel Studio',
  accent,
  admin: {
    email: (process.env.ADMIN_EMAIL || '').trim().toLowerCase(),
    password: process.env.ADMIN_PASSWORD || '',
    name: process.env.ADMIN_NAME || 'Studio',
  },
  defaultEtaMinutes: Number(process.env.DEFAULT_ETA_MINUTES || 60),
  // Email: Gmail with an app password, or any SMTP server. Without either, emails go to data/outbox/.
  mail: {
    gmailUser: (process.env.GMAIL_USER || '').trim(),
    gmailAppPassword: (process.env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, ''),
    smtpHost: process.env.SMTP_HOST || '',
    smtpPort: Number(process.env.SMTP_PORT || 465),
    smtpSecure: (process.env.SMTP_SECURE || (Number(process.env.SMTP_PORT || 465) === 465 ? 'true' : 'false')) === 'true',
    smtpUser: process.env.SMTP_USER || '',
    smtpPass: process.env.SMTP_PASS || '',
    from: process.env.MAIL_FROM || '',
    // Where the studio's own alerts go (new video, changes, approvals).
    alertTo: (process.env.ALERT_EMAIL || process.env.GMAIL_USER || process.env.ADMIN_EMAIL || '').trim(),
  },
  sessionDays: 30,
};
