// Tour editor: shot list, live preview, keyframe timeline and inspector. Saves tour.json through the local server.
(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const M = window.TourMath;
  const OUT_ASPECT = 9 / 16;
  const MOVES = ['push', 'pull', 'panLeft', 'panRight', 'tiltUp', 'tiltDown', 'orbit', 'hold'];
  const TRS = ['cut', 'whip', 'zoom', 'warp', 'leak', 'slide', 'fade', 'flash'];
  const EASES = ['soft', 'linear', 'inOutSine', 'inOutCubic', 'inOutQuart', 'outCubic', 'outExpo'];

  let tour, media, reviews = {}, engine, tl;
  let sel = 0, t = 0, playing = false, dirty = false;
  let undoStack = [], redoStack = [];
  let pxPerSec = 60;
  const audio = $('#audio');

  // ---------- helpers ----------
  const clone = v => JSON.parse(JSON.stringify(v));
  const fmt = s => { s = Math.max(0, s); const m = Math.floor(s / 60); return `${m}:${(s - m * 60).toFixed(2).padStart(5, '0')}`; };
  const r3 = v => Math.round(v * 1000) / 1000;
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
  const shot = () => tour.shots[sel];
  const segOf = i => tl.segs[i];
  function setStatus(text, cls) { const s = $('#status'); s.textContent = text; s.className = 'status ' + (cls || ''); }

  function snapshot() { undoStack.push(JSON.stringify(tour)); if (undoStack.length > 200) undoStack.shift(); redoStack = []; }
  function changed(opts = {}) {
    dirty = true; setStatus('Unsaved', 'dirty');
    engine.setTour(tour); tl = engine.tl;
    if (sel >= tour.shots.length) sel = tour.shots.length - 1;
    renderList(); renderTimeline();
    if (!opts.keepInspector) renderInspector();
    draw();
  }
  function edit(fn, opts) { snapshot(); fn(); changed(opts); }

  // ---------- presets (mirror of build_tour.py keys_for) ----------
  function viewW(aspect, z) { return (aspect > OUT_ASPECT ? OUT_ASPECT / aspect : 1) / z; }
  function presetKeys(move, m) {
    const [fx, fy] = (m && m.focus) || [0.5, 0.5];
    const a = (m && m.aspect) || 0.75;
    const f = (x, y, z, extra) => Object.assign({u: 0, x: r3(x), y: r3(y), z: r3(z)}, extra || {});
    switch (move) {
      case 'push': return [f(.5, .5, 1.04), Object.assign(f(.5 + (fx - .5) * .6, .5 + (fy - .5) * .5, 1.24), {u: 1})];
      case 'pull': return [f(.5 + (fx - .5) * .6, .5 + (fy - .5) * .5, 1.26), Object.assign(f(.5, .5, 1.05), {u: 1})];
      case 'panLeft': case 'panRight': {
        const z = a > OUT_ASPECT * 1.3 ? 1.06 : 1.3, half = viewW(a, z) / 2, lo = half, hi = 1 - half;
        const travel = Math.min(hi - lo, 0.42), mid = Math.min(Math.max(fx, lo + travel / 2), hi - travel / 2);
        let x0 = mid - travel / 2, x1 = mid + travel / 2;
        if (move === 'panLeft') [x0, x1] = [x1, x0];
        return [f(x0, .5, z), Object.assign(f(x1, .5, z + .05), {u: 1})];
      }
      case 'tiltUp': return [f(.5, .62, 1.22), Object.assign(f(.5, .4, 1.26), {u: 1})];
      case 'tiltDown': return [f(.5, .4, 1.22), Object.assign(f(.5, .62, 1.26), {u: 1})];
      case 'orbit': return [f(.44, .5, 1.18, {r: -0.6}), Object.assign(f(.56, .5, 1.22, {r: 0.6}), {u: 1})];
      default: return [f(.5, .5, 1.0), Object.assign(f(.5, .5, 1.06), {u: 1})];
    }
  }

  // ---------- drawing ----------
  let drawing = false, pending = false;
  async function draw() {
    if (drawing) { pending = true; return; }
    drawing = true;
    try { await engine.renderAt(t, !playing); } catch (e) { console.error(e); }
    drawing = false;
    updateClock();
    if (pending) { pending = false; draw(); }
  }
  function updateClock() {
    $('#clock').textContent = `${fmt(t)} / ${fmt(engine.duration)}`;
    const ph = $('#playhead');
    ph.style.left = (14 + t * pxPerSec) + 'px';
    const cur = tl.segs.findIndex(g => t >= g.start && t < g.end);
    if (playing && cur >= 0 && cur !== sel) { sel = cur; renderList(); renderInspector(); renderKeys(); }
    else if (!playing) { renderKeys(); markCurrentKey(); }
  }
  function seek(v) { t = Math.min(Math.max(0, v), Math.max(0, engine.duration - 1 / 60)); if (playing) syncAudio(); draw(); }

  // ---------- playback ----------
  let clock0 = 0, t0 = 0;
  function syncAudio() {
    clock0 = performance.now(); t0 = t;
    if ($('#audioOn').checked && audio.src && audio.readyState >= 1) { audio.currentTime = t; audio.play().catch(() => {}); }
  }
  function play() {
    if (t >= engine.duration - 0.05) t = 0;
    playing = true; $('#play').textContent = '❚❚ Pause';
    syncAudio();
    requestAnimationFrame(loop);
  }
  function pause() {
    playing = false; $('#play').textContent = '▶︎ Play';
    audio.pause();
    engine.videos.forEach(v => v.v.pause());
    draw(); renderInspector();
  }
  async function loop() {
    if (!playing) return;
    const useAudio = $('#audioOn').checked && audio.src && !audio.paused && audio.readyState >= 2;
    t = useAudio ? audio.currentTime : t0 + (performance.now() - clock0) / 1000;
    if (t >= engine.duration) { t = engine.duration - 1 / 60; pause(); return; }
    await draw();
    requestAnimationFrame(loop);
  }

  // ---------- stage sizing and direct manipulation ----------
  function fitStage() {
    const wrap = $('#stageWrap'), st = $('#stage');
    const s = Math.min(wrap.clientWidth / 1080, wrap.clientHeight / 1920);
    st.style.transform = `scale(${s})`;
    st.style.left = ((wrap.clientWidth - 1080 * s) / 2) + 'px';
    st.style.top = ((wrap.clientHeight - 1920 * s) / 2) + 'px';
    st.dataset.scale = s;
  }
  function currentU() { const g = segOf(sel); return Math.min(1, Math.max(0, (t - g.vStart) / (g.vEnd - g.vStart))); }
  function keyAtPlayhead(create) {
    const s = shot();
    if (!s.keys || !s.keys.length) s.keys = presetKeys('push', media[s.media]);
    const u = currentU();
    let k = s.keys.find(k => Math.abs(k.u - u) < 0.035);
    if (!k && create) {
      const c = M.camAt(s, u);
      k = {u: r3(u), x: r3(c.x), y: r3(c.y), z: r3(c.z)};
      if (c.r) k.r = r3(c.r);
      s.keys.push(k); s.keys.sort((a, b) => a.u - b.u);
    }
    return k;
  }
  function editableShot() { const s = shot(); return s && (s.kind === 'photo' || s.kind === 'video' || s.kind === 'collage') && !playing; }
  function setupStageControls() {
    const st = $('#stage');
    let drag = null;
    st.addEventListener('pointerdown', e => {
      if (!editableShot()) return;
      const g = segOf(sel);
      if (t < g.start || t >= g.end) { seek(Math.min(Math.max(t, g.start), g.end - 0.01)); }
      snapshot();
      const k = keyAtPlayhead(true);
      const m = media[shot().media] || {aspect: 0.75};
      drag = {x: e.clientX, y: e.clientY, k, x0: k.x, y0: k.y, asp: m.w / m.h || m.aspect};
      st.setPointerCapture(e.pointerId); st.classList.add('dragging');
    });
    st.addEventListener('pointermove', e => {
      if (!drag) return;
      const s = Number(st.dataset.scale);
      const [vw, vh] = M.viewSize(drag.asp, OUT_ASPECT, drag.k.z);
      drag.k.x = r3(drag.x0 - (e.clientX - drag.x) / (1080 * s) * vw);
      drag.k.y = r3(drag.y0 - (e.clientY - drag.y) / (1920 * s) * vh);
      const c = M.clampCam(drag.k, drag.asp, OUT_ASPECT); drag.k.x = r3(c.x); drag.k.y = r3(c.y);
      engine.setTour(tour); draw(); renderKeysTable();
    });
    const end = () => { if (!drag) return; drag = null; st.classList.remove('dragging'); changed(); };
    st.addEventListener('pointerup', end); st.addEventListener('pointercancel', end);
    let wheelTimer = null;
    st.addEventListener('wheel', e => {
      if (!editableShot()) return;
      e.preventDefault();
      if (!wheelTimer) snapshot();
      const k = keyAtPlayhead(true);
      if (e.shiftKey) k.r = r3(Math.max(-6, Math.min(6, (k.r || 0) + (e.deltaY > 0 ? 0.15 : -0.15))));
      else k.z = r3(Math.max(1, Math.min(2.5, k.z * (e.deltaY > 0 ? 0.985 : 1.015))));
      engine.setTour(tour); draw(); renderKeysTable();
      clearTimeout(wheelTimer); wheelTimer = setTimeout(() => { wheelTimer = null; changed(); }, 350);
    }, {passive: false});
  }

  // ---------- shot list ----------
  function thumbOf(s) {
    const id = s.media || s.bg || (s.tiles || [])[0];
    return id && media[id] ? '/' + media[id].thumb : '';
  }
  function titleOf(s) {
    if (s.kind === 'collage') return (s.title && s.title.text) || 'Opening';
    if (s.kind === 'outro') return s.headline || 'Contact card';
    return (s.label && s.label.text) || s.room || s.id;
  }
  function renderList() {
    const ol = $('#shotList');
    ol.innerHTML = '';
    $('#shotCount').textContent = `${tour.shots.length} · ${engine.duration.toFixed(1)}s`;
    tour.shots.forEach((s, i) => {
      const li = document.createElement('li');
      li.draggable = true; li.dataset.i = i;
      if (i === sel) li.className = 'sel';
      const rv = (reviews[s.id] || {}).status || 'pending';
      li.innerHTML = `<img src="${thumbOf(s)}" alt=""><div><div class="t1">${i + 1}. ${esc(titleOf(s))}</div>
        <div class="t2">${esc(s.room || s.kind)}<span class="badge">${esc(s.kind === 'photo' ? (s.move || 'custom') : s.kind)}</span></div>
        <div class="t2">${s.dur.toFixed(2)}s → ${esc((s.transition || {}).type || 'cut')}</div></div><span class="rv ${rv}"></span>`;
      li.onclick = () => select(i, true);
      li.ondragstart = e => { e.dataTransfer.setData('text/plain', i); };
      li.ondragover = e => { e.preventDefault(); li.classList.add('drop'); };
      li.ondragleave = () => li.classList.remove('drop');
      li.ondrop = e => {
        e.preventDefault(); li.classList.remove('drop');
        const from = Number(e.dataTransfer.getData('text/plain')), to = i;
        if (from === to) return;
        edit(() => { const [m] = tour.shots.splice(from, 1); tour.shots.splice(to, 0, m); sel = to; });
      };
      ol.appendChild(li);
    });
  }
  function select(i, seekTo) {
    sel = Math.max(0, Math.min(tour.shots.length - 1, i));
    if (seekTo) { const g = segOf(sel); t = g.start + Math.min(0.6, g.shot.dur / 3); }
    renderList(); renderInspector(); renderTimeline(); draw();
  }

  // ---------- timeline ----------
  function renderTimeline() {
    const tlEl = $('#timeline');
    pxPerSec = Math.max(28, (tlEl.clientWidth - 40) / Math.max(10, engine.duration));
    const width = engine.duration * pxPerSec;
    ['#ruler', '#track', '#keys', '#vo'].forEach(s => { $(s).style.width = width + 'px'; });
    const ruler = $('#ruler'); ruler.innerHTML = '';
    const step = pxPerSec > 70 ? 1 : pxPerSec > 35 ? 2 : 5;
    for (let s = 0; s <= engine.duration; s += step) {
      ruler.insertAdjacentHTML('beforeend', `<i style="left:${s * pxPerSec}px"></i><span style="left:${s * pxPerSec}px">${s}s</span>`);
    }
    const track = $('#track'); track.innerHTML = '';
    tl.segs.forEach((g, i) => {
      const b = document.createElement('div');
      b.className = 'blk' + (i === sel ? ' sel' : '');
      b.style.left = g.start * pxPerSec + 'px'; b.style.width = Math.max(4, g.shot.dur * pxPerSec - 2) + 'px';
      const th = thumbOf(g.shot); if (th) b.style.backgroundImage = `url(${th})`;
      b.innerHTML = `<div class="bl">${esc(titleOf(g.shot))}</div><div class="grip"></div>`;
      b.onclick = e => { if (e.target.classList.contains('grip')) return; select(i, false); seek(g.start + (e.offsetX / pxPerSec)); };
      const grip = b.querySelector('.grip');
      grip.onpointerdown = e => {
        e.stopPropagation(); snapshot();
        const x0 = e.clientX, d0 = g.shot.dur;
        const mv = ev => { g.shot.dur = Math.max(0.8, Math.round((d0 + (ev.clientX - x0) / pxPerSec) * 20) / 20); b.style.width = g.shot.dur * pxPerSec + 'px'; };
        const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); changed(); };
        window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
      };
      track.appendChild(b);
      if (i < tl.segs.length - 1) {
        const tr = (g.shot.transition || {}).type || 'cut';
        const d = document.createElement('div');
        d.className = 'tr'; d.style.left = g.end * pxPerSec + 'px'; d.title = `Transition: ${tr}`;
        d.innerHTML = `<span>${tr[0].toUpperCase()}</span>`;
        d.onclick = () => { select(i, false); seek(g.end); document.querySelector('#f-tr')?.focus(); };
        track.appendChild(d);
      }
    });
    const vo = $('#vo'); vo.innerHTML = '';
    ((tour.audio || {}).vo || []).forEach(c => {
      vo.insertAdjacentHTML('beforeend', `<div class="vo" style="left:${c.start * pxPerSec}px;width:${c.dur * pxPerSec}px" title="${esc(c.key)}">🎙 ${esc(c.key)}</div>`);
    });
    renderKeys();
    updateClock();
  }
  function renderKeys() {
    const box = $('#keys'); if (!box) return;
    box.innerHTML = '';
    const g = segOf(sel); if (!g || !g.shot.keys) return;
    g.shot.keys.forEach((k, idx) => {
      const x = (g.vStart + k.u * (g.vEnd - g.vStart)) * pxPerSec;
      const d = document.createElement('div');
      d.className = 'kf'; d.style.left = x + 'px'; d.dataset.idx = idx;
      d.title = `key ${idx + 1}: u ${k.u}  x ${k.x}  y ${k.y}  zoom ${k.z}`;
      d.onpointerdown = e => {
        e.stopPropagation(); snapshot();
        const mv = ev => {
          const rect = box.getBoundingClientRect();
          const time = (ev.clientX - rect.left) / pxPerSec;
          k.u = r3(Math.min(1, Math.max(0, (time - g.vStart) / (g.vEnd - g.vStart))));
          d.style.left = (g.vStart + k.u * (g.vEnd - g.vStart)) * pxPerSec + 'px';
          engine.setTour(tour); seek(g.vStart + k.u * (g.vEnd - g.vStart));
        };
        const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); g.shot.keys.sort((a, b) => a.u - b.u); changed(); };
        window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
      };
      box.appendChild(d);
    });
    markCurrentKey();
  }
  function markCurrentKey() {
    const g = segOf(sel); if (!g || !g.shot.keys) return;
    const u = (t - g.vStart) / (g.vEnd - g.vStart);
    document.querySelectorAll('.kf').forEach(d => { const k = g.shot.keys[d.dataset.idx]; d.classList.toggle('cur', k && Math.abs(k.u - u) < 0.035); });
    document.querySelectorAll('.keys-table tr[data-idx]').forEach(tr => { const k = g.shot.keys[tr.dataset.idx]; tr.classList.toggle('cur', k && Math.abs(k.u - u) < 0.035); });
  }
  function setupTimelineSeek() {
    const tlEl = $('#timeline');
    const at = e => (e.clientX - $('#ruler').getBoundingClientRect().left) / pxPerSec;
    $('#ruler').addEventListener('pointerdown', e => {
      seek(at(e));
      const mv = ev => seek(at(ev));
      const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); };
      window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
    });
    tlEl.addEventListener('dblclick', e => { if (e.target.closest('.blk')) { seek(at(e)); } });
  }

  // ---------- inspector ----------
  const field = (label, html) => `<div class="row"><label>${label}</label><div>${html}</div></div>`;
  const inp = (id, v, type = 'text', extra = '') => `<input id="${id}" type="${type}" value="${esc(v)}" ${extra}>`;
  const opts = (list, cur) => list.map(o => `<option ${o === cur ? 'selected' : ''}>${o}</option>`).join('');
  function bind(id, fn, evt = 'change') { const e = document.getElementById(id); if (e) e.addEventListener(evt, () => edit(() => fn(e), {keepInspector: evt === 'input'})); }

  function renderInspector() {
    const s = shot(), box = $('#tab-shot');
    if (!s) { box.innerHTML = '<p class="muted">No shot selected.</p>'; return; }
    const m = media[s.media] || {};
    let h = `<div class="sec"><h4>Shot ${sel + 1} · ${esc(s.kind)}</h4>`;
    if (s.kind !== 'outro') h += field('Picture', `<div class="thumb-pick"><img src="${thumbOf(s)}" alt=""><button id="f-pick">Change…</button><span class="muted">${esc(s.media || '')}</span></div>`);
    h += field('Room', inp('f-room', s.room || ''));
    h += field('Duration', inp('f-dur', s.dur, 'number', 'step="0.05" min="0.8"'));
    if (s.kind === 'video') h += field('Clip start', inp('f-clipin', s.clipIn || 0, 'number', 'step="0.1" min="0"')) + field('Speed', inp('f-speed', s.speed || 1, 'number', 'step="0.05" min="0.25" max="2"'));
    h += '</div>';

    if (s.kind !== 'outro') {
      h += `<div class="sec"><h4>Camera</h4>`;
      h += field('Preset', `<div class="row2"><select id="f-move">${opts(MOVES, s.move)}</select><button id="f-apply">Apply</button></div>`);
      h += field('Easing', `<select id="f-ease">${opts(EASES, s.ease || 'soft')}</select>`);
      h += field('3D depth', `<input id="f-par" type="range" min="0" max="1.2" step="0.05" value="${s.parallax || 0}"><span class="muted">${(s.parallax || 0).toFixed(2)}${m.depthMethod ? ' · ' + m.depthMethod : ' · no depth map'}</span>`);
      h += `<table class="keys-table" id="keysTable"></table><div class="btns" style="margin-top:6px"><button id="f-addkey">+ Key at playhead</button></div></div>`;
    }
    if (s.kind === 'collage') {
      const ti = s.title || {};
      h += `<div class="sec"><h4>Opening title</h4>${field('Title', inp('f-tt', ti.text || ''))}${field('Line 2', inp('f-ts', ti.sub || ''))}${field('Price chip', inp('f-tp', ti.price || ''))}${field('Appears at', inp('f-ta', ti.at ?? 2.1, 'number', 'step="0.05"'))}
        ${field('Tiles', inp('f-tiles', (s.tiles || []).join(', ')))}</div>`;
    }
    if (s.kind === 'photo' || s.kind === 'video') {
      const lb = s.label || {};
      h += `<div class="sec"><h4>Room label</h4>${field('Text', inp('f-lt', lb.text || ''))}${field('Kicker', inp('f-lk', lb.kicker ?? '', 'text', 'placeholder="auto: 01 · Room"'))}
        ${field('Appears at', inp('f-la', lb.at ?? 0.45, 'number', 'step="0.05"'))}${field('Position', `<select id="f-lpos">${opts(['left', 'center'], lb.style === 'center' ? 'center' : 'left')}</select>`)}</div>`;
      h += `<div class="sec"><h4>Stats</h4>`;
      (s.stats || []).forEach((st, k) => {
        h += `<div class="stat-card"><div class="row2">${inp('f-sv' + k, st.value || '', 'text', 'placeholder="1,050"')}${inp('f-su' + k, st.unit || '', 'text', 'placeholder="sq ft"')}</div>
          <div class="row2" style="margin-top:6px">${inp('f-sc' + k, st.caption || '', 'text', 'placeholder="Carpet area"')}${inp('f-sa' + k, st.at ?? 1, 'number', 'step="0.05" title="appears at (s)"')}</div>
          <div class="btns" style="margin-top:6px"><button id="f-sdel${k}" class="danger">Remove</button></div></div>`;
      });
      h += `<button id="f-sadd">+ Add stat</button><p class="note">Only show numbers that come from the listing. Each stat should match something the voiceover says.</p></div>`;
    }
    if (s.kind === 'outro') {
      const a = s.agent || tour.agent || {};
      h += `<div class="sec"><h4>Contact card</h4>${field('Kicker', inp('f-ok', s.kicker ?? 'Interested?'))}${field('Headline', inp('f-oh', s.headline || ''))}
        ${field('Button', inp('f-oc', s.cta || ''))}${field('Footer', inp('f-of', s.footer || ''))}${field('Background', `<div class="thumb-pick"><img src="${thumbOf(s)}" alt=""><button id="f-pick">Change…</button></div>`)}</div>
        <div class="sec"><h4>Agent</h4>${field('Name', inp('f-an', a.name || ''))}${field('Company', inp('f-aco', a.company || ''))}${field('Phone', inp('f-ap', a.phone || ''))}
        ${field('Since', inp('f-as', a.since || ''))}${field('RERA', inp('f-ar', a.rera || ''))}${field('Photo', inp('f-aph', a.photo || '', 'text', 'placeholder="media/agent.jpg"'))}</div>`;
    }
    if (sel < tour.shots.length - 1) {
      const tr = s.transition || {};
      h += `<div class="sec"><h4>Transition to next shot</h4>${field('Type', `<select id="f-tr">${opts(TRS, tr.type || 'cut')}</select>`)}
        ${field('Direction', `<select id="f-trd">${opts(['left', 'right', 'up', 'down'], tr.dir || 'left')}</select>`)}
        ${field('Length', inp('f-trl', tr.dur ?? 0.5, 'number', 'step="0.05" min="0.1" max="2"'))}</div>`;
    }
    if (s.vo) h += `<div class="sec"><h4>Voiceover line</h4><div class="note">${esc(s.vo)}</div><p class="muted">Ask Claude to change the wording; it regenerates the voice and re-fits the timing.</p></div>`;
    box.innerHTML = h;
    renderKeysTable();
    wireInspector();
  }

  function renderKeysTable() {
    const s = shot(), tb = document.getElementById('keysTable');
    if (!tb || !s) return;
    const keys = s.keys || [];
    tb.innerHTML = `<tr><th>at</th><th>x</th><th>y</th><th>zoom</th><th>tilt</th><th></th></tr>` + keys.map((k, i) =>
      `<tr data-idx="${i}"><td><input data-k="${i}" data-f="u" type="number" step="0.01" min="0" max="1" value="${k.u}"></td>
       <td><input data-k="${i}" data-f="x" type="number" step="0.01" value="${k.x}"></td>
       <td><input data-k="${i}" data-f="y" type="number" step="0.01" value="${k.y}"></td>
       <td><input data-k="${i}" data-f="z" type="number" step="0.01" min="1" value="${k.z}"></td>
       <td><input data-k="${i}" data-f="r" type="number" step="0.1" value="${k.r || 0}"></td>
       <td><button data-del="${i}" title="Delete key" ${keys.length <= 1 ? 'disabled' : ''}>✕</button></td></tr>`).join('');
    tb.querySelectorAll('input').forEach(e => e.addEventListener('change', () => edit(() => {
      const k = s.keys[e.dataset.k]; k[e.dataset.f] = r3(Number(e.value));
      if (e.dataset.f === 'u') s.keys.sort((a, b) => a.u - b.u);
      s.move = s.move && s.move.endsWith('*') ? s.move : (s.move || 'custom');
    })));
    tb.querySelectorAll('button[data-del]').forEach(b => b.addEventListener('click', () => edit(() => s.keys.splice(Number(b.dataset.del), 1))));
    tb.querySelectorAll('tr[data-idx]').forEach(tr => tr.addEventListener('dblclick', () => { const g = segOf(sel); seek(g.vStart + s.keys[tr.dataset.idx].u * (g.vEnd - g.vStart)); }));
    markCurrentKey();
  }

  function wireInspector() {
    const s = shot();
    const num = e => Number(e.value);
    document.getElementById('f-pick')?.addEventListener('click', () => openPicker(id => edit(() => {
      if (s.kind === 'outro') s.bg = id;
      else { s.media = id; s.kind = media[id].kind === 'video' ? 'video' : (s.kind === 'collage' ? 'collage' : 'photo'); if (s.move && s.move !== 'custom') s.keys = presetKeys(s.move, media[id]); }
    })));
    bind('f-room', e => { s.room = e.value || null; });
    bind('f-dur', e => { s.dur = Math.max(0.8, num(e)); });
    bind('f-clipin', e => { s.clipIn = Math.max(0, num(e)); });
    bind('f-speed', e => { s.speed = num(e); });
    document.getElementById('f-apply')?.addEventListener('click', () => edit(() => { s.move = $('#f-move').value; s.keys = presetKeys(s.move, media[s.media]); }));
    bind('f-ease', e => { s.ease = e.value; });
    bind('f-par', e => { s.parallax = num(e); });
    document.getElementById('f-addkey')?.addEventListener('click', () => edit(() => { keyAtPlayhead(true); }));
    bind('f-tt', e => { (s.title = s.title || {}).text = e.value; });
    bind('f-ts', e => { (s.title = s.title || {}).sub = e.value; });
    bind('f-tp', e => { (s.title = s.title || {}).price = e.value; });
    bind('f-ta', e => { (s.title = s.title || {}).at = num(e); });
    bind('f-tiles', e => { s.tiles = e.value.split(/[\s,]+/).filter(id => media[id]); });
    const lab = () => (s.label = s.label || {text: ''});
    bind('f-lt', e => { if (e.value) lab().text = e.value; else delete s.label; });
    bind('f-lk', e => { if (e.value === '') delete lab().kicker; else lab().kicker = e.value; });
    bind('f-la', e => { lab().at = num(e); });
    bind('f-lpos', e => { if (e.value === 'center') lab().style = 'center'; else delete lab().style; });
    (s.stats || []).forEach((st, k) => {
      bind('f-sv' + k, e => { st.value = e.value; });
      bind('f-su' + k, e => { st.unit = e.value; });
      bind('f-sc' + k, e => { st.caption = e.value; });
      bind('f-sa' + k, e => { st.at = num(e); });
      document.getElementById('f-sdel' + k)?.addEventListener('click', () => edit(() => { s.stats.splice(k, 1); if (!s.stats.length) delete s.stats; }));
    });
    document.getElementById('f-sadd')?.addEventListener('click', () => edit(() => { (s.stats = s.stats || []).push({value: '', unit: '', caption: '', at: 1.0}); }));
    bind('f-ok', e => { s.kicker = e.value; });
    bind('f-oh', e => { s.headline = e.value; });
    bind('f-oc', e => { s.cta = e.value; });
    bind('f-of', e => { s.footer = e.value; });
    const ag = () => (s.agent = s.agent || clone(tour.agent || {}));
    bind('f-an', e => { ag().name = e.value; });
    bind('f-aco', e => { ag().company = e.value; });
    bind('f-ap', e => { ag().phone = e.value; });
    bind('f-as', e => { ag().since = e.value; });
    bind('f-ar', e => { ag().rera = e.value; });
    bind('f-aph', e => { ag().photo = e.value; });
    const tr = () => (s.transition = s.transition || {type: 'whip', dur: 0.5});
    bind('f-tr', e => { if (e.value === 'cut') s.transition = {type: 'cut'}; else tr().type = e.value; });
    bind('f-trd', e => { tr().dir = e.value; });
    bind('f-trl', e => { tr().dur = Math.max(0.1, num(e)); });
  }

  function renderReview() {
    const s = shot(), box = $('#tab-review');
    if (!s) return;
    const r = reviews[s.id] || {status: 'pending', feedback: ''};
    const all = reviews._overall || {status: 'pending', feedback: ''};
    const counts = tour.shots.reduce((c, x) => { const st = (reviews[x.id] || {}).status || 'pending'; c[st] = (c[st] || 0) + 1; return c; }, {});
    box.innerHTML = `<div class="sec"><h4>Shot ${sel + 1}: ${esc(titleOf(s))}</h4>
      <div class="btns review-btns"><button data-st="approved" class="${r.status === 'approved' ? 'on approved' : ''}">✓ Approve</button>
      <button data-st="rejected" class="${r.status === 'rejected' ? 'on rejected' : ''}">✕ Needs changes</button></div>
      <p class="muted">Notes for Claude (what to change, or what you like):</p><textarea id="rv-text">${esc(r.feedback)}</textarea>
      <div class="btns" style="margin-top:8px"><button id="rv-save" class="primary">Save note</button></div></div>
      <div class="sec"><h4>Whole reel</h4><textarea id="rv-all" placeholder="Pacing, music, voice, anything overall">${esc(all.feedback)}</textarea>
      <div class="btns" style="margin-top:8px"><button id="rv-all-save">Save note</button></div>
      <p class="muted">${counts.approved || 0} approved · ${counts.rejected || 0} need changes · ${counts.pending || 0} not reviewed</p></div>`;
    const post = async (id, status, feedback) => {
      const res = await fetch('/api/reviews', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({id, status, feedback})});
      if (!res.ok) { setStatus('Review not saved', 'err'); return; }
      reviews[id] = await res.json(); renderList(); renderReview();
    };
    box.querySelectorAll('[data-st]').forEach(b => b.onclick = () => post(s.id, r.status === b.dataset.st ? 'pending' : b.dataset.st, $('#rv-text').value));
    $('#rv-save').onclick = () => post(s.id, r.status, $('#rv-text').value);
    $('#rv-all-save').onclick = () => post('_overall', 'pending', $('#rv-all').value);
  }

  function renderProject() {
    const box = $('#tab-project'), look = tour.look || {}, g = tour.grade || {};
    const sl = (id, v, min, max, step) => `<input id="${id}" type="range" min="${min}" max="${max}" step="${step}" value="${v}">`;
    box.innerHTML = `<div class="sec"><h4>Reel</h4>${field('Title', inp('p-title', tour.title || ''))}${field('Accent', inp('p-accent', tour.accent || '#2EE6FF', 'color'))}
      ${field('Room tracker', `<input id="p-tracker" type="checkbox" ${tour.tracker !== false ? 'checked' : ''}>`)}</div>
      <div class="sec"><h4>Look</h4>${field('Exposure', sl('p-exp', g.exposure ?? 1.03, 0.8, 1.3, 0.01))}${field('Contrast', sl('p-con', g.contrast ?? 1.04, 0.85, 1.25, 0.01))}
      ${field('Saturation', sl('p-sat', g.saturation ?? 1.06, 0.6, 1.4, 0.01))}${field('Warmth', sl('p-warm', g.warmth ?? 0.3, -1, 1.5, 0.05))}
      ${field('Grain', sl('p-grain', look.grain ?? 0.035, 0, 0.1, 0.005))}${field('Vignette', sl('p-vig', look.vignette ?? 0.22, 0, 0.6, 0.01))}</div>
      <div class="sec"><h4>Sound</h4><p class="note">The preview plays the last mix (media/mix.wav). After you change timing, ask Claude to re-run the mix so the voice and whooshes line up again.</p><p id="mixState" class="muted"></p></div>`;
    bind('p-title', e => { tour.title = e.value; $('#title').textContent = e.value; });
    bind('p-accent', e => { tour.accent = e.value; document.documentElement.style.setProperty('--accent', e.value); $('#stage').style.setProperty('--accent', e.value); });
    bind('p-tracker', e => { tour.tracker = e.checked; });
    const gs = (id, key) => bind(id, e => { (tour.grade = tour.grade || {})[key] = Number(e.value); }, 'input');
    gs('p-exp', 'exposure'); gs('p-con', 'contrast'); gs('p-sat', 'saturation'); gs('p-warm', 'warmth');
    bind('p-grain', e => { (tour.look = tour.look || {}).grain = Number(e.value); }, 'input');
    bind('p-vig', e => { (tour.look = tour.look || {}).vignette = Number(e.value); }, 'input');
    checkMix();
  }
  async function checkMix() {
    try {
      const st = await (await fetch('/api/status')).json();
      const el = document.getElementById('mixState');
      if (el) el.textContent = st.mix ? (st.mix < st.tour ? 'The mix is older than the last save: timing may be off.' : 'The mix matches the saved tour.') : 'No mix yet.';
    } catch (e) { /* ignore */ }
  }

  // ---------- media picker ----------
  function openPicker(cb) {
    const grid = $('#pickGrid');
    grid.innerHTML = Object.entries(media).filter(([k]) => !k.startsWith('_')).map(([k, m]) =>
      `<button value="${k}" type="button" data-id="${k}"><img src="/${m.thumb}" alt=""><span>${k}${m.kind === 'video' ? ' ▶︎' : ''}</span></button>`).join('');
    grid.querySelectorAll('button').forEach(b => b.onclick = () => { $('#picker').close(); cb(b.dataset.id); });
    $('#picker').showModal();
  }

  // ---------- save / undo ----------
  async function save() {
    try {
      const res = await fetch('/api/tour', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(tour)});
      if (!res.ok) throw new Error((await res.json()).error);
      dirty = false; setStatus('Saved');
    } catch (e) { setStatus('Save failed', 'err'); alert('Could not save: ' + e.message); }
  }
  function undo() { if (!undoStack.length) return; redoStack.push(JSON.stringify(tour)); tour = JSON.parse(undoStack.pop()); changed(); }
  function redo() { if (!redoStack.length) return; undoStack.push(JSON.stringify(tour)); tour = JSON.parse(redoStack.pop()); changed(); }

  // ---------- boot ----------
  async function boot() {
    [tour, media, reviews] = await Promise.all(['/api/tour', '/api/media', '/api/reviews'].map(u => fetch(u).then(r => r.json())));
    if (!tour.shots || !tour.shots.length) { document.body.innerHTML = '<p style="padding:40px">tour.json has no shots yet. Ask Claude to build the tour first.</p>'; return; }
    $('#title').textContent = tour.title || 'Property tour';
    document.title = (tour.title || 'Tour') + ' · Tour Editor';
    document.documentElement.style.setProperty('--accent', tour.accent || '#2EE6FF');
    $('#stage').style.setProperty('--accent', tour.accent || '#2EE6FF');
    engine = new TourEngine($('#gl'), $('#overlay'));
    await engine.load(tour, media);
    tl = engine.tl;
    fetch('/media/mix.wav', {method: 'HEAD'}).then(r => { if (r.ok) audio.src = '/media/mix.wav'; });
    fitStage(); renderList(); renderTimeline(); renderInspector(); renderProject(); renderReview();
    setupStageControls(); setupTimelineSeek();
    window.addEventListener('resize', () => { fitStage(); renderTimeline(); });
    $('#play').onclick = () => (playing ? pause() : play());
    $('#toStart').onclick = () => seek(0);
    $('#prevShot').onclick = () => select(sel - 1, true);
    $('#nextShot').onclick = () => select(sel + 1, true);
    $('#save').onclick = save; $('#undo').onclick = undo; $('#redo').onclick = redo;
    $('#guidesOn').onchange = e => $('#guides').classList.toggle('on', e.target.checked);
    $('#audioOn').onchange = e => { if (!e.target.checked) audio.pause(); else if (playing) syncAudio(); };
    $('#addShot').onclick = () => openPicker(id => edit(() => {
      const m = media[id], at = Math.max(1, Math.min(sel + 1, tour.shots.length - (tour.shots[tour.shots.length - 1].kind === 'outro' ? 1 : 0)));
      const prev = tour.shots[sel] || {};
      tour.shots.splice(at, 0, {id: 'shot-' + Date.now().toString(36), kind: m.kind === 'video' ? 'video' : 'photo', group: prev.group, room: prev.room || null,
        media: id, move: 'push', keys: presetKeys('push', m), parallax: m.depthMethod === 'depth-anything-v2' ? 0.55 : 0.25, dur: 2.5, transition: {type: 'whip', dir: 'left', dur: 0.45}});
      sel = at;
    }));
    $('#dupShot').onclick = () => edit(() => { const c = clone(shot()); c.id = c.id + '-b' + Date.now().toString(36).slice(-3); delete c.label; delete c.stats; delete c.vo; tour.shots.splice(sel + 1, 0, c); sel++; });
    $('#delShot').onclick = () => { if (tour.shots.length > 1 && confirm(`Delete shot ${sel + 1}? (Undo brings it back.)`)) edit(() => { tour.shots.splice(sel, 1); }); };
    document.querySelectorAll('.tabs button').forEach(b => b.onclick = () => {
      document.querySelectorAll('.tabs button').forEach(x => x.classList.toggle('on', x === b));
      document.querySelectorAll('.tab').forEach(x => x.classList.toggle('on', x.id === 'tab-' + b.dataset.tab));
      if (b.dataset.tab === 'review') renderReview();
      if (b.dataset.tab === 'project') renderProject();
    });
    window.addEventListener('keydown', e => {
      const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); return; }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
      if (typing) return;
      if (e.code === 'Space') { e.preventDefault(); playing ? pause() : play(); }
      else if (e.key === 'ArrowLeft') seek(t - (e.shiftKey ? 1 : 1 / 30));
      else if (e.key === 'ArrowRight') seek(t + (e.shiftKey ? 1 : 1 / 30));
      else if (e.key === '[') select(sel - 1, true);
      else if (e.key === ']') select(sel + 1, true);
      else if (e.key === 'Home') seek(0);
      else if (e.key.toLowerCase() === 'k' && editableShot()) edit(() => { keyAtPlayhead(true); });
    });
    window.addEventListener('beforeunload', e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });
    t = 0.01; draw();
    setInterval(checkMix, 15000);
    window.__tour = () => tour;
  }
  const _renderInspector = renderInspector;
  renderInspector = function () { _renderInspector(); if ($('#tab-review').classList.contains('on')) renderReview(); };
  boot().catch(e => { console.error(e); document.body.insertAdjacentHTML('afterbegin', `<pre style="color:#f66;padding:20px">${esc(e.stack || e)}</pre>`); });
})();
