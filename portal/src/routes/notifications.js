// The studio's notifications: the bell in the admin panel, the list, and phone notifications (Web Push).
import { Router } from 'express';
import { db, now } from '../db.js';
import { requireAdmin } from '../auth.js';
import {
  listNotifications, unreadNotificationCount, pushPublicKey, savePushSubscription, removePushSubscription,
  pushDeviceCount, pushToStudio,
} from '../studio-alerts.js';
import { notificationsPage } from '../views/notifications.js';

export const notificationRoutes = Router();

function requireAdminApi(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(404).json({ error: 'Not found.' });
  next();
}
notificationRoutes.use('/admin/notifications', requireAdmin);
notificationRoutes.use(['/admin/api/notifications', '/admin/api/push'], requireAdminApi);

notificationRoutes.get('/admin/notifications', (req, res) => {
  res.send(notificationsPage(req, { items: listNotifications(), devices: pushDeviceCount(req.user.id), publicKey: pushPublicKey }));
});

// Opening a notification marks it read and goes to its project.
notificationRoutes.get('/admin/notifications/:id/open', (req, res) => {
  const n = db.prepare('SELECT * FROM notifications WHERE id = ?').get(Number(req.params.id));
  if (!n) return res.redirect('/admin/notifications');
  db.prepare('UPDATE notifications SET read_at = ? WHERE id = ? AND read_at IS NULL').run(now(), n.id);
  res.redirect(n.video_id ? `/admin/videos/${n.video_id}${n.kind === 'message' ? '#chat' : ''}` : '/admin/notifications');
});

notificationRoutes.post('/admin/notifications/read-all', (req, res) => {
  db.prepare('UPDATE notifications SET read_at = ? WHERE read_at IS NULL').run(now());
  res.redirect(303, '/admin/notifications');
});

// Live bell: unread count and the newest notification.
notificationRoutes.get('/admin/api/notifications', (req, res) => {
  const latest = db.prepare('SELECT id, title FROM notifications ORDER BY id DESC LIMIT 1').get() || null;
  res.json({ unread: unreadNotificationCount(), latest });
});

notificationRoutes.post('/admin/api/push/subscribe', (req, res) => {
  try {
    savePushSubscription(req.user.id, req.body?.subscription, req.get('user-agent'));
    res.json({ ok: true, devices: pushDeviceCount(req.user.id) });
  } catch {
    res.status(400).json({ error: 'This browser sent an invalid subscription.' });
  }
});
notificationRoutes.post('/admin/api/push/unsubscribe', (req, res) => {
  removePushSubscription(req.body?.endpoint);
  res.json({ ok: true, devices: pushDeviceCount(req.user.id) });
});
notificationRoutes.post('/admin/api/push/test', async (req, res) => {
  await pushToStudio({ title: 'Notifications are on', body: 'You’ll hear about new projects, messages, changes and approvals here.', url: '/admin/notifications', tag: 'test' });
  res.json({ ok: true, devices: pushDeviceCount(req.user.id) });
});

