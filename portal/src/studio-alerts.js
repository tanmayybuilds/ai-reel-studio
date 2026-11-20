// Studio notifications: every event the editor should know about is saved (the bell in the admin
// panel) and pushed to the editor's phones/computers that turned notifications on (Web Push).
import fs from 'node:fs';
import path from 'node:path';
import webpush from 'web-push';
import { db, now } from './db.js';
import { config } from './config.js';

// ---------- VAPID keys (identify this portal to the browsers' push services) ----------

const keyFile = path.join(config.dataDir, 'vapid.json');
function loadKeys() {
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    return { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
  }
  try {
    return JSON.parse(fs.readFileSync(keyFile, 'utf8'));
  } catch {
    const keys = webpush.generateVAPIDKeys();
    fs.mkdirSync(config.dataDir, { recursive: true });
    fs.writeFileSync(keyFile, JSON.stringify(keys), { mode: 0o600 });
    return keys;
  }
}
const vapid = loadKeys();
webpush.setVapidDetails(config.adminUrl.startsWith('https://') ? config.adminUrl : `mailto:${config.mail.alertTo || 'studio@example.com'}`, vapid.publicKey, vapid.privateKey);
export const pushPublicKey = vapid.publicKey;

// ---------- subscriptions ----------

export function savePushSubscription(userId, sub, userAgent = '') {
  if (!sub || typeof sub.endpoint !== 'string' || !/^https:\/\//.test(sub.endpoint) || sub.endpoint.length > 1000) throw new Error('Bad subscription');
  if (!sub.keys?.p256dh || !sub.keys?.auth) throw new Error('Bad subscription');
  db.prepare(`INSERT INTO push_subscriptions (user_id, endpoint, keys, user_agent, created_at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, keys = excluded.keys, user_agent = excluded.user_agent`)
    .run(userId, sub.endpoint, JSON.stringify({ p256dh: String(sub.keys.p256dh), auth: String(sub.keys.auth) }), String(userAgent).slice(0, 200), now());
}
export const removePushSubscription = (endpoint) => db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(String(endpoint || ''));
export const pushDeviceCount = (userId) => db.prepare('SELECT COUNT(*) AS n FROM push_subscriptions WHERE user_id = ?').get(userId).n;

/** Send one notification to every device the admin turned on. Dead subscriptions are removed. */
export async function pushToStudio({ title, body, url, tag }) {
  const subs = db.prepare("SELECT s.* FROM push_subscriptions s JOIN users u ON u.id = s.user_id WHERE u.role = 'admin'").all();
  const payload = JSON.stringify({ title, body, url, tag });
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: JSON.parse(s.keys) }, payload, { TTL: 24 * 3600, urgency: 'high' });
    } catch (err) {
      if ([404, 410].includes(err.statusCode)) removePushSubscription(s.endpoint);
      else console.warn('push failed:', err.statusCode || err.message);
    }
  }));
}

// ---------- notifications ----------

export const unreadNotificationCount = () => db.prepare('SELECT COUNT(*) AS n FROM notifications WHERE read_at IS NULL').get().n;
export const listNotifications = (limit = 100) => db.prepare(`
  SELECT n.*, v.title AS video_title FROM notifications n LEFT JOIN videos v ON v.id = n.video_id
  ORDER BY n.id DESC LIMIT ?`).all(limit);

/**
 * Tell the studio something happened. Chat messages on the same project within 10 minutes are folded
 * into one notification, so a burst of messages doesn't buzz the phone ten times.
 */
export function alertStudio(kind, videoId, title, body = '') {
  const text = String(body).replace(/\s+/g, ' ').trim().slice(0, 240);
  let id;
  const recent = kind === 'message'
    ? db.prepare("SELECT id FROM notifications WHERE kind = 'message' AND video_id = ? AND read_at IS NULL AND created_at > ? ORDER BY id DESC LIMIT 1")
      .get(videoId, now() - 10 * 60e3)
    : null;
  if (recent) {
    db.prepare('UPDATE notifications SET title = ?, body = ?, created_at = ? WHERE id = ?').run(title, text, now(), recent.id);
    id = recent.id;
  } else {
    id = Number(db.prepare('INSERT INTO notifications (kind, video_id, title, body, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(kind, videoId, title, text, now()).lastInsertRowid);
  }
  pushToStudio({ title, body: text, url: `/admin/notifications/${id}/open`, tag: `video-${videoId}-${kind}` }).catch(() => {});
  return id;
}
