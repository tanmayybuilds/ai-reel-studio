import fs from 'node:fs';
import { Router } from 'express';
import { db } from '../db.js';
import { requireAdmin, flash } from '../auth.js';
import {
  listStyles, getStyle, deleteStyle, activeCount,
  stylePreviewPath, stylePosterPath, MAX_STYLES, createDriveStyle,
} from '../styles.js';
import { stylesPage } from '../views/styles.js';
import { parseDriveUrl, checkDriveAccess, DRIVE_PROBLEM, drivePreviewUrl } from '../drive.js';

export const styleRoutes = Router();

// ---------- media (any signed-in user; clients only see active styles) ----------

function styleForViewer(req) {
  if (!req.user) return null;
  const style = getStyle(req.params.id);
  if (!style || (!style.active && req.user.role !== 'admin')) return null;
  return style;
}
styleRoutes.get('/styles/:id/preview.mp4', (req, res, next) => {
  const style = styleForViewer(req);
  if (!style) return next();
  if (style.drive_url) return res.redirect(drivePreviewUrl(style.drive_url));
  if (!stylePreviewPath(style) || !fs.existsSync(stylePreviewPath(style))) return next();
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
  res.send(stylesPage(req, { styles: listStyles(), active: activeCount() }));
});

styleRoutes.post('/admin/styles/drive', async (req, res) => {
  try {
    const style = await createDriveStyle({ link: String(req.body.drive_url || ''), name: String(req.body.name || ''), description: String(req.body.description || '') });
    flash(req, 'success', style.active ? 'Drive style added for clients.' : `Style added hidden. You already show ${MAX_STYLES} styles.`);
  } catch (err) { flash(req, 'error', err.message); }
  res.redirect(303, '/admin/styles');
});

// Editing an existing local sample can switch it to Drive without deleting its original.
styleRoutes.post('/admin/styles/:id', async (req, res) => {
  const style = getStyle(req.params.id);
  const name = String(req.body.name || '').trim().slice(0, 60);
  if (style && name) {
    try {
      let link = style.drive_url;
      if (req.body.drive_url) {
        const d = parseDriveUrl(req.body.drive_url);
        if (!d.ok || d.kind !== 'file') throw new Error('Use a Google Drive video file link.');
        const access = await checkDriveAccess(d.url);
        if (access !== 'shared') throw new Error(DRIVE_PROBLEM[access] || DRIVE_PROBLEM.unknown);
        link = d.url;
      }
      db.prepare('UPDATE styles SET name = ?, description = ?, drive_url = ? WHERE id = ?')
        .run(name, String(req.body.description || '').trim().slice(0, 240) || null, link, style.id);
      flash(req, 'success', 'Saved.');
    } catch (err) { flash(req, 'error', err.message); }
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
