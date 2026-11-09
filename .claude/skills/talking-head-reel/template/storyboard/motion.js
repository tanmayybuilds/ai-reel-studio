// Timeline-driven motion layer. Every animation is paused and seeked from video time,
// so the same code gives the dashboard preview and frame-exact renders later.
const CANVAS_W = 1080, HERO_MAX = 940;
const EASE = 'cubic-bezier(.2,.8,.2,1)', BACK = 'cubic-bezier(.3,1.5,.5,1)';
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = p => { p = clamp(p); return p * p * (3 - 2 * p); };
const el = (tag, cls, parent, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; if (parent) parent.appendChild(n); return n; };
const HAND = '<svg viewBox="0 0 120 150"><g stroke="#10101a" stroke-width="7" fill="#fff" stroke-linejoin="round"><path d="M40 62V22a11 11 0 0 1 22 0v34V14a11 11 0 0 1 22 0v44V24a11 11 0 0 1 22 0v62c0 32-18 54-46 54-20 0-32-9-42-27L8 88c-5-9 7-20 16-12l16 16z"/></g></svg>';

const GITHUB = 'M8 0a8 8 0 0 0-2.5 15.6c.4.1.5-.2.5-.4v-1.4c-2.2.5-2.7-1-2.7-1-.4-.9-.9-1.2-.9-1.2-.7-.5.1-.5.1-.5.8.1 1.2.8 1.2.8.7 1.2 1.9.9 2.3.7.1-.5.3-.9.5-1.1-1.8-.2-3.7-.9-3.7-4 0-.9.3-1.6.8-2.1-.1-.2-.4-1 .1-2.1 0 0 .7-.2 2.2.8a7.6 7.6 0 0 1 4 0c1.5-1 2.2-.8 2.2-.8.4 1.1.2 1.9.1 2.1.5.6.8 1.3.8 2.1 0 3.1-1.9 3.8-3.7 4 .3.3.6.8.6 1.5v2.2c0 .2.1.5.6.4A8 8 0 0 0 8 0z';

const reveal = (node, at, dur = .2) => ({node, at, dur, ease: EASE, frames: [{opacity: 0, filter: 'blur(14px)', transform: 'translateY(16px)'}, {opacity: 1, filter: 'blur(0)', transform: 'none'}]});
const pop = (node, at, dur = .26) => ({node, at, dur, ease: BACK, frames: [{opacity: 0, filter: 'blur(10px)', transform: 'scale(.76)'}, {opacity: 1, filter: 'blur(0)', transform: 'none'}]});
const rise = (node, at, dur = .34) => ({node, at, dur, ease: EASE, frames: [{opacity: 0, filter: 'blur(16px)', transform: 'translateY(70px) scale(.94)'}, {opacity: 1, filter: 'blur(0)', transform: 'none'}]});

function bars(parent, count) { return Array.from({length: count}, () => el('i', '', parent)); }
function heroLines(text) { return text.includes('|') ? text.split('|') : text.length > 12 && text.includes(' ') ? text.split(' ') : [text]; }

// Sarmila reel (8 Nov 2026): karaoke captions. Each word pops in on its spoken time; the word being spoken
// carries an accent box until the next word lands. Keywords ([text, at, 'key'|'red'|'gold']) keep their colour.
const ACCENT = '#2ee6ff', ACCENT_INK = '#00222e';  // set_accent.py swaps these with the rest of the palette
const ACCENT_RGB = [1, 3, 5].map(i => parseInt(ACCENT.slice(i, i + 2), 16)).join(',');
const KEY_COL = {key: ACCENT, red: '#ff5c7f', gold: '#ffd36e'};
const popWord = (node, at) => ({node, at, dur: .22, ease: BACK, frames: [{opacity: 0, filter: 'blur(8px)', transform: 'translateY(14px) scale(.55)'}, {opacity: 1, filter: 'blur(0)', transform: 'none'}]});
function capWords(line, list, ctx, endAt) {
  line.classList.add('kara');
  list.forEach(([text, at, key], i) => {
    const span = el('span', key ? `kw kw-${key}` : '', line, text);  // not plain "key": that class is the typer's keyboard key
    ctx.anims.push(popWord(span, at));
    const next = i + 1 < list.length ? list[i + 1][1] : endAt ?? at + .42;
    const dur = Math.max(.14, Math.min(next, at + .6) - at);
    const base = KEY_COL[key] ?? '#ffffff';
    const box = key === 'red' ? '255,61,102' : ACCENT_RGB;
    const ink = key === 'red' ? '#ffffff' : ACCENT_INK;
    const p = Math.min(.35, .05 / dur);
    ctx.anims.push({node: span, at, dur, ease: 'linear', frames: [
      {backgroundColor: `rgba(${box},0)`, color: base, scale: '1'},
      {backgroundColor: `rgba(${box},1)`, color: ink, scale: '1.08', offset: p},
      {backgroundColor: `rgba(${box},1)`, color: ink, scale: '1.08', offset: 1 - p},
      {backgroundColor: `rgba(${box},0)`, color: base, scale: '1'}]});
  });
}

let CHART_ID = 0;
// y of each chart curve for x in 0..1 (0 = top of the plot, 1 = bottom).
const CURVES = {
  flat: x => .72 - .07 * x + .022 * Math.sin(x * 19) * (1 - .4 * x),
  down: x => .2 + .62 * Math.pow(x, 1.15) + .03 * Math.sin(x * 16),
  compound: x => .9 - .82 * (Math.exp(3.3 * x) - 1) / (Math.exp(3.3) - 1) + .012 * Math.sin(x * 21),
  up: x => .85 - .7 * x + .03 * Math.sin(x * 14)
};
const ICONS = {
  bank: '<svg viewBox="0 0 64 64"><path fill="currentColor" d="M32 4 4 18v6h56v-6L32 4zM8 28h8v22H8zm14 0h8v22h-8zm12 0h8v22h-8zm14 0h8v22h-8zM4 54h56v6H4z"/></svg>',
  fund: '<svg viewBox="0 0 64 64"><path fill="currentColor" d="M32 3 7 12v17c0 15 10.6 28.4 25 32 14.4-3.6 25-17 25-32V12L32 3z" opacity=".25"/><path fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" d="M17 42l10-10 7 7 13-15m-9 0h9v9"/></svg>',
  grad: '<svg viewBox="0 0 64 64"><path fill="#14131c" d="M32 10 2 24l30 14 30-14L32 10z"/><path fill="#14131c" d="M14 32v12c0 5 8 9 18 9s18-4 18-9V32L32 41 14 32z"/><path fill="none" stroke="#ffd36e" stroke-width="3" d="M56 27v16"/><circle cx="56" cy="45" r="4" fill="#ffd36e"/></svg>',
  boy: '<svg viewBox="0 0 64 64"><circle cx="32" cy="22" r="13" fill="currentColor"/><path fill="currentColor" d="M8 60c0-14 10.7-23 24-23s24 9 24 23z"/></svg>',
  doc: '<svg viewBox="0 0 64 64"><path fill="currentColor" d="M14 4h26l14 14v42H14z" opacity=".9"/><path fill="none" stroke="#0c1820" stroke-width="4" stroke-linecap="round" d="M22 28h20M22 38h20M22 48h12"/></svg>',
  lens: '<svg viewBox="0 0 120 120"><circle cx="48" cy="48" r="34" fill="rgba(46, 230, 255,.22)" stroke="#0c1820" stroke-width="10"/><path stroke="#0c1820" stroke-width="16" stroke-linecap="round" d="M74 74l34 34"/></svg>',
  school: '<svg viewBox="0 0 64 64"><path fill="currentColor" d="M32 6 6 20v6h52v-6L32 6zM10 30h44v28H10z" opacity=".95"/><path fill="#0c1820" d="M27 42h10v16H27z"/></svg>'
};

const builders = {
  cap(o, ctx) {
    // Two styles. Default (house style, approved on VoiceStudio to Muse): lead words blur in one by one, then the
    // hero word wipes in. With `karaoke: true` (approved on the Sarmila reel): the lead sits in a frosted pill,
    // the word being spoken carries an accent box, keywords keep a colour ([text, at, 'key'|'red'|'gold']), and the
    // hero word lands with a scale-in plus a light sheen.
    const kara = !!o.karaoke;
    const box = el('div', `cap${o.ink ? ' ink' : ''}${kara ? ' karaoke' : ''}`, ctx.root);
    box.style.top = `${o.y ?? 1130}px`;
    const words = (list, cls, endAt) => {
      const line = el('div', cls, box);
      if (!kara) {
        for (const [text, at] of list) ctx.anims.push(reveal(el('span', '', line, text), at));
        return;
      }
      // The frosted pill behind the words fades up just before the first word.
      ctx.anims.push({node: line, at: list[0][1] - .08, dur: .18, ease: EASE, frames: [{opacity: 0, transform: 'scale(.9)'}, {opacity: 1, transform: 'none'}]});
      capWords(line, list, ctx, endAt);
    };
    if (o.lead) words(o.lead, 'lead', o.word ? o.wordAt : undefined);
    if (o.word) {
      const wrap = el('div', 'hero-wrap', box);
      for (const text of o.oneLine ? [o.word] : heroLines(o.word)) {
        const line = el('div', `hero ${o.tone}`, wrap, text);
        ctx.fit.push(line);
        if (!kara) {
          ctx.anims.push({node: line, at: o.wordAt, dur: .26, ease: EASE, frames: [{opacity: 0, clipPath: 'inset(-30% 105% -30% -5%)', filter: 'blur(12px)'}, {opacity: 1, clipPath: 'inset(-30% -5% -30% -5%)', filter: 'blur(0)'}]});
          continue;
        }
        ctx.anims.push({node: line, at: o.wordAt, dur: .26, ease: EASE, frames: [{opacity: 0, clipPath: 'inset(-30% 105% -30% -5%)', filter: 'blur(12px)', scale: '1.28'}, {opacity: 1, clipPath: 'inset(-30% -5% -30% -5%)', filter: 'blur(0)', scale: '1'}]});
        // A light sheen runs across the hero word once it has landed.
        // (the tone's CSS has a white band as its first background layer, clipped to the glyphs)
        ctx.anims.push({node: line, at: o.wordAt + .2, dur: .6, ease: 'ease-in-out', frames: [{backgroundPosition: '160% 0, 0 0'}, {backgroundPosition: '-60% 0, 0 0'}]});
      }
    }
    if (o.tail) words(o.tail, 'lead');
    return box;
  },
  stack(o, ctx) {
    const box = el('div', 'cap', ctx.root);
    box.style.top = '1110px';
    const top = el('div', 'hero white', el('div', 'hero-wrap', box), o.top);
    const bottom = el('div', 'hero red', el('div', 'hero-wrap', box), o.bottom);
    ctx.fit.push(top, bottom);
    ctx.anims.push(pop(top, o.in), {node: bottom, at: o.bottomAt, dur: .2, ease: BACK, frames: [{opacity: 0, transform: 'scale(1.5)', filter: 'blur(12px)'}, {opacity: 1, transform: 'none', filter: 'blur(0)'}]});
    return box;
  },
  tiles(o, ctx) {
    const grid = el('div', 'tiles', ctx.root);
    grid.style.top = `${o.y}px`;
    const rows = {};
    for (const item of o.items) (rows[item.row ?? 0] ||= []).push(item);
    for (const row of Object.values(rows)) {
      const line = el('div', 'tile-row', grid);
      for (const item of row) ctx.anims.push(pop(el('div', `tile${item.hot ? ' hot' : ''}${item.small ? ' small' : ''}`, line, item.text), item.at));
    }
    return grid;
  },
  pill(o, ctx) {
    const box = el('div', 'pill', ctx.root);
    box.style.top = `${o.y}px`;
    el('b', `dot ${o.icon}`, box, o.icon === 'x' ? '✕' : '✓');
    const text = el('span', 'pill-text', box);
    for (const [word, at] of o.words) ctx.anims.push(reveal(el('span', '', text, word), at, .16));
    ctx.anims.push({node: box, at: o.in, dur: .22, ease: EASE, frames: [{opacity: 0, filter: 'blur(12px)'}, {opacity: 1, filter: 'blur(0)'}]});
    return box;
  },
  white(o, ctx) { return el('div', 'board', ctx.root); },
  stars(o, ctx) {
    const box = el('div', 'stars', ctx.root);
    const value = el('div', 'stars-value', box, '0');
    el('div', 'stars-label', box, o.label ?? 'stars on GitHub');
    ctx.anims.push(reveal(box, o.in, .24));
    ctx.ticks.push(t => { value.textContent = `${(o.value * smooth((t - o.in) / 1.1)).toFixed(1)}${o.suffix ?? 'k+'}`; });
    return box;
  },
  repoPin(o, ctx) {
    const box = el('div', 'repo-pin big', ctx.root);
    box.innerHTML = '<svg viewBox="0 0 16 16"><path fill="#14141c" d="' + GITHUB + '"/></svg>';
    const text = el('span', 'pin-text', box);
    el('small', '', text, o.label ?? 'GitHub repository');
    el('b', '', text, o.name);
    if (o.hidden) el('span', 'pin-hidden', box, o.hidden);  // covers the name until a later reveal
    ctx.anims.push(pop(box, o.in));
    return box;
  },
  slotCard(o, ctx) {
    const slot = el('div', 'slot', ctx.root);
    Object.assign(slot.style, {left: `${o.x}px`, top: `${o.y}px`, width: `${o.w}px`, height: `${o.h}px`});
    const image = el('img', '', slot);
    image.src = o.src;
    ctx.anims.push(rise(image, o.in));
    return slot;
  },
  slots(o, ctx) {
    const col = el('div', 'slots', ctx.root);
    col.style.top = `${o.y}px`;
    const hand = el('div', 'hand', ctx.root);
    hand.innerHTML = HAND;
    const stops = o.items.map((item, i) => {
      const image = el('img', '', el('div', 'slot static', col));
      image.src = item.src;
      ctx.anims.push(rise(image, item.at, .26));
      return {at: item.at, x: 800, y: o.y + 170 + i * 256};
    });
    ctx.ticks.push(t => {
      let x = 1140, y = 1300;
      for (const stop of stops) { const p = smooth((t - stop.at + .3) / .3); x += (stop.x - x) * p; y += (stop.y - y) * p; }
      hand.style.transform = `translate(${x}px,${y}px) rotate(-12deg)`;
    });
    return col;
  },
  panel(o, ctx) {
    const card = el('div', 'panel', ctx.root);
    Object.assign(card.style, {left: `${o.x}px`, top: `${o.y}px`, width: `${o.w}px`});
    el('img', '', card).src = o.src;
    ctx.anims.push(rise(card, o.in));
    return card;
  },
  code(o, ctx) {
    const card = el('div', 'code', ctx.root);
    Object.assign(card.style, {left: `${o.x}px`, top: `${o.y}px`, width: `${o.w}px`});
    const inner = el('div', '', card);
    el('small', '', inner, o.label);
    inner.append(o.text);
    ctx.anims.push(rise(card, o.in));
    return card;
  },
  appCard(o, ctx) {
    const card = el('div', 'panel app', ctx.root);
    Object.assign(card.style, {left: `${o.x}px`, top: `${o.y}px`, width: `${o.w}px`});
    const inner = el('div', 'app-inner', card);
    el('img', 'app-script', inner).src = o.script;
    const row = el('div', 'app-row', inner);
    const wave = el('div', 'mini-wave', row);
    const lines = bars(wave, 22);
    const button = el('img', 'app-button', row);
    button.src = o.button;
    ctx.anims.push(rise(card, o.in));
    ctx.anims.push({node: button, at: o.press - .05, dur: .22, ease: 'ease-out', frames: [{transform: 'scale(1)'}, {transform: 'scale(.9)', offset: .4}, {transform: 'scale(1)'}]});
    ctx.ticks.push(t => {
      const on = clamp((t - o.press) / .2);
      lines.forEach((bar, i) => { bar.style.transform = `scaleY(${.08 + on * Math.abs(Math.sin(t * 7 + i * .7)) * (.4 + .6 * Math.abs(Math.sin(i * 1.3)))})`; });
    });
    return card;
  },
  waveBadge(o, ctx) {
    const badge = el('div', 'wave-badge', ctx.root);
    Object.assign(badge.style, {left: `${o.x}px`, top: `${o.y}px`});
    const lines = bars(badge, 5);
    ctx.anims.push(pop(badge, o.in));
    ctx.ticks.push(t => lines.forEach((bar, i) => { bar.style.transform = `scaleY(${.3 + .7 * Math.abs(Math.sin(t * 9 + i))})`; }));
    return badge;
  },
  wave(o, ctx) {
    const strip = el('div', 'wave-strip', ctx.root);
    strip.style.top = `${o.y}px`;
    const lines = bars(strip, 36);
    ctx.anims.push(reveal(strip, o.in, .24));
    ctx.ticks.push(t => {
      const pitch = 5 + 7 * smooth((t - o.in) / 1.2);
      lines.forEach((bar, i) => { bar.style.transform = `scaleY(${.12 + .88 * Math.abs(Math.sin(t * 5 + i / 36 * pitch)) * Math.sin(Math.PI * i / 35)})`; });
    });
    return strip;
  },
  repoScroll(o, ctx) {
    // Real README, stitched from the screen recording, scrolling behind the danger line.
    const card = el('div', 'repo-scroll', ctx.root);
    const page = el('img', '', card);
    page.src = o.src;
    const ticker = el('div', 'ticker', card);
    const run = el('div', 'ticker-run', ticker);
    for (let i = 0; i < 6; i++) el('span', '', run, o.text);
    const chip = el('div', 'star-chip', card);
    chip.style.display = o.stars ? '' : 'none';
    el('b', '', chip, '★');
    const count = el('span', '', chip, '0');
    const countFor = o.countFor ?? 2.3;  // the counter lands, then pulses once
    ctx.anims.push(rise(card, o.in - .3, .3));
    ctx.ticks.push(t => {
      const p = clamp((t - o.in) / (o.out - o.in));
      page.style.transform = `translateY(${-(o.from + (o.to - o.from) * p)}px)`;
      run.style.transform = `translateX(${-t * 260}px)`;
      if (!o.stars) return;
      count.textContent = `${(o.stars * (1 - (1 - clamp((t - o.in) / countFor)) ** 3)).toFixed(1)}k`;
      chip.style.transform = `scale(${1 + .16 * Math.max(0, 1 - Math.abs(t - o.in - countFor - .1) / .16)})`;
    });
    return card;
  },
  appWindow(o, ctx) {
    const card = el('div', 'app-window', ctx.root);
    Object.assign(card.style, {left: `${o.x}px`, top: `${o.y}px`, width: `${o.w}px`});
    el('img', '', card).src = o.src;
    ctx.ticks.push(t => {
      const enter = smooth((t - o.in) / .38), leave = smooth((t - o.out + .16) / .16);
      card.style.opacity = enter * (1 - leave);
      card.style.transform = `perspective(1400px) translateY(${(1 - enter) * 130 - leave * 70}px) rotateX(${(1 - enter) * 28}deg) scale(${.86 + .14 * enter + t * .018})`;
    });
    return card;
  },
  duo(o, ctx) {
    const row = el('div', 'duo', ctx.root);
    row.style.top = `${o.y}px`;
    for (const item of o.items) {
      const slot = el('div', 'duo-slot', row);
      ctx.anims.push(reveal(slot, o.in, .24));
      const card = el('div', `duo-card ${item.tone}`, slot);
      el('div', 'duo-big', card, item.big);
      el('div', 'duo-label', card, item.label);
      el('div', 'duo-note', card, item.note);
      ctx.anims.push(pop(card, item.at, .32));
    }
    return row;
  },
  browser(o, ctx) {
    const win = el('div', 'browser', ctx.root);
    Object.assign(win.style, {left: `${o.x}px`, top: `${o.y}px`, width: `${o.w}px`, height: `${o.h}px`});
    const spin = el('i', 'sheet-glow', win);
    const inner = el('div', 'browser-inner', win);
    const bar = el('div', 'browser-bar', inner);
    for (let i = 0; i < 3; i++) el('i', 'bdot', bar);
    const address = el('div', 'address', bar);
    el('b', 'lock', address, '●');
    const url = el('span', 'url', address);
    const caret = el('i', 'url-caret', address);
    const load = el('i', 'browser-load', inner);
    const body = el('div', 'browser-body', inner);
    const page = el('img', '', body);
    page.src = o.src;
    const head = el('div', 'repo-head', body);
    head.style.display = o.name ? '' : 'none';  // plain websites have no repo bar
    head.innerHTML = '<svg viewBox="0 0 16 16"><path fill="#fff" d="' + GITHUB + '"/></svg>';
    const name = el('span', 'repo-name', head, o.owner ? `${o.owner} / ` : '');
    el('b', '', name, o.name ?? '');
    const chip = el('div', 'star-chip inline', head);
    chip.style.display = o.stars ? '' : 'none';
    el('b', '', chip, '★');
    const count = el('span', '', chip, '0');
    const shine = el('i', 'browser-shine', win);
    ctx.ticks.push(t => {
      const enter = smooth((t - o.in + .1) / .36), loaded = smooth((t - o.loadAt) / .28);
      win.style.opacity = enter;
      win.style.transform = `perspective(1500px) translateY(${(1 - enter) * 120}px) rotateX(${(1 - enter) * 24}deg) scale(${1 + .03 * Math.exp(-(((t - o.loadAt - .12) / .12) ** 2))})`;
      spin.style.transform = `rotate(${t * 150}deg)`;
      url.textContent = o.url.slice(0, Math.floor(clamp((t - o.typeAt) / (o.loadAt - .1 - o.typeAt)) * o.url.length));
      caret.style.opacity = t < o.loadAt && Math.floor((t + 10) * 6) % 2 ? 1 : 0;
      load.style.transform = `scaleX(${clamp((t - o.loadAt + .06) / .3)})`;
      load.style.opacity = t < o.loadAt + .5 ? 1 : 0;
      body.style.opacity = loaded;
      page.style.transform = `translateY(${-(o.from + (o.to - o.from) * clamp((t - o.loadAt) / (o.out - o.loadAt)))}px)`;
      if (o.stars) count.textContent = `${(o.stars * (1 - (1 - clamp((t - o.loadAt) / .8)) ** 3)).toFixed(1)}k`;
      shine.style.transform = `translateX(${-1100 + 2400 * clamp((t - o.loadAt) / .55)}px) skewX(-18deg)`;
    });
    return win;
  },
  verify(o, ctx) {
    const card = el('div', 'verify', ctx.root);
    card.style.top = `${o.y}px`;
    card.innerHTML = '<svg viewBox="0 0 200 130"><rect x="30" y="8" width="140" height="94" rx="10" fill="#14131f" stroke="#fff" stroke-width="7"/><path d="M6 112h188l-10 12H16z" fill="#fff"/></svg>';
    const scan = el('i', 'verify-scan', card);
    const mark = el('b', 'verify-mark', card, '✓');
    ctx.anims.push(rise(card, o.in), pop(mark, o.doneAt));
    ctx.ticks.push(t => { const p = clamp((t - o.in) / (o.doneAt - o.in)); scan.style.top = `${22 + 170 * Math.abs(Math.sin(p * Math.PI * 1.5))}px`; scan.style.opacity = t < o.doneAt ? 1 : 0; });
    return card;
  },
  commentSheet(o, ctx) {
    const sheet = el('div', `comment-sheet${o.style === 'dm' ? ' dm' : ''}`, ctx.root);
    const glow = el('i', 'sheet-glow', sheet);
    const input = el('div', 'comment-input', sheet);
    el('b', 'face', input, o.you ?? 'You');
    const typed = el('span', 'typed', input);
    // o.times: one time per letter, e.g. when the speaker spells the word out (R-E-S-P).
    [...o.text].forEach((c, i) => ctx.anims.push({node: el('span', '', typed, c), at: o.times ? o.times[i] : o.typeAt + i * .05, dur: .12, ease: BACK, frames: [{opacity: 0, transform: 'translateY(26px) scale(.6)'}, {opacity: 1, transform: 'none'}]}));
    const caret = el('i', 'caret', typed);
    const send = el('div', 'send', input);
    send.innerHTML = '<svg viewBox="0 0 24 24"><path fill="#fff" d="M3 20.5 21.5 12 3 3.500V10l12 2-12 2z"/></svg>';
    ctx.anims.push({node: send, at: o.sendAt - .04, dur: .3, ease: 'ease-out', frames: [{transform: 'scale(1)'}, {transform: 'scale(.78)', offset: .3}, {transform: 'scale(1.18)', offset: .65}, {transform: 'scale(1)'}]});
    const burst = el('div', 'burst', sheet);
    Array.from({length: 18}, (_, i) => {
      const dot = el('i', i % 3 ? 'cyan' : 'red', burst);
      const angle = i / 18 * Math.PI * 2, reach = 150 + (i % 4) * 46;
      ctx.anims.push({node: dot, at: o.sendAt, dur: .55, ease: 'cubic-bezier(.1,.7,.2,1)', frames: [{opacity: 0, transform: 'translate(0,0) scale(1)'}, {opacity: 1, transform: 'translate(0,0) scale(1)', offset: .02}, {opacity: 0, transform: `translate(${Math.cos(angle) * reach}px,${Math.sin(angle) * reach}px) scale(.2)`}]});
    });
    const posted = el('div', 'comment-row', sheet);
    el('b', 'face', posted, o.you ?? 'You');
    const body = el('div', 'row-text', posted);
    el('small', '', body, o.when ?? 'abhi');
    el('strong', '', body, o.keepCase ? o.text : o.text.toLowerCase());
    const heart = el('span', 'heart', posted, '♥');
    ctx.anims.push(rise(posted, o.sendAt + .04, .28), {node: heart, at: o.sendAt + .4, dur: .34, ease: BACK, frames: [{transform: 'scale(0)'}, {transform: 'scale(1.5)', offset: .6}, {transform: 'scale(1)'}]});
    const dm = el('div', 'dm-row', sheet);
    el('b', 'dm-face', dm, o.initial ?? 'T');
    const dmText = el('div', 'row-text', dm);
    el('strong', '', dmText, o.dmTitle);
    el('small', '', dmText, o.dmNote);
    el('span', 'dm-badge', dm, o.dmBadge ?? 'NEW');
    const plane = el('div', 'plane', sheet);
    plane.innerHTML = '<svg viewBox="0 0 24 24"><path fill="#fff" d="M3 20.500 21.500 12 3 3.500V10l12 2-12 2z"/></svg>';
    ctx.anims.push(rise(dm, o.dmAt, .3));
    ctx.anims.push({node: plane, at: o.dmAt - .32, dur: .42, ease: 'ease-in', frames: [{opacity: 0, transform: 'translate(0,0) rotate(0deg) scale(.7)'}, {opacity: 1, transform: 'translate(-40px,20px) rotate(4deg) scale(.8)', offset: .1}, {opacity: 1, transform: 'translate(-300px,120px) rotate(30deg) scale(1.1)', offset: .7}, {opacity: 0, transform: 'translate(-520px,200px) rotate(20deg) scale(.4)'}]});
    ctx.anims.push(rise(sheet, o.in, .36));
    ctx.ticks.push(t => {
      const gone = t >= o.sendAt;
      typed.style.opacity = gone ? 0 : 1;
      caret.style.opacity = !gone && Math.floor((t + 10) * 5) % 2 ? 1 : 0;
      glow.style.transform = `rotate(${t * 70}deg)`;
      // The sheet grows as rows arrive, so it never sits half empty.
      sheet.style.height = `${230 + 152 * smooth((t - o.sendAt) / .3) + 148 * smooth((t - o.dmAt) / .3)}px`;
    });
    return sheet;
  },
  notify(o, ctx) {
    const row = el('div', 'notify', ctx.root);
    row.style.top = `${o.y}px`;
    el('b', 'notify-dot', row, o.initial ?? 'T');
    const text = el('div', 'notify-text', row);
    el('strong', '', text, o.title);
    el('small', '', text, o.note);
    el('span', 'notify-badge', row, o.badge);
    ctx.anims.push(rise(row, o.in));
    return row;
  },
  typer(o, ctx) {
    // A glass text field typed slowly by hand, with a mini keyboard pressing the real letter being typed.
    const box = el('div', 'typer', ctx.root);
    box.style.top = `${o.y}px`;
    const field = el('div', 'typer-field', box);
    const text = el('span', 'typer-text', field);
    const caret = el('i', 'typer-caret', field);
    const kb = el('div', 'kb', box);
    const keys = {};
    for (const row of ['qwertyuiop', 'asdfghjkl', 'zxcvbnm']) {
      const line = el('div', 'kb-row', kb);
      for (const c of row) keys[c] = el('b', 'key', line, c.toUpperCase());
    }
    keys[' '] = el('b', 'key space', el('div', 'kb-row', kb), '');
    // Deterministic hesitations: each character gets its own small delay, so the typing looks human and slow.
    const times = [];
    let at = o.typeAt;
    [...o.text].forEach((c, i) => { times.push(at); at += o.step * (0.65 + 0.7 * Math.abs(Math.sin(i * 12.9898) * 43758.5453 % 1)); });
    ctx.anims.push(rise(box, o.in, .3));
    ctx.ticks.push(t => {
      let n = 0;
      while (n < times.length && t >= times[n]) n++;
      text.textContent = o.text.slice(0, n);
      caret.style.opacity = Math.floor((t + 10) * 4) % 2 || (n > 0 && t - times[n - 1] < .25) ? 1 : 0;
      for (const k of Object.values(keys)) k.classList.remove('down');
      const last = n > 0 ? o.text[n - 1].toLowerCase() : null;
      if (last && t - times[n - 1] < .12 && keys[last]) keys[last].classList.add('down');
    });
    return box;
  },
  price(o, ctx) {
    // A subscription price card that a red strike slams through on the "no" word.
    const card = el('div', 'price', ctx.root);
    card.style.top = `${o.y}px`;
    const head = el('div', 'price-head', card);
    el('b', 'price-logo', head, o.initial ?? 'W');
    el('span', 'price-name', head, o.name);
    el('small', 'price-plan', head, o.plan ?? '');
    const row = el('div', 'price-row', card);
    const amount = el('span', 'price-amount', row, '$0');
    el('span', 'price-unit', row, o.unit ?? '/ month');
    const strike = el('i', 'price-strike', card);
    const stamp = el('b', 'price-stamp', card, o.stamp ?? 'NAHI');
    ctx.anims.push(rise(card, o.in, .32));
    ctx.anims.push({node: strike, at: o.strikeAt, dur: .18, ease: EASE, frames: [{transform: 'rotate(-8deg) scaleX(0)'}, {transform: 'rotate(-8deg) scaleX(1)'}]});
    ctx.anims.push({node: stamp, at: o.strikeAt + .08, dur: .24, ease: BACK, frames: [{opacity: 0, transform: 'rotate(-12deg) scale(2.2)', filter: 'blur(10px)'}, {opacity: 1, transform: 'rotate(-12deg) scale(1)', filter: 'blur(0)'}]});
    ctx.ticks.push(t => {
      amount.textContent = `$${Math.round(o.value * (1 - (1 - clamp((t - o.countAt) / .45)) ** 3))}`;
      const hit = Math.max(0, 1 - Math.abs(t - o.strikeAt - .1) / .14);
      card.style.transform = `translateX(${Math.sin(t * 90) * 14 * hit}px)`;
      card.classList.toggle('dead', t >= o.strikeAt + .1);
    });
    return card;
  },
  // ---- New for the Muse reel ----
  tokenMeter(o, ctx) {
    // A glowing glass meter whose odometer digits roll from 0 to the full value, comma-grouped, with orbiting token
    // coins; an optional green FREE stamp lands at freeAt.
    const box = el('div', 'tmeter', ctx.root);
    box.style.top = `${o.y}px`;
    const ring = el('i', 'tmeter-spin', el('i', 'tmeter-glow', box));
    el('small', 'tmeter-label', box, o.label ?? 'Muse tokens');
    const row = el('div', 'tmeter-row', box);
    const digits = String(o.value).length, cols = [];
    for (let i = 0; i < digits; i++) {
      if (i && (digits - i) % 3 === 0) el('span', 'tmeter-comma', row, ',');
      const col = el('span', 'tmeter-digit', row);
      const strip = el('span', 'tmeter-strip', col);
      for (let d = 0; d <= 10; d++) el('b', '', strip, String(d % 10));
      cols.push(strip);
    }
    const coins = Array.from({length: 7}, () => el('i', 'tmeter-coin', box));
    if (o.unit) el('div', 'tmeter-unit', box, o.unit);
    const stamp = o.freeAt !== undefined ? el('b', 'tmeter-stamp', box, o.stamp ?? 'FREE') : null;
    ctx.anims.push(rise(box, o.in, .34));
    if (stamp) ctx.anims.push({node: stamp, at: o.freeAt, dur: .26, ease: BACK, frames: [{opacity: 0, transform: 'rotate(-10deg) scale(2.3)', filter: 'blur(10px)'}, {opacity: 1, transform: 'rotate(-10deg) scale(1)', filter: 'blur(0)'}]});
    ctx.ticks.push(t => {
      // Each column rolls on its own clock, the leftmost settling last, like a real counter racing up.
      const p = clamp((t - o.countAt) / (o.dur ?? 1.1));
      const target = String(o.value).padStart(digits, '0');
      cols.forEach((strip, i) => {
        const settle = clamp(p * (1 + (digits - 1 - i) * .08) - (digits - 1 - i) * .02);
        const spins = 2 + (digits - i) % 3;
        const pos = (1 - (1 - settle) ** 3) * (spins * 10 + +target[i]);
        strip.style.transform = `translateY(${-(pos % 10) * 1.1}em)`;
      });
      ring.style.transform = `rotate(${t * 90}deg)`;
      coins.forEach((c, i) => {
        const a = t * 1.6 + i / coins.length * Math.PI * 2;
        const show = smooth((t - o.countAt - i * .05) / .25);
        c.style.transform = `translate(${Math.cos(a) * 470}px, ${Math.sin(a) * 120}px) scale(${.6 + .4 * (Math.sin(a) + 1) / 2})`;
        c.style.opacity = show * (.45 + .55 * (Math.sin(a) + 1) / 2);
        c.style.zIndex = Math.sin(a) > 0 ? 2 : -1;
      });
    });
    return box;
  },
  codeFlap(o, ctx) {
    // A referral field whose characters flap like an airport board and land one by one on the real code; a hand can
    // then press the button under it.
    const box = el('div', 'flap', ctx.root);
    box.style.top = `${o.y}px`;
    el('small', 'flap-label', box, o.label ?? 'Referral code');
    const row = el('div', 'flap-row', box);
    const ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789';
    const cells = [...o.code].map(() => { const c = el('span', 'flap-cell', row); return {c, txt: el('b', '', c)}; });
    const btn = el('div', 'flap-btn', box, o.button ?? 'Redeem');
    ctx.anims.push(rise(box, o.in, .32));
    if (o.pressAt !== undefined) ctx.anims.push({node: btn, at: o.pressAt - .04, dur: .3, ease: 'ease-out', frames: [{transform: 'scale(1)'}, {transform: 'scale(.92)', offset: .3}, {transform: 'scale(1.05)', offset: .65}, {transform: 'scale(1)'}]});
    ctx.ticks.push(t => {
      cells.forEach(({c, txt}, i) => {
        const land = o.flapAt + i * (o.step ?? .09) + .18;
        if (t < o.flapAt) { txt.textContent = ''; c.classList.remove('set', 'flip'); return; }
        if (t >= land) { txt.textContent = o.code[i]; c.classList.add('set'); c.classList.remove('flip'); return; }
        const k = Math.floor((t - o.flapAt) * 30) + i * 7;
        txt.textContent = ABC[(k * 13 + i * 5) % ABC.length];
        c.classList.toggle('flip', k % 2 === 0); c.classList.remove('set');
      });
      btn.classList.toggle('live', t >= o.flapAt + o.code.length * (o.step ?? .09) + .18);
    });
    return box;
  },
  timeline(o, ctx) {
    // A video-editor timeline: film thumbnails stream in while the playhead runs and the length counter climbs past
    // the spoken duration.
    const box = el('div', 'tl', ctx.root);
    box.style.top = `${o.y}px`;
    const head = el('div', 'tl-head', box);
    el('b', 'tl-rec', head, '●');
    el('span', 'tl-title', head, o.title ?? 'AI video');
    const clock = el('span', 'tl-clock', head, '00:00');
    const track = el('div', 'tl-track', box);
    const fill = el('div', 'tl-fill', track);
    const frames = Array.from({length: 12}, () => el('i', 'tl-frame', fill));
    const play = el('i', 'tl-play', track);
    const ticks = el('div', 'tl-ticks', box);
    for (const m of o.marks ?? ['0', '10m', '20m', '30m+']) el('span', '', ticks, m);
    ctx.anims.push(rise(box, o.in, .32));
    ctx.ticks.push(t => {
      const p = 1 - (1 - clamp((t - o.runAt) / (o.dur ?? 1.4))) ** 2;
      fill.style.width = `${p * 100}%`;
      play.style.left = `${p * 100}%`;
      frames.forEach((f, i) => { f.style.opacity = p * 12 > i ? 1 : 0; });
      const secs = Math.round(p * (o.toMin ?? 30) * 60);
      clock.textContent = `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}${p >= 1 ? '+' : ''}`;
    });
    return box;
  },
  stepRail(o, ctx) {
    // A slim progress rail of the how-to steps; the step being spoken lights up cyan, finished ones turn green.
    const rail = el('div', 'rail', ctx.root);
    rail.style.top = `${o.y ?? 190}px`;
    const items = o.steps.map((s, i) => {
      const n = el('div', 'rail-step', rail);
      el('b', '', n, String(i + 1));
      el('span', '', n, s);
      if (i < o.steps.length - 1) el('i', 'rail-link', rail);
      return n;
    });
    if (o.enter !== false) ctx.anims.push({node: rail, at: o.in, dur: .24, ease: EASE, frames: [{opacity: 0, transform: 'translateY(-30px)', filter: 'blur(10px)'}, {opacity: 1, transform: 'none', filter: 'blur(0)'}]});
    items.forEach((n, i) => {
      if (i === o.active) ctx.anims.push({node: n, at: o.activeAt ?? o.in, dur: .3, ease: BACK, frames: [{transform: 'scale(1)'}, {transform: 'scale(1.12)', offset: .5}, {transform: 'scale(1)'}]});
    });
    ctx.ticks.push(t => items.forEach((n, i) => {
      n.classList.toggle('done', i < o.active);
      n.classList.toggle('on', i === o.active && t >= (o.activeAt ?? o.in));
    }));
    return rail;
  },
  offerTimer(o, ctx) {
    // An offer countdown whose digits scramble (nobody knows the end), with a pulsing red rim and a "LIMITED" tag.
    const box = el('div', 'otimer', ctx.root);
    box.style.top = `${o.y}px`;
    const head = el('div', 'otimer-head', box);
    el('b', 'otimer-dot', head, '');
    el('span', '', head, o.title ?? 'Offer ends in');
    const digits = el('div', 'otimer-digits', box);
    const groups = [0, 1, 2].map(i => { const g = el('span', 'otimer-g', digits, '??'); if (i < 2) el('i', '', digits, ':'); return g; });
    const tag = el('b', 'otimer-tag', box, o.tag ?? 'LIMITED');
    ctx.anims.push(rise(box, o.in, .32), pop(tag, o.tagAt ?? o.in + .3));
    ctx.ticks.push(t => {
      const lt = t - o.in;
      groups.forEach((g, i) => {
        const k = Math.floor(lt * (14 - i * 3)) + i * 11;
        g.textContent = lt < .12 ? '??' : String((k * 37 + i * 13) % 60).padStart(2, '0');
      });
      box.style.boxShadow = `0 26px 70px rgba(0,0,0,.6), 0 0 0 ${4 + 4 * (Math.sin(t * 9) + 1) / 2}px rgba(255, 61, 102, ${.35 + .35 * (Math.sin(t * 9) + 1) / 2})`;
    });
    return box;
  },
  // ---- Sarmila reel builders (8 Nov 2026): money-story graphics. Everything depends only on t. ----
  chart(o, ctx) {
    // Glass card with a line chart that draws itself: "flat" (bank, next to nothing), "down" (inflation),
    // "compound" (exponential growth). Optional stat chips count up on their spoken word.
    const W = o.w ?? 940, H = o.h ?? 430, id = `c${++CHART_ID}`;
    const card = el('div', `chart-card ${o.tone ?? 'cyan'}`, ctx.root);
    Object.assign(card.style, {left: `${o.x ?? (1080 - W) / 2}px`, top: `${o.y}px`, width: `${W}px`, height: `${H}px`});
    const head = el('div', 'chart-head', card);
    const icon = el('b', 'chart-icon', head);
    icon.innerHTML = ICONS[o.icon] ?? '';
    const titles = el('div', 'chart-titles', head);
    const title = el('strong', '', titles, o.title ?? '');
    const sub = el('small', '', titles, o.sub ?? '');
    const statBox = el('div', 'chart-stats', head);
    const stats = (o.stats ?? []).map(s => {
      const box = el('div', `chart-stat ${s.tone ?? ''}`, statBox);
      const v = el('b', '', box, '');
      el('small', '', box, s.label);
      ctx.anims.push(pop(box, s.at));
      return {s, v, box};
    });
    const PW = W - 56, PH = H - 172;
    const f = CURVES[o.mode ?? 'compound'];
    const pts = Array.from({length: 61}, (_, i) => { const x = i / 60; return [14 + x * (PW - 28), 12 + f(x) * (PH - 24)]; });
    const d = 'M' + pts.map(p => p.map(v => v.toFixed(1)).join(' ')).join(' L');
    const area = `${d} L${pts[60][0].toFixed(1)} ${PH} L${pts[0][0].toFixed(1)} ${PH} Z`;
    const plot = el('div', 'chart-plot', card);
    plot.innerHTML = `<svg viewBox="0 0 ${PW} ${PH}" width="${PW}" height="${PH}"><defs>
      <linearGradient id="${id}g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="ca1"/><stop offset="1" class="ca2"/></linearGradient>
      <clipPath id="${id}k"><rect x="0" y="0" width="0" height="${PH}"/></clipPath></defs>
      ${[.25, .5, .75].map(g => `<line x1="0" x2="${PW}" y1="${PH * g}" y2="${PH * g}" class="grid"/>`).join('')}
      <path d="${area}" fill="url(#${id}g)" clip-path="url(#${id}k)"/>
      <path d="${d}" class="line" pathLength="1"/>
      <circle r="13" class="headdot"/></svg>`;
    const clipRect = plot.querySelector('rect'), line = plot.querySelector('.line'), dot = plot.querySelector('.headdot');
    const marks = (o.marks ?? []).map(m => {
      const n = el('span', 'chart-mark', plot, m.label);
      const p = pts[Math.round(m.p * 60)];
      Object.assign(n.style, {left: `${p[0]}px`, top: `${p[1]}px`});
      ctx.anims.push({node: n, at: m.at, dur: .28, ease: BACK, frames: [{opacity: 0, transform: 'translate(-50%,-130%) scale(.4)'}, {opacity: 1, transform: 'translate(-50%,-130%) scale(1)'}]});
      return n;
    });
    if (o.tag) {
      const tag = el('span', `chart-tag ${o.tagTone ?? o.tone ?? 'cyan'}`, plot, o.tag);
      const p = pts[60];
      Object.assign(tag.style, {right: '0px', top: `${Math.max(0, Math.min(PH - 70, p[1] - 90))}px`});
      ctx.anims.push(pop(tag, o.tagAt));
    }
    ctx.anims.push(rise(card, o.in, .34));
    ctx.anims.push(reveal(title, o.titleAt ?? o.in, .22), reveal(sub, o.subAt ?? o.titleAt ?? o.in, .22));
    ctx.ticks.push(t => {
      const p = smooth((t - o.drawAt) / (o.drawFor ?? 1.4));
      line.style.strokeDashoffset = 1 - p;
      clipRect.setAttribute('width', (PW * p).toFixed(1));
      const q = pts[Math.round(p * 60)];
      dot.setAttribute('cx', q[0]); dot.setAttribute('cy', q[1]);
      dot.style.opacity = p > 0 && p < 1 ? 1 : p >= 1 ? .9 : 0;
      dot.setAttribute('r', 11 + 4 * Math.abs(Math.sin(t * 6)));
      for (const {s, v, box} of stats) {
        const k = 1 - (1 - clamp((t - s.at) / (s.dur ?? .7))) ** 3;
        v.textContent = `${s.prefix ?? ''}${(s.value * k).toFixed(s.decimals ?? 0)}${s.suffix ?? ''}`;
        box.style.scale = 1 + .14 * Math.max(0, 1 - Math.abs(t - s.at - (s.dur ?? .7) - .05) / .14);
      }
    });
    return card;
  },
  counter(o, ctx) {
    // One huge number counting up on its word, with a label under it; a pulse when it lands.
    const box = el('div', `counter ${o.tone ?? 'gold'}`, ctx.root);
    box.style.top = `${o.y}px`;
    const num = el('div', 'counter-num', box, '0');
    const label = el('div', 'counter-label', box, o.label ?? '');
    ctx.anims.push(pop(box, o.in, .3), reveal(label, o.labelAt ?? o.at, .22));
    const ring = el('i', 'counter-ring', box);
    ctx.anims.push({node: ring, at: o.at + (o.dur ?? .8), dur: .55, ease: 'ease-out', frames: [{opacity: .9, transform: 'translate(-50%,-50%) scale(.4)'}, {opacity: 0, transform: 'translate(-50%,-50%) scale(1.9)'}]});
    ctx.ticks.push(t => {
      const k = 1 - (1 - clamp((t - o.at) / (o.dur ?? .8))) ** 3;
      const v = (o.from ?? 0) + (o.value - (o.from ?? 0)) * k;
      num.textContent = `${o.prefix ?? ''}${v.toFixed(o.decimals ?? 0)}${o.suffix ?? ''}`;
      num.style.scale = 1 + .12 * Math.max(0, 1 - Math.abs(t - o.at - (o.dur ?? .8) - .05) / .15);
    });
    return box;
  },
  progress(o, ctx) {
    // A video progress bar whose playhead runs to the end ("watch till the end").
    const box = el('div', 'progress-ui', ctx.root);
    box.style.top = `${o.y}px`;
    const track = el('div', 'pg-track', box);
    const fill = el('i', 'pg-fill', track);
    const head = el('b', 'pg-head', track);
    const flag = el('span', 'pg-end', box, o.label ?? 'END');
    ctx.anims.push(rise(box, o.in, .3), pop(flag, o.endAt));
    ctx.ticks.push(t => {
      const p = .1 + .9 * smooth((t - o.at) / (o.dur ?? .8));
      fill.style.transform = `scaleX(${p})`;
      head.style.left = `${p * 100}%`;
    });
    return box;
  },
  nameCard(o, ctx) {
    // Lower third: "I'm", the name wiping in, the licence line with a check, and the mum-of-two chip.
    const card = el('div', 'name-card', ctx.root);
    card.style.top = `${o.y}px`;
    const bar = el('i', 'name-bar', card);
    const text = el('div', 'name-text', card);
    const eyebrow = el('small', 'name-eyebrow', text, o.eyebrow ?? '');
    const name = el('div', 'name-big', text, o.name);
    const titleRow = el('div', 'name-title', text);
    const tick = el('b', 'name-check', titleRow, '✓');
    const title = el('span', '', titleRow);
    capWords(title, o.title, ctx);
    const chip = el('div', 'name-chip', text);
    const chipText = el('span', '', chip);
    capWords(chipText, o.chip, ctx);
    const kids = Array.from({length: o.kids ?? 0}, (_, i) => { const k = el('b', 'kid', chip); k.innerHTML = ICONS.boy; ctx.anims.push(pop(k, o.kidsAt + i * .12, .3)); return k; });
    ctx.anims.push(rise(card, o.in, .32));
    ctx.anims.push({node: bar, at: o.in, dur: .3, ease: EASE, frames: [{transform: 'scaleY(0)'}, {transform: 'scaleY(1)'}]});
    ctx.anims.push(reveal(eyebrow, o.in, .18));
    ctx.anims.push({node: name, at: o.nameAt, dur: .34, ease: EASE, frames: [{opacity: 0, clipPath: 'inset(-20% 100% -20% 0)', filter: 'blur(10px)'}, {opacity: 1, clipPath: 'inset(-20% -5% -20% 0)', filter: 'blur(0)'}]});
    ctx.anims.push(pop(tick, o.checkAt ?? o.title[0][1]), pop(chip, o.chip[0][1] - .05));
    return card;
  },
  profile(o, ctx) {
    // A son's card: avatar (with a mortarboard dropping on when he graduates), label, age counter, chips.
    const card = el('div', `profile ${o.tone ?? 'gold'}`, ctx.root);
    card.style.top = `${o.y}px`;
    const av = el('div', 'pf-av', card);
    el('div', 'pf-avatar', av).innerHTML = ICONS.boy;
    if (o.capAt !== undefined) {
      const hat = el('b', 'pf-cap', av);
      hat.innerHTML = ICONS.grad;
      ctx.anims.push({node: hat, at: o.capAt, dur: .4, ease: BACK, frames: [{opacity: 0, transform: 'translateY(-150px) rotate(-40deg)'}, {opacity: 1, transform: 'rotate(-8deg)'}]});
    }
    const body = el('div', 'pf-body', card);
    const label = el('div', 'pf-label', body);
    capWords(label, o.label, ctx);
    const ageRow = el('div', 'pf-age', body);
    const ageNum = el('b', '', ageRow, '0');
    el('span', '', ageRow, o.ageLabel ?? 'years old');
    const chips = el('div', 'pf-chips', body);
    for (const c of o.chips ?? []) {
      const chip = el('span', `pf-chip ${c.tone ?? ''}`, chips);
      if (c.icon) el('b', '', chip).innerHTML = ICONS[c.icon];
      el('span', '', chip, c.text);
      ctx.anims.push(pop(chip, c.at));
    }
    ctx.anims.push(rise(card, o.in, .32), reveal(ageRow, o.ageAt - .05, .2));
    ctx.ticks.push(t => {
      ageNum.textContent = Math.round(o.age * (1 - (1 - clamp((t - o.ageAt) / .55)) ** 3));
      ageNum.style.scale = 1 + .16 * Math.max(0, 1 - Math.abs(t - o.ageAt - .6) / .14);
    });
    return card;
  },
  transfer(o, ctx) {
    // Bank card -> lane with RESP coins flying -> segregated fund card that lights up on arrival.
    const box = el('div', 'transfer', ctx.root);
    box.style.top = `${o.y}px`;
    const chip = el('div', 'tf-chip', box);
    capWords(chip, o.chip, ctx);
    const row = el('div', 'tf-row', box);
    const card = (side, tone) => {
      const c = el('div', `tf-card ${tone}`, row);
      el('b', 'tf-icon', c).innerHTML = ICONS[side.icon];
      el('strong', '', c, side.title);
      if (side.sub) el('small', '', c, side.sub);
      ctx.anims.push(pop(c, side.at, .3));
      return c;
    };
    const from = card(o.from, 'red');
    const lane = el('div', 'tf-lane', row);
    const track = el('i', 'tf-track', lane);
    const coins = [0, 1, 2].map(i => el('b', 'tf-coin', lane, o.coin ?? 'RESP'));
    const to = card(o.to, 'cyan');
    ctx.anims.push({node: track, at: o.flyAt - .1, dur: .3, ease: EASE, frames: [{transform: 'scaleX(0)'}, {transform: 'scaleX(1)'}]});
    ctx.ticks.push(t => {
      coins.forEach((c, i) => {
        const p = clamp((t - o.flyAt - i * .16) / .55);
        const e = smooth(p);
        c.style.opacity = p > 0 && p < 1 ? 1 : 0;
        c.style.transform = `translate(${-20 + e * 170}px, ${-Math.sin(e * Math.PI) * 60}px) scale(${.8 + .3 * Math.sin(e * Math.PI)})`;
      });
      const land = Math.max(0, 1 - Math.abs(t - o.flyAt - .7) / .3);
      to.style.boxShadow = `0 26px 70px rgba(0,0,0,.55), 0 0 ${40 + 80 * land}px rgba(46, 230, 255,${.25 + .5 * land})`;
      to.style.scale = 1 + .06 * land;
      from.style.filter = t > o.flyAt + .5 ? 'saturate(.55) brightness(.85)' : 'none';
    });
    return box;
  },
  darkBoard(o, ctx) {
    // Full-screen deep accent board (covers the speaker and the source's own baked-in screenshot).
    const b = el('div', 'dark-board', ctx.root);
    el('i', 'db-grid', b);
    const glow = el('i', 'db-glow', b);
    ctx.anims.push({node: b, at: o.in, dur: o.fade ?? .2, ease: EASE, frames: [{opacity: 0}, {opacity: 1}]});
    ctx.ticks.push(t => { glow.style.transform = `rotate(${t * 40}deg)`; });
    return b;
  },
  flash(o, ctx) {
    const f = el('div', `flash ${o.tone ?? ''}`, ctx.root);
    ctx.anims.push({node: f, at: o.in, dur: o.dur ?? .32, ease: 'ease-out', frames: [{opacity: 0}, {opacity: o.peak ?? .85, offset: .15}, {opacity: 0}]});
    return f;
  },
  proof(o, ctx) {
    // The real screenshot the client showed, tilting up into place; a ring lands on the number.
    const card = el('div', 'proof', ctx.root);
    Object.assign(card.style, {left: `${o.x}px`, top: `${o.y}px`, width: `${o.w}px`});
    el('img', '', card).src = o.src;
    const ring = el('i', 'proof-ring', card);
    const [rx, ry, rw, rh] = o.ring;
    Object.assign(ring.style, {left: `${rx}%`, top: `${ry}%`, width: `${rw}%`, height: `${rh}%`});
    const shine = el('i', 'proof-shine', card);
    ctx.ticks.push(t => {
      const e = smooth((t - o.in) / .42);
      card.style.opacity = e;
      card.style.transform = `perspective(1400px) translateY(${(1 - e) * 120}px) rotateX(${(1 - e) * 26}deg) scale(${.9 + .1 * e + Math.max(0, t - o.in) * .012})`;
      const r = clamp((t - o.ringAt) / .3);
      ring.style.opacity = r;
      ring.style.transform = `scale(${1.6 - .6 * smooth(r) + .04 * Math.sin(t * 8) * r})`;
      shine.style.transform = `translateX(${-400 + 1900 * clamp((t - o.in - .35) / .6)}px) skewX(-18deg)`;
    });
    return card;
  },
  compare(o, ctx) {
    // Two bars: the bank's 1.29% stub against the fund's 40%+ tower.
    const box = el('div', 'compare', ctx.root);
    Object.assign(box.style, {top: `${o.y}px`, height: `${o.h ?? 760}px`});
    for (const item of o.items) {
      const col = el('div', `cmp-col ${item.tone}`, box);
      const bar = el('div', 'cmp-bar', col);
      const val = el('b', 'cmp-val', bar, '');
      const fill = el('i', '', bar);
      el('b', 'cmp-icon', col).innerHTML = ICONS[item.icon] ?? '';
      el('span', 'cmp-label', col, item.label);
      ctx.anims.push(reveal(col, o.in, .22));
      ctx.ticks.push(t => {
        const k = 1 - (1 - clamp((t - item.at) / (item.dur ?? .6))) ** 3;
        fill.style.height = `${item.h * k}%`;
        val.textContent = `${(item.value * k).toFixed(item.decimals ?? 0)}${item.suffix ?? ''}`;
        val.style.bottom = `${item.h * k}%`;
      });
    }
    return box;
  },
  sheetList(o, ctx) {
    // Bottom glass sheet with rows (cross / check / bank icon) whose words are karaoke captions.
    const sheet = el('div', 'sheet-list', ctx.root);
    sheet.style.top = `${o.y}px`;
    const glow = el('i', 'sheet-glow', sheet);
    for (const row of o.rows) {
      const r = el('div', `sl-row ${row.icon}`, sheet);
      const dot = el('b', `sl-dot ${row.icon}`, r);
      if (row.icon === 'x') dot.textContent = '✕'; else if (row.icon === 'check') dot.textContent = '✓'; else dot.innerHTML = ICONS[row.icon] ?? '';
      const text = el('div', 'sl-text', r);
      capWords(text, row.words, ctx, row.endAt);
      ctx.anims.push(rise(r, row.at, .28));
      if (row.strikeAt !== undefined) {
        const s = el('i', 'sl-strike', r);
        ctx.anims.push({node: s, at: row.strikeAt, dur: .22, ease: EASE, frames: [{transform: 'scaleX(0)'}, {transform: 'scaleX(1)'}]});
      }
    }
    // riseAt < in pre-rolls the entrance, so the sheet is already in place on the beat's first frame.
    ctx.anims.push({node: sheet, at: o.riseAt ?? o.in, dur: .32, ease: EASE, frames: [{opacity: 0, transform: 'translateY(160px)'}, {opacity: 1, transform: 'none'}]});
    ctx.ticks.push(t => { glow.style.transform = `rotate(${t * 60}deg)`; });
    return sheet;
  },
  statement(o, ctx) {
    // An RESP statement card; a magnifier glides to the rate-of-return row, which lights up with "?%".
    const card = el('div', 'statement', ctx.root);
    card.style.top = `${o.y}px`;
    const head = el('div', 'st-head', card);
    el('b', 'st-icon', head).innerHTML = ICONS.doc;
    const ht = el('div', 'st-titles', head);
    el('strong', '', ht, o.title);
    el('small', '', ht, o.sub ?? '');
    const rows = o.rows.map(r => {
      const row = el('div', `st-row${r.hot ? ' hot' : ''}`, card);
      el('span', 'st-k', row, r.k);
      const v = el('b', 'st-v', row, r.v);
      ctx.anims.push(reveal(row, r.at, .22));
      return {row, v, r};
    });
    const lens = el('div', 'st-lens', card);
    lens.innerHTML = ICONS.lens;
    ctx.anims.push(rise(card, o.in, .32));
    ctx.ticks.push(t => {
      const p = smooth((t - o.lensAt) / .5);
      const hot = rows.find(x => x.r.hot);
      const ty = hot ? hot.row.offsetTop - 30 : 200;
      lens.style.opacity = clamp((t - o.lensAt + .1) / .15);
      lens.style.transform = `translate(${760 - 300 * p + Math.sin(t * 3) * 14 * p}px, ${-60 + (ty + 60) * p + Math.cos(t * 2.4) * 8 * p}px) rotate(${-18 + 10 * p}deg)`;
      if (hot) {
        const on = t >= o.hotAt;
        hot.row.classList.toggle('lit', on);
        hot.v.style.scale = on ? 1 + .1 * Math.abs(Math.sin((t - o.hotAt) * 5)) : 1;
      }
    });
    return card;
  },
  hand(o, ctx) {
    const hand = el('div', 'hand', ctx.root);
    hand.innerHTML = HAND;
    const ring = el('div', 'ripple', ctx.root);
    Object.assign(ring.style, {left: `${o.to[0]}px`, top: `${o.to[1]}px`});
    ctx.anims.push({node: ring, at: o.tap, dur: .4, ease: 'ease-out', frames: [{opacity: 0, transform: 'translate(-50%,-50%) scale(.2)'}, {opacity: .9, transform: 'translate(-50%,-50%) scale(.2)', offset: .03}, {opacity: 0, transform: 'translate(-50%,-50%) scale(1.6)'}]});
    ctx.ticks.push(t => {
      const p = smooth((t - o.in) / .32);
      const x = o.from[0] + (o.to[0] - o.from[0]) * p, y = o.from[1] + (o.to[1] - o.from[1]) * p;
      const press = 1 - .16 * Math.max(0, 1 - Math.abs(t - o.tap) / .1);
      hand.style.transform = `translate(${x}px,${y}px) rotate(-12deg) scale(${press})`;
    });
    return hand;
  }
};

class Stage {
  constructor(host, beats, video) {
    this.host = host; this.beats = beats; this.video = video;
    this.base = beats.length === 1 ? beats[0].start : 0;
    this.layers = beats.map(beat => this.buildBeat(beat));
    document.fonts.ready.then(() => { this.fit(); this.seek(this.video.currentTime); });
    this.resize();
    new ResizeObserver(() => this.resize()).observe(host.parentElement);
  }
  resize() { this.host.style.transform = `scale(${this.host.parentElement.clientWidth / CANVAS_W})`; }
  buildBeat(beat) {
    const root = el('div', 'fx-layer', this.host);
    const layer = {beat, root, items: []};
    for (const o of beat.overlays) {
      const ctx = {root, anims: [], ticks: [], fit: []};
      if (!builders[o.type]) { console.error(`${beat.id}: unknown overlay type "${o.type}"`); continue; }
      const node = builders[o.type](o, ctx);
      const anims = ctx.anims.map(a => { const anim = a.node.animate(a.frames, {duration: a.dur * 1000, easing: a.ease, fill: 'both'}); anim.pause(); return {anim, at: a.at}; });
      layer.items.push({o, node, anims, ticks: ctx.ticks, fit: ctx.fit, siblings: node.classList.contains('hand') ? [node.nextElementSibling] : []});
    }
    return layer;
  }
  fit() {
    // Sizes must be measured with every layer laid out, whatever beat is currently showing.
    const hidden = [...this.host.querySelectorAll('[hidden]')];
    hidden.forEach(node => { node.hidden = false; });
    for (const line of this.host.querySelectorAll('.hero')) {
      line.style.fontSize = '150px';
      line.style.fontSize = `${Math.min(150, Math.floor(150 * HERO_MAX / Math.max(line.offsetWidth, 1)))}px`;
    }
    hidden.forEach(node => { node.hidden = true; });
  }
  seek(time) {
    const t = time + this.base;
    let active = this.layers[this.layers.length - 1];
    for (const layer of this.layers) if (t >= layer.beat.start && t < layer.beat.end) active = layer;
    this.host.dataset.scene = active.beat.scene;
    for (const layer of this.layers) {
      const on = layer === active;
      layer.root.hidden = !on;
      if (!on) continue;
      const lt = t - layer.beat.start;
      for (const item of layer.items) {
        const visible = lt >= item.o.in && lt < item.o.out;
        item.node.hidden = !visible;
        for (const sib of item.siblings) if (sib) sib.hidden = !visible;
        if (!visible) continue;
        for (const {anim, at} of item.anims) anim.currentTime = Math.max(0, (lt - at) * 1000);
        for (const tick of item.ticks) tick(lt);
      }
    }
  }
}

window.Stage = Stage;
