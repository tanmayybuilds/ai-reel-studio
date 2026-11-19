// A client's own account: change their password (the admin-generated one is meant to be replaced).
import { Router } from 'express';
import { db } from '../db.js';
import { requireClient, verifyPassword, hashPassword, signOutOthers, flash } from '../auth.js';
import { accountPage } from '../views/account.js';

export const accountRoutes = Router();

accountRoutes.get('/account', requireClient, (req, res) => {
  res.send(accountPage(req, {}));
});

accountRoutes.post('/account/password', requireClient, async (req, res) => {
  const current = String(req.body.current || '');
  const next = String(req.body.password || '');
  const confirm = String(req.body.confirm || '');
  const fail = (error) => res.status(400).send(accountPage(req, { error }));

  const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
  if (!(await verifyPassword(current, row.password_hash))) return fail('Your current password isn’t right.');
  if (next.length < 10) return fail('Use at least 10 characters for the new password.');
  if (next.length > 200) return fail('That password is too long.');
  if (next !== confirm) return fail('The two new passwords don’t match.');
  if (next === current) return fail('That’s the same as your current password.');

  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(await hashPassword(next), req.user.id);
  signOutOthers(req); // any other device using the old password is signed out
  flash(req, 'success', 'Password changed. Other devices have been signed out.');
  res.redirect(303, '/account');
});
