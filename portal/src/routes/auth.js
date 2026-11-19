import { Router } from 'express';
import { db } from '../db.js';
import {
  verifyPassword, burnPasswordCheck, normEmail, signIn, signOut, safeNext, homeFor, loginLimiter,
} from '../auth.js';
import { loginPage } from '../views/auth.js';
import { config } from '../config.js';

/** With split addresses: the admin only signs in on ADMIN_SITE_URL, clients only on SITE_URL. */
function wrongSide(req, user) {
  if (!config.splitHosts) return null;
  const host = req.hostname.toLowerCase();
  if (user.role === 'admin' && host === config.siteHost) return `Studio sign-in is at ${config.adminUrl}/login`;
  if (user.role === 'client' && host === config.adminHost) return `Client sign-in is at ${config.siteUrl}/login`;
  return null;
}

export const authRoutes = Router();

authRoutes.get('/', (req, res) => res.redirect(req.user ? homeFor(req.user) : '/login'));

authRoutes.get('/login', (req, res) => {
  if (req.user) return res.redirect(safeNext(req.query.next) || homeFor(req.user));
  res.send(loginPage(req, { next: safeNext(req.query.next) }));
});

authRoutes.post('/login', async (req, res) => {
  const email = normEmail(req.body.email);
  const password = String(req.body.password || '');
  const next = safeNext(req.body.next);
  const again = (status, error) => res.status(status).send(loginPage(req, { error, email, next }));

  const locked = loginLimiter.lockedMinutes(req.ip, email);
  if (locked) return again(429, `Too many attempts. Try again in ${locked} minute${locked === 1 ? '' : 's'}.`);

  const user = email ? db.prepare('SELECT * FROM users WHERE email = ?').get(email) : null;
  const ok = user ? await verifyPassword(password, user.password_hash) : (await burnPasswordCheck(password), false);
  if (!ok) {
    loginLimiter.fail(req.ip, email);
    return again(401, 'That email and password don’t match. Check for typos and try again.');
  }
  if (user.disabled) return again(403, 'This login is turned off. Please contact your editor.');
  const elsewhere = wrongSide(req, user);
  if (elsewhere) return again(403, elsewhere);

  loginLimiter.reset(req.ip, email);
  signIn(req, res, user);
  // A client can't be sent into /admin and the admin can't be sent into client pages.
  const fits = next && (user.role === 'admin') === next.startsWith('/admin');
  res.redirect(303, fits ? next : homeFor(user));
});

authRoutes.post('/logout', (req, res) => {
  signOut(req, res);
  res.redirect(303, '/login');
});
