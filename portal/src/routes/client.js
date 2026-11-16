import { Router } from 'express';
import { db } from '../db.js';
import { requireClient, normEmail, isEmail } from '../auth.js';
import { isHttpUrl } from '../storage.js';
import { latestDraft, getOwnedDraft, filesOf, submitDraft, discardDraft, createDraft } from '../videos.js';
import fs from 'node:fs';
import { dashboardPage, newVideoPage, videoPage, reviewPage, deliveredPage } from '../views/client.js';
import { listVersions, finalFile, posterPath, requestChanges, approve } from '../review.js';
import { flash } from '../auth.js';
import { listMessages, markRead, threadHandlers, unreadForClient } from '../thread.js';
import { chatPanel } from '../views/chat.js';
import { listStyles, getStyle } from '../styles.js';

export const clientRoutes = Router();

const submitting = new Set(); // draft ids being submitted right now (stops double clicks)

clientRoutes.get('/dashboard', requireClient, (req, res) => {
  const videos = db.prepare("SELECT * FROM videos WHERE client_id = ? AND status != 'draft' ORDER BY created_at DESC").all(req.user.id)
    .map((v) => {
      const last = listVersions(v.id).at(-1);
      return { ...v, unread: unreadForClient(v.id), poster_file: last && posterPath(last.file_id) ? last.file_id : null };
    });
  res.send(dashboardPage(req, { videos, draft: latestDraft(req.user.id) }));
});

clientRoutes.get('/videos/new', requireClient, (req, res) => {
  const draft = latestDraft(req.user.id);
  res.send(newVideoPage(req, {
    draft,
    files: draft ? filesOf(draft.id) : [],
    styles: listStyles({ activeOnly: true }),
    form: { title: draft && draft.title !== 'Untitled video' ? draft.title : '', notify_email: req.user.email },
  }));
});

clientRoutes.post('/videos/new', requireClient, async (req, res) => {
  const b = req.body;
  const form = {
    title: String(b.title || '').trim().slice(0, 120),
    reference_url: String(b.reference_url || '').trim().slice(0, 2000),
    drive_url: String(b.drive_url || '').trim().slice(0, 2000),
    notes: String(b.notes || '').trim().slice(0, 5000),
    notify_email: normEmail(b.notify_email),
    source: b.source === 'drive' ? 'drive' : 'upload',
    ref_mode: b.ref_mode === 'style' ? 'style' : 'reference',
    style_id: b.style_id ? Number(b.style_id) : null,
  };
  let draft = b.video_id ? getOwnedDraft(b.video_id, req.user.id) : null;
  if (b.video_id && !draft) return res.redirect(303, '/dashboard'); // already submitted (double click)

  const files = draft ? filesOf(draft.id) : [];
  const styles = listStyles({ activeOnly: true });
  const fail = (error) => res.status(400).send(newVideoPage(req, { draft, files, form, styles, error }));

  if (!form.title) return fail('Give the video a title, for example "Launch reel".');
  if (form.ref_mode === 'style') {
    const style = form.style_id ? getStyle(form.style_id) : null;
    if (!style || !style.active) return fail('Pick one of our styles, or switch to \u201cI have a reference reel\u201d.');
    form.style_name = style.name;
    form.reference_url = '';
  } else {
    form.style_id = null;
  }
  if (form.reference_url && !isHttpUrl(form.reference_url)) return fail('The reference reel link should start with https://');
  if (form.drive_url && !isHttpUrl(form.drive_url)) return fail('The Google Drive link should start with https://');
  if (!isEmail(form.notify_email)) return fail('Add the email where we should tell you the video is ready.');
  if (files.some((f) => !f.complete)) return fail('Some files haven’t finished uploading. Wait for them, or remove them.');
  const rawCount = files.filter((f) => f.kind === 'raw' && f.complete).length;
  if (!rawCount && !form.drive_url) {
    return fail(form.source === 'drive' ? 'Paste the Google Drive link to your raw footage.' : 'Upload your raw footage, or switch to "Google Drive link" and paste one.');
  }

  if (!draft) draft = createDraft(req.user, form.title);
  if (submitting.has(draft.id)) return res.redirect(303, '/dashboard');
  submitting.add(draft.id);
  try {
    const client = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    const video = await submitDraft(draft, client, form);
    res.redirect(303, `/videos/${video.id}`);
  } finally {
    submitting.delete(draft.id);
  }
});

clientRoutes.post('/videos/:id/discard', requireClient, async (req, res) => {
  const draft = getOwnedDraft(req.params.id, req.user.id);
  if (draft) await discardDraft(draft);
  res.redirect(303, '/videos/new');
});

const ownedVideo = (req) =>
  db.prepare("SELECT * FROM videos WHERE id = ? AND client_id = ? AND status != 'draft'").get(Number(req.params.id), req.user.id);

clientRoutes.get('/videos/:id', requireClient, (req, res, next) => {
  const video = db.prepare('SELECT * FROM videos WHERE id = ? AND client_id = ?').get(Number(req.params.id), req.user.id);
  if (!video) return next(); // 404
  if (video.status === 'draft') return res.redirect('/videos/new');
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
    const show = wanted ? showing : null;
    return res.send(deliveredPage(req, { video, files, versions, showing: show || (final ? null : showing), final, chat }));
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
    requestChanges(video, req.user, body);
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
    approve(video, req.user);
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
