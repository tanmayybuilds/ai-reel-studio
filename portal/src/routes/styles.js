import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import { Router } from 'express';
import { db } from '../db.js';
import { requireAdmin, flash } from '../auth.js';
import {
  listStyles, getStyle, createStyle, deleteStyle, activeCount, approvedReels, stylesRoot,
  stylePreviewPath, stylePosterPath, MAX_STYLES,
} from '../styles.js';
import { stylesPage } from '../views/styles.js';

export const styleRoutes = Router();
const MAX_UPLOAD = 2 * 1024 ** 3;

// ---------- media (any signed-in user; clients only see active styles) ----------

function styleForViewer(req) {
  if (!req.user) return null;
  const style = getStyle(req.params.id);
  if (!style || (!style.active && req.user.role !== 'admin')) return null;
  return style;
}
styleRoutes.get('/styles/:id/preview.mp4', (req, res, next) => {
  const style = styleForViewer(req);
  if (!style || !fs.existsSync(stylePreviewPath(style))) return next();
  res.set('Cache-Control', 'private, max-age=3600');
  res.sendFile(stylePreviewPath(style), { dotfiles: 'allow' }); // supports Range, so the video can seek
});
styleRoutes.get('/styles/:id/poster.jpg', (req, res, next) => {
  const style = styleForViewer(req);
  const poster = style && stylePosterPath(style);
  if (!poster) return next();
  res.set('Cache-Control', 'private, max-age=3600');
  res.sendFile(poster, { dotfiles: 'allow' });
});

// ---------- admin ----------

styleRoutes.use('/admin/styles', requireAdmin);

styleRoutes.get('/admin/styles', (req, res) => {
  res.send(stylesPage(req, { styles: listStyles(), approved: approvedReels(), active: activeCount() }));
});

// Upload a reel from the computer: raw bytes in the body, details in the query string.
styleRoutes.post('/admin/styles/upload', async (req, res) => {
  const name = String(req.query.name || '').trim();
  const fileName = String(req.query.file || 'reel.mp4');
  const length = Number(req.get('content-length'));
  if (!name) return res.status(400).json({ error: 'Give the style a name.' });
  if (!/\.(mp4|mov|m4v|webm)$/i.test(fileName)) return res.status(415).json({ error: 'Use an MP4, MOV, M4V or WEBM file.' });
  if (!length || length > MAX_UPLOAD) return res.status(413).json({ error: 'Sample reels can be up to 2 GB.' });

  await fsp.mkdir(stylesRoot, { recursive: true });
  const tmp = path.join(stylesRoot, `upload-${crypto.randomUUID()}${path.extname(fileName).toLowerCase()}`);
  let seen = 0;
  const cap = new Transform({
    transform(chunk, _e, cb) { seen += chunk.length; cb(seen > MAX_UPLOAD ? new Error('too big') : null, chunk); },
  });
  try {
    await pipeline(req, cap, fs.createWriteStream(tmp));
    if (seen !== length) throw new Error('Upload incomplete');
    const style = await createStyle({ file: tmp, name, description: String(req.query.description || ''), sourceName: fileName });
    flash(req, 'success', style.active ? `“${style.name}” is live for clients.` : `“${style.name}” was added but is hidden: you already show ${MAX_STYLES} styles.`);
    res.json({ ok: true, id: style.id });
  } catch (err) {
    if (!res.headersSent) res.status(400).json({ error: 'The upload didn’t finish. Try again.' });
    console.warn('style upload failed:', err.message);
  } finally {
    fsp.rm(tmp, { force: true }).catch(() => {});
  }
});

// Use one of the studio's approved reels (from Approved Videos/) as a style.
styleRoutes.post('/admin/styles/from-approved', async (req, res) => {
  const pick = approvedReels().find((r) => r.folder === req.body.folder && r.file === req.body.file);
  const name = String(req.body.name || '').trim() || pick?.folder;
  if (!pick) {
    flash(req, 'error', 'That reel wasn’t found in Approved Videos.');
    return res.redirect(303, '/admin/styles');
  }
  const style = await createStyle({ file: pick.path, name, description: String(req.body.description || ''), sourceName: pick.file });
  flash(req, 'success', style.active ? `“${style.name}” is live for clients.` : `“${style.name}” was added but is hidden: you already show ${MAX_STYLES} styles.`);
  res.redirect(303, '/admin/styles');
});

styleRoutes.post('/admin/styles/:id', (req, res) => {
  const style = getStyle(req.params.id);
  const name = String(req.body.name || '').trim().slice(0, 60);
  if (style && name) {
    db.prepare('UPDATE styles SET name = ?, description = ? WHERE id = ?')
      .run(name, String(req.body.description || '').trim().slice(0, 240) || null, style.id);
    flash(req, 'success', 'Saved.');
  }
  res.redirect(303, '/admin/styles');
});

styleRoutes.post('/admin/styles/:id/toggle', (req, res) => {
  const style = getStyle(req.params.id);
  if (style) {
    if (!style.active && activeCount() >= MAX_STYLES) {
      flash(req, 'error', `Clients can see up to ${MAX_STYLES} styles. Hide one first.`);
    } else {
      db.prepare('UPDATE styles SET active = ? WHERE id = ?').run(style.active ? 0 : 1, style.id);
    }
  }
  res.redirect(303, '/admin/styles');
});

styleRoutes.post('/admin/styles/:id/move', (req, res) => {
  const list = listStyles();
  const i = list.findIndex((s) => s.id === Number(req.params.id));
  const j = req.body.dir === 'up' ? i - 1 : i + 1;
  if (i >= 0 && j >= 0 && j < list.length) {
    [list[i], list[j]] = [list[j], list[i]];
    list.forEach((s, k) => db.prepare('UPDATE styles SET sort = ? WHERE id = ?').run(k + 1, s.id));
  }
  res.redirect(303, '/admin/styles');
});

styleRoutes.post('/admin/styles/:id/delete', async (req, res) => {
  const style = getStyle(req.params.id);
  if (style) {
    await deleteStyle(style);
    flash(req, 'success', `“${style.name}” removed. Your original reel wasn’t touched.`);
  }
  res.redirect(303, '/admin/styles');
});
