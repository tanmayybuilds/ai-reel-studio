import { html } from '../html.js';
import { page, icon } from './layout.js';
import { ALLOWED, CHUNK_SIZE, humanSize } from '../storage.js';
import { STATUS } from '../videos.js';
import { referencePicker } from './styles.js';

const accept = (kind) => ALLOWED[kind].exts.map((e) => `.${e}`).join(',');
const clock = (ms) => new Date(ms).toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true });
const day = (ms) => new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

export const statusBadge = (status) => {
  const s = STATUS[status] || STATUS.draft;
  return html`<span class="badge badge-${s.cls}">${s.label}</span>`;
};

// ---------- dashboard ----------

export function dashboardPage(req, { videos, draft }) {
  const first = req.user.name.split(' ')[0];
  return page({
    title: 'Your videos',
    req,
    body: html`
    <div class="page-head">
      <div>
        <h1>Hi ${first}</h1>
        <p class="muted">${videos.length ? 'Your reels, newest first.' : 'Send your footage and get an edited reel back in about an hour.'}</p>
      </div>
      <a class="btn btn-primary btn-lg" href="/videos/new">${icon.plus} New video</a>
    </div>

    ${draft ? html`
    <a class="banner" href="/videos/new">
      <span class="banner-icon">${icon.upload}</span>
      <span><strong>You have an unfinished video</strong><span class="muted"> · ${draft.title}. Continue where you left off.</span></span>
      <span class="banner-go">Continue →</span>
    </a>` : ''}

    ${videos.length ? html`
    <div class="video-grid">
      ${videos.map((v) => html`
      <a class="vcard" href="/videos/${v.id}">
        <div class="vthumb ${v.status === 'editing' || v.status === 'changes' || v.status === 'exporting' ? 'is-working' : ''}">
          ${v.poster_file ? html`<img src="/videos/${v.id}/media/${v.poster_file}/poster.jpg" alt="" loading="lazy">` : html`<span class="vthumb-icon">${icon.film}</span>`}
        </div>
        <div class="vbody">
          <div class="vrow">${statusBadge(v.status)}${v.unread ? html`<span class="badge badge-msg">${v.unread} new message${v.unread === 1 ? '' : 's'}</span>` : ''}</div>
          <h3>${v.title}</h3>
          <p class="muted small">${cardMeta(v)}</p>
        </div>
      </a>`)}
    </div>` : draft ? '' : html`
    <section class="card welcome">
      <ol class="how">
        <li>
          <span class="how-icon">${icon.upload}</span>
          <h3>Send your footage</h3>
          <p class="muted">Upload the raw file or paste a Google Drive link. Add a reference reel if you have one.</p>
        </li>
        <li>
          <span class="how-icon">${icon.wand}</span>
          <h3>We edit it</h3>
          <p class="muted">Usually within an hour. You can close the window, and we'll email you when it's ready.</p>
        </li>
        <li>
          <span class="how-icon">${icon.check}</span>
          <h3>Review and download</h3>
          <p class="muted">Ask for changes, or approve it and download the final file.</p>
        </li>
      </ol>
      <div class="welcome-cta">
        <a class="btn btn-primary btn-lg" href="/videos/new">${icon.plus} Start your first video</a>
      </div>
    </section>`}`,
  });
}

function cardMeta(v) {
  if (['editing', 'changes', 'exporting'].includes(v.status) && v.eta_at) {
    return v.eta_at > Date.now() ? `Ready around ${clock(v.eta_at)}` : 'Almost ready';
  }
  if (v.status === 'delivered' && v.delivered_at) return `Delivered ${day(v.delivered_at)}`;
  return `Sent ${day(v.submitted_at || v.created_at)}`;
}

// ---------- new video ----------

function fileRow(f) {
  const pct = f.size ? Math.floor((f.received / f.size) * 100) : 0;
  return html`
  <li class="frow ${f.complete ? 'is-done' : 'is-paused'}" data-file-id="${f.id}" data-name="${f.original_name}" data-size="${f.size}"
      data-received="${f.received}" data-complete="${f.complete ? '1' : ''}">
    <span class="frow-icon">${f.kind === 'voiceover' ? icon.mic : f.kind === 'asset' ? icon.image : icon.film}</span>
    <div class="frow-main">
      <div class="frow-top"><span class="frow-name">${f.original_name}</span><span class="frow-size">${humanSize(f.size)}</span></div>
      <div class="bar"><span data-p="${f.complete ? 100 : pct}"></span></div>
      <div class="frow-status">${f.complete
        ? html`${icon.check} Uploaded. Identical to your original`
        : `Paused at ${pct}%. Choose the same file again to continue.`}</div>
    </div>
    <button type="button" class="icon-btn" data-remove aria-label="Remove ${f.original_name}">${icon.x}</button>
  </li>`;
}

function dropzone(kind, { title, hint, big = false }) {
  return html`
  <div class="dropzone ${big ? 'dz-big' : 'dz-small'}" data-dropzone="${kind}" tabindex="0" role="button" aria-label="${title}">
    <input type="file" multiple accept="${accept(kind)}" hidden data-input="${kind}">
    <span class="dz-icon">${kind === 'raw' ? icon.upload : kind === 'voiceover' ? icon.mic : icon.image}</span>
    <span class="dz-title">${title}</span>
    <span class="dz-hint">${hint}</span>
  </div>`;
}

export function newVideoPage(req, { draft, files, form, styles = [], error = '' }) {
  const by = (k) => files.filter((f) => f.kind === k);
  const source = form.source || (form.drive_url && !by('raw').length ? 'drive' : 'upload');
  return page({
    title: 'New video',
    req,
    body: html`
    <div class="nv-head">
      <a class="back" href="/dashboard">← Your videos</a>
      <h1>New video</h1>
      <p class="muted">Send everything for one reel. It takes about two minutes, plus upload time.</p>
    </div>

    ${draft && files.length ? html`
    <div class="draft-note">
      <span>${icon.clock} You started this earlier. Files you already uploaded are kept.</span>
      <form method="post" action="/videos/${draft.id}/discard" data-confirm="Start over? Files you've uploaded for this video will be removed.">
        <input type="hidden" name="_csrf" value="${req.csrf}">
        <button class="btn btn-ghost btn-sm" type="submit">Start over</button>
      </form>
    </div>` : ''}

    ${error ? html`<div class="flash flash-error nv-error" role="alert">${error}</div>` : ''}

    <form id="new-video" class="nv" method="post" action="/videos/new" data-chunk-size="${CHUNK_SIZE}" novalidate>
      <input type="hidden" name="_csrf" value="${req.csrf}">
      <input type="hidden" name="video_id" value="${draft?.id || ''}">
      <input type="hidden" name="source" value="${source}">

      <section class="card nv-sec">
        <div class="sec-head"><span class="sec-num">1</span><div><h2>About this video</h2></div></div>
        <div class="stack">
          <label class="field"><span>Title</span>
            <input name="title" value="${form.title || ''}" maxlength="120" required placeholder="e.g. Launch reel, Episode 12 teaser"></label>
        </div>
      </section>

      <section class="card nv-sec">
        <div class="sec-head"><span class="sec-num">2</span><div><h2>The look</h2>
          <p class="muted">${styles.length ? 'Share a reel you like, or pick one of our styles.' : 'Share a reel whose style you like.'}</p></div></div>
        ${referencePicker({ styles, form })}
      </section>

      <section class="card nv-sec">
        <div class="sec-head"><span class="sec-num">3</span><div><h2>Raw footage</h2>
          <p class="muted">Your original camera file gives the best result.</p></div></div>

        <div class="seg" role="tablist">
          <button type="button" role="tab" data-tab="upload" aria-selected="${String(source === 'upload')}">${icon.upload} Upload files</button>
          <button type="button" role="tab" data-tab="drive" aria-selected="${String(source === 'drive')}">${icon.drive} Google Drive link</button>
        </div>

        <div data-panel="upload" ${source === 'upload' ? '' : 'hidden'}>
          ${dropzone('raw', { big: true, title: 'Drag your footage here, or click to choose', hint: 'MP4, MOV, MKV and more · sent exactly as recorded, never compressed' })}
          <ul class="flist" data-list="raw">${by('raw').map(fileRow)}</ul>
          <div class="tip" data-drive-tip hidden>
            <strong>This upload looks slow.</strong> <span data-drive-tip-text></span>
            A Google Drive link may be quicker. <button type="button" class="linkish" data-tab="drive">Use a Drive link instead</button>
          </div>
        </div>

        <div data-panel="drive" ${source === 'drive' ? '' : 'hidden'}>
          <label class="field"><span>Google Drive link</span>
            <div class="input-icon">${icon.drive}<input type="url" name="drive_url" value="${form.drive_url || ''}" placeholder="https://drive.google.com/…" inputmode="url"></div>
          </label>
          <ol class="mini-steps">
            <li>Upload the footage to Google Drive at <strong>original quality</strong>.</li>
            <li>Right-click it, then <strong>Share → General access → Anyone with the link</strong>.</li>
            <li>Copy the link and paste it here. A folder link works too.</li>
          </ol>
        </div>
      </section>

      <section class="card nv-sec">
        <div class="sec-head"><span class="sec-num">4</span><div><h2>Extras <em class="opt">optional</em></h2>
          <p class="muted">Anything that helps the edit.</p></div></div>
        <div class="extras">
          <div>
            ${dropzone('voiceover', { title: 'Voiceover', hint: 'WAV, MP3, M4A' })}
            <ul class="flist" data-list="voiceover">${by('voiceover').map(fileRow)}</ul>
          </div>
          <div>
            ${dropzone('asset', { title: 'Screenshots & screen recordings', hint: 'PNG, JPG, MP4, MOV' })}
            <ul class="flist" data-list="asset">${by('asset').map(fileRow)}</ul>
          </div>
        </div>
        <label class="field"><span>Notes for the editor</span>
          <textarea name="notes" rows="4" maxlength="5000" placeholder="e.g. Use the second take of the intro. Mention the 20% launch discount on screen. Keep it under 45 seconds.">${form.notes || ''}</textarea></label>
      </section>

      <section class="card nv-sec">
        <div class="sec-head"><span class="sec-num">5</span><div><h2>Where should we tell you it's ready?</h2></div></div>
        <label class="field"><span>Email</span>
          <input type="email" name="notify_email" value="${form.notify_email || ''}" required autocomplete="email"></label>
      </section>

      <div class="nv-submit">
        <p class="muted small" data-submit-note>You can close the window after this. We'll email you when the video is ready.</p>
        <button class="btn btn-primary btn-lg" type="submit" data-submit>Continue</button>
      </div>
    </form>
    <script src="/js/upload.js" defer></script>`,
  });
}

// ---------- video page: live "being edited" screen ----------

export const STAGES = [
  'Watching every take',
  'Picking the best takes',
  'Cutting on the beat',
  'Timing captions word by word',
  'Adding motion graphics',
  'Layering sound design',
  'Final polish',
];

const WORKING = {
  editing: { eyebrow: 'Your video is being edited', late: 'Finishing touches. Almost there.' },
  changes: { eyebrow: 'Making your changes', late: 'Finishing your changes. Almost there.' },
  exporting: { eyebrow: 'Preparing your final file', late: 'Wrapping up your final file.' },
};

function sentDetails(video, files) {
  const by = (k) => files.filter((f) => f.kind === k);
  const fileList = (list) => html`<ul class="sent-files">${list.map((f) => html`
    <li>${f.kind === 'voiceover' ? icon.mic : f.kind === 'asset' ? icon.image : icon.film}<span>${f.original_name}</span><span class="muted">${humanSize(f.size)}</span></li>`)}</ul>`;
  return html`
  <details class="card sent-details">
    <summary>What you sent</summary>
    <dl class="sent">
      ${by('raw').length ? html`<dt>Raw footage</dt><dd>${fileList(by('raw'))}</dd>` : ''}
      ${video.drive_url ? html`<dt>Google Drive</dt><dd><a href="${video.drive_url}" target="_blank" rel="noopener noreferrer">${video.drive_url}</a></dd>` : ''}
      ${video.reference_url ? html`<dt>Reference reel</dt><dd><a href="${video.reference_url}" target="_blank" rel="noopener noreferrer">${video.reference_url}</a></dd>` : ''}
      ${video.style_name ? html`<dt>Style</dt><dd>${video.style_name}</dd>` : ''}
      ${by('voiceover').length ? html`<dt>Voiceover</dt><dd>${fileList(by('voiceover'))}</dd>` : ''}
      ${by('asset').length ? html`<dt>Screenshots & recordings</dt><dd>${fileList(by('asset'))}</dd>` : ''}
      ${video.notes ? html`<dt>Notes</dt><dd class="pre">${video.notes}</dd>` : ''}
    </dl>
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

export function videoPage(req, { video, files, messages, chat }) {
  const working = WORKING[video.status];
  return page({
    title: video.title,
    req,
    body: html`
    <div class="vp-head">
      <a class="back" href="/dashboard">← Your videos</a>
      <div class="row"><h1>${video.title}</h1>${statusBadge(video.status)}</div>
    </div>

    <div class="work ${working ? 'work-editing' : ''}" data-live data-status="${video.status}">
      ${working ? editingStage() : html`
      <div class="work-stage">
        <section class="card ready-soon">
          <span class="sent-check">${icon.check}</span>
          <h2>${video.status === 'delivered' ? 'Delivered' : 'Your video is ready'}</h2>
          <p class="muted">The review and download screens arrive in Phase 4 of the build.</p>
        </section>
      </div>`}

      <div class="work-side">
        ${working ? html`
        <section class="card eta-card" data-eta-card data-eta="${video.eta_at}" data-start="${video.submitted_at}">
          <p class="eyebrow"><span class="live-dot"></span>${working.eyebrow}</p>
          <div class="eta-big" data-countdown>--:--</div>
          <p class="eta-sub muted" data-eta-sub>Ready around <strong data-eta-clock>${clock(video.eta_at)}</strong></p>
          <p class="eta-late" data-eta-late hidden>${working.late}</p>
          <div class="bar eta-bar"><span data-eta-progress></span></div>
          <ol class="stages" data-stages>${STAGES.map((s) => html`<li>${s}</li>`)}</ol>
          <p class="close-note">${icon.check}<span>You can close this window. We'll email <strong>${video.notify_email}</strong> when it's ready, and it'll be waiting in your dashboard.</span></p>
        </section>` : ''}
        ${chat}
      </div>
    </div>

    ${sentDetails(video, files)}`,
  });
}

// ---------- review and delivered ----------

function versionChips(video, versions, showing) {
  if (versions.length < 2) return '';
  return html`<nav class="vchips" aria-label="Versions">${versions.map((v) => html`
    <a href="/videos/${video.id}?v=${v.number}" class="${v.number === showing.number ? 'on' : ''}">v${v.number}${v.number === versions.at(-1).number ? ' · latest' : ''}</a>`)}</nav>`;
}

function player(video, fileId, posterFileId) {
  return html`
  <div class="player-phone">
    <video src="/videos/${video.id}/media/${fileId}" poster="/videos/${video.id}/media/${posterFileId || fileId}/poster.jpg"
      controls playsinline preload="metadata" data-review-player></video>
  </div>`;
}

export function reviewPage(req, { video, files, versions, showing, chat }) {
  const latest = versions.at(-1);
  const old = showing.number !== latest.number;
  return page({
    title: video.title,
    req,
    body: html`
    <div class="vp-head">
      <a class="back" href="/dashboard">← Your videos</a>
      <div class="row"><h1>${video.title}</h1>${statusBadge(video.status)}</div>
    </div>
    <div class="work" data-live data-status="${video.status}">
      <div class="work-stage">
        ${player(video, showing.file_id)}
        ${versionChips(video, versions, showing)}
      </div>
      <div class="work-side">
        <section class="card review-card">
          <p class="eyebrow"><span class="live-dot"></span>Ready to review</p>
          <h2>${latest.number === 1 ? 'Your video is ready' : `Version ${latest.number} is ready`}</h2>
          ${latest.note ? html`<blockquote class="studio-note pre">${latest.note}</blockquote>` : ''}
          ${old ? html`<div class="flash flash-info">You're watching v${showing.number}. Your answer below is about the latest, <a href="/videos/${video.id}">v${latest.number}</a>.</div>` : ''}

          <form method="post" action="/videos/${video.id}/changes" class="stack review-changes">
            <input type="hidden" name="_csrf" value="${req.csrf}">
            <label class="field"><span>Want something changed?</span>
              <textarea name="body" rows="4" maxlength="4000" required placeholder="e.g. At 0:12, make the caption bigger. Cut the pause around 0:30."></textarea></label>
            <div class="row review-row">
              <button type="button" class="btn btn-ghost btn-sm" data-stamp>${icon.clock} <span>Add time 0:00</span></button>
              <button type="submit" class="btn">Request changes</button>
            </div>
          </form>

          <div class="or"><span>or</span></div>

          <form method="post" action="/videos/${video.id}/approve" data-confirm="Approve version ${latest.number}? We'll prepare the final file for you to download.">
            <input type="hidden" name="_csrf" value="${req.csrf}">
            <button class="btn btn-primary btn-lg btn-block" type="submit">${icon.check} Looks great, export it</button>
          </form>
          <p class="muted small review-fine">You'll get the final full-quality file to download, plus a Google Drive link if we add one.</p>
        </section>
        ${chat}
      </div>
    </div>
    ${sentDetails(video, files)}
    <script src="/js/review.js" defer></script>`,
  });
}

export function deliveredPage(req, { video, files, versions, showing, final, chat }) {
  const playId = showing ? showing.file_id : final?.id;
  return page({
    title: video.title,
    req,
    body: html`
    <div class="vp-head">
      <a class="back" href="/dashboard">← Your videos</a>
      <div class="row"><h1>${video.title}</h1>${statusBadge(video.status)}</div>
    </div>
    <div class="work" data-live data-status="${video.status}">
      <div class="work-stage">
        ${playId ? player(video, playId) : ''}
        ${versionChips(video, versions, showing || versions.at(-1) || {})}
      </div>
      <div class="work-side">
        <section class="card done-card">
          <div class="confetti" aria-hidden="true">${Array.from({ length: 14 }, () => html`<i></i>`)}</div>
          <span class="sent-check">${icon.check}</span>
          <h2>Your final video is ready</h2>
          <p class="muted">Delivered <time data-ts="${video.delivered_at}">${day(video.delivered_at)}</time>. It stays here whenever you need it.</p>
          <div class="done-actions">
            ${final ? html`<a class="btn btn-primary btn-lg" href="/videos/${video.id}/download">${icon.download} Download <span class="btn-sub">${humanSize(final.size)}</span></a>` : ''}
            ${video.final_drive_url ? html`<a class="btn btn-lg ${final ? '' : 'btn-primary'}" href="${video.final_drive_url}" target="_blank" rel="noopener noreferrer">${icon.drive} Open in Google Drive</a>` : ''}
          </div>
          <a class="btn btn-ghost new-cta" href="/videos/new">${icon.plus} Start another video</a>
        </section>
        ${chat}
      </div>
    </div>
    ${sentDetails(video, files)}`,
  });
}
