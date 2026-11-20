import { html } from '../html.js';
import { page, icon, asset } from './layout.js';
import { humanSize } from '../storage.js';
import { STATUS } from '../videos.js';
import { referencePicker } from './styles.js';
import { drivePreviewUrl, driveDownloadUrl, parseDriveUrl } from '../drive.js';
import { EDITING_STAGES } from '../jobs.js';
import { drivePlayer } from './drive-player.js';

const clock = (ms) => new Date(ms).toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true });
const day = (ms) => new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

export const statusBadge = (status) => {
  const s = STATUS[status] || STATUS.draft;
  return html`<span class="badge badge-${s.cls}">${s.label}</span>`;
};

const ext = (href, label, cls = 'btn') => html`<a class="${cls}" href="${href}" target="_blank" rel="noopener noreferrer">${label}</a>`;

// ---------- install the app ----------

/** Shown by app.js only when the browser can install the portal (or on iPhone, with the steps). */
export const installCard = () => html`
  <section class="card install-card" data-install hidden>
    <span class="install-icon"><img src="/icons/icon-192.png" alt="" width="44" height="44"></span>
    <div class="install-text">
      <strong>Install the app</strong>
      <span class="muted small" data-install-hint>Open your videos in one tap from your home screen.</span>
    </div>
    <button class="btn btn-primary btn-sm" type="button" data-install-go>Install</button>
    <button class="icon-btn" type="button" data-install-close aria-label="Not now">${icon.x}</button>
  </section>`;

// ---------- dashboard ----------

export function dashboardPage(req, { videos }) {
  const first = req.user.name.split(' ')[0];
  return page({
    title: 'Your videos',
    req,
    tab: 'videos',
    body: html`
    <div class="page-head">
      <div>
        <h1>Hi ${first}</h1>
        <p class="muted">${videos.length ? 'Your reels, newest first.' : 'Share your footage and get an edited reel back in about an hour.'}</p>
      </div>
      <a class="btn btn-primary btn-lg hide-mobile" href="/videos/new">${icon.plus} New video</a>
    </div>

    ${installCard()}

    ${videos.length ? html`
    <div class="video-grid">
      ${videos.map((v) => html`
      <a class="vcard" href="/videos/${v.id}">
        <div class="vthumb ${['editing', 'changes', 'exporting'].includes(v.status) ? 'is-working' : ''}">
          ${v.poster_file ? html`<img src="/videos/${v.id}/media/${v.poster_file}/poster.jpg" alt="" loading="lazy">` : html`<span class="vthumb-icon">${icon.film}</span>`}
        </div>
        <div class="vbody">
          <div class="vrow">${statusBadge(v.status)}${v.unread ? html`<span class="badge badge-msg">${v.unread} new</span>` : ''}</div>
          <h3>${v.title}</h3>
          <p class="muted small">${cardMeta(v)}</p>
        </div>
      </a>`)}
    </div>` : html`
    <section class="card welcome">
      <ol class="how">
        <li>
          <span class="how-icon">${icon.drive}</span>
          <h3>Share your footage</h3>
          <p class="muted">Put it in Google Drive, share the link, and pick a reference reel or one of our styles.</p>
        </li>
        <li>
          <span class="how-icon">${icon.wand}</span>
          <h3>We edit it</h3>
          <p class="muted">Usually within an hour. Close the app if you like. We'll email you when it's ready.</p>
        </li>
        <li>
          <span class="how-icon">${icon.check}</span>
          <h3>Review and download</h3>
          <p class="muted">Watch it here, ask for changes, or approve it and download the final.</p>
        </li>
      </ol>
      <div class="welcome-cta">
        <a class="btn btn-primary btn-lg" href="/videos/new">${icon.plus} Start your first video</a>
      </div>
    </section>`}`,
  });
}

// <time data-ts> is repainted in the viewer's own time zone by live.js (the server may run in UTC).
function cardMeta(v) {
  if (['editing', 'changes', 'exporting'].includes(v.status) && v.eta_at) {
    return v.eta_at > Date.now() ? html`Ready around <time data-ts="${v.eta_at}">${clock(v.eta_at)}</time>` : 'Almost ready';
  }
  if (v.status === 'delivered' && v.delivered_at) return html`Delivered <time data-ts="${v.delivered_at}">${day(v.delivered_at)}</time>`;
  const at = v.submitted_at || v.created_at;
  return html`Sent <time data-ts="${at}">${day(at)}</time>`;
}

// ---------- new video ----------

export function newVideoPage(req, { form, styles = [], error = '', field = '' }) {
  const bad = (name) => (field === name ? 'is-invalid' : '');
  return page({
    title: 'New video',
    req,
    tab: 'new',
    body: html`
    <div class="nv-head">
      <a class="back" href="/dashboard">← Your videos</a>
      <h1>New video</h1>
      <p class="muted">Five quick steps. Your footage stays in your Google Drive.</p>
    </div>

    ${error ? html`<div class="flash flash-error nv-error" role="alert" data-error-field="${field}">${error}</div>` : ''}

    <form id="new-video" class="nv" method="post" action="/videos/new" novalidate>
      <input type="hidden" name="_csrf" value="${req.csrf}">

      <section class="card nv-sec ${bad('title')}" data-field="title">
        <div class="sec-head"><span class="sec-num">1</span><div><h2>Name this video</h2></div></div>
        <label class="field"><span>Title</span>
          <input name="title" value="${form.title || ''}" maxlength="120" required autocomplete="off" enterkeyhint="next"
            placeholder="e.g. Launch reel, Episode 12 teaser"></label>
      </section>

      <section class="card nv-sec ${bad('look')}" data-field="look">
        <div class="sec-head"><span class="sec-num">2</span><div><h2>Choose the look</h2>
          <p class="muted">${styles.length ? 'Share a reel you like, or pick one of our styles.' : 'Share a reel whose style you like.'}</p></div></div>
        ${referencePicker({ styles, form })}
      </section>

      <section class="card nv-sec ${bad('drive')} ${bad('shared')}" data-field="drive">
        <div class="sec-head"><span class="sec-num">3</span><div><h2>Share your footage</h2>
          <p class="muted">Put the camera files (plus any voiceover or screenshots) in one Google Drive folder.</p></div></div>
        <ol class="share-steps">
          <li><span>1</span><div>Open the file or folder in <a href="https://drive.google.com/drive/my-drive" target="_blank" rel="noopener noreferrer">Google Drive</a>. Upload at <strong>original quality</strong>.</div></li>
          <li><span>2</span><div>Tap <strong>Share</strong> → <strong>General access</strong> → <strong>Anyone with the link</strong>. Allow viewers to download the files.</div></li>
          <li><span>3</span><div>Tap <strong>Copy link</strong> and paste it below.</div></li>
        </ol>
        <label class="field"><span>Google Drive link</span>
          <div class="input-icon">${icon.drive}<input type="url" name="drive_url" value="${form.drive_url || ''}" required inputmode="url"
            autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="https://drive.google.com/…"></div>
          <small class="help" data-drive-hint>A file link or a folder link both work.</small></label>
        <label class="check ${bad('shared')}" data-field="shared">
          <input type="checkbox" name="shared" value="yes" required ${form.shared ? 'checked' : ''}>
          <span class="check-box" aria-hidden="true">${icon.check}</span>
          <span>I've set this link to <strong>Anyone with the link</strong> and allowed downloads, so the editor can use the original files.</span>
        </label>
      </section>

      <section class="card nv-sec" data-field="notes">
        <div class="sec-head"><span class="sec-num">4</span><div><h2>Notes for the editor <em class="opt">optional</em></h2></div></div>
        <label class="field"><span class="sr-only">Notes</span>
          <textarea name="notes" rows="4" maxlength="5000" placeholder="e.g. Use the second take of the intro. Mention the 20% launch discount on screen. Keep it under 45 seconds.">${form.notes || ''}</textarea></label>
      </section>

      <section class="card nv-sec ${bad('email')}" data-field="email">
        <div class="sec-head"><span class="sec-num">5</span><div><h2>Where should we tell you it's ready?</h2></div></div>
        <label class="field"><span>Email</span>
          <input type="email" name="notify_email" value="${form.notify_email || ''}" required autocomplete="email" inputmode="email" autocapitalize="off"></label>
      </section>

      <div class="nv-submit">
        <p class="muted small" data-submit-note>We verify anonymous download access before submitting. Keep folders under 50 files. You can close the app once your job is queued.</p>
        <button class="btn btn-primary btn-lg" type="submit" data-submit>Send to the editor</button>
      </div>
    </form>
    <script src="${asset('/js/new-video.js')}" defer></script>`,
  });
}

// ---------- video page: live "being edited" screen ----------

export const STAGES = EDITING_STAGES;

const WORKING = {
  editing: { eyebrow: 'Your video is being edited', late: 'Finishing touches. Almost there.' },
  exporting: { eyebrow: 'Preparing your final file', late: 'Wrapping up your final file.' },
};

function sentDetails(video, files, req) {
  const by = (k) => files.filter((f) => f.kind === k);
  const fileList = (list) => html`<ul class="sent-files">${list.map((f) => html`
    <li>${f.kind === 'voiceover' ? icon.mic : f.kind === 'asset' ? icon.image : icon.film}<span>${f.original_name}</span><span class="muted">${humanSize(f.size)}</span></li>`)}</ul>`;
  return html`
  <details class="card sent-details">
    <summary>What you sent</summary>
    <dl class="sent">
      ${video.drive_url ? html`<dt>Footage</dt><dd><a href="${video.drive_url}" target="_blank" rel="noopener noreferrer">${video.drive_url}</a></dd>` : ''}
      ${by('raw').length ? html`<dt>Raw footage</dt><dd>${fileList(by('raw'))}</dd>` : ''}
      ${video.reference_url ? html`<dt>Reference reel</dt><dd><a href="${video.reference_url}" target="_blank" rel="noopener noreferrer">${video.reference_url}</a></dd>` : ''}
      ${video.style_name ? html`<dt>Style</dt><dd>${video.style_name}</dd>` : ''}
      ${by('voiceover').length ? html`<dt>Voiceover</dt><dd>${fileList(by('voiceover'))}</dd>` : ''}
      ${by('asset').length ? html`<dt>Screenshots & recordings</dt><dd>${fileList(by('asset'))}</dd>` : ''}
      ${video.notes ? html`<dt>Notes</dt><dd class="pre">${video.notes}</dd>` : ''}
    </dl>
    ${req && !['delivered', 'cancelled'].includes(video.status) ? html`
      <p class="small ${video.drive_check_result === 'shared' ? 'help-ok' : 'warn-text'}">${video.drive_check_result === 'shared' ? 'Footage download access verified.' : 'Please check your footage sharing settings.'}</p>
      <form class="stack" method="post" action="/videos/${video.id}/footage">
        <input type="hidden" name="_csrf" value="${req.csrf}">
        <label class="field"><span>Replace footage link</span><input type="url" name="drive_url" required placeholder="https://drive.google.com/…"></label>
        <label class="check"><input type="checkbox" name="shared" value="yes" required><span class="check-box" aria-hidden="true">${icon.check}</span><span>Anyone with the link can view and download</span></label>
        <button class="btn btn-sm" type="submit">Verify and replace link</button>
      </form>` : ''}
  </details>`;
}

function editingStage() {
  return html`
  <div class="work-stage" aria-hidden="true">
    <div class="studio-phone">
      <div class="sp-screen">
        <div class="sp-glow"></div>
        <div class="sp-subject"><i class="sp-head"></i><i class="sp-body"></i></div>
        <div class="sp-hero">${' '}</div>
        <div class="sp-caps"><i></i><i></i></div>
        <div class="sp-scan"></div>
        <div class="sp-rec"><b></b>EDITING</div>
      </div>
    </div>
    <div class="timeline">
      <div class="tl-track tl-v">${Array.from({ length: 7 }, () => html`<i></i>`)}</div>
      <div class="tl-track tl-c">${Array.from({ length: 10 }, () => html`<i></i>`)}</div>
      <div class="tl-track tl-a">${Array.from({ length: 5 }, () => html`<i></i>`)}</div>
      <span class="tl-playhead"></span>
    </div>
  </div>`;
}

const vpHead = (video) => html`
  <div class="vp-head">
    <a class="back" href="/dashboard">← Your videos</a>
    <div class="row"><h1>${video.title}</h1>${statusBadge(video.status)}</div>
  </div>`;

export function videoPage(req, { video, files, chat }) {
  const working = WORKING[video.status];
  return page({
    title: video.title,
    req,
    tab: 'videos',
    body: html`
    ${vpHead(video)}
    <div class="work ${working ? 'work-editing' : ''}" data-live data-status="${video.status}" data-stage="${video.editing_stage}">
      ${working ? editingStage() : ''}
      <div class="work-side">
        ${!working ? (video.status === 'queued' ? html`<section class="card eta-card queued-card">
          <p class="eyebrow"><span class="live-dot"></span>Checking your footage</p>
          <h2>We're checking it for sensitive content</h2>
          <p class="muted">${video.status_note || 'If nothing sensitive is found, we’ll start editing and let you know right here and by email. You can close the app: your video will be waiting in your dashboard.'}</p>
          <div class="scan-bar" aria-hidden="true"><span></span></div>
        </section>` : html`<section class="card eta-card">
          <p class="eyebrow">${video.status === 'changes' ? 'Your changes have been received' : video.status === 'on_hold' ? 'Your job is on hold' : 'This job was cancelled'}</p>
          <h2>${video.status === 'changes' ? 'Your editor will pick it up.' : video.status === 'on_hold' ? 'Waiting for the next step' : 'Your files and chat are kept'}</h2>
          <p class="muted">${video.status_note || (video.status === 'changes' ? 'Your editor will start on your changes and set an estimated ready time. You can close this page and return from your dashboard.' : 'Tap the chat button to message the studio if you need help.')}</p>
        </section>`) : ''}
        ${working ? html`
        <section class="card eta-card" data-eta-card data-eta="${video.eta_at}" data-start="${video.submitted_at}">
          <p class="eyebrow"><span class="live-dot"></span>${working.eyebrow}</p>
          <div class="eta-big" data-countdown>--:--</div>
          <p class="eta-sub muted" data-eta-sub>Estimated ready time <strong data-eta-clock>${clock(video.eta_at)}</strong></p>
          <p class="eta-late" data-eta-late hidden>${working.late}</p>
          <div class="bar eta-bar"><span data-eta-progress></span></div>
          ${video.status !== 'exporting' ? html`<ol class="stages" data-stages data-current-stage="${video.editing_stage}">${STAGES.map((s, i) => html`<li class="${i < video.editing_stage ? 'done' : i === video.editing_stage ? 'current' : ''}">${s}</li>`)}</ol><p class="muted small">Progress is updated by your editor. The countdown is an estimate.</p>` : ''}
          <p class="close-note">${icon.check}<span>You can close the app. We'll email <strong>${video.notify_email}</strong> when it's ready, and it'll be waiting here.</span></p>
        </section>` : ''}
        ${chat}
      </div>
    </div>
    ${sentDetails(video, files, req)}`,
  });
}

// ---------- review and delivered ----------

function versionChips(video, versions, showing) {
  if (versions.length < 2) return '';
  return html`<nav class="vchips" aria-label="Versions">${versions.map((v) => html`
    <a href="/videos/${video.id}?v=${v.number}" class="${v.number === showing?.number ? 'on' : ''}">v${v.number}${v.number === versions.at(-1).number ? ' · latest' : ''}</a>`)}</nav>`;
}

/**
 * The video, played inside the page: Google Drive's own player for a Drive file link, our player for
 * a stored file (older videos), or a button when the link is a folder (Drive can't embed folders).
 */
function player(video, { link, fileId, stream }) {
  const preview = link && drivePreviewUrl(link);
  if (preview) {
    return html`
    <div class="player-phone player-drive">
      ${drivePlayer(link, 'Your video', stream)}
    </div>
    <p class="player-alt muted small">Not playing? ${ext(link, 'Open it in Google Drive', 'linkish-a')}</p>`;
  }
  if (link) {
    return html`
    <div class="player-phone player-folder">
      <span class="dz-icon">${icon.drive}</span>
      <p>This version is in a Google Drive folder.</p>
      ${ext(link, html`${icon.drive} Open in Google Drive`, 'btn btn-primary')}
    </div>`;
  }
  if (fileId) {
    return html`
    <div class="player-phone">
      <video src="/videos/${video.id}/media/${fileId}" poster="/videos/${video.id}/media/${fileId}/poster.jpg"
        controls playsinline preload="metadata" data-review-player></video>
    </div>`;
  }
  return '';
}

export function reviewPage(req, { video, files, versions, showing, chat }) {
  const latest = versions.at(-1);
  const old = showing.number !== latest.number;
  return page({
    title: video.title,
    req,
    tab: 'videos',
    body: html`
    ${vpHead(video)}
    <div class="work" data-live data-status="${video.status}">
      <div class="work-stage">
        ${player(video, { link: showing.link, fileId: showing.file_id, stream: `/videos/${video.id}/play/${showing.number}` })}
        ${versionChips(video, versions, showing)}
      </div>
      <div class="work-side">
        <section class="card review-card">
          <p class="eyebrow"><span class="live-dot"></span>Ready to review</p>
          <h2>${old ? `Watching version ${showing.number}` : latest.number === 1 ? 'Your video is ready' : `Version ${latest.number} is ready`}</h2>
          ${showing.note ? html`<blockquote class="studio-note pre">${showing.note}</blockquote>` : ''}
          ${old ? html`<div class="flash flash-info">You're watching v${showing.number}. <a href="/videos/${video.id}">Watch the latest v${latest.number}</a> before approving or requesting changes.</div>` : html`

          <form method="post" action="/videos/${video.id}/approve" data-confirm="Approve version ${latest.number}? We'll prepare your final video.">
            <input type="hidden" name="_csrf" value="${req.csrf}">
            <input type="hidden" name="version" value="${latest.number}">
            <button class="btn btn-primary btn-lg btn-block" type="submit">${icon.check} Looks great, finalise it</button>
          </form>

          <div class="or"><span>or</span></div>

          <form method="post" action="/videos/${video.id}/changes" class="stack review-changes">
            <input type="hidden" name="_csrf" value="${req.csrf}">
            <input type="hidden" name="version" value="${latest.number}">
            <label class="field"><span>Ask for changes</span>
              <textarea name="body" rows="4" maxlength="4000" required placeholder="e.g. At 0:12, make the caption bigger. Cut the pause around 0:30."></textarea></label>
            ${showing.file_id && !showing.link
              ? html`<div class="row review-row"><button type="button" class="btn btn-ghost btn-sm" data-stamp>${icon.clock} <span>Add time 0:00</span></button><button type="submit" class="btn">Request changes</button></div>`
              : html`<p class="help">Tip: mention the time, like “at 0:12”, so the editor finds the spot.</p><button type="submit" class="btn btn-block">Request changes</button>`}
          </form>
          `}
        </section>
        ${chat}
      </div>
    </div>
    ${sentDetails(video, files, req)}
    <script src="${asset('/js/review.js')}" defer></script>`,
  });
}

export function deliveredPage(req, { video, files, versions, showing, final, chat }) {
  const finalLink = video.final_drive_url;
  const download = finalLink && driveDownloadUrl(finalLink);
  const isFolder = finalLink && parseDriveUrl(finalLink).kind === 'folder';
  const shown = showing
    ? { link: showing.link, fileId: showing.file_id, stream: `/videos/${video.id}/play/${showing.number}` }
    : (finalLink ? { link: finalLink, stream: `/videos/${video.id}/play/final` } : { fileId: final?.id });
  return page({
    title: video.title,
    req,
    tab: 'videos',
    body: html`
    ${vpHead(video)}
    <div class="work" data-live data-status="${video.status}">
      <div class="work-stage">
        ${player(video, shown)}
        ${versionChips(video, versions, showing)}
      </div>
      <div class="work-side">
        <section class="card done-card">
          <div class="confetti" aria-hidden="true">${Array.from({ length: 14 }, () => html`<i></i>`)}</div>
          <span class="sent-check">${icon.check}</span>
          <h2>Your final video is ready</h2>
          <p class="muted">Delivered <time data-ts="${video.delivered_at}">${day(video.delivered_at)}</time>. It stays here whenever you need it.</p>
          <div class="done-actions">
            ${download ? ext(download, html`${icon.download} Download video`, 'btn btn-primary btn-lg') : ''}
            ${finalLink ? ext(finalLink, html`${icon.drive} ${isFolder ? 'Open the folder in Google Drive' : 'Open in Google Drive'}`, `btn btn-lg ${download ? '' : 'btn-primary'}`) : ''}
            ${!finalLink && final ? html`<a class="btn btn-primary btn-lg" href="/videos/${video.id}/download">${icon.download} Download <span class="btn-sub">${humanSize(final.size)}</span></a>` : ''}
          </div>
          ${download ? html`<p class="muted small">Big files: Google may ask you to confirm the download. That's normal.</p>` : ''}
          <a class="btn btn-ghost new-cta" href="/videos/new">${icon.plus} Start another video</a>
        </section>
        ${chat}
      </div>
    </div>
    ${sentDetails(video, files, req)}`,
  });
}
