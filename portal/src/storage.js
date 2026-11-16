import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { config } from './config.js';

/** Uploads are staged here while the client fills in the form, then moved into Raw/ on submit. */
export const stagingRoot = path.join(config.dataDir, 'uploads');
export const rawRoot = path.join(config.studioRoot, 'Raw');
export const exportsRoot = path.join(config.studioRoot, 'Exports');

export const CHUNK_SIZE = 32 * 1024 * 1024; // under Cloudflare's 100 MB request cap when we go live
export const MAX_FILE_SIZE = 50 * 1024 ** 3;
export const MAX_FILES_PER_VIDEO = 60;
const FREE_SPACE_MARGIN = 2 * 1024 ** 3;

export const ALLOWED = {
  raw: { exts: ['mp4', 'mov', 'm4v', 'mkv', 'webm', 'mts', 'avi'], label: 'MP4, MOV, M4V, MKV, WEBM, MTS or AVI' },
  voiceover: { exts: ['wav', 'mp3', 'm4a', 'aac', 'aif', 'aiff', 'flac'], label: 'WAV, MP3, M4A, AAC, AIFF or FLAC' },
  asset: { exts: ['png', 'jpg', 'jpeg', 'webp', 'heic', 'gif', 'mp4', 'mov', 'm4v', 'webm'], label: 'images (PNG, JPG, WEBP, HEIC) or screen recordings (MP4, MOV)' },
};

export const extOf = (name) => (path.extname(name).slice(1) || '').toLowerCase();

/** Safe file/folder name for macOS, Windows and Linux. */
export function cleanName(name, fallback = 'file') {
  const cleaned = String(name)
    .normalize('NFC')
    .replace(/[\u0000-\u001f\u007f/\\:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s.]+|[\s.]+$/g, '')
    .slice(0, 90)
    .trim();
  return cleaned || fallback;
}

/** Returns a path that doesn't exist yet: "x.mp4", "x (2).mp4", ... Nothing is ever overwritten. */
export function uniquePath(dir, name) {
  const ext = path.extname(name);
  const base = name.slice(0, name.length - ext.length);
  let candidate = path.join(dir, name);
  for (let i = 2; fs.existsSync(candidate); i++) candidate = path.join(dir, `${base} (${i})${ext}`);
  return candidate;
}

export function freeBytes(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const s = fs.statfsSync(dir);
  return Number(s.bavail) * Number(s.bsize);
}
export const hasRoomFor = (bytes) => freeBytes(stagingRoot) > bytes + FREE_SPACE_MARGIN;

/** Move a file, falling back to copy + delete when source and target are on different disks. */
export async function moveFile(from, to) {
  await fsp.mkdir(path.dirname(to), { recursive: true });
  try {
    await fsp.rename(from, to);
  } catch (err) {
    if (err.code !== 'EXDEV') throw err;
    await fsp.copyFile(from, to, fs.constants.COPYFILE_EXCL);
    await fsp.unlink(from);
  }
}

export async function sha256File(file) {
  const hash = crypto.createHash('sha256');
  await pipeline(fs.createReadStream(file), hash);
  return hash.digest('hex');
}

export function humanSize(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const v = bytes / 1024 ** i;
  return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}

export const isHttpUrl = (s) => {
  try {
    const u = new URL(s);
    return (u.protocol === 'https:' || u.protocol === 'http:') && !!u.hostname.includes('.');
  } catch {
    return false;
  }
};
