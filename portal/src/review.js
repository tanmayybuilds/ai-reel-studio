// Edited versions, review, change requests, approval and delivery.
// New versions and finals are shared Google Drive links, so the portal stores no video files.
// Videos from before the switch may still have stored files; those keep working.
import fs from 'node:fs';
import path from 'node:path';
import { db, now, tx } from './db.js';
import { config } from './config.js';
import { addSystemMessage, addMessage } from './thread.js';
import { notify } from './notify.js';

const EXPORT_ETA_MINUTES = Number(process.env.EXPORT_ETA_MINUTES || 15);
const postersRoot = path.join(config.dataDir, 'posters');

const VERSION_COLUMNS = 'v.*, f.stored_path, f.size, f.original_name';
export const listVersions = (videoId) => db.prepare(`
  SELECT ${VERSION_COLUMNS} FROM versions v LEFT JOIN files f ON f.id = v.file_id
  WHERE v.video_id = ? ORDER BY v.number`).all(videoId);

export const latestVersion = (videoId) => db.prepare(`
  SELECT ${VERSION_COLUMNS} FROM versions v LEFT JOIN files f ON f.id = v.file_id
  WHERE v.video_id = ? ORDER BY v.number DESC LIMIT 1`).get(videoId) || null;

/** A stored final file (older videos only; new finals are Drive links in videos.final_drive_url). */
export const finalFile = (videoId) =>
  db.prepare("SELECT * FROM files WHERE video_id = ? AND kind = 'final' ORDER BY id DESC LIMIT 1").get(videoId) || null;

export const lastChangeRequest = (videoId) =>
  db.prepare("SELECT * FROM messages WHERE video_id = ? AND kind = 'changes' ORDER BY id DESC LIMIT 1").get(videoId) || null;

/** Poster frame of a stored edit (older videos only). */
export const posterPath = (fileId) => {
  if (!fileId) return null;
  const p = path.join(postersRoot, `${fileId}.jpg`);
  return fs.existsSync(p) ? p : null;
};

export const nextVersionNumber = (videoId) =>
  (db.prepare('SELECT MAX(number) AS n FROM versions WHERE video_id = ?').get(videoId).n || 0) + 1;

// ---------- steps ----------

const conflict = (msg) => Object.assign(new Error(msg), { status: 409 });

/**
 * Move a video from one status to the next in a single guarded UPDATE, so two clicks (or two tabs)
 * can never both succeed. Throws 409 if the video was no longer in one of the `from` states.
 */
function transition(videoId, from, set, params, message) {
  const r = db.prepare(`UPDATE videos SET ${set}, updated_at = ? WHERE id = ? AND status IN (${from.map(() => '?').join(',')})`)
    .run(...params, now(), videoId, ...from);
  if (r.changes !== 1) throw conflict(message);
}

/** Admin sends an edited cut as a Drive link: it becomes v(N+1) and the client is asked to review it. */
export function addVersion(video, link, note = '') {
  const version = tx(() => {
    transition(video.id, ['editing', 'changes', 'review'], "status = 'review', eta_at = NULL", [], 'This video isn’t waiting for an edit.');
    const number = nextVersionNumber(video.id);
    db.prepare('INSERT INTO versions (video_id, number, link, note, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(video.id, number, link, note.trim().slice(0, 2000) || null, now());
    return { number, link };
  });
  addSystemMessage(video.id, `Version ${version.number} is ready to review.`);
  notify.versionReady(video.id, { number: version.number, note: note.trim(), link });
  return version;
}

/** The client must be answering about the version they actually watched. */
function checkWatched(video, versionNumber) {
  const v = latestVersion(video.id);
  if (!v) throw conflict('There’s no version to review yet.');
  if (versionNumber && Number(versionNumber) !== v.number) {
    throw conflict(`A newer version (v${v.number}) just arrived. Have a look at it first.`);
  }
  return v;
}

export function requestChanges(video, client, text, versionNumber) {
  const v = checkWatched(video, versionNumber);
  tx(() => {
    transition(video.id, ['review'], "status = 'changes', eta_at = ?", [now() + config.defaultEtaMinutes * 60e3], 'This version can’t be changed right now.');
    addMessage(video.id, client, text, 'changes');
  });
  notify.changes(video.id, v.number, text);
}

export function approve(video, client, versionNumber) {
  const v = checkWatched(video, versionNumber);
  transition(video.id, ['review'], "status = 'exporting', approved_version = ?, eta_at = ?", [v.number, now() + EXPORT_ETA_MINUTES * 60e3], 'There’s nothing to approve right now.');
  addSystemMessage(video.id, `${client.name.split(' ')[0]} approved version ${v.number} for export.`);
  notify.approved(video.id, v.number);
}

/** Admin delivers the final video as a Drive link. */
export function deliver(video, driveUrl) {
  if (!driveUrl) throw Object.assign(new Error('Add the Google Drive link to the final video.'), { status: 400 });
  transition(video.id, ['exporting'], "status = 'delivered', final_drive_url = ?, delivered_at = ?, eta_at = NULL", [driveUrl, now()], 'Deliver after the client approves.');
  addSystemMessage(video.id, 'Final video delivered.');
  notify.delivered(video.id);
}
