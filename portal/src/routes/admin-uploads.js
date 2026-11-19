// The studio's own uploads: style reels for the style library (edits and finals are Drive links).
// Resumable and in chunks, so big files work behind any host or proxy that caps request size.
//
//   POST /admin/api/uploads              { purpose: 'style', name, size } -> { id, received, chunkSize }
//   PUT  /admin/api/uploads/:id?offset=N one chunk, with X-Chunk-SHA256     -> { received }
//   POST /admin/api/uploads/:id/finish   { name, description }             -> { redirect }
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { Router } from 'express';
import { db, now } from '../db.js';
import { config } from '../config.js';
import { requireAdmin, flash } from '../auth.js';
import { CHUNK_SIZE, hasRoomFor, extOf } from '../storage.js';
import { writeChunk, isBusy, reconcile } from '../chunks.js';
import { createStyle, MAX_STYLES } from '../styles.js';

export const adminUploadRoutes = Router();
adminUploadRoutes.use('/admin/api/uploads', requireAdmin);

const VIDEO_EXTS = ['mp4', 'mov', 'm4v', 'webm'];
const MAX_STYLE_SIZE = 2 * 1024 ** 3;
const tmpRoot = path.join(config.dataDir, 'admin-uploads');
const getUpload = (id) => db.prepare('SELECT * FROM admin_uploads WHERE id = ?').get(String(id));
const httpError = (status, message) => Object.assign(new Error(message), { status });

adminUploadRoutes.post('/admin/api/uploads', (req, res) => {
  try {
    const { purpose, name, size } = req.body || {};
    const fileSize = Number(size);
    if (purpose !== 'style') throw httpError(400, 'Edits and finals are sent as Google Drive links.');
    if (typeof name !== 'string' || !name.trim() || name.length > 255) throw httpError(400, 'That file has no name.');
    if (!VIDEO_EXTS.includes(extOf(name))) throw httpError(415, 'Use an MP4, MOV, M4V or WEBM file.');
    if (!Number.isSafeInteger(fileSize) || fileSize <= 0 || fileSize > MAX_STYLE_SIZE) throw httpError(413, 'Sample reels can be up to 2 GB.');

    // Picking the same file again resumes it.
    const existing = db.prepare('SELECT * FROM admin_uploads WHERE purpose = ? AND name = ? AND size = ? ORDER BY created_at DESC LIMIT 1')
      .get(purpose, name, fileSize);
    const safe = existing && !isBusy(existing.id) ? reconcile(existing.path, existing.received) : null;
    if (existing && safe !== null) {
      if (safe !== existing.received) db.prepare('UPDATE admin_uploads SET received = ? WHERE id = ?').run(safe, existing.id);
      return res.json({ id: existing.id, received: safe, chunkSize: CHUNK_SIZE });
    }
    if (!hasRoomFor(fileSize)) throw httpError(507, 'The server is short on storage for a file this size.');

    fs.mkdirSync(tmpRoot, { recursive: true });
    const id = crypto.randomUUID();
    const filePath = path.join(tmpRoot, `${id}.part`);
    fs.writeFileSync(filePath, '');
    db.prepare('INSERT INTO admin_uploads (id, purpose, video_id, name, size, path, created_at) VALUES (?, ?, NULL, ?, ?, ?, ?)')
      .run(id, purpose, name.trim(), fileSize, filePath, now());
    res.status(201).json({ id, received: 0, chunkSize: CHUNK_SIZE });
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message });
  }
});

adminUploadRoutes.put('/admin/api/uploads/:id', async (req, res) => {
  const up = getUpload(req.params.id);
  if (!up) return res.status(404).json({ error: 'Upload not found.' });
  const r = await writeChunk(req, { key: up.id, filePath: up.path, received: up.received, size: up.size });
  if (r.status === 200) db.prepare('UPDATE admin_uploads SET received = ? WHERE id = ?').run(r.body.received, up.id);
  if (!res.headersSent) res.status(r.status).json(r.body);
});

adminUploadRoutes.post('/admin/api/uploads/:id/finish', async (req, res) => {
  const up = getUpload(req.params.id);
  if (!up) return res.status(404).json({ error: 'Upload not found.' });
  try {
    if (up.received !== up.size || fs.statSync(up.path).size !== up.size) throw httpError(409, 'The file isn’t fully uploaded yet.');
    const name = String(req.body?.name || '').trim();
    if (!name) throw httpError(400, 'Give the style a name.');
    const style = await createStyle({ file: up.path, name, description: String(req.body?.description || ''), sourceName: up.name });
    await fsp.rm(up.path, { force: true });
    db.prepare('DELETE FROM admin_uploads WHERE id = ?').run(up.id);
    flash(req, 'success', style.active
      ? `“${style.name}” is live for clients.`
      : `“${style.name}” was added but is hidden: you already show ${MAX_STYLES} styles.`);
    res.json({ redirect: '/admin/styles' });
  } catch (err) {
    if (!err.status) console.warn('style upload failed:', err.message);
    res.status(err.status || 500).json({ error: err.status ? err.message : 'Something went wrong saving the file. Try again.' });
  }
});

/** Half-finished studio uploads older than two days are just leftovers. */
export function purgeStaleAdminUploads() {
  const old = db.prepare('SELECT * FROM admin_uploads WHERE created_at < ?').all(now() - 2 * 864e5);
  for (const up of old) {
    if (isBusy(up.id)) continue;
    fs.rmSync(up.path, { force: true });
    db.prepare('DELETE FROM admin_uploads WHERE id = ?').run(up.id);
  }
}
