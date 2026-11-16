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
                    CHECK (status IN ('draft','editing','review','changes','exporting','delivered')),
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
    file_id    INTEGER NOT NULL REFERENCES files(id),
    note       TEXT,
    created_at INTEGER NOT NULL,
    UNIQUE (video_id, number)
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

// Small additive migrations for databases created by earlier phases.
function addColumn(table, column, ddl) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  if (!cols.includes(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
}
addColumn('videos', 'style_id', 'style_id INTEGER REFERENCES styles(id) ON DELETE SET NULL');
addColumn('videos', 'style_name', 'style_name TEXT'); // snapshot, survives the style being deleted
addColumn('videos', 'approved_version', 'approved_version INTEGER'); // version number the client approved for export

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
