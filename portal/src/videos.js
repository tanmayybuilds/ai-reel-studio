import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { db, now } from './db.js';
import { addSystemMessage } from './thread.js';
import { notify } from './notify.js';
import { config } from './config.js';
import { rawRoot, stagingRoot, cleanName, uniquePath, moveFile, humanSize } from './storage.js';
import { recordJobEvent } from './jobs.js';

export const STATUS = {
  draft: { label: 'Draft', cls: 'muted' },
  queued: { label: 'Queued', cls: 'accent' },
  on_hold: { label: 'On hold', cls: 'warn' },
  cancelled: { label: 'Cancelled', cls: 'muted' },
  editing: { label: 'Editing', cls: 'accent' },
  review: { label: 'Ready to review', cls: 'ok' },
  changes: { label: 'Changes requested', cls: 'warn' },
  exporting: { label: 'Preparing final', cls: 'accent' },
  delivered: { label: 'Delivered', cls: 'done' },
};

export function createDraft(user, title) {
  const t = now();
  const info = db.prepare(`
    INSERT INTO videos (client_id, title, folder, status, notify_email, created_at, updated_at)
    VALUES (?, ?, '', 'draft', ?, ?, ?)`).run(user.id, title.trim().slice(0, 120) || 'Untitled video', user.email, t, t);
  return db.prepare('SELECT * FROM videos WHERE id = ?').get(info.lastInsertRowid);
}

export const getOwnedDraft = (id, userId) =>
  db.prepare("SELECT * FROM videos WHERE id = ? AND client_id = ? AND status = 'draft'").get(Number(id), userId) || null;

export const latestDraft = (userId) =>
  db.prepare("SELECT * FROM videos WHERE client_id = ? AND status = 'draft' ORDER BY updated_at DESC LIMIT 1").get(userId) || null;

export const filesOf = (videoId) =>
  db.prepare('SELECT * FROM files WHERE video_id = ? ORDER BY kind, id').all(videoId);

/** Raw/<this name>/ for a client. Two clients with the same name get different folders. */
export function clientFolder(client) {
  const base = cleanName(client.name, `Client ${client.id}`);
  const clash = db.prepare("SELECT id, name FROM users WHERE role = 'client' AND id < ?").all(client.id)
    .some((u) => cleanName(u.name).toLowerCase() === base.toLowerCase());
  return clash ? `${base} (${client.id})` : base;
}

function videoFolderName(title, when) {
  const d = new Date(when);
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return `${date} ${cleanName(title, 'Untitled video')}`;
}

/**
 * Turn a draft into a submitted job: move its uploads from staging into
 * Raw/<Client>/<YYYY-MM-DD Title>/ (screenshots in Assets/), write brief.md, start the ETA clock.
 */
export async function submitDraft(video, client, fields) {
  const submittedAt = now();
  const clientDir = path.join(rawRoot, clientFolder(client));
  let videoDir = path.join(clientDir, videoFolderName(fields.title, submittedAt));
  for (let i = 2; fs.existsSync(videoDir); i++) videoDir = path.join(clientDir, `${videoFolderName(fields.title, submittedAt)} (${i})`);
  await fsp.mkdir(videoDir, { recursive: true });

  const files = filesOf(video.id).filter((f) => f.complete);
  for (const f of files) {
    const dir = f.kind === 'asset' ? path.join(videoDir, 'Assets') : videoDir;
    await fsp.mkdir(dir, { recursive: true });
    const dest = uniquePath(dir, cleanName(f.original_name));
    await moveFile(f.stored_path, dest);
    db.prepare('UPDATE files SET stored_path = ? WHERE id = ?').run(dest, f.id);
    f.stored_path = dest;
  }
  // Half-finished uploads the client gave up on are dropped with the staging folder.
  db.prepare('DELETE FROM files WHERE video_id = ? AND complete = 0').run(video.id);
  await fsp.rm(path.join(stagingRoot, String(video.id)), { recursive: true, force: true });

  db.prepare(`
    UPDATE videos SET title = ?, folder = ?, status = 'queued', reference_url = ?, drive_url = ?, notes = ?,
      notify_email = ?, eta_at = NULL, submitted_at = ?, updated_at = ?, style_id = ?, style_name = ?,
      drive_checked_at = ?, drive_check_result = 'shared' WHERE id = ?`)
    .run(fields.title, path.relative(config.studioRoot, videoDir), fields.reference_url || null, fields.drive_url || null,
      fields.notes || null, fields.notify_email, submittedAt, submittedAt, fields.style_id || null, fields.style_name || null, submittedAt, video.id);
  recordJobEvent(video.id, client.id, 'submitted', 'Drive access verified. Your video is in the studio queue.');
  if (fields.style_name) addSystemMessage(video.id, `Style picked: ${fields.style_name}`);
  else if (fields.reference_url) addSystemMessage(video.id, 'Reference reel shared.');

  await fsp.writeFile(path.join(videoDir, 'brief.md'), briefMarkdown(client, fields, files, submittedAt, video.id));
  notify.newVideo(video.id);
  return db.prepare('SELECT * FROM videos WHERE id = ?').get(video.id);
}

function briefMarkdown(client, f, files, at, id) {
  const line = (label, v) => (v ? `- **${label}:** ${v}\n` : '');
  const list = (kind) => files.filter((x) => x.kind === kind)
    .map((x) => `  - ${path.basename(x.stored_path)} (${humanSize(x.size)}, sha256 ${x.sha256})\n`).join('');
  return `# ${f.title}\n\n` +
    line('Client', `${client.name}${client.company ? ` (${client.company})` : ''}, ${client.email}`) +
    line('Submitted', new Date(at).toLocaleString('en-GB')) +
    line('Portal video id', id) +
    line('Updates go to', f.notify_email) +
    line('Reference reel', f.reference_url) +
    line('Style picked (no reference)', f.style_name) +
    line('Raw footage on Google Drive', f.drive_url) +
    (list('raw') ? `- **Raw footage:**\n${list('raw')}` : '') +
    (list('voiceover') ? `- **Voiceover:**\n${list('voiceover')}` : '') +
    (list('asset') ? `- **Assets (in Assets/):**\n${list('asset')}` : '') +
    (f.notes ? `\n## Client notes\n\n${f.notes}\n` : '');
}

export async function discardDraft(video) {
  await fsp.rm(path.join(stagingRoot, String(video.id)), { recursive: true, force: true });
  db.prepare("DELETE FROM videos WHERE id = ? AND status = 'draft'").run(video.id);
}
