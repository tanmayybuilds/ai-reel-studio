import { db, now, tx } from './db.js';
import { config } from './config.js';
import { addSystemMessage } from './thread.js';
import { checkDriveAccess, parseDriveUrl, DRIVE_PROBLEM } from './drive.js';
import fs from 'node:fs';
import path from 'node:path';

export const EDITING_STAGES = [
  'Watching every take', 'Picking the best takes', 'Cutting on the beat',
  'Timing captions word by word', 'Adding motion graphics', 'Layering sound design', 'Final polish',
];
export const jobHistory = (videoId) => db.prepare(`
  SELECT e.*, u.name AS actor FROM job_events e LEFT JOIN users u ON e.actor_id = u.id
  WHERE video_id = ? ORDER BY e.id DESC LIMIT 100`).all(videoId);

export function recordJobEvent(videoId, actorId, action, detail, { publicMessage = true } = {}) {
  db.prepare('INSERT INTO job_events (video_id, actor_id, action, detail, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(videoId, actorId, action, detail, now());
  if (publicMessage) addSystemMessage(videoId, detail);
}

export async function replaceFootage(video, actorId, input, shared) {
  const d = parseDriveUrl(input);
  if (!d.ok) throw new Error('Paste a Google Drive file or folder link.');
  if (!shared) throw new Error('Confirm the footage is shared with Anyone with the link.');
  const access = await checkDriveAccess(d.url);
  if (access !== 'shared') throw new Error(DRIVE_PROBLEM[access] || DRIVE_PROBLEM.unknown);
  tx(() => {
    const r = db.prepare(`UPDATE videos SET drive_url = ?, drive_checked_at = ?, drive_check_result = 'shared', updated_at = ?
      WHERE id = ? AND drive_url = ? AND status NOT IN ('draft','delivered','cancelled')`)
      .run(d.url, now(), now(), video.id, video.drive_url);
    if (r.changes !== 1) throw conflict('The footage or job changed while we checked it. Reload and try again.');
    recordJobEvent(video.id, actorId, 'footage', `Footage link replaced and verified: ${d.url}`);
  });
  // Preserve the original submission and append the current link for local editing sessions.
  const brief = path.resolve(config.studioRoot, video.folder, 'brief.md');
  if (brief.startsWith(config.studioRoot + path.sep) && fs.existsSync(brief)) {
    try { fs.appendFileSync(brief, `\n## Footage updated ${new Date().toISOString()}\n\nCurrent verified footage: ${d.url}\n`); }
    catch (err) { console.warn('Could not append footage update to brief:', err.message); }
  }
}

export async function recheckFootage(video, actorId) {
  const access = await checkDriveAccess(video.drive_url);
  tx(() => {
    const r = db.prepare('UPDATE videos SET drive_checked_at = ?, drive_check_result = ?, updated_at = ? WHERE id = ? AND drive_url = ?')
      .run(now(), access, now(), video.id, video.drive_url);
    if (r.changes !== 1) throw conflict('The footage link changed. Reload and check the new link.');
    recordJobEvent(video.id, actorId, 'access-check', access === 'shared'
      ? 'The studio rechecked the footage: anonymous download access confirmed.'
      : `The studio could not verify footage access. ${DRIVE_PROBLEM[access] || DRIVE_PROBLEM.unknown}`);
  });
  return access;
}

const conflict = (message) => Object.assign(new Error(message), { status: 409 });

/** Explicit admin transitions; final approval is always the client's decision. Nothing is deleted. */
export function controlJob(videoId, actorId, action, fields = {}) {
  return tx(() => {
    const video = db.prepare("SELECT * FROM videos WHERE id = ? AND status != 'draft'").get(videoId);
    if (!video) throw conflict('This video no longer exists.');
    if (fields.state !== video.status) throw conflict('The job changed in another tab. Reload before trying again.');
    const note = String(fields.note || '').trim().slice(0, 2000);
    const t = now();
    let status = video.status;
    let eta = video.eta_at;
    let resume = video.resume_status;
    let stage = video.editing_stage;
    let started = video.work_started_at;
    let detail;
    if (action === 'start' && ['queued', 'changes'].includes(status)) {
      if (video.drive_check_result !== 'shared') throw conflict('Recheck or replace the footage link before starting.');
      status = 'editing'; eta = t + config.defaultEtaMinutes * 60e3; stage = 0; started = t;
      detail = 'The studio started editing your video.';
    } else if (action === 'hold' && ['queued', 'editing', 'changes', 'review', 'exporting'].includes(status)) {
      if (!note) throw conflict('Add a reason for the hold. The client will see it.');
      resume = status; status = 'on_hold'; eta = null;
      detail = `The studio put this job on hold: ${note}`;
    } else if (action === 'resume' && status === 'on_hold') {
      status = ['queued', 'editing', 'changes', 'review', 'exporting'].includes(resume) ? resume : 'queued';
      eta = ['editing', 'exporting'].includes(status) ? t + (status === 'exporting' ? Number(process.env.EXPORT_ETA_MINUTES || 15) : config.defaultEtaMinutes) * 60e3 : null;
      started = t; resume = null;
      detail = 'The studio resumed your job.';
    } else if (action === 'cancel' && !['delivered', 'cancelled'].includes(status)) {
      if (!note) throw conflict('Add a reason for cancelling. The client will see it.');
      status = 'cancelled'; eta = null; resume = null;
      detail = `The studio cancelled this job: ${note}`;
    } else if (action === 'reopen' && ['cancelled', 'delivered'].includes(status)) {
      if (!note) throw conflict('Add a reason for reopening. The client will see it.');
      if (status === 'delivered' && video.final_drive_url) recordJobEvent(video.id, actorId, 'previous-final', `Previous final kept: ${video.final_drive_url}`, { publicMessage: false });
      status = 'queued'; eta = null; stage = 0; started = null; resume = null;
      detail = `The studio reopened this job: ${note}. A new version will need your approval.`;
    } else if (action === 'stage' && status === 'editing') {
      stage = Number(fields.stage);
      if (!Number.isInteger(stage) || stage < 0 || stage >= EDITING_STAGES.length) throw conflict('Choose a valid editing stage.');
      detail = `Editing update: ${EDITING_STAGES[stage]}.`;
    } else { throw conflict('That action is not available at this stage.'); }
    db.prepare(`UPDATE videos SET status = ?, eta_at = ?, resume_status = ?, status_note = ?,
      editing_stage = ?, work_started_at = ?, approved_version = CASE WHEN ? = 'reopen' THEN NULL ELSE approved_version END,
      updated_at = ? WHERE id = ?`).run(status, eta, resume, note || null, stage, started, action, t, video.id);
    recordJobEvent(video.id, actorId, action, detail);
    return db.prepare('SELECT * FROM videos WHERE id = ?').get(video.id);
  });
}
