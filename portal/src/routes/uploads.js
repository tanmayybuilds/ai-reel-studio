// Resumable, verified uploads.
//
//   POST   /api/uploads               start (or resume) a file -> { fileId, videoId, received, chunkSize }
//   PUT    /api/uploads/:id?offset=N  one chunk of raw bytes, with X-Chunk-SHA256 -> { received }
//   POST   /api/uploads/:id/complete  final check, whole-file SHA-256 -> { sha256 }
//   DELETE /api/uploads/:id           remove a file from a draft
//
// Bytes are written exactly as sent. Every chunk's SHA-256 is checked against the hash the browser
// computed from the original file, so the stored file is provably identical to the client's.

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { Router } from 'express';
import { db, now } from '../db.js';
import {
  stagingRoot, CHUNK_SIZE, MAX_FILE_SIZE, MAX_FILES_PER_VIDEO, ALLOWED, extOf, hasRoomFor, sha256File, humanSize,
} from '../storage.js';
import { createDraft, getOwnedDraft } from '../videos.js';

export const uploadRoutes = Router();

function requireClientApi(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'You were signed out. Sign in again to keep uploading.' });
  if (req.user.role !== 'client') return res.status(403).json({ error: 'Only clients can upload here.' });
  next();
}
uploadRoutes.use('/api/uploads', requireClientApi);

const busy = new Set(); // file ids with a chunk in flight

function getOwnedFile(fileId, userId) {
  return db.prepare(`
    SELECT f.*, v.status AS video_status FROM files f JOIN videos v ON v.id = f.video_id
    WHERE f.id = ? AND v.client_id = ?`).get(Number(fileId), userId);
}

const publicFile = (f) => ({
  fileId: f.id, videoId: f.video_id, kind: f.kind, name: f.original_name, size: f.size,
  received: f.received, complete: !!f.complete, sha256: f.sha256, chunkSize: CHUNK_SIZE,
});

uploadRoutes.post('/api/uploads', (req, res) => {
  const { kind, name, size, lastModified, videoId, title } = req.body || {};
  const fileSize = Number(size);
  const allowed = ALLOWED[kind];
  if (!allowed) return res.status(400).json({ error: 'Unknown file type.' });
  if (typeof name !== 'string' || !name.trim() || name.length > 255) return res.status(400).json({ error: 'That file has no name.' });
  if (!allowed.exts.includes(extOf(name))) {
    return res.status(415).json({ error: `${name} can't be added here. Use ${allowed.label}.` });
  }
  if (!Number.isSafeInteger(fileSize) || fileSize <= 0) return res.status(400).json({ error: `${name} is empty.` });
  if (fileSize > MAX_FILE_SIZE) {
    return res.status(413).json({ error: `${name} is ${humanSize(fileSize)}. Files over ${humanSize(MAX_FILE_SIZE)} need a Google Drive link.` });
  }

  let video = videoId ? getOwnedDraft(videoId, req.user.id) : null;
  if (videoId && !video) return res.status(409).json({ error: 'This video was already sent. Reload the page.' });

  // Same file picked again (after a refresh or dropped connection): resume where it stopped.
  if (video) {
    const existing = db.prepare(`
      SELECT * FROM files WHERE video_id = ? AND kind = ? AND original_name = ? AND size = ? AND complete = 0
      ORDER BY id DESC LIMIT 1`).get(video.id, kind, name, fileSize);
    if (existing && fs.existsSync(existing.stored_path)) {
      const onDisk = fs.statSync(existing.stored_path).size;
      if (onDisk !== existing.received) { // trust the disk if a chunk was cut off mid-write
        const received = Math.min(onDisk, existing.received);
        fs.truncateSync(existing.stored_path, received);
        db.prepare('UPDATE files SET received = ? WHERE id = ?').run(received, existing.id);
        existing.received = received;
      }
      return res.json(publicFile(existing));
    }
    const count = db.prepare('SELECT COUNT(*) AS n FROM files WHERE video_id = ?').get(video.id).n;
    if (count >= MAX_FILES_PER_VIDEO) return res.status(400).json({ error: `A video can have up to ${MAX_FILES_PER_VIDEO} files.` });
  }

  if (!hasRoomFor(fileSize)) {
    return res.status(507).json({ error: 'The studio is short on storage right now. Please send a Google Drive link instead.' });
  }

  if (!video) video = createDraft(req.user, String(title || ''));

  const dir = path.join(stagingRoot, String(video.id));
  fs.mkdirSync(dir, { recursive: true });
  const stored = path.join(dir, `${crypto.randomUUID()}.${extOf(name)}.part`);
  fs.writeFileSync(stored, '');
  const info = db.prepare(`
    INSERT INTO files (video_id, kind, original_name, stored_path, size, received, created_at)
    VALUES (?, ?, ?, ?, ?, 0, ?)`).run(video.id, kind, name.trim(), stored, fileSize, now());
  db.prepare('UPDATE videos SET updated_at = ? WHERE id = ?').run(now(), video.id);
  void lastModified;
  res.status(201).json(publicFile(db.prepare('SELECT * FROM files WHERE id = ?').get(info.lastInsertRowid)));
});

uploadRoutes.put('/api/uploads/:id', async (req, res) => {
  const file = getOwnedFile(req.params.id, req.user.id);
  if (!file || file.video_status !== 'draft') return res.status(404).json({ error: 'Upload not found.' });
  if (file.complete) return res.json({ received: file.received, complete: true });

  const offset = Number(req.query.offset);
  const length = Number(req.get('content-length'));
  if (offset !== file.received) return res.status(409).json({ received: file.received });
  if (!Number.isSafeInteger(length) || length <= 0 || length > CHUNK_SIZE || offset + length > file.size) {
    return res.status(400).json({ error: 'Bad chunk size.' });
  }
  if (busy.has(file.id)) return res.status(409).json({ received: file.received });
  busy.add(file.id);

  const expected = String(req.get('x-chunk-sha256') || '').toLowerCase();
  const hash = crypto.createHash('sha256');
  let written = 0;
  const counter = new Transform({
    transform(chunk, _enc, cb) {
      written += chunk.length;
      if (written > length) return cb(new Error('Chunk larger than announced'));
      hash.update(chunk);
      cb(null, chunk);
    },
  });

  const rollback = () => fsp.truncate(file.stored_path, offset).catch(() => {});
  try {
    await pipeline(req, counter, fs.createWriteStream(file.stored_path, { flags: 'r+', start: offset }));
    if (written !== length) {
      await rollback();
      return res.status(400).json({ error: 'The chunk arrived incomplete.', received: offset });
    }
    if (expected && hash.digest('hex') !== expected) {
      await rollback();
      return res.status(422).json({ error: 'A piece of the file arrived damaged. Retrying.', received: offset });
    }
    const received = offset + written;
    db.prepare('UPDATE files SET received = ? WHERE id = ?').run(received, file.id);
    res.json({ received });
  } catch (err) {
    await rollback();
    if (!res.headersSent && !req.destroyed) res.status(400).json({ error: 'Upload interrupted.', received: offset });
    if (err.code !== 'ERR_STREAM_PREMATURE_CLOSE' && err.code !== 'ECONNRESET') console.warn('upload chunk failed:', err.message);
  } finally {
    busy.delete(file.id);
  }
});

uploadRoutes.post('/api/uploads/:id/complete', async (req, res) => {
  const file = getOwnedFile(req.params.id, req.user.id);
  if (!file || file.video_status !== 'draft') return res.status(404).json({ error: 'Upload not found.' });
  if (file.complete) return res.json(publicFile(file));
  const onDisk = fs.statSync(file.stored_path).size;
  if (file.received !== file.size || onDisk !== file.size) {
    return res.status(409).json({ error: 'The file isn’t fully uploaded yet.', received: file.received });
  }
  const sha256 = await sha256File(file.stored_path);
  db.prepare('UPDATE files SET complete = 1, sha256 = ? WHERE id = ?').run(sha256, file.id);
  res.json(publicFile({ ...file, complete: 1, sha256 }));
});

uploadRoutes.delete('/api/uploads/:id', async (req, res) => {
  const file = getOwnedFile(req.params.id, req.user.id);
  if (!file || file.video_status !== 'draft') return res.status(404).json({ error: 'Upload not found.' });
  if (busy.has(file.id)) return res.status(409).json({ error: 'Still uploading. Try again in a second.' });
  await fsp.unlink(file.stored_path).catch(() => {});
  db.prepare('DELETE FROM files WHERE id = ?').run(file.id);
  res.json({ ok: true });
});
