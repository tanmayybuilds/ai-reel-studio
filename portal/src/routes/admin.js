import { Router } from 'express';
import { db, now } from '../db.js';
import { requireAdmin, hashPassword, generatePassword, normEmail, isEmail, flash } from '../auth.js';
import path from 'node:path';
import fs from 'node:fs';
import { execFile } from 'node:child_process';
import { config } from '../config.js';
import { clientsPage, clientEditPage, queuePage, queueList, workspacePage, QUEUE_FILTERS } from '../views/admin.js';
import { filesOf } from '../videos.js';
import { listMessages, markRead, threadHandlers, addSystemMessage, unreadForAdmin } from '../thread.js';
import { chatPanel } from '../views/chat.js';
import { listVersions, lastChangeRequest, addVersion, deliver } from '../review.js';
import { parseDriveUrl, checkDriveAccess, DRIVE_PROBLEM } from '../drive.js';
import { controlJob, jobHistory, recordJobEvent, recheckFootage, replaceFootage } from '../jobs.js';

export const adminRoutes = Router();

adminRoutes.use('/admin', requireAdmin);

adminRoutes.get('/admin', (req, res) => res.redirect('/admin/queue'));

// ---------- queue ----------

const queueRows = (statuses) => db.prepare(`
  SELECT v.*, u.name AS client_name, u.company,
    (SELECT COUNT(*) FROM messages m WHERE m.video_id = v.id AND m.read_by_admin = 0) AS unread,
    (SELECT COUNT(*) FROM files f WHERE f.video_id = v.id AND f.complete = 1 AND f.kind IN ('raw','voiceover','asset')) AS file_count
  FROM videos v JOIN users u ON u.id = v.client_id
  WHERE v.status IN (${statuses.map(() => '?').join(',')})
  ORDER BY CASE WHEN v.status IN ('editing','changes','exporting') THEN 0 ELSE 1 END,
    CASE WHEN v.status IN ('editing','changes','exporting') THEN v.eta_at END ASC,
    v.updated_at DESC`).all(...statuses);

adminRoutes.get('/admin/queue', (req, res) => {
  const filter = QUEUE_FILTERS.find(([k]) => k === req.query.f) ? req.query.f : 'active';
  const [, , statuses] = QUEUE_FILTERS.find(([k]) => k === filter);
  const videos = queueRows(statuses);
  // live.js asks for just the list every few seconds.
  if (req.get('x-partial')) return res.send(String(queueList(videos)));
  const counts = {};
  for (const [key, , st] of QUEUE_FILTERS) {
    counts[key] = db.prepare(`SELECT COUNT(*) AS n FROM videos WHERE status IN (${st.map(() => '?').join(',')})`).get(...st).n;
  }
  res.send(queuePage(req, { videos, filter, counts }));
});

// ---------- one video ----------

const adminVideo = (req) => db.prepare("SELECT * FROM videos WHERE id = ? AND status != 'draft'").get(Number(req.params.id));

adminRoutes.get('/admin/videos/:id', (req, res, next) => {
  const video = adminVideo(req);
  if (!video) return next();
  const client = db.prepare('SELECT * FROM users WHERE id = ?').get(video.client_id);
  const messages = listMessages(video.id, req.user);
  const unread = unreadForAdmin(video.id); // before marking read, for the chat button's badge
  markRead(video.id, req.user);
  const chat = chatPanel({
    req,
    messages,
    unread,
    subtitle: video.title,
    stateUrl: `/admin/api/videos/${video.id}/state`,
    postUrl: `/admin/api/videos/${video.id}/messages`,
    title: `Chat with ${client.name.split(' ')[0]}`,
    hint: 'They see your messages on their editing screen.',
    placeholder: `Message ${client.name.split(' ')[0]}…`,
    empty: 'No messages yet.',
  });
  res.send(workspacePage(req, {
    video, client, files: filesOf(video.id), chat,
    versions: listVersions(video.id), changeRequest: lastChangeRequest(video.id), history: jobHistory(video.id),
  }));
});

const adminThread = threadHandlers(adminVideo);
adminRoutes.get('/admin/api/videos/:id/state', adminThread.state);
adminRoutes.post('/admin/api/videos/:id/messages', adminThread.post);

adminRoutes.post('/admin/videos/:id/control', (req, res) => {
  try {
    controlJob(Number(req.params.id), req.user.id, String(req.body.action || ''), req.body);
    flash(req, 'success', 'Job updated. The client screen will update automatically.');
  } catch (err) { flash(req, 'error', err.message); }
  res.redirect(303, `/admin/videos/${req.params.id}`);
});

adminRoutes.post('/admin/videos/:id/footage', async (req, res) => {
  const video = adminVideo(req);
  if (!video) return res.redirect(303, '/admin/queue');
  try {
    if (req.body.action === 'recheck') {
      const result = await recheckFootage(video, req.user.id);
      flash(req, result === 'shared' ? 'success' : 'error', result === 'shared' ? 'Anonymous download access confirmed.' : DRIVE_PROBLEM[result] || DRIVE_PROBLEM.unknown);
    } else {
      await replaceFootage(video, req.user.id, req.body.drive_url, req.body.shared === 'yes');
      flash(req, 'success', 'Footage link replaced and verified.');
    }
  } catch (err) { flash(req, 'error', err.message); }
  res.redirect(303, `/admin/videos/${video.id}`);
});

adminRoutes.post('/admin/videos/:id/eta', (req, res) => {
  const video = adminVideo(req);
  if (!video) return res.redirect(303, '/admin/queue');
  if (!['editing', 'changes', 'exporting'].includes(video.status)) return res.redirect(303, `/admin/videos/${video.id}`);
  const t = Date.now();
  const change = String(req.body.change || '');
  let eta;
  if (change === 'reset') eta = t + config.defaultEtaMinutes * 60e3;
  else {
    const minutes = Number(change);
    if (!Number.isFinite(minutes) || Math.abs(minutes) > 24 * 60) return res.redirect(303, `/admin/videos/${video.id}`);
    // Adding time to an overdue job counts from now, not from the old deadline.
    const base = minutes > 0 ? Math.max(video.eta_at || t, t) : (video.eta_at || t);
    eta = Math.max(t + 60e3, base + minutes * 60e3);
  }
  db.prepare('UPDATE videos SET eta_at = ?, updated_at = ? WHERE id = ?').run(eta, t, video.id);
  addSystemMessage(video.id, 'The studio updated the estimated ready time.');
  recordJobEvent(video.id, req.user.id, 'eta', `Estimated ready time changed to ${new Date(eta).toISOString()}.`, { publicMessage: false });
  flash(req, 'success', 'New time saved. The client\u2019s countdown has updated.');
  res.redirect(303, `/admin/videos/${video.id}`);
});

adminRoutes.post('/admin/videos/:id/reveal', (req, res) => {
  const video = adminVideo(req);
  if (video?.folder && process.platform === 'darwin') {
    const dir = path.join(config.studioRoot, video.folder);
    if (fs.existsSync(dir)) execFile('open', [dir], () => {});
  }
  res.redirect(303, `/admin/videos/${req.params.id}`);
});

// ---------- sending edits and the final ----------

// Send an edited version: a shared Google Drive link plus an optional note.
adminRoutes.post('/admin/videos/:id/versions', async (req, res) => {
  const video = adminVideo(req);
  if (!video) return res.redirect(303, '/admin/queue');
  try {
    const link = await sharedDriveLink(req.body.link);
    const v = addVersion(video, link, String(req.body.note || ''), req.user.id);
    flash(req, 'success', `Version ${v.number} sent. The client can review it now.`);
  } catch (err) {
    flash(req, 'error', err.message);
  }
  res.redirect(303, `/admin/videos/${video.id}`);
});

// Deliver the final: the approved version's Drive link, or a different Drive link (e.g. a full-quality export).
adminRoutes.post('/admin/videos/:id/deliver', async (req, res) => {
  const video = adminVideo(req);
  if (!video) return res.redirect(303, '/admin/queue');
  try {
    let link;
    if (req.body.source === 'approved') {
      const v = listVersions(video.id).find((x) => x.number === video.approved_version) || listVersions(video.id).at(-1);
      if (!v?.link) throw new Error('The approved version has no Drive link. Paste the final\u2019s link instead.');
      link = v.link;
    } else {
      link = await sharedDriveLink(req.body.drive_url);
    }
    // Recheck the approved link too: its sharing may have changed since review.
    if (req.body.source === 'approved') link = await sharedDriveLink(link);
    deliver(video, link, req.user.id);
    flash(req, 'success', 'Delivered. The client can download the final now.');
  } catch (err) {
    flash(req, 'error', err.message);
  }
  res.redirect(303, `/admin/videos/${video.id}`);
});

/** A tidy Drive link that the client will actually be able to open, or a clear error. */
async function sharedDriveLink(input) {
  const d = parseDriveUrl(input);
  if (!d.ok) throw new Error('Paste a Google Drive link (drive.google.com/\u2026).');
  const access = await checkDriveAccess(d.url);
  if (access !== 'shared') throw new Error(DRIVE_PROBLEM[access] || DRIVE_PROBLEM.unknown);
  return d.url;
}

adminRoutes.get('/admin/files/:id/stream', (req, res, next) => {
  const file = db.prepare('SELECT * FROM files WHERE id = ? AND complete = 1').get(Number(req.params.id));
  if (!file || !fs.existsSync(file.stored_path)) return next();
  res.sendFile(file.stored_path, { dotfiles: 'allow' });
});

adminRoutes.get('/admin/files/:id', (req, res, next) => {
  const file = db.prepare('SELECT * FROM files WHERE id = ? AND complete = 1').get(Number(req.params.id));
  if (!file || !fs.existsSync(file.stored_path)) return next();
  // The path comes from our database, never from the request, so dot-folders (e.g. .claude/worktrees) are fine.
  res.download(file.stored_path, file.original_name, { dotfiles: 'allow' });
});

const listClients = () => db.prepare(`
  SELECT u.*, (SELECT COUNT(*) FROM videos v WHERE v.client_id = u.id) AS video_count
  FROM users u WHERE u.role = 'client'
  ORDER BY u.disabled ASC, u.created_at DESC
`).all();

const getClient = (id) => db.prepare("SELECT * FROM users WHERE id = ? AND role = 'client'").get(Number(id));

adminRoutes.get('/admin/clients', (req, res) => {
  res.send(clientsPage(req, { clients: listClients() }));
});

adminRoutes.post('/admin/clients', async (req, res) => {
  const form = {
    name: String(req.body.name || '').trim().slice(0, 80),
    email: normEmail(req.body.email),
    company: String(req.body.company || '').trim().slice(0, 80),
    password: String(req.body.password || ''),
  };
  const fail = (error) => res.status(400).send(clientsPage(req, { clients: listClients(), form: { ...form, password: '' }, error }));

  if (!form.name) return fail('Add the client’s name.');
  if (!isEmail(form.email)) return fail('That email address doesn’t look right.');
  if (form.password && form.password.length < 8) return fail('A password needs at least 8 characters. Leave it blank to generate one.');
  if (db.prepare('SELECT id FROM users WHERE email = ?').get(form.email)) return fail(`${form.email} already has a login.`);

  const password = form.password || generatePassword();
  db.prepare("INSERT INTO users (role, name, email, company, password_hash, created_at) VALUES ('client', ?, ?, ?, ?, ?)")
    .run(form.name, form.email, form.company || null, await hashPassword(password), now());

  flash(req, 'credentials', { name: form.name, email: form.email, password });
  res.redirect(303, '/admin/clients');
});

adminRoutes.get('/admin/clients/:id', (req, res, next) => {
  const client = getClient(req.params.id);
  if (!client) return next();
  const videos = db.prepare("SELECT * FROM videos WHERE client_id = ? AND status != 'draft' ORDER BY created_at DESC").all(client.id);
  res.send(clientEditPage(req, { client, videos, form: client }));
});

adminRoutes.post('/admin/clients/:id', (req, res, next) => {
  const client = getClient(req.params.id);
  if (!client) return next();
  const form = {
    name: String(req.body.name || '').trim().slice(0, 80),
    email: normEmail(req.body.email),
    company: String(req.body.company || '').trim().slice(0, 80),
  };
  const videos = db.prepare("SELECT * FROM videos WHERE client_id = ? AND status != 'draft' ORDER BY created_at DESC").all(client.id);
  const fail = (error) => res.status(400).send(clientEditPage(req, { client, videos, form, error }));
  if (!form.name) return fail('Add the client\u2019s name.');
  if (!isEmail(form.email)) return fail('That email address doesn\u2019t look right.');
  if (db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(form.email, client.id)) return fail(`${form.email} already has a login.`);
  db.prepare('UPDATE users SET name = ?, email = ?, company = ? WHERE id = ?').run(form.name, form.email, form.company || null, client.id);
  flash(req, 'success', form.email !== client.email ? `Saved. ${form.name} now signs in with ${form.email}.` : 'Saved.');
  res.redirect(303, '/admin/clients');
});

adminRoutes.post('/admin/clients/:id/reset', async (req, res) => {
  const client = getClient(req.params.id);
  if (!client) return res.redirect(303, '/admin/clients');
  const password = generatePassword();
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(await hashPassword(password), client.id);
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(client.id); // sign them out everywhere
  flash(req, 'credentials', { name: client.name, email: client.email, password, reset: true });
  res.redirect(303, '/admin/clients');
});

adminRoutes.post('/admin/clients/:id/toggle', (req, res) => {
  const client = getClient(req.params.id);
  if (!client) return res.redirect(303, '/admin/clients');
  const disabled = client.disabled ? 0 : 1;
  db.prepare('UPDATE users SET disabled = ? WHERE id = ?').run(disabled, client.id);
  if (disabled) db.prepare('DELETE FROM sessions WHERE user_id = ?').run(client.id);
  flash(req, 'success', disabled ? `${client.name}’s login is turned off.` : `${client.name} can sign in again.`);
  res.redirect(303, '/admin/clients');
});
