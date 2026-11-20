import { Router } from 'express';
import { db } from '../db.js';
import { requireAdmin, flash } from '../auth.js';
import { mailStatus, verifyMail, sendMail, resendMail, readOutbox } from '../mailer.js';
import { testEmail } from '../emails.js';
import { config } from '../config.js';
import { emailsPage } from '../views/emails.js';

export const emailRoutes = Router();
emailRoutes.use('/admin/emails', requireAdmin);

emailRoutes.get('/admin/emails', (req, res) => {
  const emails = db.prepare(`
    SELECT e.*, v.title AS video_title FROM emails e LEFT JOIN videos v ON v.id = e.video_id
    ORDER BY e.id DESC LIMIT 150`).all();
  res.send(emailsPage(req, { emails, status: mailStatus() }));
});

emailRoutes.post('/admin/emails/test', async (req, res) => {
  const to = config.mail.alertTo;
  const status = mailStatus();
  if (!to) {
    flash(req, 'error', 'Set ALERT_EMAIL (or GMAIL_USER) in portal/.env so the portal knows where to send it.');
    return res.redirect(303, '/admin/emails');
  }
  if (status.mode !== 'off') {
    const check = await verifyMail();
    if (!check.ok) {
      flash(req, 'error', check.error);
      return res.redirect(303, '/admin/emails');
    }
  }
  const id = await sendMail({ to, kind: 'test', ...testEmail() });
  const row = db.prepare('SELECT status, error FROM emails WHERE id = ?').get(id);
  if (row.status === 'sent') flash(req, 'success', `Test email sent to ${to}. Check your inbox (and spam, the first time).`);
  else if (row.status === 'logged') flash(req, 'info', 'Email isn’t set up yet, so the test was saved here instead. Preview it below.');
  else flash(req, 'error', row.error || 'The test email failed.');
  res.redirect(303, '/admin/emails');
});

emailRoutes.post('/admin/emails/:id/resend', async (req, res) => {
  const id = await resendMail(req.params.id);
  const row = id && db.prepare('SELECT status, error, to_addr FROM emails WHERE id = ?').get(id);
  if (!row) flash(req, 'error', 'Email not found.');
  else if (row.status === 'sent') flash(req, 'success', `Sent again to ${row.to_addr}.`);
  else if (row.status === 'logged') flash(req, 'info', 'Saved again. Email isn’t set up yet.');
  else flash(req, 'error', row.error || 'Resend failed.');
  res.redirect(303, '/admin/emails');
});

// The saved email exactly as the recipient sees it. It's our own HTML, but it's still shown sandboxed:
// no scripts, inline styles allowed (emails need them), links open in a new tab.
emailRoutes.get('/admin/emails/:id/preview', (req, res, next) => {
  const row = db.prepare('SELECT * FROM emails WHERE id = ?').get(Number(req.params.id));
  if (!row) return next();
  const { html, text } = readOutbox(row.id);
  res.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; img-src data: https:; sandbox allow-popups allow-popups-to-escape-sandbox; base-uri 'none'");
  res.type(req.query.text ? 'text/plain' : 'html').send(req.query.text ? text : html.replace('<head>', '<head><base target="_blank">'));
});
