import path from 'node:path';
import { fileURLToPath } from 'node:url';

const portalDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || 4400);
const siteUrl = (process.env.SITE_URL || `http://localhost:${port}`).replace(/\/+$/, '');
// Optional separate address for the studio's admin side (e.g. https://admineditor.example.com).
const adminUrl = (process.env.ADMIN_SITE_URL || siteUrl).replace(/\/+$/, '');
const hostOf = (u) => { try { return new URL(u).hostname.toLowerCase(); } catch { return ''; } };
const accent = /^#[0-9a-f]{6}$/i.test(process.env.PORTAL_ACCENT || '') ? process.env.PORTAL_ACCENT : '#2dd4bf';

const isProduction = process.env.NODE_ENV === 'production';

// How many proxies sit in front of the portal (sets Express "trust proxy"). On a host such as Railway,
// Render or Fly use 1; behind Cloudflare Tunnel on this Mac the default "loopback" is right.
function trustProxy(v) {
  if (v === undefined || v === '') return 'loopback';
  if (/^\d+$/.test(v)) return Number(v);
  if (v === 'true') return true;
  if (v === 'false') return false;
  return v;
}

export const config = {
  portalDir,
  isProduction,
  trustProxy: trustProxy(process.env.TRUST_PROXY),
  // Uploads land in <studioRoot>/Raw/<Client>/<Video>/ so the studio skills can pick them up.
  studioRoot: path.resolve(process.env.STUDIO_ROOT || path.join(portalDir, '..')),
  // PORTAL_DATA_DIR lets the end-to-end test run against a throwaway database.
  dataDir: process.env.PORTAL_DATA_DIR ? path.resolve(process.env.PORTAL_DATA_DIR) : path.join(portalDir, 'data'),
  port,
  // Containers must listen on all interfaces; on this Mac stay private by default.
  host: process.env.HOST || (isProduction ? '0.0.0.0' : '127.0.0.1'),
  siteUrl,
  adminUrl,
  siteHost: hostOf(siteUrl),
  adminHost: hostOf(adminUrl),
  // Clients on SITE_URL, the studio on ADMIN_SITE_URL: each side only answers on its own address.
  splitHosts: hostOf(adminUrl) !== hostOf(siteUrl),
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

const PLACEHOLDER_PASSWORDS = /^(change-me|changeme|password|admin)/i;

/**
 * Settings that would make a public portal unsafe. In production (NODE_ENV=production) the server
 * refuses to start while any of these are true; locally they're printed as warnings.
 */
export function configProblems() {
  const problems = [];
  if (!config.admin.email) problems.push('ADMIN_EMAIL is not set.');
  if (config.admin.password.length < 12) problems.push('ADMIN_PASSWORD must be at least 12 characters.');
  if (PLACEHOLDER_PASSWORDS.test(config.admin.password)) problems.push('ADMIN_PASSWORD is still a placeholder. Choose a real password.');
  if (config.isProduction && !config.secureCookies) problems.push('SITE_URL must start with https:// in production.');
  if (config.isProduction && /localhost|127\.0\.0\.1/.test(config.siteUrl)) problems.push('SITE_URL must be the public address, e.g. https://portal.yourdomain.com');
  if (config.adminUrl.startsWith('https://') !== config.secureCookies) problems.push('ADMIN_SITE_URL and SITE_URL must both be https:// (or both http:// locally).');
  return problems;
}
