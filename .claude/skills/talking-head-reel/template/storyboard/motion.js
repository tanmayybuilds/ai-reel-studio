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
function heroLines(text) { return text.length > 12 && text.includes(' ') ? text.split(' ') : [text]; }

const builders = {
  cap(o, ctx) {
    const box = el('div', `cap${o.ink ? ' ink' : ''}`, ctx.root);
    box.style.top = `${o.y ?? 1130}px`;
    const words = (list, cls) => { const line = el('div', cls, box); for (const [text, at] of list) ctx.anims.push(reveal(el('span', '', line, text), at)); };
    if (o.lead) words(o.lead, 'lead');
    if (o.word) {
      const wrap = el('div', 'hero-wrap', box);
      for (const text of o.oneLine ? [o.word] : heroLines(o.word)) {
        const line = el('div', `hero ${o.tone}`, wrap, text);
        ctx.fit.push(line);
        ctx.anims.push({node: line, at: o.wordAt, dur: .26, ease: EASE, frames: [{opacity: 0, clipPath: 'inset(-30% 105% -30% -5%)', filter: 'blur(12px)'}, {opacity: 1, clipPath: 'inset(-30% -5% -30% -5%)', filter: 'blur(0)'}]});
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
    const sheet = el('div', 'comment-sheet', ctx.root);
    const glow = el('i', 'sheet-glow', sheet);
    const input = el('div', 'comment-input', sheet);
    el('b', 'face', input, 'You');
    const typed = el('span', 'typed', input);
    [...o.text].forEach((c, i) => ctx.anims.push({node: el('span', '', typed, c), at: o.typeAt + i * .05, dur: .1, ease: BACK, frames: [{opacity: 0, transform: 'translateY(26px) scale(.6)'}, {opacity: 1, transform: 'none'}]}));
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
    el('b', 'face', posted, 'You');
    const body = el('div', 'row-text', posted);
    el('small', '', body, o.when ?? 'abhi');
    el('strong', '', body, o.text.toLowerCase());
    const heart = el('span', 'heart', posted, '♥');
    ctx.anims.push(rise(posted, o.sendAt + .04, .28), {node: heart, at: o.sendAt + .4, dur: .34, ease: BACK, frames: [{transform: 'scale(0)'}, {transform: 'scale(1.5)', offset: .6}, {transform: 'scale(1)'}]});
    const dm = el('div', 'dm-row', sheet);
    el('b', 'dm-face', dm, o.initial ?? 'T');
    const dmText = el('div', 'row-text', dm);
    el('strong', '', dmText, o.dmTitle);
    el('small', '', dmText, o.dmNote);
    el('span', 'dm-badge', dm, 'NEW');
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
