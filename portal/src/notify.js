// Emails fired at each step of a video. Always reloads the video so the email has the latest details.
import { db } from './db.js';
import { config } from './config.js';
import { sendMail } from './mailer.js';
import {
  versionReadyEmail, deliveredEmail, adminNewVideoEmail, adminChangesEmail, adminApprovedEmail,
} from './emails.js';

const load = (videoId) => {
  const video = db.prepare('SELECT * FROM videos WHERE id = ?').get(videoId);
  const client = video && db.prepare('SELECT * FROM users WHERE id = ?').get(video.client_id);
  return { video, client };
};

function toClient(video, kind, mail) {
  return sendMail({ to: video.notify_email, kind, videoId: video.id, ...mail });
}
function toStudio(video, kind, mail) {
  return sendMail({ to: config.mail.alertTo, kind, videoId: video.id, ...mail });
}

export const notify = {
  /** Client: an edited version is ready to review (with the studio's note). */
  versionReady(videoId, version) {
    const { video, client } = load(videoId);
    if (video) toClient(video, 'version-ready', versionReadyEmail({ video, client, version }));
  },
  /** Client: the final file / Drive link is ready. */
  delivered(videoId) {
    const { video, client } = load(videoId);
    const final = db.prepare("SELECT * FROM files WHERE video_id = ? AND kind = 'final' ORDER BY id DESC LIMIT 1").get(videoId);
    if (video) toClient(video, 'delivered', deliveredEmail({ video, client, final }));
  },
  /** Studio: a client sent a new video. */
  newVideo(videoId) {
    const { video, client } = load(videoId);
    const files = db.prepare('SELECT * FROM files WHERE video_id = ? AND complete = 1').all(videoId);
    if (video) toStudio(video, 'admin-new', adminNewVideoEmail({ video, client, files }));
  },
  /** Studio: the client asked for changes. */
  changes(videoId, versionNumber, request) {
    const { video, client } = load(videoId);
    if (video) toStudio(video, 'admin-changes', adminChangesEmail({ video, client, versionNumber, request }));
  },
  /** Studio: the client approved a version for export. */
  approved(videoId, versionNumber) {
    const { video, client } = load(videoId);
    if (video) toStudio(video, 'admin-approved', adminApprovedEmail({ video, client, versionNumber }));
  },
};
