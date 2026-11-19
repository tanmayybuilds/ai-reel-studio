import { Router } from 'express';
import { db } from '../db.js';
import { requireClient, normEmail, isEmail } from '../auth.js';
import { isHttpUrl } from '../storage.js';
import { filesOf, submitDraft, createDraft } from '../videos.js';
import { parseDriveUrl, checkDriveAccess, DRIVE_PROBLEM } from '../drive.js';
import fs from 'node:fs';
import { dashboardPage, newVideoPage, videoPage, reviewPage, deliveredPage } from '../views/client.js';
import { listVersions, finalFile, posterPath, requestChanges, approve } from '../review.js';
import { flash } from '../auth.js';
import { listMessages, markRead, threadHandlers, unreadForClient } from '../thread.js';
import { chatPanel } from '../views/chat.js';
import { listStyles, getStyle } from '../styles.js';

export const clientRoutes = Router();

const submitting = new Set(); // submissions in flight right now (stops double taps)

clientRoutes.get('/dashboard', requireClient, (req, res) => {
  const videos = db.prepare("SELECT * FROM videos WHERE client_id = ? AND status != 'draft' ORDER BY created_at DESC").all(req.user.id)
    .map((v) => {
      const last = listVersions(v.id).at(-1);
      return { ...v, unread: unreadForClient(v.id), poster_file: last && posterPath(last.file_id) ? last.file_id : null };
    });
  res.send(dashboardPage(req, { videos }));
});

clientRoutes.get('/videos/new', requireClient, (req, res) => {
  res.send(newVideoPage(req, { styles: listStyles({ activeOnly: true }), form: { notify_email: req.user.email } }));
});

// Everything arrives as a Google Drive link: the portal stores no footage.
clientRoutes.post('/videos/new', requireClient, async (req, res) => {
  const b = req.body;
  const form = {
    title: String(b.title || '').trim().slice(0, 120),
    reference_url: String(b.reference_url || '').trim().slice(0, 2000),
    drive_url: String(b.drive_url || '').trim().slice(0, 2000),
    notes: String(b.notes || '').trim().slice(0, 5000),
    notify_email: normEmail(b.notify_email),
    ref_mode: b.ref_mode === 'style' ? 'style' : 'reference',
    style_id: b.style_id ? Number(b.style_id) : null,
    shared: b.shared === 'yes',
  };
  const styles = listStyles({ activeOnly: true });
  const fail = (error, field) => res.status(400).send(newVideoPage(req, { form, styles, error, field }));

  if (!form.title) return fail('Give the video a title, for example “Launch reel”.', 'title');
  if (form.ref_mode === 'style') {
    const style = form.style_id ? getStyle(form.style_id) : null;
    if (!style || !style.active) return fail('Pick one of our styles, or switch to “Reference reel” and paste a link.', 'look');
    form.style_name = style.name;
    form.reference_url = '';
  } else {
    form.style_id = null;
    if (!form.reference_url) return fail('Paste a reference reel link, or switch to “Pick our style”.', 'look');
    if (!isHttpUrl(form.reference_url)) return fail('The reference reel link should start with https://', 'look');
  }
  const drive = parseDriveUrl(form.drive_url);
  if (!drive.ok) return fail('Paste the Google Drive link to your footage (it starts with https://drive.google.com/).', 'drive');
  form.drive_url = drive.url;
  if (!form.shared) return fail('Tick the box to confirm the Drive link is shared with “Anyone with the link”.', 'shared');
  if (!isEmail(form.notify_email)) return fail('Add the email where we should tell you the video is ready.', 'email');

  // Catch the most common mistake before it costs an hour: a Drive link the editor can't open.
  const access = await checkDriveAccess(form.drive_url);
  if (DRIVE_PROBLEM[access]) return fail(DRIVE_PROBLEM[access], 'drive');

  const key = `${req.user.id}:${form.drive_url}`;
  if (submitting.has(key)) return res.redirect(303, '/dashboard'); // double tap
  submitting.add(key);
  try {
    const client = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    const video = await submitDraft(createDraft(req.user, form.title), client, form);
    res.redirect(303, `/videos/${video.id}`);
  } finally {
    submitting.delete(key);
  }
});

const ownedVideo = (req) =>
  db.prepare("SELECT * FROM videos WHERE id = ? AND client_id = ? AND status != 'draft'").get(Number(req.params.id), req.user.id);

clientRoutes.get('/videos/:id', requireClient, (req, res, next) => {
  const video = db.prepare('SELECT * FROM videos WHERE id = ? AND client_id = ?').get(Number(req.params.id), req.user.id);
  if (!video) return next(); // 404
  if (video.status === 'draft') return next();
  const messages = listMessages(video.id, req.user);
  markRead(video.id, req.user);
  const chat = chatPanel({
    req,
    messages,
    stateUrl: `/api/videos/${video.id}/state`,
    postUrl: `/api/videos/${video.id}/messages`,
    hint: 'Questions or extra notes? The studio sees these right away.',
    placeholder: 'Message the studio…',
    empty: 'No messages yet. Anything to add? Send it here.',
  });
  const files = filesOf(video.id);
  const versions = listVersions(video.id);
  const wanted = Number(req.query.v);
  const showing = versions.find((v) => v.number === wanted)
    || (video.status === 'delivered' ? versions.find((v) => v.number === video.approved_version) : null)
    || versions.at(-1);
  if (video.status === 'review' && versions.length) return res.send(reviewPage(req, { video, files, versions, showing, chat }));
  if (video.status === 'delivered') {
    const final = finalFile(video.id);
    // The final plays by default; ?v=N shows an earlier version.
    const show = wanted ? showing : (video.final_drive_url || final ? null : showing);
    return res.send(deliveredPage(req, { video, files, versions, showing: show, final, chat }));
  }
  res.send(videoPage(req, { video, files, messages, chat }));
});

// ---------- the client's edits: stream, poster, download ----------

function ownedMediaFile(req) {
  const video = ownedVideo(req);
  if (!video) return null;
  return db.prepare("SELECT * FROM files WHERE id = ? AND video_id = ? AND kind IN ('version','final') AND complete = 1")
    .get(Number(req.params.fileId), video.id) || null;
}
clientRoutes.get('/videos/:id/media/:fileId', requireClient, (req, res, next) => {
  const file = ownedMediaFile(req);
  if (!file || !fs.existsSync(file.stored_path)) return next();
  res.sendFile(file.stored_path, { dotfiles: 'allow' }); // Range requests work, so the player can seek
});
clientRoutes.get('/videos/:id/media/:fileId/poster.jpg', requireClient, (req, res, next) => {
  const file = ownedMediaFile(req);
  const poster = file && posterPath(file.id);
  if (!poster) return next();
  res.sendFile(poster, { dotfiles: 'allow' });
});
clientRoutes.get('/videos/:id/download', requireClient, (req, res, next) => {
  const video = ownedVideo(req);
  const final = video?.status === 'delivered' ? finalFile(video.id) : null;
  if (!final || !fs.existsSync(final.stored_path)) return next();
  res.download(final.stored_path, final.original_name, { dotfiles: 'allow' });
});

// ---------- review actions ----------

clientRoutes.post('/videos/:id/changes', requireClient, (req, res, next) => {
  const video = ownedVideo(req);
  if (!video) return next();
  const body = String(req.body.body || '').replace(/\r\n/g, '\n').trim().slice(0, 4000);
  try {
    if (!body) throw new Error('Tell us what to change first.');
    requestChanges(video, req.user, body, req.body.version);
    flash(req, 'success', 'Got it. We\u2019re making your changes now.');
  } catch (err) {
    flash(req, 'error', err.message);
  }
  res.redirect(303, `/videos/${video.id}`);
});

clientRoutes.post('/videos/:id/approve', requireClient, (req, res, next) => {
  const video = ownedVideo(req);
  if (!video) return next();
  try {
    approve(video, req.user, req.body.version);
    flash(req, 'success', 'Approved! We\u2019re preparing your final file.');
  } catch (err) {
    flash(req, 'error', err.message);
  }
  res.redirect(303, `/videos/${video.id}`);
});

// Live state (status, ETA, new messages) and sending messages. Same JSON shape as the admin side.
const clientThread = threadHandlers(ownedVideo);
function requireClientApi(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'You were signed out. Reload the page to sign in again.' });
  if (req.user.role !== 'client') return res.status(404).json({ error: 'Not found.' });
  next();
}
clientRoutes.get('/api/videos/:id/state', requireClientApi, clientThread.state);
clientRoutes.post('/api/videos/:id/messages', requireClientApi, clientThread.post);
