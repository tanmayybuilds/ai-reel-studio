import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { db, now } from './db.js';
import { config } from './config.js';

const scrypt = promisify(crypto.scrypt);
const SCRYPT = { N: 16384, r: 8, p: 1 };
// The __Host- prefix makes browsers refuse the cookie unless it's Secure, host-only and path=/.
const COOKIE = config.secureCookies ? '__Host-rs_sid' : 'rs_sid';

// ---------- passwords ----------

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, 64, SCRYPT);
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password, stored) {
  const [algo, saltB64, keyB64] = String(stored || '').split('$');
  if (algo !== 'scrypt' || !saltB64 || !keyB64) return false;
  const expected = Buffer.from(keyB64, 'base64');
  const key = await scrypt(password, Buffer.from(saltB64, 'base64'), expected.length, SCRYPT);
  return crypto.timingSafeEqual(key, expected);
}

// Spends the same time as a real check when the email doesn't exist, so timing doesn't reveal accounts.
const DUMMY_HASH = await hashPassword(crypto.randomBytes(16).toString('hex'));
export const burnPasswordCheck = (password) => verifyPassword(password, DUMMY_HASH);

/** Readable random password, e.g. "k7pm-x3qd-9hwt" (~62 bits). */
export function generatePassword() {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(12);
  let out = '';
  for (let i = 0; i < 12; i++) {
    if (i && i % 4 === 0) out += '-';
    out += alphabet[bytes[i] % alphabet.length];
  }
  return out;
}

export const normEmail = (e) => String(e || '').trim().toLowerCase();
export const isEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 254;

// ---------- admin bootstrap ----------

/** The one admin account comes from .env. Editing ADMIN_PASSWORD in .env and restarting resets it. */
export async function ensureAdmin() {
  const { email, password, name } = config.admin;
  if (!email || !password) {
    console.warn('! ADMIN_EMAIL / ADMIN_PASSWORD are not set in portal/.env, so nobody can sign in to /admin yet.');
    return;
  }
  if (password.length < 10) console.warn('! ADMIN_PASSWORD is shorter than 10 characters. Use a longer one.');
  const existing = db.prepare("SELECT * FROM users WHERE role = 'admin'").get();
  if (!existing) {
    const clash = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (clash) throw new Error(`ADMIN_EMAIL ${email} already belongs to a client account.`);
    db.prepare("INSERT INTO users (role, name, email, password_hash, created_at) VALUES ('admin', ?, ?, ?, ?)")
      .run(name, email, await hashPassword(password), now());
    console.log(`Admin account created for ${email}`);
    return;
  }
  const updates = [];
  if (existing.email !== email) updates.push(['email', email]);
  if (existing.name !== name) updates.push(['name', name]);
  if (!(await verifyPassword(password, existing.password_hash))) {
    updates.push(['password_hash', await hashPassword(password)]);
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(existing.id);
  }
  for (const [col, val] of updates) db.prepare(`UPDATE users SET ${col} = ? WHERE id = ?`).run(val, existing.id);
  if (updates.length) console.log(`Admin account updated (${updates.map((u) => u[0]).join(', ')})`);
}

// ---------- sessions ----------

const newId = () => crypto.randomBytes(32).toString('base64url');

function setCookie(res, id) {
  res.cookie(COOKIE, id, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.secureCookies,
    maxAge: config.sessionDays * 864e5,
    path: '/',
  });
}

function createSession(res, userId = null) {
  const id = newId();
  db.prepare('INSERT INTO sessions (id, user_id, csrf, created_at, expires_at) VALUES (?, ?, ?, ?, ?)')
    .run(id, userId, newId(), now(), now() + config.sessionDays * 864e5);
  setCookie(res, id);
  return db.prepare('SELECT * FROM sessions WHERE id = ?').get(id);
}

function readCookie(req, name) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

/** Attaches req.session, req.user, req.csrf and req.flash on every request. */
export function sessionMiddleware(req, res, next) {
  const id = readCookie(req, COOKIE);
  let session = id ? db.prepare('SELECT * FROM sessions WHERE id = ? AND expires_at > ?').get(id, now()) : null;
  let user = null;
  if (session?.user_id) {
    user = db.prepare('SELECT id, role, name, email, company, disabled FROM users WHERE id = ?').get(session.user_id);
    if (!user || user.disabled) {
      db.prepare('DELETE FROM sessions WHERE id = ?').run(session.id);
      session = null;
      user = null;
    }
  }
  // The sign-in form needs a CSRF token, so visitors get a session there (and only there: bots and
  // stray requests elsewhere don't create database rows).
  if (!session && req.method === 'GET' && req.path === '/login') session = createSession(res);

  req.session = session;
  req.user = user;
  req.csrf = session?.csrf || '';
  req.flash = [];
  if (session?.flash) {
    try { req.flash = JSON.parse(session.flash); } catch { /* ignore */ }
    db.prepare('UPDATE sessions SET flash = NULL WHERE id = ?').run(session.id);
  }
  res.locals.flashOut = [];
  next();
}

/** Queue a message for the next page the user sees. */
export function flash(req, type, data) {
  if (!req.session) return;
  const row = db.prepare('SELECT flash FROM sessions WHERE id = ?').get(req.session.id);
  const list = row?.flash ? JSON.parse(row.flash) : [];
  list.push({ type, ...(typeof data === 'string' ? { msg: data } : data) });
  db.prepare('UPDATE sessions SET flash = ? WHERE id = ?').run(JSON.stringify(list), req.session.id);
}

/** Replace the session on sign-in so an old session id can't be reused (session fixation). */
export function signIn(req, res, user) {
  if (req.session) db.prepare('DELETE FROM sessions WHERE id = ?').run(req.session.id);
  req.session = createSession(res, user.id);
  req.user = user;
  db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(now(), user.id);
}

export function signOut(req, res) {
  if (req.session) db.prepare('DELETE FROM sessions WHERE id = ?').run(req.session.id);
  res.clearCookie(COOKIE, { path: '/', httpOnly: true, sameSite: 'lax', secure: config.secureCookies });
}

/** Sign a user out everywhere except this session (after a password change). */
export function signOutOthers(req) {
  db.prepare('DELETE FROM sessions WHERE user_id = ? AND id != ?').run(req.user.id, req.session.id);
}

export function purgeExpiredSessions() {
  // Forget old sign-in attempts so the rate-limit map can't grow forever.
  for (const [key, a] of attempts) if (a.lockedUntil < now() && now() - a.first > LOCK_MS) attempts.delete(key);
  db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now());
  // Anonymous sessions older than a day are just bots and closed tabs.
  db.prepare('DELETE FROM sessions WHERE user_id IS NULL AND created_at <= ?').run(now() - 864e5);
}

// ---------- guards ----------

export function csrfCheck(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const sent = req.get('x-csrf-token') || req.body?._csrf;
  const ok = req.session && sent && sent.length === req.session.csrf.length &&
    crypto.timingSafeEqual(Buffer.from(sent), Buffer.from(req.session.csrf));
  if (ok) return next();
  res.status(403);
  if (req.get('x-csrf-token') !== undefined || req.is('json')) return res.json({ error: 'Your session expired. Reload the page and try again.' });
  return res.redirect(303, req.get('referer') && sameOrigin(req.get('referer')) ? req.get('referer') : '/login?expired=1');
}

function sameOrigin(url) {
  try { return new URL(url).host === new URL(config.siteUrl).host || new URL(url).hostname === '127.0.0.1' || new URL(url).hostname === 'localhost'; } catch { return false; }
}

/** Only allow redirects to paths on this site. */
export function safeNext(next) {
  const n = String(next || '');
  return n.startsWith('/') && !n.startsWith('//') && !n.startsWith('/\\') ? n : '';
}

export const homeFor = (user) => (user?.role === 'admin' ? '/admin' : '/dashboard');

function toLogin(req, res) {
  res.redirect(`/login?next=${encodeURIComponent(req.originalUrl)}`);
}

export function requireClient(req, res, next) {
  if (!req.user) return toLogin(req, res);
  if (req.user.role !== 'client') return res.redirect('/admin');
  next();
}

export function requireAdmin(req, res, next) {
  if (!req.user) return toLogin(req, res);
  // Clients get a plain 404: admin pages don't exist as far as they can tell.
  // next('router') leaves the whole admin router, so the request falls through to the 404 handler.
  if (req.user.role !== 'admin') return next('router');
  next();
}

// ---------- sign-in rate limit ----------

const attempts = new Map(); // key -> { fails, lockedUntil, first }
const MAX_FAILS = 5;
const LOCK_MS = 10 * 60e3;

export const loginLimiter = {
  lockedMinutes(ip, email) {
    const t = Math.max(attempts.get(`ip:${ip}`)?.lockedUntil || 0, attempts.get(`em:${email}`)?.lockedUntil || 0);
    return t > now() ? Math.ceil((t - now()) / 60e3) : 0;
  },
  fail(ip, email) {
    for (const [key, max] of [[`ip:${ip}`, MAX_FAILS * 4], [`em:${email}`, MAX_FAILS]]) {
      const a = attempts.get(key) || { fails: 0, lockedUntil: 0, first: now() };
      if (now() - a.first > LOCK_MS) Object.assign(a, { fails: 0, first: now() });
      a.fails += 1;
      if (a.fails >= max) Object.assign(a, { lockedUntil: now() + LOCK_MS, fails: 0, first: now() });
      attempts.set(key, a);
    }
  },
  reset(ip, email) {
    attempts.delete(`em:${email}`);
    attempts.delete(`ip:${ip}`);
  },
};
