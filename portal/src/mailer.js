// Sends email through Gmail (app password) or any SMTP server. Every email is also saved to
// data/outbox/<id>.html/.txt and listed under Admin → Emails, so you can preview and resend it.
// Without mail settings, emails are only saved there ("logged") and the portal works as normal.
import fs from 'node:fs';
import path from 'node:path';
import nodemailer from 'nodemailer';
import { db, now } from './db.js';
import { config } from './config.js';

export const outboxDir = path.join(config.dataDir, 'outbox');
fs.mkdirSync(outboxDir, { recursive: true });

const m = config.mail;
export const mailMode = m.gmailUser && m.gmailAppPassword ? 'gmail' : m.smtpHost ? 'smtp' : 'off';
export const senderAddress = mailMode === 'gmail' ? m.gmailUser : (m.smtpUser || m.from || '');

let transporter = null;
if (mailMode === 'gmail') {
  transporter = nodemailer.createTransport({ service: 'gmail', auth: { user: m.gmailUser, pass: m.gmailAppPassword } });
} else if (mailMode === 'smtp') {
  transporter = nodemailer.createTransport({
    host: m.smtpHost, port: m.smtpPort, secure: m.smtpSecure,
    auth: m.smtpUser ? { user: m.smtpUser, pass: m.smtpPass } : undefined,
    tls: { rejectUnauthorized: !/^(localhost|127\.0\.0\.1)$/.test(m.smtpHost) },
  });
}

const fromHeader = () => m.from || `"${config.portalName}" <${senderAddress}>`;

export function mailStatus() {
  return { mode: mailMode, sender: senderAddress, alertTo: config.mail.alertTo };
}

/** Check the login works (used by "Send test email" to give a clear error). */
export async function verifyMail() {
  if (!transporter) return { ok: false, error: 'Email isn’t set up yet.' };
  try {
    await transporter.verify();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: friendlyError(err) };
  }
}

function friendlyError(err) {
  const msg = String(err?.response || err?.message || err);
  if (/535|Username and Password not accepted|BadCredentials/i.test(msg)) {
    return 'Gmail refused the login. Check GMAIL_USER and that GMAIL_APP_PASSWORD is a 16-letter app password (not your normal password).';
  }
  if (/ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ETIMEDOUT/i.test(msg)) return `Couldn’t reach the mail server (${msg.split('\n')[0]}).`;
  return msg.split('\n')[0].slice(0, 300);
}

const write = (id, html, text) => {
  fs.writeFileSync(path.join(outboxDir, `${id}.html`), html);
  fs.writeFileSync(path.join(outboxDir, `${id}.txt`), text);
};
export const readOutbox = (id) => {
  const h = path.join(outboxDir, `${Number(id)}.html`);
  const t = path.join(outboxDir, `${Number(id)}.txt`);
  return { html: fs.existsSync(h) ? fs.readFileSync(h, 'utf8') : '', text: fs.existsSync(t) ? fs.readFileSync(t, 'utf8') : '' };
};

async function deliver(id, { to, subject, html, text }) {
  if (!transporter) {
    db.prepare("UPDATE emails SET status = 'logged', error = NULL WHERE id = ?").run(id);
    console.log(`[email logged] #${id} to=${to} | ${subject}`);
    return;
  }
  try {
    await transporter.sendMail({ from: fromHeader(), to, subject, html, text });
    db.prepare("UPDATE emails SET status = 'sent', error = NULL WHERE id = ?").run(id);
    console.log(`[email sent] #${id} to=${to} | ${subject}`);
  } catch (err) {
    db.prepare("UPDATE emails SET status = 'failed', error = ? WHERE id = ?").run(friendlyError(err), id);
    console.warn(`[email failed] #${id} to=${to} | ${friendlyError(err)}`);
  }
}

/**
 * Queue an email. Returns at once; sending happens in the background so pages never wait on Gmail.
 * @returns {Promise<number>} resolves with the email id once the send attempt finished
 */
export function sendMail({ to, subject, html, text, kind, videoId = null }) {
  if (!to) return Promise.resolve(0);
  const info = db.prepare("INSERT INTO emails (video_id, to_addr, subject, kind, status, created_at) VALUES (?, ?, ?, ?, 'sending', ?)")
    .run(videoId, to, subject, kind, now());
  const id = Number(info.lastInsertRowid);
  write(id, html, text);
  return deliver(id, { to, subject, html, text }).then(() => id);
}

/** Send a saved email again (after fixing settings, or if the client lost it). */
export function resendMail(id) {
  const row = db.prepare('SELECT * FROM emails WHERE id = ?').get(Number(id));
  if (!row) return Promise.resolve(0);
  const { html, text } = readOutbox(row.id);
  return sendMail({ to: row.to_addr, subject: row.subject, html, text, kind: row.kind, videoId: row.video_id });
}
