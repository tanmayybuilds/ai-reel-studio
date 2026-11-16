import { Router } from 'express';
import { db, now } from '../db.js';
import { requireAdmin, hashPassword, generatePassword, normEmail, isEmail, flash } from '../auth.js';
import path from 'node:path';
import fs from 'node:fs';
import { execFile } from 'node:child_process';
import { config } from '../config.js';
import { clientsPage, queuePage, queueList, workspacePage, QUEUE_FILTERS } from '../views/admin.js';
import { filesOf } from '../videos.js';
import { listMessages, markRead, threadHandlers, addSystemMessage } from '../thread.js';
import { chatPanel } from '../views/chat.js';
import { isHttpUrl } from '../storage.js';
import {
  listVersions, finalFile, lastChangeRequest, recentExports, receiveBody, addVersion, deliver, exportsDirFor,
  editFileName, nextVersionNumber, VIDEO_EXTS,
} from '../review.js';

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
  markRead(video.id, req.user);
  const chat = chatPanel({
    req,
    messages,
    stateUrl: `/admin/api/videos/${video.id}/state`,
    postUrl: `/admin/api/videos/${video.id}/messages`,
    title: `Chat with ${client.name.split(' ')[0]}`,
    hint: 'They see your messages on their editing screen.',
    placeholder: `Message ${client.name.split(' ')[0]}…`,
    empty: 'No messages yet.',
  });
  res.send(workspacePage(req, {
    video, client, files: filesOf(video.id), chat,
    versions: listVersions(video.id), final: finalFile(video.id), changeRequest: lastChangeRequest(video.id),
    exportsList: ['editing', 'changes', 'review', 'exporting'].includes(video.status) ? recentExports() : [],
    folderAbs: video.folder ? path.join(config.studioRoot, video.folder) : '',
    canReveal: process.platform === 'darwin' && config.host === '127.0.0.1',
  }));
});

const adminThread = threadHandlers(adminVideo);
adminRoutes.get('/admin/api/videos/:id/state', adminThread.state);
adminRoutes.post('/admin/api/videos/:id/messages', adminThread.post);

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

const okExt = (name) => VIDEO_EXTS.includes(String(name).split('.').pop().toLowerCase());
const fail = (res, err) => res.status(err.status || 400).json({ error: err.status ? err.message : 'The upload didn\u2019t finish. Try again.' });

// Upload an edited cut from the computer (raw body; details in the query string).
adminRoutes.post('/admin/videos/:id/versions', async (req, res) => {
  const video = adminVideo(req);
  if (!video) return res.status(404).json({ error: 'Video not found.' });
  const file = String(req.query.file || '');
  if (!okExt(file)) return res.status(415).json({ error: 'Use an MP4, MOV, M4V or WEBM file.' });
  try {
    if (!['editing', 'changes', 'review'].includes(video.status)) throw Object.assign(new Error('This video isn\u2019t waiting for an edit.'), { status: 409 });
    const dest = await receiveBody(req, exportsDirFor(video), editFileName(video, `v${nextVersionNumber(video.id)}`, file));
    const v = addVersion(video, dest, String(req.query.note || ''));
    flash(req, 'success', `Version ${v.number} sent. The client can review it now.`);
    res.json({ redirect: `/admin/videos/${video.id}` });
  } catch (err) {
    console.warn('version upload failed:', err.message);
    fail(res, err);
  }
});

// Attach a render that's already in Exports/ (e.g. from the editing skills). The file stays where it is.
adminRoutes.post('/admin/videos/:id/versions/from-exports', (req, res) => {
  const video = adminVideo(req);
  if (!video) return res.redirect(303, '/admin/queue');
  const pick = recentExports(200).find((e) => e.rel === req.body.rel);
  try {
    if (!pick) throw Object.assign(new Error('That file isn\u2019t in Exports/ any more.'), { status: 400 });
    const v = addVersion(video, pick.path, String(req.body.note || ''));
    flash(req, 'success', `Version ${v.number} sent. The client can review it now.`);
  } catch (err) {
    flash(req, 'error', err.message);
  }
  res.redirect(303, `/admin/videos/${video.id}`);
});

// Deliver with the approved version, an Exports render, or just a Drive link.
adminRoutes.post('/admin/videos/:id/deliver', (req, res) => {
  const video = adminVideo(req);
  if (!video) return res.redirect(303, '/admin/queue');
  const driveUrl = String(req.body.drive_url || '').trim();
  try {
    if (driveUrl && !isHttpUrl(driveUrl)) throw new Error('The Drive link should start with https://');
    let filePath = null;
    const source = String(req.body.source || '');
    if (source === 'approved') {
      const v = listVersions(video.id).find((x) => x.number === video.approved_version) || listVersions(video.id).at(-1);
      filePath = v?.stored_path || null;
    } else if (source.startsWith('exports:')) {
      filePath = recentExports(200).find((e) => e.rel === source.slice(8))?.path || null;
      if (!filePath) throw new Error('That file isn\u2019t in Exports/ any more.');
    }
    deliver(video, { filePath, driveUrl });
    flash(req, 'success', 'Delivered. The client can download the final now.');
  } catch (err) {
    flash(req, 'error', err.message);
  }
  res.redirect(303, `/admin/videos/${video.id}`);
});

// Deliver by uploading a separate final file.
adminRoutes.post('/admin/videos/:id/deliver/upload', async (req, res) => {
  const video = adminVideo(req);
  if (!video) return res.status(404).json({ error: 'Video not found.' });
  const file = String(req.query.file || '');
  const driveUrl = String(req.query.drive_url || '').trim();
  if (!okExt(file)) return res.status(415).json({ error: 'Use an MP4, MOV, M4V or WEBM file.' });
  if (driveUrl && !isHttpUrl(driveUrl)) return res.status(400).json({ error: 'The Drive link should start with https://' });
  try {
    if (video.status !== 'exporting') throw Object.assign(new Error('Deliver after the client approves.'), { status: 409 });
    const dest = await receiveBody(req, exportsDirFor(video), editFileName(video, 'final', file));
    deliver(video, { filePath: dest, driveUrl });
    flash(req, 'success', 'Delivered. The client can download the final now.');
    res.json({ redirect: `/admin/videos/${video.id}` });
  } catch (err) {
    console.warn('final upload failed:', err.message);
    fail(res, err);
  }
});

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
