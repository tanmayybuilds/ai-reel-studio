// End-to-end test of the whole portal, run with `npm test`.
// Starts a separate portal on port 4499 with a throwaway database and studio folder, walks a client
// and the admin through every step over HTTP, checks the results on disk, then deletes everything.
// Your real portal, data and footage are never touched.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const portalDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 4499;
const BASE = `http://127.0.0.1:${PORT}`;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'reel-portal-e2e-'));
const studio = path.join(tmp, 'studio');
for (const d of ['Raw', 'Exports', 'Approved Videos']) fs.mkdirSync(path.join(studio, d), { recursive: true });
const ADMIN = { email: 'admin@e2e.test', password: crypto.randomBytes(12).toString('hex') };

// Fail fast if something (e.g. a test that was killed) still holds the port.
try {
  await fetch(`${BASE}/healthz`);
  console.error(`Port ${PORT} is already in use (a leftover test server?). Stop it and run again.`);
  process.exit(1);
} catch { /* free: good */ }

const server = spawn(process.execPath, ['server.js'], {
  cwd: portalDir,
  env: {
    PATH: process.env.PATH, HOME: process.env.HOME, PORT: String(PORT), HOST: '127.0.0.1', SITE_URL: BASE,
    PORTAL_DATA_DIR: path.join(tmp, 'data'), STUDIO_ROOT: studio, PORTAL_NAME: 'E2E Studio',
    ADMIN_EMAIL: ADMIN.email, ADMIN_PASSWORD: ADMIN.password, ALERT_EMAIL: 'alerts@e2e.test',
    DRIVE_LINK_CHECK: 'off', // the test never calls Google
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverLog = '';
server.stdout.on('data', (d) => { serverLog += d; });
server.stderr.on('data', (d) => { serverLog += d; });
// Never leave the test server running, even if the test is interrupted.
process.on('exit', () => server.kill());
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => process.exit(130));

// ---------- tiny browser ----------

class Browser {
  constructor() { this.cookie = ''; this.csrf = ''; }
  async req(method, url, { body, headers = {} } = {}) {
    const res = await fetch(BASE + url, { method, body, redirect: 'manual', headers: { cookie: this.cookie, ...headers } });
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(';');
      this.cookie = pair.endsWith('=') ? '' : pair;
    }
    return res;
  }
  async get(url) {
    const res = await this.req('GET', url);
    const text = await res.text();
    const m = text.match(/name="csrf-token" content="([^"]+)"/) || text.match(/name="_csrf" value="([^"]+)"/);
    if (m) this.csrf = m[1];
    return { res, text };
  }
  post(url, fields = {}) {
    return this.req('POST', url, { body: new URLSearchParams({ _csrf: this.csrf, ...fields }), headers: { 'content-type': 'application/x-www-form-urlencoded' } });
  }
  async api(method, url, json) {
    const res = await this.req(method, url, { body: json ? JSON.stringify(json) : undefined, headers: { 'content-type': 'application/json', 'x-csrf-token': this.csrf } });
    return { res, data: await res.json().catch(() => ({})) };
  }
  raw(url, buf) {
    return this.req('POST', url, { body: buf, headers: { 'content-type': 'application/octet-stream', 'x-csrf-token': this.csrf } });
  }
  /** The studio's chunked upload: start, send chunks, finish. Returns the finish response. */
  async adminUpload(purpose, videoId, name, buf, extra = {}) {
    const start = await this.api('POST', '/admin/api/uploads', { purpose, videoId, name, size: buf.length });
    assert.ok([200, 201].includes(start.res.status), `start ${purpose}: ${JSON.stringify(start.data)}`);
    let offset = start.data.received;
    while (offset < buf.length) {
      const chunk = buf.subarray(offset, offset + start.data.chunkSize);
      const res = await this.req('PUT', `/admin/api/uploads/${start.data.id}?offset=${offset}`, {
        body: chunk, headers: { 'content-type': 'application/octet-stream', 'x-csrf-token': this.csrf, 'x-chunk-sha256': sha(chunk) },
      });
      assert.equal(res.status, 200);
      offset = (await res.json()).received;
    }
    return this.api('POST', `/admin/api/uploads/${start.data.id}/finish`, extra);
  }
  async signIn(email, password) {
    await this.get('/login');
    const res = await this.post('/login', { email, password });
    assert.equal(res.status, 303, `sign-in for ${email} should redirect`);
    return res.headers.get('location');
  }
}

const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let passed = 0;
async function step(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ✔ ${name}`);
  } catch (err) {
    console.log(`  ✘ ${name}\n\n${err.stack}\n\n--- server output ---\n${serverLog.slice(-3000)}`);
    throw err;
  }
}

// ---------- the journey ----------

async function run() {
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(`${BASE}/login`)).ok) break; } catch { /* starting */ }
    await sleep(200);
  }
  const admin = new Browser();
  const client = new Browser();
  const other = new Browser();
  let clientPassword = '';
  let videoId = 0;

  console.log('\nAccounts');
  await step('admin signs in and lands on the queue', async () => {
    const to = await admin.signIn(ADMIN.email, ADMIN.password);
    assert.match(to, /\/admin$/);
  });
  await step('wrong password is refused', async () => {
    const b = new Browser();
    await b.get('/login');
    assert.equal((await b.post('/login', { email: ADMIN.email, password: 'nope' })).status, 401);
  });
  await step('admin creates a client and gets a one-time password', async () => {
    await admin.get('/admin/clients');
    assert.equal((await admin.post('/admin/clients', { name: 'Priya Sharma', email: 'priya@e2e.test', company: 'Brand Co.' })).status, 303);
    const { text } = await admin.get('/admin/clients');
    clientPassword = text.match(/class="creds-pw">([^<]+)</)[1];
    assert.ok(clientPassword.length >= 12);
    const again = await admin.get('/admin/clients');
    assert.ok(!again.text.includes(clientPassword), 'password must only be shown once');
  });
  await step('client signs in and cannot reach admin pages', async () => {
    assert.match(await client.signIn('priya@e2e.test', clientPassword), /\/dashboard$/);
    for (const u of ['/admin', '/admin/queue', '/admin/clients', '/admin/emails', '/admin/styles']) {
      assert.equal((await client.req('GET', u)).status, 404, u);
    }
  });

  console.log('\nNew video (Google Drive only)');
  const FOOTAGE = 'https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrStUvWx?usp=sharing';
  const good = { title: 'Launch reel', ref_mode: 'reference', reference_url: 'https://www.instagram.com/reel/abc/', drive_url: FOOTAGE, shared: 'yes', notes: 'Keep it short.', notify_email: 'priya@e2e.test' };
  const refused = async (fields, pattern) => {
    await client.get('/videos/new');
    const res = await client.post('/videos/new', fields);
    assert.equal(res.status, 400, `should refuse: ${JSON.stringify(fields)}`);
    assert.match(await res.text(), pattern);
  };
  await step('the form refuses a missing "shared" tick, look, Drive link or email', async () => {
    await refused({ ...good, shared: '' }, /Anyone with the link/);
    await refused({ ...good, reference_url: '' }, /reference reel link, or switch/);
    await refused({ ...good, ref_mode: 'style', style_id: '' }, /Pick one of our styles/);
    await refused({ ...good, drive_url: 'https://www.dropbox.com/s/abc/video.mov' }, /Google Drive link/);
    await refused({ ...good, notify_email: 'nope' }, /email/);
    await refused({ ...good, title: '' }, /title/);
  });
  await step('client uploads are gone (the portal stores no footage)', async () => {
    await client.get('/dashboard');
    assert.equal((await client.api('POST', '/api/uploads', { kind: 'raw', name: 'a.mov', size: 10 })).res.status, 404);
  });
  await step('client sends it with a Drive folder link; a brief lands in Raw/', async () => {
    await client.get('/videos/new');
    const res = await client.post('/videos/new', good);
    assert.equal(res.status, 303);
    videoId = Number(res.headers.get('location').match(/\/videos\/(\d+)/)[1]);
    const dir = fs.readdirSync(path.join(studio, 'Raw', 'Priya Sharma'))[0];
    const brief = fs.readFileSync(path.join(studio, 'Raw', 'Priya Sharma', dir, 'brief.md'), 'utf8');
    assert.match(brief, /drive\.google\.com\/drive\/folders\/1AbCdEfGhIjKlMnOpQrStUvWx/);
    assert.match(brief, /instagram\.com\/reel\/abc/);
  });
  await step('client sees the live editing screen with a countdown', async () => {
    const { text } = await client.get(`/videos/${videoId}`);
    assert.match(text, /Your video is being edited/);
    assert.match(text, /data-eta-card data-eta="\d+"/);
  });
  await step('another client cannot see or touch it', async () => {
    await admin.get('/admin/clients');
    await admin.post('/admin/clients', { name: 'Other', email: 'other@e2e.test', password: 'other-pass-123' });
    await other.signIn('other@e2e.test', 'other-pass-123');
    assert.equal((await other.req('GET', `/videos/${videoId}`)).status, 404);
    await other.get('/dashboard');
    assert.equal((await other.api('GET', `/api/videos/${videoId}/state`)).res.status, 404);
    assert.equal((await other.api('POST', `/api/videos/${videoId}/messages`, { body: 'hi' })).res.status, 404);
  });

  console.log('\nWhile editing');
  await step('chat goes both ways', async () => {
    await client.get(`/videos/${videoId}`);
    assert.equal((await client.api('POST', `/api/videos/${videoId}/messages`, { body: 'Add our logo please' })).res.status, 201);
    await admin.get(`/admin/videos/${videoId}`);
    const seen = await admin.api('GET', `/admin/api/videos/${videoId}/state?after=0`);
    assert.ok(seen.data.messages.some((m) => m.body === 'Add our logo please'));
    await admin.api('POST', `/admin/api/videos/${videoId}/messages`, { body: 'On it!' });
    const back = await client.api('GET', `/api/videos/${videoId}/state?after=0`);
    assert.ok(back.data.messages.some((m) => m.body === 'On it!' && m.author === 'E2E Studio'));
  });
  await step('admin adds 30 minutes and the client sees the new time', async () => {
    const before = (await client.api('GET', `/api/videos/${videoId}/state`)).data.eta_at;
    await admin.get(`/admin/videos/${videoId}`);
    await admin.post(`/admin/videos/${videoId}/eta`, { change: '30' });
    const after = (await client.api('GET', `/api/videos/${videoId}/state`)).data.eta_at;
    assert.ok(after - before >= 29 * 60e3);
  });
  await step('queue lists it as to do', async () => {
    const { text } = await admin.get('/admin/queue');
    assert.match(text, /Launch reel/);
  });

  console.log('\nReview and delivery (Drive links)');
  const V1 = 'https://drive.google.com/file/d/1V1V1V1V1V1V1V1V1V1V1V1V1/view?usp=sharing';
  const V2 = 'https://drive.google.com/open?id=1V2V2V2V2V2V2V2V2V2V2V2V2';
  const FINAL = 'https://drive.google.com/file/d/1FINALFINALFINALFINAL0000/view';
  await step('admin sends v1 as a Drive link; client gets a review screen that plays it', async () => {
    await admin.get(`/admin/videos/${videoId}`);
    const bad = await admin.post(`/admin/videos/${videoId}/versions`, { link: 'https://youtu.be/xyz', note: 'x' });
    assert.equal(bad.status, 303);
    assert.match((await admin.get(`/admin/videos/${videoId}`)).text, /Paste a Google Drive link/);
    await admin.post(`/admin/videos/${videoId}/versions`, { link: V1, note: 'First cut' });
    const { text } = await client.get(`/videos/${videoId}`);
    assert.match(text, /Your video is ready/);
    assert.match(text, /First cut/);
    assert.match(text, /<iframe src="https:\/\/drive\.google\.com\/file\/d\/1V1V1V1V1V1V1V1V1V1V1V1V1\/preview"/);
  });
  await step('admin gets Gmail / WhatsApp / copy buttons with the message written', async () => {
    const { text } = await admin.get(`/admin/videos/${videoId}`);
    assert.match(text, /https:\/\/mail\.google\.com\/mail\/\?view=cm&amp;fs=1&amp;to=priya%40e2e\.test/);
    assert.match(text, /https:\/\/wa\.me\/\?text=/);
  });
  await step('client asks for changes; admin sees the request', async () => {
    await client.get(`/videos/${videoId}`);
    await client.post(`/videos/${videoId}/changes`, { body: '[0:04] Bigger logo', version: '1' });
    const { text } = await admin.get(`/admin/videos/${videoId}`);
    assert.match(text, /Changes requested on v1/);
    assert.match(text, /\[0:04\] Bigger logo/);
  });
  await step('admin sends v2 (an open?id= link is tidied up)', async () => {
    await admin.get(`/admin/videos/${videoId}`);
    await admin.post(`/admin/videos/${videoId}/versions`, { link: V2, note: 'Logo bigger' });
    const { text } = await client.get(`/videos/${videoId}`);
    assert.match(text, /Version 2 is ready/);
    assert.match(text, /file\/d\/1V2V2V2V2V2V2V2V2V2V2V2V2\/preview/);
  });
  await step('approving a version the client never saw is refused', async () => {
    await client.get(`/videos/${videoId}`);
    await client.post(`/videos/${videoId}/approve`, { version: '1' });
    const { text } = await client.get(`/videos/${videoId}`);
    assert.match(text, /A newer version \(v2\) just arrived/);
  });
  await step('client approves v2; status becomes preparing final', async () => {
    await client.get(`/videos/${videoId}`);
    await client.post(`/videos/${videoId}/approve`, { version: '2' });
    const { text } = await client.get(`/videos/${videoId}`);
    assert.match(text, /Preparing your final file/);
  });
  await step('admin delivers a final Drive link (two clicks at once deliver only once)', async () => {
    await admin.get(`/admin/videos/${videoId}`);
    const fields = { source: 'new', drive_url: FINAL };
    await Promise.all([admin.post(`/admin/videos/${videoId}/deliver`, fields), admin.post(`/admin/videos/${videoId}/deliver`, fields)]);
    const db = new DatabaseSync(path.join(tmp, 'data', 'portal.db'));
    const row = db.prepare('SELECT status, final_drive_url FROM videos WHERE id = ?').get(videoId);
    const delivered = db.prepare("SELECT COUNT(*) AS n FROM messages WHERE video_id = ? AND body = 'Final video delivered.'").get(videoId).n;
    db.close();
    assert.equal(row.status, 'delivered');
    assert.equal(row.final_drive_url, FINAL);
    assert.equal(delivered, 1);
  });
  await step('client gets Download and Open in Google Drive for the final', async () => {
    const { text } = await client.get(`/videos/${videoId}`);
    assert.match(text, /Your final video is ready/);
    assert.match(text, /href="https:\/\/drive\.google\.com\/uc\?export=download&amp;id=1FINALFINALFINALFINAL0000"/);
    assert.match(text, /Open in Google Drive/);
  });

  console.log('\nEmails');
  await step('every step queued the right email to the right person', async () => {
    await sleep(300);
    const { text } = await admin.get('/admin/emails');
    const rows = [...text.matchAll(/<tr>\s*<td><strong>([^<]+)<\/strong>[\s\S]*?<td class="small">([^<]+)<\/td>/g)].map((m) => `${m[2]} | ${m[1]}`);
    const want = [
      ['alerts@e2e.test', /New video from Priya Sharma/],
      ['priya@e2e.test', /Your video .Launch reel. is ready/],
      ['alerts@e2e.test', /asked for changes/],
      ['priya@e2e.test', /Version 2 of .Launch reel. is ready/],
      ['alerts@e2e.test', /approved/],
      ['priya@e2e.test', /final video .Launch reel. is ready to download/],
    ];
    for (const [to, re] of want) assert.ok(rows.some((r) => r.startsWith(to) && re.test(r)), `missing email to ${to} matching ${re}\n${rows.join('\n')}`);
  });

  console.log('\nAccount settings');
  await step('client changes their own password; the old one stops working', async () => {
    await client.get('/account');
    const bad = await client.post('/account/password', { current: 'wrong', password: 'new-password-123', confirm: 'new-password-123' });
    assert.equal(bad.status, 400);
    await client.get('/account');
    const ok = await client.post('/account/password', { current: clientPassword, password: 'new-password-123', confirm: 'new-password-123' });
    assert.equal(ok.status, 303);
    const b = new Browser();
    await b.get('/login');
    assert.equal((await b.post('/login', { email: 'priya@e2e.test', password: clientPassword })).status, 401);
    assert.match(await new Browser().signIn('priya@e2e.test', 'new-password-123'), /\/dashboard$/);
  });
  await step('admin edits a client; they sign in with the new email', async () => {
    const { text } = await admin.get('/admin/clients');
    const id = [...text.matchAll(/href="\/admin\/clients\/(\d+)">Edit/g)].map((m) => m[1]).at(-1);
    await admin.get(`/admin/clients/${id}`);
    assert.equal((await admin.post(`/admin/clients/${id}`, { name: 'Priya S.', email: 'priya.new@e2e.test', company: '' })).status, 303);
    assert.match(await new Browser().signIn('priya.new@e2e.test', 'new-password-123'), /\/dashboard$/);
  });
  await step('a style reel uploaded in chunks becomes a style', async () => {
    await admin.get('/admin/styles');
    const done = await admin.adminUpload('style', null, 'sample.mp4', crypto.randomBytes(200_000), { name: 'Test style', description: 'For the test' });
    assert.equal(done.res.status, 200, JSON.stringify(done.data));
    assert.match((await admin.get('/admin/styles')).text, /Test style/);
  });

  console.log('\nProduction');
  await step('health check, robots.txt and no-index headers', async () => {
    const h = await fetch(`${BASE}/healthz`);
    assert.deepEqual(await h.json(), { ok: true });
    assert.match(await (await fetch(`${BASE}/robots.txt`)).text(), /Disallow: \//);
    assert.match((await fetch(`${BASE}/login`)).headers.get('x-robots-tag'), /noindex/);
  });
  await step('installable app: manifest, icons, service worker, offline page', async () => {
    const m = await (await fetch(`${BASE}/manifest.webmanifest`)).json();
    assert.equal(m.display, 'standalone');
    assert.ok(m.icons.some((i) => i.sizes === '512x512' && i.purpose === 'maskable'));
    for (const u of ['/icons/icon-192.png', '/icons/icon-512.png', '/icons/apple-touch-icon.png', '/offline.html']) {
      assert.equal((await fetch(BASE + u)).status, 200, u);
    }
    const sw = await fetch(`${BASE}/sw.js`);
    assert.equal(sw.headers.get('cache-control'), 'no-cache');
  });
  await step('stray requests don\u2019t create sessions', async () => {
    const db = new DatabaseSync(path.join(tmp, 'data', 'portal.db'));
    const before = db.prepare('SELECT COUNT(*) AS n FROM sessions').get().n;
    for (const u of ['/', '/nope', '/favicon.ico', '/dashboard']) await fetch(BASE + u, { redirect: 'manual' });
    const after = db.prepare('SELECT COUNT(*) AS n FROM sessions').get().n;
    db.close();
    assert.equal(after, before);
  });
  await step('refuses to start in production with a weak password or no HTTPS', async () => {
    const child = spawn(process.execPath, ['server.js'], {
      cwd: portalDir,
      env: { PATH: process.env.PATH, NODE_ENV: 'production', PORT: '4498', PORTAL_DATA_DIR: path.join(tmp, 'prod-data'), STUDIO_ROOT: studio,
        ADMIN_EMAIL: 'a@e2e.test', ADMIN_PASSWORD: 'change-me', SITE_URL: 'http://localhost:4498' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    child.stderr.on('data', (d) => { out += d; });
    const code = await new Promise((r) => child.on('exit', r));
    assert.equal(code, 1);
    assert.match(out, /ADMIN_PASSWORD/);
    assert.match(out, /SITE_URL must start with https/);
  });

  console.log('\nAccess');
  await step('turning a client off signs them out at once', async () => {
    await admin.get('/admin/clients');
    const { text } = await admin.get('/admin/clients');
    const id = text.match(/action="\/admin\/clients\/(\d+)\/toggle"[^>]*data-confirm="Turn off Other/)?.[1]
      || [...text.matchAll(/\/admin\/clients\/(\d+)\/toggle/g)].map((m) => m[1]).at(0);
    await admin.post(`/admin/clients/${id}/toggle`);
    const res = await other.req('GET', '/dashboard');
    assert.equal(res.status, 302);
  });
  await step('forged requests (no valid CSRF token) change nothing', async () => {
    // A forged form is bounced back to the page without being processed…
    await admin.req('POST', '/admin/clients', {
      body: new URLSearchParams({ _csrf: 'forged', name: 'Mallory', email: 'mallory@e2e.test' }),
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    });
    assert.ok(!(await admin.get('/admin/clients')).text.includes('mallory@e2e.test'));
    // …and a forged API call gets a 403.
    const res = await client.req('POST', `/api/videos/${videoId}/messages`, {
      body: JSON.stringify({ body: 'forged' }), headers: { 'content-type': 'application/json', 'x-csrf-token': 'forged' },
    });
    assert.equal(res.status, 403);
  });
}

let ok = false;
try {
  console.log(`Portal end-to-end test (throwaway data in ${tmp})`);
  await run();
  ok = true;
  console.log(`\nAll ${passed} checks passed.`);
} catch {
  console.log(`\n${passed} checks passed before the failure.`);
} finally {
  server.kill();
  await sleep(200);
  fs.rmSync(tmp, { recursive: true, force: true });
  process.exit(ok ? 0 : 1);
}
