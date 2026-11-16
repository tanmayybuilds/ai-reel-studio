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

const portalDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 4499;
const BASE = `http://127.0.0.1:${PORT}`;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'reel-portal-e2e-'));
const studio = path.join(tmp, 'studio');
for (const d of ['Raw', 'Exports', 'Approved Videos']) fs.mkdirSync(path.join(studio, d), { recursive: true });
const ADMIN = { email: 'admin@e2e.test', password: crypto.randomBytes(12).toString('hex') };

const server = spawn(process.execPath, ['server.js'], {
  cwd: portalDir,
  env: {
    PATH: process.env.PATH, HOME: process.env.HOME, PORT: String(PORT), HOST: '127.0.0.1', SITE_URL: BASE,
    PORTAL_DATA_DIR: path.join(tmp, 'data'), STUDIO_ROOT: studio, PORTAL_NAME: 'E2E Studio',
    ADMIN_EMAIL: ADMIN.email, ADMIN_PASSWORD: ADMIN.password, ALERT_EMAIL: 'alerts@e2e.test',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverLog = '';
server.stdout.on('data', (d) => { serverLog += d; });
server.stderr.on('data', (d) => { serverLog += d; });

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
  const raw = crypto.randomBytes(40 * 1024 * 1024 + 777); // 2 chunks
  const v1 = crypto.randomBytes(300_000);
  const v2 = crypto.randomBytes(500_000);

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

  console.log('\nNew video');
  await step('client uploads 40 MB of raw footage in verified chunks', async () => {
    await client.get('/videos/new');
    const start = await client.api('POST', '/api/uploads', { kind: 'raw', name: 'Take 1.mov', size: raw.length, title: 'Launch reel' });
    assert.equal(start.res.status, 201);
    let offset = 0;
    while (offset < raw.length) {
      const chunk = raw.subarray(offset, offset + start.data.chunkSize);
      const res = await client.req('PUT', `/api/uploads/${start.data.fileId}?offset=${offset}`, {
        body: chunk, headers: { 'content-type': 'application/octet-stream', 'x-csrf-token': client.csrf, 'x-chunk-sha256': sha(chunk) },
      });
      assert.equal(res.status, 200);
      offset = (await res.json()).received;
    }
    const done = await client.api('POST', `/api/uploads/${start.data.fileId}/complete`);
    assert.equal(done.data.sha256, sha(raw));
    videoId = start.data.videoId;
  });
  await step('a damaged chunk is refused', async () => {
    const start = await client.api('POST', '/api/uploads', { kind: 'voiceover', name: 'vo.wav', size: 1000, videoId });
    const res = await client.req('PUT', `/api/uploads/${start.data.fileId}?offset=0`, {
      body: Buffer.alloc(1000, 1), headers: { 'content-type': 'application/octet-stream', 'x-csrf-token': client.csrf, 'x-chunk-sha256': '0'.repeat(64) },
    });
    assert.equal(res.status, 422);
    assert.equal((await client.api('DELETE', `/api/uploads/${start.data.fileId}`)).res.status, 200);
  });
  await step('client sends it; footage lands in Raw/ byte-for-byte with a brief', async () => {
    await client.get('/videos/new');
    const res = await client.post('/videos/new', {
      video_id: String(videoId), title: 'Launch reel', ref_mode: 'reference', reference_url: 'https://www.instagram.com/reel/abc/',
      source: 'upload', notes: 'Keep it short.', notify_email: 'priya@e2e.test',
    });
    assert.equal(res.status, 303);
    const dir = fs.readdirSync(path.join(studio, 'Raw', 'Priya Sharma'))[0];
    const folder = path.join(studio, 'Raw', 'Priya Sharma', dir);
    assert.equal(sha(fs.readFileSync(path.join(folder, 'Take 1.mov'))), sha(raw));
    assert.match(fs.readFileSync(path.join(folder, 'brief.md'), 'utf8'), /instagram\.com\/reel\/abc/);
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

  console.log('\nReview and delivery');
  await step('admin sends v1; client gets the review screen', async () => {
    await admin.get(`/admin/videos/${videoId}`);
    assert.equal((await admin.raw(`/admin/videos/${videoId}/versions?file=cut.mp4&note=First%20cut`, v1)).status, 200);
    const { text } = await client.get(`/videos/${videoId}`);
    assert.match(text, /Your video is ready/);
    assert.match(text, /First cut/);
  });
  await step('client asks for changes; admin sees the request', async () => {
    await client.get(`/videos/${videoId}`);
    await client.post(`/videos/${videoId}/changes`, { body: '[0:04] Bigger logo' });
    const { text } = await admin.get(`/admin/videos/${videoId}`);
    assert.match(text, /Changes requested on v1/);
    assert.match(text, /\[0:04\] Bigger logo/);
  });
  await step('admin sends v2 from Exports/ (as the editing skills would)', async () => {
    const dir = path.join(studio, 'Exports', 'Priya Sharma', 'render');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'launch-v2.mp4'), v2);
    await admin.get(`/admin/videos/${videoId}`);
    await admin.post(`/admin/videos/${videoId}/versions/from-exports`, { rel: path.join('Exports', 'Priya Sharma', 'render', 'launch-v2.mp4'), note: 'Logo bigger' });
    const { text } = await client.get(`/videos/${videoId}`);
    assert.match(text, /Version 2 is ready/);
  });
  await step('client approves; status becomes preparing final', async () => {
    await client.get(`/videos/${videoId}`);
    await client.post(`/videos/${videoId}/approve`);
    const { text } = await client.get(`/videos/${videoId}`);
    assert.match(text, /Preparing your final file/);
  });
  await step('admin delivers the approved version with a Drive link', async () => {
    await admin.get(`/admin/videos/${videoId}`);
    await admin.post(`/admin/videos/${videoId}/deliver`, { source: 'approved', drive_url: 'https://drive.google.com/file/d/x/view' });
    const { text } = await client.get(`/videos/${videoId}`);
    assert.match(text, /Your final video is ready/);
    assert.match(text, /drive\.google\.com\/file\/d\/x/);
  });
  await step('client downloads the final, identical to the approved v2', async () => {
    const res = await client.req('GET', `/videos/${videoId}/download`);
    assert.equal(res.status, 200);
    assert.equal(sha(Buffer.from(await res.arrayBuffer())), sha(v2));
    assert.equal((await other.req('GET', `/videos/${videoId}/download`)).status, 404);
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
