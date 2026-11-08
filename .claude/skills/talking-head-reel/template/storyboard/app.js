let project, reviews = {}, filter = 'all', fullStage;
const $ = selector => document.querySelector(selector);
const time = seconds => `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(1).padStart(4, '0')}`;
const escapeHtml = text => String(text).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let toastTimer;
function toast(message) { $('#toast').textContent = message; $('#toast').style.display = 'block'; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').style.display = 'none', 3000); }
function updateProgress() {
  const counts = {pending: 0, approved: 0, rejected: 0};
  for (const beat of project.beats) counts[reviews[beat.id]?.status || 'pending']++;
  for (const name of Object.keys(counts)) $(`#${name}-count`).textContent = counts[name];
  $('#all-count').textContent = project.beats.length;
  const done = counts.approved + counts.rejected;
  $('#progress-text').textContent = `${done} of ${project.beats.length} reviewed`;
  $('#progress-fill').style.width = `${done / project.beats.length * 100}%`;
  let visible = 0;
  for (const card of document.querySelectorAll('.beat-card')) { card.hidden = filter !== 'all' && card.dataset.status !== filter; if (!card.hidden) visible++; }
  $('#empty').hidden = visible > 0;
}
function applyReview(card, entry) {
  const status = entry?.status || 'pending';
  card.dataset.status = status;
  const badge = card.querySelector('.status');
  badge.className = `status ${status}`;
  badge.textContent = {pending: 'To review', approved: 'Approved', rejected: 'Rejected'}[status];
  card.querySelector('.approve').setAttribute('aria-pressed', status === 'approved');
  card.querySelector('.reject').setAttribute('aria-pressed', status === 'rejected');
  card.querySelector('.save-status').textContent = entry ? 'Saved to this project' : '';
}
async function save(card, status) {
  const id = card.dataset.id, feedback = card.querySelector('textarea').value;
  const controls = [...card.querySelectorAll('.review button, textarea')];
  controls.forEach(button => button.disabled = true);
  card.querySelector('.save-status').textContent = 'Saving…';
  try {
    const response = await fetch('/api/reviews', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({id, status, feedback})});
    if (!response.ok) throw new Error((await response.json()).error || 'Could not save.');
    reviews[id] = await response.json(); applyReview(card, reviews[id]); updateProgress();
    toast(status === 'approved' ? 'Beat approved.' : status === 'rejected' ? 'Beat rejected. Feedback saved.' : 'Feedback saved.');
  } catch (error) { card.querySelector('.save-status').textContent = 'Unsaved feedback — retry'; toast(error.message); }
  finally { controls.forEach(button => button.disabled = false); }
}
function sourceNote(beat) {
  const ranges = (beat.segments || []).map(([a, b]) => `${(a + beat.syncOffset).toFixed(2)}–${(b + beat.syncOffset).toFixed(2)}s`).join(' + ');
  return `${project.sourceName || 'A-roll'} ${ranges}`;
}
function cardHtml(beat, index) {
  const id = escapeHtml(beat.id);
  return `<article class="beat-card" data-id="${id}" data-status="pending" aria-labelledby="title-${id}">
    <div class="media"><div class="frame"><div class="stage"><video playsinline preload="metadata" src="/media/${id}-scene.mp4" aria-label="Preview of beat ${index + 1}"></video></div></div>
      <div class="controls"><button class="play">Play</button><input class="range" type="range" min="0" max="1000" value="0" aria-label="Seek beat ${index + 1}"></div></div>
    <div class="info">
      <div class="beat-heading"><span class="beat-number">${String(index + 1).padStart(2, '0')}</span><div><h3 id="title-${id}">${escapeHtml(beat.title)}</h3><span class="beat-time">${time(beat.start)} to ${time(beat.end)} · ${beat.duration.toFixed(1)}s</span></div><span class="status">To review</span></div>
      <span class="label">Captions</span><p class="spoken" lang="hi-Latn">${escapeHtml(beat.spoken)}</p>
      <span class="label">Motion graphics, and the word that triggers each</span>
      <ul class="graphics">${beat.graphics.map(([word, what]) => `<li><q>${escapeHtml(word)}</q><span>${escapeHtml(what)}</span></li>`).join('')}</ul>
      <span class="label">Camera</span><p class="note">${escapeHtml(beat.cameraNote)}</p>
      <span class="label">B-roll and assets</span>
      ${beat.assets.length ? `<div class="assets">${beat.assets.map(a => `<a href="${escapeHtml(a.file)}" target="_blank" rel="noopener"><img src="${escapeHtml(a.file)}" alt="${escapeHtml(a.label)}" loading="lazy">${escapeHtml(a.label)}</a>`).join('')}</div>` : '<p class="note">None. A-roll carries this beat.</p>'}
      <p class="source">Source: ${escapeHtml(sourceNote(beat))}</p>
      <div class="review"><div class="review-actions"><button class="approve" aria-pressed="false">✓ Approve</button><button class="reject" aria-pressed="false">✕ Reject</button><button class="feedback-toggle" aria-expanded="false">Feedback${reviews[beat.id]?.feedback ? ' •' : ''}</button></div>
        <div class="feedback-panel" hidden><label for="feedback-${id}">What should change in this beat?</label><textarea id="feedback-${id}" maxlength="4000" placeholder="Caption wording, a tighter cut, another graphic…">${escapeHtml(reviews[beat.id]?.feedback || '')}</textarea><div class="feedback-bottom"><span class="save-status" aria-live="polite"></span><button class="save-feedback">Save feedback</button></div></div>
      </div>
    </div></article>`;
}
function bindPlayer(video, stage, range, toggle, labels) {
  let frame = 0;
  const paint = () => { stage.seek(video.currentTime); if (video.duration) range.value = video.currentTime / video.duration * 1000; };
  const loop = () => { paint(); frame = video.paused ? 0 : requestAnimationFrame(loop); };
  video.addEventListener('play', () => { document.querySelectorAll('video').forEach(other => { if (other !== video) other.pause(); }); toggle.textContent = labels[1]; cancelAnimationFrame(frame); loop(); });
  video.addEventListener('pause', () => { toggle.textContent = labels[0]; });
  video.addEventListener('ended', () => { video.currentTime = 0; });
  video.addEventListener('seeked', paint);
  toggle.onclick = () => video.paused ? video.play().catch(() => {}) : video.pause();
  range.oninput = () => { if (video.duration) video.currentTime = range.value / 1000 * video.duration; };
}
function render() {
  $('#beats').innerHTML = project.beats.map(cardHtml).join('');
  for (const card of document.querySelectorAll('.beat-card')) {
    const beat = project.beats.find(b => b.id === card.dataset.id);
    const video = card.querySelector('video');
    const stage = new Stage(card.querySelector('.stage'), [beat], video);
    bindPlayer(video, stage, card.querySelector('.range'), card.querySelector('.play'), ['Play', 'Pause']);
    // Open each card on a frame where its graphics are fully on screen.
    video.addEventListener('loadedmetadata', () => { video.currentTime = Math.min(beat.duration * .8, beat.duration - .1); }, {once: true});
    applyReview(card, reviews[beat.id]);
    card.querySelector('.approve').onclick = () => save(card, card.dataset.status === 'approved' ? 'pending' : 'approved');
    card.querySelector('.reject').onclick = () => save(card, card.dataset.status === 'rejected' ? 'pending' : 'rejected');
    card.querySelector('.save-feedback').onclick = () => save(card, card.dataset.status);
    card.querySelector('textarea').oninput = () => card.querySelector('.save-status').textContent = 'Unsaved feedback';
    card.querySelector('.feedback-toggle').onclick = event => { const panel = card.querySelector('.feedback-panel'); panel.hidden = !panel.hidden; event.currentTarget.setAttribute('aria-expanded', !panel.hidden); if (!panel.hidden) panel.querySelector('textarea').focus(); };
  }
  updateProgress();
}
async function init() {
  try {
    const responses = await Promise.all([fetch('/api/storyboard'), fetch('/api/reviews')]);
    if (responses.some(response => !response.ok)) throw new Error('Could not open this project. Restart the local dashboard and reload.');
    [project, reviews] = await Promise.all(responses.map(response => response.json()));
    document.title = `${project.title} storyboard`;
    $('#title').textContent = project.title;
    $('#duration').textContent = `${(project.duration || 0).toFixed(1)}s`; $('#beat-count').textContent = project.beats.length;
    $('#note').textContent = project.note ? ` · ${project.note}` : '';
    $('#style-line').textContent = project.styleLine || '';
    $('#connection').textContent = 'Reviews save to this computer';
    render();
    $('#watch-cut').disabled = false; $('#download-reviews').disabled = false;
  } catch (error) { $('#app-error').hidden = false; $('#app-error').textContent = error.message; $('#connection').textContent = 'Project unavailable'; }
}
document.querySelectorAll('[data-filter]').forEach(button => button.onclick = () => { filter = button.dataset.filter; document.querySelectorAll('[data-filter]').forEach(other => other.setAttribute('aria-pressed', other === button)); updateProgress(); });
$('#watch-cut').onclick = () => {
  const video = $('#full-player');
  $('#player-dialog').showModal();
  if (!fullStage) {
    video.src = `/${project.video}`;
    fullStage = new Stage($('#full-stage'), project.beats, video);
    bindPlayer(video, fullStage, $('#full-range'), $('#full-toggle'), ['Play', 'Pause']);
  }
  fullStage.resize(); video.currentTime = 0; video.play().catch(() => {});
};
$('#close-player').onclick = () => $('#player-dialog').close();
$('#player-dialog').onclose = () => $('#full-player').pause();
$('#download-reviews').onclick = () => { const blob = new Blob([JSON.stringify({project: project.title, exportedAt: new Date().toISOString(), beats: project.beats.map(beat => ({id: beat.id, title: beat.title, start: beat.start, end: beat.end, ...(reviews[beat.id] || {status: 'pending', feedback: ''})}))}, null, 2)], {type: 'application/json'}); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `${project.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-feedback.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); };
window.addEventListener('beforeunload', event => { if ([...document.querySelectorAll('.save-status')].some(el => /^(Unsaved|Saving)/.test(el.textContent))) { event.preventDefault(); event.returnValue = ''; } });
init();
