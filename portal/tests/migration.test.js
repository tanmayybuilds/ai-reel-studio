import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';

test('legacy database migration preserves jobs, versions, messages and foreign keys, with a backup', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reel-migration-'));
  try {
    const d = new DatabaseSync(path.join(dir, 'portal.db'));
    d.exec(`PRAGMA foreign_keys = OFF;
    CREATE TABLE videos (
      id INTEGER PRIMARY KEY, client_id INTEGER NOT NULL REFERENCES users(id), title TEXT NOT NULL,
      folder TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','editing','review','changes','exporting','delivered')),
      reference_url TEXT, drive_url TEXT, notes TEXT, notify_email TEXT NOT NULL, eta_at INTEGER,
      final_drive_url TEXT, submitted_at INTEGER, delivered_at INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
      style_id INTEGER REFERENCES styles(id), style_name TEXT, approved_version INTEGER
    );
    CREATE INDEX videos_client ON videos(client_id);
    CREATE TABLE users (id INTEGER PRIMARY KEY, role TEXT NOT NULL, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
      company TEXT, password_hash TEXT NOT NULL, disabled INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, last_login_at INTEGER);
    INSERT INTO users (id, role, name, email, password_hash, created_at) VALUES (1, 'client', 'Existing client', 'old@example.test', 'hash', 1);
    INSERT INTO videos (id, client_id, title, folder, status, notify_email, created_at, updated_at, approved_version)
      VALUES (7, 1, 'Existing reel', 'Raw/Existing reel', 'review', 'old@example.test', 1, 2, NULL);
    CREATE TABLE messages (id INTEGER PRIMARY KEY, video_id INTEGER NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
      sender_id INTEGER REFERENCES users(id), kind TEXT NOT NULL DEFAULT 'chat', body TEXT NOT NULL,
      read_by_admin INTEGER NOT NULL DEFAULT 0, read_by_client INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL);
    INSERT INTO messages (id, video_id, sender_id, body, created_at) VALUES (9, 7, 1, 'Keep this message', 2);
    CREATE TABLE versions (id INTEGER PRIMARY KEY, video_id INTEGER NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
      number INTEGER NOT NULL, file_id INTEGER REFERENCES files(id), link TEXT, note TEXT, created_at INTEGER NOT NULL, UNIQUE(video_id, number));
    INSERT INTO versions (id, video_id, number, link, created_at) VALUES (3, 7, 1, 'https://drive.google.com/file/d/1PUBLIC000000/view', 2);
    CREATE TABLE sessions (id TEXT PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      csrf TEXT NOT NULL, flash TEXT, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL);
    INSERT INTO sessions (id, user_id, csrf, created_at, expires_at) VALUES ('orphan', 999, 'token', 1, 9999999999999);`);
    d.close();
    const run = spawnSync(process.execPath, ['--input-type=module', '-e', `
      import { db } from './src/db.js';
      import assert from 'node:assert/strict';
      assert.equal(db.prepare('SELECT title FROM videos WHERE id = 7').get().title, 'Existing reel');
      assert.equal(db.prepare('SELECT body FROM messages WHERE id = 9').get().body, 'Keep this message');
      assert.equal(db.prepare('SELECT number FROM versions WHERE id = 3').get().number, 1);
      assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
      assert.equal(db.prepare('SELECT COUNT(*) AS n FROM sessions').get().n, 0, 'unusable old sign-ins are removed');
      assert.equal(db.prepare('SELECT foreign_keys FROM pragma_foreign_keys').get().foreign_keys, 1);
      db.prepare("UPDATE videos SET status = 'on_hold' WHERE id = 7").run();
      assert.equal(db.prepare('SELECT COUNT(*) AS n FROM messages').get().n, 1);
      db.close();
    `], { cwd: process.cwd(), env: { ...process.env, PORTAL_DATA_DIR: dir }, encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
    assert.equal(fs.readdirSync(path.join(dir, 'backups')).filter((n) => n.startsWith('before-job-controls-')).length, 1);
    const rerun = spawnSync(process.execPath, ['--input-type=module', '-e', "import { db } from './src/db.js'; db.close();"],
      { env: { ...process.env, PORTAL_DATA_DIR: dir }, encoding: 'utf8' });
    assert.equal(rerun.status, 0, rerun.stderr);
    assert.equal(fs.readdirSync(path.join(dir, 'backups')).length, 1, 'migration is idempotent');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
