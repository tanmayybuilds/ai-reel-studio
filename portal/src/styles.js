// Style library: sample reels the studio has edited. Clients without a reference pick one of these.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { db, now } from './db.js';
import { config } from './config.js';
import { checkDriveAccess, parseDriveUrl, DRIVE_PROBLEM } from './drive.js';

const run = promisify(execFile);
export const MAX_STYLES = 5;
export const stylesRoot = path.join(config.dataDir, 'styles');
const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const FFPROBE = process.env.FFPROBE || 'ffprobe';

export const listStyles = ({ activeOnly = false } = {}) =>
  db.prepare(`SELECT * FROM styles ${activeOnly ? 'WHERE active = 1' : ''} ORDER BY active DESC, sort, id`).all();

export const getStyle = (id) => db.prepare('SELECT * FROM styles WHERE id = ?').get(Number(id)) || null;
export const activeCount = () => db.prepare('SELECT COUNT(*) AS n FROM styles WHERE active = 1').get().n;

export async function createDriveStyle({ link, name, description = '' }) {
  const d = parseDriveUrl(link);
  if (!d.ok || d.kind !== 'file') throw new Error('Use a Google Drive video file link for the style preview.');
  const access = await checkDriveAccess(d.url);
  if (access !== 'shared') throw new Error(DRIVE_PROBLEM[access] || DRIVE_PROBLEM.unknown);
  const title = name.trim().slice(0, 60);
  if (!title) throw new Error('Give the style a name.');
  const sort = (db.prepare('SELECT MAX(sort) AS m FROM styles').get().m || 0) + 1;
  const info = db.prepare('INSERT INTO styles (name, description, source_name, dir, drive_url, active, sort, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(title, description.trim().slice(0, 240) || null, 'Google Drive', '', d.url, activeCount() < MAX_STYLES ? 1 : 0, sort, now());
  return getStyle(Number(info.lastInsertRowid));
}

async function duration(file) {
  try {
    const { stdout } = await run(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]);
    return Number(stdout.trim()) || 0;
  } catch {
    return 0;
  }
}

/**
 * Make a style from a finished reel. The original is never touched: we write a light 720p
 * preview (fast to stream to clients) and a poster frame into data/styles/<id>/.
 * Without ffmpeg the original is copied as the preview and there's no poster.
 */
export async function createStyle({ file, name, description = '', sourceName = '' }) {
  const t = now();
  const sort = (db.prepare('SELECT MAX(sort) AS m FROM styles').get().m || 0) + 1;
  const info = db.prepare('INSERT INTO styles (name, description, source_name, dir, active, sort, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(name.trim().slice(0, 60), description.trim().slice(0, 240) || null, sourceName || path.basename(file), '', activeCount() < MAX_STYLES ? 1 : 0, sort, t);
  const id = Number(info.lastInsertRowid);
  const dir = path.join(stylesRoot, String(id));
  await fsp.mkdir(dir, { recursive: true });
  db.prepare('UPDATE styles SET dir = ? WHERE id = ?').run(dir, id);

  const preview = path.join(dir, 'preview.mp4');
  const poster = path.join(dir, 'poster.jpg');
  try {
    await run(FFMPEG, ['-v', 'error', '-y', '-i', file, '-vf', 'scale=720:-2', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '26',
      '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', preview], { timeout: 10 * 60e3 });
    const at = Math.max(0.5, (await duration(file)) * 0.22);
    await run(FFMPEG, ['-v', 'error', '-y', '-ss', at.toFixed(2), '-i', file, '-frames:v', '1', '-vf', 'scale=540:-2', '-q:v', '4', poster]);
  } catch (err) {
    console.warn(`ffmpeg unavailable or failed (${err.message.split('\n')[0]}); using the original file as the preview.`);
    await fsp.copyFile(file, preview);
  }
  return getStyle(id);
}

export async function deleteStyle(style) {
  db.prepare('DELETE FROM styles WHERE id = ?').run(style.id);
  // Only our preview copy lives here; the studio's original reel is untouched.
  if (style.dir.startsWith(stylesRoot + path.sep)) await fsp.rm(style.dir, { recursive: true, force: true });
}

export const stylePreviewPath = (style) => style.dir ? path.join(style.dir, 'preview.mp4') : null;
export const stylePosterPath = (style) => {
  if (!style.dir) return null;
  const p = path.join(style.dir, 'poster.jpg');
  return fs.existsSync(p) ? p : null;
};

/** Finished reels in Approved Videos/ that could become styles. */
export function approvedReels() {
  const root = path.join(config.studioRoot, 'Approved Videos');
  if (!fs.existsSync(root)) return [];
  const used = new Set(listStyles().map((s) => s.source_name));
  const out = [];
  for (const folder of fs.readdirSync(root, { withFileTypes: true })) {
    if (!folder.isDirectory()) continue;
    for (const f of fs.readdirSync(path.join(root, folder.name))) {
      if (/\.(mp4|mov|m4v)$/i.test(f)) out.push({ folder: folder.name, file: f, path: path.join(root, folder.name, f), used: used.has(f) });
    }
  }
  return out;
}
