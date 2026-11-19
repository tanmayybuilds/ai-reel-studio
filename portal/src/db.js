import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { config } from './config.js';

fs.mkdirSync(config.dataDir, { recursive: true });

export const db = new DatabaseSync(path.join(config.dataDir, 'portal.db'));

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  PRAGMA busy_timeout = 5000;

  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY,
    role          TEXT NOT NULL CHECK (role IN ('admin','client')),
    name          TEXT NOT NULL,
    email         TEXT NOT NULL UNIQUE,
    company       TEXT,
    password_hash TEXT NOT NULL,
    disabled      INTEGER NOT NULL DEFAULT 0,
    created_at    INTEGER NOT NULL,
    last_login_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id         TEXT PRIMARY KEY,
    user_id    INTEGER REFERENCES users(id) ON DELETE CASCADE,
    csrf       TEXT NOT NULL,
    flash      TEXT,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);

  -- One row per reel a client asks for.
  CREATE TABLE IF NOT EXISTS videos (
    id              INTEGER PRIMARY KEY,
    client_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title           TEXT NOT NULL,
    folder          TEXT NOT NULL,            -- Raw/<Client>/<folder>/
    status          TEXT NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','queued','editing','review','changes','exporting','delivered','on_hold','cancelled')),
    reference_url   TEXT,
    drive_url       TEXT,                     -- raw footage via Drive instead of upload
    notes           TEXT,
    notify_email    TEXT NOT NULL,
    eta_at          INTEGER,                  -- when the current edit should be ready
    final_drive_url TEXT,
    submitted_at    INTEGER,
    delivered_at    INTEGER,
    created_at      INTEGER NOT NULL,
    updated_at      INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS videos_client ON videos(client_id);

  -- Every file on disk: raw footage, voiceover, assets, edited versions, finals.
  CREATE TABLE IF NOT EXISTS files (
    id            INTEGER PRIMARY KEY,
    video_id      INTEGER NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
    kind          TEXT NOT NULL CHECK (kind IN ('raw','voiceover','asset','version','final')),
    original_name TEXT NOT NULL,
    stored_path   TEXT NOT NULL,              -- absolute path (staging while draft, Raw/ or Exports/ after)
    size          INTEGER NOT NULL,
    received      INTEGER NOT NULL DEFAULT 0, -- bytes received so far (resumable uploads)
    sha256        TEXT,
    complete      INTEGER NOT NULL DEFAULT 0,
    created_at    INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS files_video ON files(video_id);

  -- Edited cuts sent to the client for review: v1, v2, ...
  CREATE TABLE IF NOT EXISTS versions (
    id         INTEGER PRIMARY KEY,
    video_id   INTEGER NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
    number     INTEGER NOT NULL,
    file_id    INTEGER REFERENCES files(id),  -- an uploaded file (older videos)…
    link       TEXT,                          -- …or a shared Google Drive link
    note       TEXT,
    created_at INTEGER NOT NULL,
    UNIQUE (video_id, number),
    CHECK (file_id IS NOT NULL OR link IS NOT NULL)
  );

  -- Chat thread per video, including change requests and system notes.
  CREATE TABLE IF NOT EXISTS messages (
    id             INTEGER PRIMARY KEY,
    video_id       INTEGER NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
    sender_id      INTEGER REFERENCES users(id) ON DELETE SET NULL,
    kind           TEXT NOT NULL DEFAULT 'chat' CHECK (kind IN ('chat','changes','system')),
    body           TEXT NOT NULL,
    read_by_admin  INTEGER NOT NULL DEFAULT 0,
    read_by_client INTEGER NOT NULL DEFAULT 0,
    created_at     INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS messages_video ON messages(video_id);

  CREATE TABLE IF NOT EXISTS emails (
    id         INTEGER PRIMARY KEY,
    video_id   INTEGER REFERENCES videos(id) ON DELETE SET NULL,
    to_addr    TEXT NOT NULL,
    subject    TEXT NOT NULL,
    kind       TEXT NOT NULL,
    status     TEXT NOT NULL,                 -- sent | logged | failed
    error      TEXT,
    created_at INTEGER NOT NULL
  );
`);

// Style library: 2-5 sample reels clients can pick instead of sending a reference.
db.exec(`
  CREATE TABLE IF NOT EXISTS styles (
    id          INTEGER PRIMARY KEY,
    name        TEXT NOT NULL,
    description TEXT,
    source_name TEXT,                     -- original file name the sample came from
    dir         TEXT NOT NULL,            -- absolute folder with preview.mp4 + poster.jpg
    active      INTEGER NOT NULL DEFAULT 1,
    sort        INTEGER NOT NULL DEFAULT 0,
    created_at  INTEGER NOT NULL
  );
`);

// The studio's own uploads (edits, finals, style reels) in progress, sent in chunks like the clients'.
db.exec(`
  CREATE TABLE IF NOT EXISTS admin_uploads (
    id         TEXT PRIMARY KEY,
    purpose    TEXT NOT NULL CHECK (purpose IN ('version','final','style')),
    video_id   INTEGER REFERENCES videos(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    size       INTEGER NOT NULL,
    received   INTEGER NOT NULL DEFAULT 0,
    path       TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
`);

// Small additive migrations for databases created by earlier phases.
// Older SQLite CHECK constraints need a table rebuild. Preserve every column/index and take a
// consistent backup first; foreign keys are checked before committing the replacement.
const videosSql = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'videos'").get().sql;
if (!videosSql.includes("'queued'")) {
  const backups = path.join(config.dataDir, 'backups');
  fs.mkdirSync(backups, { recursive: true });
  const backup = path.join(backups, `before-job-controls-${Date.now()}.db`);
  db.exec(`VACUUM INTO '${backup.replace(/'/g, "''")}'`);
  const indexes = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'index' AND tbl_name = 'videos' AND sql IS NOT NULL").all();
  const ddl = videosSql.replace(/^CREATE TABLE\s+videos/i, 'CREATE TABLE videos_new')
    .replace(/CHECK\s*\(status IN\s*\([^)]+\)\)/i,
      "CHECK (status IN ('draft','queued','editing','review','changes','exporting','delivered','on_hold','cancelled'))");
  db.exec('PRAGMA foreign_keys = OFF; BEGIN IMMEDIATE;');
  try {
    // Old demo databases can retain sign-in sessions for removed accounts. They are unusable;
    // clear them just as sessionMiddleware does when one is presented. The backup keeps the original.
    db.exec('DELETE FROM sessions WHERE user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM users WHERE users.id = sessions.user_id)');
    db.exec(ddl);
    db.exec('INSERT INTO videos_new SELECT * FROM videos; DROP TABLE videos; ALTER TABLE videos_new RENAME TO videos;');
    for (const i of indexes) db.exec(i.sql);
    if (db.prepare('PRAGMA foreign_key_check').all().length) throw new Error('Job migration failed foreign-key validation');
    db.exec('COMMIT');
  } catch (err) { db.exec('ROLLBACK'); throw err; }
  finally { db.exec('PRAGMA foreign_keys = ON'); }
}

function addColumn(table, column, ddl) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  if (!cols.includes(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
}
addColumn('videos', 'style_id', 'style_id INTEGER REFERENCES styles(id) ON DELETE SET NULL');
addColumn('videos', 'style_name', 'style_name TEXT'); // snapshot, survives the style being deleted
addColumn('videos', 'approved_version', 'approved_version INTEGER'); // version number the client approved for export
addColumn('videos', 'resume_status', 'resume_status TEXT');
addColumn('videos', 'status_note', 'status_note TEXT');
addColumn('videos', 'editing_stage', 'editing_stage INTEGER NOT NULL DEFAULT 0');
addColumn('videos', 'work_started_at', 'work_started_at INTEGER');
addColumn('videos', 'drive_checked_at', 'drive_checked_at INTEGER');
addColumn('videos', 'drive_check_result', "drive_check_result TEXT NOT NULL DEFAULT 'unverified'");
addColumn('styles', 'drive_url', 'drive_url TEXT');

db.exec(`CREATE TABLE IF NOT EXISTS job_events (
  id INTEGER PRIMARY KEY,
  video_id INTEGER NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  detail TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS job_events_video ON job_events(video_id, id);`);

// Versions can be Drive links: databases from before that need file_id made optional (SQLite has to
// rebuild the table for that). Runs once; the data is copied over unchanged.
if (!db.prepare('PRAGMA table_info(versions)').all().some((c) => c.name === 'link')) {
  db.exec(`
    PRAGMA foreign_keys = OFF;
    BEGIN;
    CREATE TABLE versions_new (
      id INTEGER PRIMARY KEY,
      video_id INTEGER NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
      number INTEGER NOT NULL,
      file_id INTEGER REFERENCES files(id),
      link TEXT,
      note TEXT,
      created_at INTEGER NOT NULL,
      UNIQUE (video_id, number),
      CHECK (file_id IS NOT NULL OR link IS NOT NULL)
    );
    INSERT INTO versions_new (id, video_id, number, file_id, note, created_at)
      SELECT id, video_id, number, file_id, note, created_at FROM versions;
    DROP TABLE versions;
    ALTER TABLE versions_new RENAME TO versions;
    COMMIT;
    PRAGMA foreign_keys = ON;
  `);
  console.log('Database updated: versions can now be Google Drive links.');
}

export const now = () => Date.now();

/** Run fn inside a transaction. */
export function tx(fn) {
  db.exec('BEGIN');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
