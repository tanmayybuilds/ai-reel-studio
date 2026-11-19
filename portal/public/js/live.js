// Live bits shared by client and admin pages: countdowns, editing stages, chat polling, queue refresh.
(() => {
  const meta = document.querySelector('meta[name="server-now"]');
  let skew = meta ? Number(meta.content) - Date.now() : 0; // server clock minus this browser's clock
  const serverNow = () => Date.now() + skew;
  const csrf = document.querySelector('meta[name="csrf-token"]')?.content || '';
  const baseTitle = document.title;
  let unseen = 0;

  // ---------- time formatting ----------

  const timeFmt = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
  const dayFmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' });
  function fmtTime(ms) {
    const d = new Date(ms);
    const sameDay = d.toDateString() === new Date().toDateString();
    return sameDay ? timeFmt.format(d) : `${dayFmt.format(d)}, ${timeFmt.format(d)}`;
  }
  function paintTimes(root = document) {
    root.querySelectorAll('time[data-ts]').forEach((t) => { t.textContent = fmtTime(Number(t.dataset.ts)); });
  }
  const pad = (n) => String(n).padStart(2, '0');
  function clockDown(ms) {
    const s = Math.max(0, Math.ceil(ms / 1000));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${pad(m)}:${pad(s % 60)}`;
  }
  function words(ms) {
    const m = Math.ceil(Math.abs(ms) / 60000);
    const t = m >= 60 ? `${Math.floor(m / 60)} hr${m % 60 ? ` ${m % 60} min` : ''}` : `${m} min`;
    return ms >= 0 ? `${t} left` : `Overdue ${t}`;
  }

  // ---------- ETA cards + queue timers ----------

  function tick() {
    const now = serverNow();
    document.querySelectorAll('[data-eta-card]').forEach((card) => {
      const eta = Number(card.dataset.eta);
      const start = Number(card.dataset.start) || eta - 3600e3;
      const left = eta - now;
      const late = left <= 0;
      card.classList.toggle('is-late', late);

      const cd = card.querySelector('[data-countdown]');
      if (cd) {
        if (cd.dataset.countdownStyle === 'words') cd.textContent = words(left);
        else cd.textContent = late ? 'Almost there' : clockDown(left);
      }
      const clock = card.querySelector('[data-eta-clock]');
      if (clock && clock.dataset.for !== String(eta)) { clock.textContent = timeFmt.format(new Date(eta)); clock.dataset.for = String(eta); }
      const sub = card.querySelector('[data-eta-sub]');
      const lateNote = card.querySelector('[data-eta-late]');
      if (sub && lateNote) { sub.hidden = late; lateNote.hidden = !late; }

      const p = late ? 1 : Math.min(1, Math.max(0, (now - start) / Math.max(1, eta - start)));
      const bar = card.querySelector('[data-eta-progress]');
      if (bar) bar.style.width = `${(late ? 0.98 : Math.max(0.03, p)) * 100}%`;

      const stages = card.querySelectorAll('[data-stages] li');
      if (stages.length) {
        const idx = Number(card.querySelector('[data-stages]').dataset.currentStage) || 0;
        stages.forEach((li, i) => {
          li.classList.toggle('done', i < idx);
          li.classList.toggle('current', i === idx);
        });
      }
    });
    document.querySelectorAll('[data-due]').forEach((el) => {
      const left = Number(el.dataset.due) - now;
      el.textContent = words(left);
      el.classList.toggle('is-late', left < 0);
      el.classList.toggle('is-soon', left >= 0 && left < 10 * 60e3);
    });
  }

  // ---------- chat ----------

  function msgEl(m) {
    const li = document.createElement('li');
    li.dataset.id = m.id;
    if (m.kind === 'system') {
      li.className = 'msg msg-system';
      li.innerHTML = '<span></span> <time></time>';
      li.querySelector('span').textContent = m.body;
    } else {
      li.className = `msg ${m.mine ? 'msg-mine' : 'msg-theirs'}${m.kind === 'changes' ? ' msg-changes' : ''}`;
      li.innerHTML = `<div class="msg-meta"><strong></strong>${m.kind === 'changes' ? ' <span class="msg-tag">Change request</span>' : ''} <time></time></div><div class="msg-body"></div>`;
      li.querySelector('strong').textContent = m.author;
      li.querySelector('.msg-body').textContent = m.body;
    }
    const t = li.querySelector('time');
    t.dataset.ts = m.created_at;
    t.textContent = fmtTime(m.created_at);
    return li;
  }

  function setupChat(chat) {
    const list = chat.querySelector('[data-msgs]');
    const empty = list.querySelector('.msgs-empty');
    const form = chat.querySelector('[data-chat-form]');
    const box = form.querySelector('textarea');
    const live = document.querySelector('[data-live]');
    const seen = new Set([...list.querySelectorAll('[data-id]')].map((li) => li.dataset.id));
    let lastId = Number(chat.dataset.lastId) || 0;
    let timer = null;

    const nearBottom = () => list.scrollHeight - list.scrollTop - list.clientHeight < 80;
    const toBottom = () => { list.scrollTop = list.scrollHeight; };
    toBottom();

    function add(m, { fromPoll } = {}) {
      if (seen.has(String(m.id))) return;
      seen.add(String(m.id));
      lastId = Math.max(lastId, m.id);
      const stick = nearBottom() || !fromPoll;
      list.insertBefore(msgEl(m), empty);
      if (m.kind !== 'system' && empty) empty.hidden = true;
      if (stick) toBottom();
      if (fromPoll && !m.mine && m.kind !== 'system' && document.hidden) {
        unseen += 1;
        document.title = `(${unseen}) New message · ${baseTitle}`;
      }
    }

    async function poll() {
      clearTimeout(timer);
      try {
        const res = await fetch(`${chat.dataset.stateUrl}?after=${lastId}`, { headers: { Accept: 'application/json' } });
        if (res.status === 401 || res.redirected) { location.reload(); return; }
        if (res.ok) {
          const s = await res.json();
          skew = s.now - Date.now();
          s.messages.forEach((m) => add(m, { fromPoll: true }));
          if (live && live.dataset.status && s.status !== live.dataset.status) { location.reload(); return; }
          document.querySelectorAll('[data-stages]').forEach((el) => { el.dataset.currentStage = s.editing_stage; });
          document.querySelectorAll('[data-eta-card]').forEach((c) => { if (s.eta_at) c.dataset.eta = s.eta_at; });
          tick();
        }
      } catch { /* offline: try again next round */ }
      timer = setTimeout(poll, document.hidden ? 20000 : 4000);
    }

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        unseen = 0;
        document.title = baseTitle;
        poll();
      }
    });

    const grow = () => {
      box.style.height = 'auto';
      box.style.height = `${Math.min(160, box.scrollHeight)}px`;
      box.style.overflowY = box.scrollHeight > 160 ? 'auto' : 'hidden';
    };
    grow();
    box.addEventListener('input', grow);
    box.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit(); }
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const body = box.value.trim();
      if (!body) return;
      const btn = form.querySelector('button');
      btn.disabled = true;
      try {
        const res = await fetch(chat.dataset.postUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
          body: JSON.stringify({ body }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Message not sent');
        add(data);
        box.value = '';
        grow();
      } catch (err) {
        window.portalToast?.(err.message || 'Message not sent. Check your connection.');
      } finally {
        btn.disabled = false;
        box.focus();
      }
    });

    timer = setTimeout(poll, 4000);
  }

  // ---------- partial refresh (admin queue) ----------

  function setupRefresh(el) {
    const every = Number(el.dataset.refresh) || 15000;
    async function refresh() {
      if (!document.hidden) {
        try {
          const res = await fetch(location.href, { headers: { 'X-Partial': '1' } });
          if (res.ok && !res.redirected) {
            el.innerHTML = await res.text();
            paintTimes(el);
            tick();
          }
        } catch { /* ignore */ }
      }
      setTimeout(refresh, every);
    }
    setTimeout(refresh, every);
  }

  // ---------- boot ----------

  paintTimes();
  tick();
  if (document.querySelector('[data-eta-card], [data-due], [data-refresh]')) setInterval(tick, 1000);
  document.querySelectorAll('[data-chat]').forEach(setupChat);
  document.querySelectorAll('[data-refresh]').forEach(setupRefresh);
})();
