// Housekeeping that runs at start-up and then every hour.
import fs from 'node:fs';
import path from 'node:path';
import { db, now } from './db.js';
import { config } from './config.js';
import { purgeExpiredSessions } from './auth.js';
import { discardDraft } from './videos.js';
import { purgeStaleAdminUploads } from './routes/admin-uploads.js';

export const backupsDir = path.join(config.dataDir, 'backups');
const KEEP_BACKUPS = Math.max(1, Number(process.env.BACKUP_KEEP || 14));
// Client drafts (uploads never sent with Continue) untouched this long are removed. 0 keeps them forever.
const DRAFT_DAYS = Number(process.env.DRAFT_RETENTION_DAYS ?? 30);

/** A consistent copy of the database (safe while the portal is running). Returns the file path. */
export function backupDatabase(label = new Date().toISOString().slice(0, 10)) {
  fs.mkdirSync(backupsDir, { recursive: true });
  const file = path.join(backupsDir, `portal-${label}.db`);
  if (fs.existsSync(file)) fs.rmSync(file);
  db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
  const all = fs.readdirSync(backupsDir).filter((f) => /^portal-.*\.db$/.test(f)).sort();
  for (const old of all.slice(0, Math.max(0, all.length - KEEP_BACKUPS))) fs.rmSync(path.join(backupsDir, old), { force: true });
  return file;
}

function dailyBackup() {
  const today = path.join(backupsDir, `portal-${new Date().toISOString().slice(0, 10)}.db`);
  if (!fs.existsSync(today)) {
    try {
      backupDatabase();
    } catch (err) {
      console.warn('database backup failed:', err.message);
    }
  }
}

async function purgeAbandonedDrafts() {
  if (!DRAFT_DAYS) return;
  const old = db.prepare("SELECT * FROM videos WHERE status = 'draft' AND updated_at < ?").all(now() - DRAFT_DAYS * 864e5);
  for (const draft of old) {
    await discardDraft(draft);
    console.log(`Removed draft #${draft.id} (untouched for ${DRAFT_DAYS} days)`);
  }
}

export async function runMaintenance() {
  try {
    purgeExpiredSessions();
    purgeStaleAdminUploads();
    await purgeAbandonedDrafts();
    dailyBackup();
  } catch (err) {
    console.warn('maintenance failed:', err.message);
  }
}
