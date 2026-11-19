import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkDriveAccess, parseDriveUrl, drivePreviewUrl, driveDownloadUrl } from '../src/drive.js';
const ID = '1PUBLICFILE000000000000000';
const link = `https://drive.google.com/file/d/${ID}/view`;
const bytes = () => new Response(new Uint8Array([0, 0, 0, 24]), { status: 206, headers: { 'content-type': 'video/mp4', 'content-disposition': 'attachment; filename="clip.mp4"' } });

test('normalises file/folder links, preserves resource keys, refuses deceptive hosts and Docs', () => {
  assert.equal(parseDriveUrl(`https://drive.google.com/open?id=${ID}&usp=sharing`).url, link);
  assert.equal(parseDriveUrl(`https://drive.google.com/drive/u/0/folders/${ID}`).kind, 'folder');
  assert.match(drivePreviewUrl(`${link}?resourcekey=0-test-key`), /preview\?resourcekey=0-test-key$/);
  assert.match(driveDownloadUrl(`${link}?resourcekey=0-test-key`), /resourcekey=0-test-key/);
  for (const bad of [`http://drive.google.com/file/d/${ID}`, `https://drive.google.com.evil.test/file/d/${ID}`, `https://user@drive.google.com/file/d/${ID}`, `https://drive.google.com:444/file/d/${ID}`, `https://docs.google.com/document/d/${ID}/edit`, `https://drive.google.com/not-a-file?id=${ID}`]) assert.equal(parseDriveUrl(bad).ok, false, bad);
});

test('only actual anonymous download bytes verify access; no cookies or authentication sent', async () => {
  let cancelled = false;
  const result = await checkDriveAccess(`${link}?resourcekey=0-key`, { fetcher: async (url, options) => {
    assert.match(url, /resourcekey=0-key/);
    assert.equal(options.redirect, 'manual');
    assert.equal(options.headers.Range, 'bytes=0-31');
    assert.equal(options.headers.Cookie, undefined);
    return new Response(new ReadableStream({ start(c) { c.enqueue(new Uint8Array([1])); }, cancel() { cancelled = true; } }), { headers: { 'content-type': 'video/mp4', 'content-disposition': 'attachment; filename="a.mp4"' } });
  } });
  assert.equal(result, 'shared'); assert.equal(cancelled, true);
});

test('private, missing, blocked, throttled and misleading 200 pages do not verify', async () => {
  for (const [response, expected] of [
    [() => new Response('', { status: 302, headers: { location: 'https://accounts.google.com/signin' } }), 'not-shared'],
    [() => new Response('Request access', { headers: { 'content-type': 'text/html' } }), 'not-shared'],
    [() => new Response('not found', { status: 404 }), 'missing'],
    [() => new Response('denied', { status: 403 }), 'download-blocked'],
    [() => new Response('limit', { status: 429 }), 'unknown'],
    [() => new Response('<title>Google Drive</title>', { headers: { 'content-type': 'text/html' } }), 'unknown'],
    [() => new Response('', { headers: { 'content-type': 'video/mp4', 'content-disposition': 'attachment' } }), 'unknown'],
  ]) assert.equal(await checkDriveAccess(link, { fetcher: response }), expected);
});

test('uncertainty and timeouts fail closed; legacy off setting cannot bypass checks', async () => {
  process.env.DRIVE_LINK_CHECK = 'off';
  assert.equal(await checkDriveAccess(link, { fetcher: async () => { throw new Error('network'); } }), 'unknown');
  assert.equal(await checkDriveAccess(link, { timeoutMs: 5, fetcher: async (_, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('timeout')))) }), 'unknown');
  delete process.env.DRIVE_LINK_CHECK;
});

test('redirects cannot reach arbitrary/private network hosts', async () => {
  let calls = 0;
  assert.equal(await checkDriveAccess(link, { fetcher: async () => { calls++; return new Response('', { status: 302, headers: { location: 'http://127.0.0.1/private' } }); } }), 'unknown');
  assert.equal(calls, 1);
});

test('large-file confirmation must lead to bytes, not just a download button', async () => {
  let calls = 0;
  const fetcher = async (_, options) => {
    assert.equal(options.headers.Range, 'bytes=0-31');
    if (++calls === 2) return bytes();
    return new Response(`<form id="download-form" action="https://drive.usercontent.google.com/download"><input type="hidden" name="id" value="${ID}"><input type="hidden" name="confirm" value="t"></form>`, { headers: { 'content-type': 'text/html' } });
  };
  assert.equal(await checkDriveAccess(link, { fetcher }), 'shared');
  assert.equal(calls, 2);
});

test('folder verification checks each visible child and fails for inaccessible or empty folders', async () => {
  const folder = `https://drive.google.com/drive/folders/1FOLDER00000000000000000`;
  let fileChecks = 0;
  assert.equal(await checkDriveAccess(folder, { fetcher: async (url) => {
    if (url.includes('embeddedfolderview')) return new Response(`<title>Footage</title><a href="${link}">Camera</a>`);
    fileChecks++; return bytes();
  } }), 'shared');
  assert.equal(fileChecks, 1);
  assert.equal(await checkDriveAccess(folder, { fetcher: async (url) => url.includes('embeddedfolderview') ? new Response(`<a href="${link}">Camera</a>`) : new Response('', { status: 403 }) }), 'download-blocked');
  assert.equal(await checkDriveAccess(folder, { fetcher: async () => new Response('<title>Empty folder</title>') }), 'empty');
});

test('folder verification follows subfolders, bounds work, and rejects oversized HTML', async () => {
  const folder = 'https://drive.google.com/drive/folders/1FOLDER00000000000000000';
  assert.equal(await checkDriveAccess(folder, { fetcher: async (url) => {
    if (url.includes('id=1FOLDER')) return new Response('<a href="https://drive.google.com/drive/folders/1SUBFOLDER00000000000000">Assets</a>');
    if (url.includes('embeddedfolderview')) return new Response(`<a href="${link}">Video</a>`);
    return bytes();
  } }), 'shared');
  assert.equal(await checkDriveAccess(folder, { fetcher: async (url) => url.includes('embeddedfolderview')
    ? new Response(Array.from({ length: 51 }, (_, i) => `<a href="https://drive.google.com/file/d/1VIDEOFILE0000000000${i}/view">${i}</a>`).join('')) : bytes() }), 'too-large');
  assert.equal(await checkDriveAccess(folder, { fetcher: async () => new Response('x'.repeat(1024 * 1024 + 1)) }), 'unknown');
});
