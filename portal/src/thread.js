// Chat thread + live state for one video, shared by the client page and the admin workspace.
import { db, now } from './db.js';
import { config } from './config.js';

export const MAX_MESSAGE = 4000;

export function listMessages(videoId, viewer, afterId = 0) {
  return db.prepare(`
    SELECT m.id, m.kind, m.body, m.created_at, m.sender_id, u.role AS sender_role, u.name AS sender_name
    FROM messages m LEFT JOIN users u ON u.id = m.sender_id
    WHERE m.video_id = ? AND m.id > ? ORDER BY m.id`).all(videoId, afterId)
    .map((m) => toPublic(m, viewer));
}

export function toPublic(m, viewer) {
  const mine = m.sender_id === viewer.id;
  let author = 'Studio';
  if (m.kind === 'system') author = '';
  else if (mine) author = 'You';
  else if (m.sender_role === 'admin') author = config.portalName;
  else author = m.sender_name || 'Client';
  return { id: m.id, kind: m.kind, body: m.body, created_at: m.created_at, mine, author };
}

/** Mark everything the other side sent as read by this viewer. */
export function markRead(videoId, viewer) {
  const col = viewer.role === 'admin' ? 'read_by_admin' : 'read_by_client';
  db.prepare(`UPDATE messages SET ${col} = 1 WHERE video_id = ? AND ${col} = 0`).run(videoId);
}

export function addMessage(videoId, sender, body, kind = 'chat') {
  const t = now();
  const fromAdmin = sender?.role === 'admin';
  const info = db.prepare(`
    INSERT INTO messages (video_id, sender_id, kind, body, read_by_admin, read_by_client, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(videoId, sender?.id ?? null, kind, body, fromAdmin || !sender ? 1 : 0, !fromAdmin || !sender ? 1 : 0, t);
  db.prepare('UPDATE videos SET updated_at = ? WHERE id = ?').run(t, videoId);
  return db.prepare(`
    SELECT m.*, u.role AS sender_role, u.name AS sender_name FROM messages m LEFT JOIN users u ON u.id = m.sender_id
    WHERE m.id = ?`).get(info.lastInsertRowid);
}

/** System note visible to both sides (e.g. "Video sent", "Estimate updated"). */
export function addSystemMessage(videoId, body) {
  const t = now();
  db.prepare("INSERT INTO messages (video_id, sender_id, kind, body, read_by_admin, read_by_client, created_at) VALUES (?, NULL, 'system', ?, 1, 1, ?)")
    .run(videoId, body, t);
}

export function videoState(video, viewer, afterId) {
  const messages = listMessages(video.id, viewer, afterId);
  markRead(video.id, viewer);
  return {
    now: now(),
    status: video.status,
    eta_at: video.eta_at,
    submitted_at: video.submitted_at,
    updated_at: video.updated_at,
    editing_stage: video.editing_stage,
    drive_check_result: video.drive_check_result,
    messages,
  };
}

/** Express handlers for GET state + POST message, given a function that loads the video for this user. */
export function threadHandlers(loadVideo) {
  return {
    state(req, res) {
      const video = loadVideo(req);
      if (!video) return res.status(404).json({ error: 'Video not found.' });
      res.json(videoState(video, req.user, Number(req.query.after) || 0));
    },
    post(req, res) {
      const video = loadVideo(req);
      if (!video) return res.status(404).json({ error: 'Video not found.' });
      const body = String(req.body?.body || '').replace(/\r\n/g, '\n').trim();
      if (!body) return res.status(400).json({ error: 'Type a message first.' });
      if (body.length > MAX_MESSAGE) return res.status(400).json({ error: `Messages can be up to ${MAX_MESSAGE} characters.` });
      const m = addMessage(video.id, req.user, body);
      res.status(201).json(toPublic(m, req.user));
    },
  };
}

/** Unread counts for badges. */
export function unreadForClient(videoId) {
  return db.prepare("SELECT COUNT(*) AS n FROM messages WHERE video_id = ? AND read_by_client = 0").get(videoId).n;
}
export function unreadForAdmin(videoId) {
  return db.prepare("SELECT COUNT(*) AS n FROM messages WHERE video_id = ? AND read_by_admin = 0").get(videoId).n;
}
