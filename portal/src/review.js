// Edited versions, review, change requests, approval and delivery.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { db, now, tx } from './db.js';
import { config } from './config.js';
import { exportsRoot, cleanName, uniquePath, extOf } from './storage.js';
import { addSystemMessage, addMessage } from './thread.js';
import { notify } from './notify.js';

export const VIDEO_EXTS = ['mp4', 'mov', 'm4v', 'webm'];
export const MAX_EDIT_SIZE = 20 * 1024 ** 3;
const EXPORT_ETA_MINUTES = Number(process.env.EXPORT_ETA_MINUTES || 15);
const postersRoot = path.join(config.dataDir, 'posters');

/** Exports/<Client>/<YYYY-MM-DD Title>/, mirroring the Raw/ folder. */
export function exportsDirFor(video) {
  const rel = video.folder.replace(/^Raw[\\/]/, '');
  return path.join(exportsRoot, rel);
}

export const listVersions = (videoId) => db.prepare(`
  SELECT v.*, f.stored_path, f.size, f.original_name FROM versions v JOIN files f ON f.id = v.file_id
  WHERE v.video_id = ? ORDER BY v.number`).all(videoId);

export const latestVersion = (videoId) => db.prepare(`
  SELECT v.*, f.stored_path, f.size, f.original_name FROM versions v JOIN files f ON f.id = v.file_id
  WHERE v.video_id = ? ORDER BY v.number DESC LIMIT 1`).get(videoId) || null;

export const finalFile = (videoId) =>
  db.prepare("SELECT * FROM files WHERE video_id = ? AND kind = 'final' ORDER BY id DESC LIMIT 1").get(videoId) || null;

export const lastChangeRequest = (videoId) =>
  db.prepare("SELECT * FROM messages WHERE video_id = ? AND kind = 'changes' ORDER BY id DESC LIMIT 1").get(videoId) || null;

// ---------- receiving files ----------

/** Stream a raw request body to `dest` (never overwriting). Returns the final path. */
export async function receiveBody(req, dir, fileName, maxBytes = MAX_EDIT_SIZE) {
  const length = Number(req.get('content-length'));
  if (!length || length > maxBytes) throw Object.assign(new Error('File too large or empty.'), { status: 413 });
  await fsp.mkdir(dir, { recursive: true });
  const tmp = path.join(dir, `.upload-${crypto.randomUUID()}.part`);
  let seen = 0;
  const cap = new Transform({ transform(c, _e, cb) { seen += c.length; cb(seen > length ? new Error('too big') : null, c); } });
  try {
    await pipeline(req, cap, fs.createWriteStream(tmp));
    if (seen !== length) throw new Error('Upload incomplete');
    const dest = uniquePath(dir, fileName);
    await fsp.rename(tmp, dest);
    return dest;
  } catch (err) {
    await fsp.rm(tmp, { force: true });
    throw err;
  }
}

/** Recent renders in Exports/ that aren't attached to a video yet (the studio skills export here). */
export function recentExports(limit = 20) {
  if (!fs.existsSync(exportsRoot)) return [];
  const used = new Set(db.prepare("SELECT stored_path FROM files WHERE kind IN ('version','final')").all().map((r) => r.stored_path));
  const out = [];
  const walk = (dir, depth) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name.startsWith('.')) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory() && depth < 3) walk(full, depth + 1);
      else if (e.isFile() && VIDEO_EXTS.includes(extOf(e.name)) && !used.has(full)) {
        const st = fs.statSync(full);
        out.push({ path: full, rel: path.relative(config.studioRoot, full), size: st.size, mtime: st.mtimeMs });
      }
    }
  };
  walk(exportsRoot, 0);
  return out.sort((a, b) => b.mtime - a.mtime).slice(0, limit);
}

function makePoster(fileId, videoPath) {
  fs.mkdirSync(postersRoot, { recursive: true });
  execFile(process.env.FFMPEG || 'ffmpeg', ['-v', 'error', '-y', '-ss', '1', '-i', videoPath, '-frames:v', '1', '-vf', 'scale=540:-2', '-q:v', '4',
    path.join(postersRoot, `${fileId}.jpg`)], () => {});
}
export const posterPath = (fileId) => {
  const p = path.join(postersRoot, `${fileId}.jpg`);
  return fs.existsSync(p) ? p : null;
};

export const nextVersionNumber = (videoId) =>
  (db.prepare('SELECT MAX(number) AS n FROM versions WHERE video_id = ?').get(videoId).n || 0) + 1;

// ---------- steps ----------

function insertFile(video, kind, filePath, originalName) {
  const size = fs.statSync(filePath).size;
  const info = db.prepare(`
    INSERT INTO files (video_id, kind, original_name, stored_path, size, received, complete, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 1, ?)`).run(video.id, kind, originalName, filePath, size, size, now());
  return Number(info.lastInsertRowid);
}

/** Admin sends an edited cut: becomes v(N+1) and the client is asked to review it. */
export function addVersion(video, filePath, note = '') {
  if (!['editing', 'changes', 'review'].includes(video.status)) throw Object.assign(new Error('This video isn’t waiting for an edit.'), { status: 409 });
  const version = tx(() => {
    const number = (db.prepare('SELECT MAX(number) AS n FROM versions WHERE video_id = ?').get(video.id).n || 0) + 1;
    const fileId = insertFile(video, 'version', filePath, path.basename(filePath));
    db.prepare('INSERT INTO versions (video_id, number, file_id, note, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(video.id, number, fileId, note.trim().slice(0, 2000) || null, now());
    db.prepare("UPDATE videos SET status = 'review', eta_at = NULL, updated_at = ? WHERE id = ?").run(now(), video.id);
    return { number, fileId };
  });
  makePoster(version.fileId, filePath);
  addSystemMessage(video.id, `Version ${version.number} is ready to review.`);
  notify.versionReady(video.id, { number: version.number, note: note.trim() });
  return version;
}

export function requestChanges(video, client, text) {
  if (video.status !== 'review') throw Object.assign(new Error('This version can’t be changed right now.'), { status: 409 });
  const v = latestVersion(video.id);
  addMessage(video.id, client, text, 'changes');
  db.prepare("UPDATE videos SET status = 'changes', eta_at = ?, updated_at = ? WHERE id = ?")
    .run(now() + config.defaultEtaMinutes * 60e3, now(), video.id);
  notify.changes(video.id, v?.number || 1, text);
}

export function approve(video, client) {
  if (video.status !== 'review') throw Object.assign(new Error('There’s nothing to approve right now.'), { status: 409 });
  const v = latestVersion(video.id);
  db.prepare("UPDATE videos SET status = 'exporting', approved_version = ?, eta_at = ?, updated_at = ? WHERE id = ?")
    .run(v.number, now() + EXPORT_ETA_MINUTES * 60e3, now(), video.id);
  addSystemMessage(video.id, `${client.name.split(' ')[0]} approved version ${v.number} for export.`);
  notify.approved(video.id, v.number);
}

/** Admin delivers: a final file (new upload, an Exports render, or the approved version) and/or a Drive link. */
export function deliver(video, { filePath = null, driveUrl = '' }) {
  if (video.status !== 'exporting') throw Object.assign(new Error('Deliver after the client approves.'), { status: 409 });
  if (!filePath && !driveUrl) throw Object.assign(new Error('Add a final file or a Google Drive link.'), { status: 400 });
  const finalId = tx(() => {
    const id = filePath ? insertFile(video, 'final', filePath, path.basename(filePath)) : null;
    db.prepare("UPDATE videos SET status = 'delivered', final_drive_url = ?, delivered_at = ?, eta_at = NULL, updated_at = ? WHERE id = ?")
      .run(driveUrl || null, now(), now(), video.id);
    return id;
  });
  if (finalId) makePoster(finalId, filePath);
  addSystemMessage(video.id, 'Final video delivered.');
  notify.delivered(video.id);
}

/** Name for an uploaded or copied edit: "<Title>-v3.mp4" / "<Title>-final.mp4". */
export function editFileName(video, suffix, sourceName) {
  const ext = extOf(sourceName) || 'mp4';
  return `${cleanName(video.title, 'video')}-${suffix}.${ext}`;
}
