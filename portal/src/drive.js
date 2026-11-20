// Verify anonymous access without saving footage or using a signed-in Google session.
const DRIVE_HOSTS = new Set(['drive.google.com', 'docs.google.com']);
const ID = /^[\w-]{10,200}$/;

export function parseDriveUrl(input) {
  let u;
  try { u = new URL(String(input || '').trim()); } catch { return { ok: false }; }
  if (u.protocol !== 'https:' || !DRIVE_HOSTS.has(u.hostname) || u.username || u.password || u.port) return { ok: false };
  const folder = u.pathname.match(/^\/(?:drive\/(?:u\/\d+\/)?)?folders\/([\w-]+)\/?$/);
  const file = u.pathname.match(/^\/file\/(?:u\/\d+\/)?d\/([\w-]+)(?:\/(?:view|preview|edit))?\/?$/);
  const id = folder?.[1] || file?.[1] || (['/open', '/uc'].includes(u.pathname) ? u.searchParams.get('id') : null);
  if (!id || !ID.test(id)) return { ok: false };
  const kind = folder ? 'folder' : 'file';
  const key = u.searchParams.get('resourcekey');
  if (key && !/^[\w-]{1,200}$/.test(key)) return { ok: false };
  const url = new URL(kind === 'folder' ? `https://drive.google.com/drive/folders/${id}` : `https://drive.google.com/file/d/${id}/view`);
  if (key) url.searchParams.set('resourcekey', key);
  return { ok: true, kind, id, resourceKey: key || null, url: url.href };
}

function fileUrl(link, preview) {
  const d = parseDriveUrl(link);
  if (!d.ok || d.kind !== 'file') return null;
  const u = new URL(preview ? `https://drive.google.com/file/d/${d.id}/preview` : `https://drive.google.com/uc?export=download&id=${d.id}`);
  if (d.resourceKey) u.searchParams.set('resourcekey', d.resourceKey);
  return u.href;
}
export const drivePreviewUrl = (link) => fileUrl(link, true);
export const driveDownloadUrl = (link) => fileUrl(link, false);

/** Direct, seekable video stream of a shared Drive file, for the phone's own <video> player. */
export function driveStreamUrl(link) {
  const d = parseDriveUrl(link);
  if (!d.ok || d.kind !== 'file') return null;
  const u = new URL(`https://drive.usercontent.google.com/download?id=${d.id}&export=download`);
  if (d.resourceKey) u.searchParams.set('resourcekey', d.resourceKey);
  return u.href;
}

export const DRIVE_PROBLEM = {
  'not-shared': 'That Drive link requires access. Set Share → General access → Anyone with the link, then try again.',
  missing: 'That Drive file or folder was not found. Check the link and try again.',
  'download-blocked': 'The file cannot be downloaded anonymously. Set Anyone with the link and allow viewers to download in Drive sharing settings, then try again.',
  empty: 'No downloadable files were found in that folder. Add your footage, or paste a direct video file link.',
  unknown: 'We could not confirm Drive access. Nothing was submitted. Please retry, or use a direct video file link.',
  'too-large': 'This folder is too large to verify at once. Share a smaller folder (up to 50 files) or a direct video file link.',
};

export function safeGoogleUrl(value) {
  const u = new URL(value);
  return u.protocol === 'https:' && !u.username && !u.password && !u.port && (
    DRIVE_HOSTS.has(u.hostname) || u.hostname === 'drive.usercontent.google.com' ||
    /^[\w-]+-docs\.googleusercontent\.com$/.test(u.hostname)
  );
}
// Inspect every redirect; never forward Google authentication cookies or fetch arbitrary hosts.
async function googleFetch(url, fetcher, signal, range = false) {
  for (let n = 0; n < 6; n++) {
    if (!safeGoogleUrl(url)) throw new Error('Unexpected download host');
    const res = await fetcher(url, { redirect: 'manual', signal, headers: {
      'User-Agent': 'Mozilla/5.0 ReelStudioPortal/1.0', ...(range ? { Range: 'bytes=0-31' } : {}),
    } });
    if (res.status >= 300 && res.status < 400) {
      const location = new URL(res.headers.get('location') || '', url);
      await res.body?.cancel();
      if (location.hostname === 'accounts.google.com') return { result: 'not-shared' };
      url = location.href;
      continue;
    }
    return { res };
  }
  return { result: 'unknown' };
}

async function limitedText(res, limit = 1024 * 1024) {
  const reader = res.body?.getReader();
  if (!reader) return '';
  const chunks = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > limit) throw new Error('Response too large');
      chunks.push(value);
    }
    return new TextDecoder().decode(Buffer.concat(chunks));
  } finally { await reader.cancel().catch(() => {}); }
}

const unescapeHtml = (s) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const attr = (s, key) => unescapeHtml(s.match(new RegExp(`\\b${key}\\s*=\\s*["']([^"']*)["']`, 'i'))?.[1] || '');

async function verifyFile(d, fetcher, signal) {
  const u = new URL(`https://drive.usercontent.google.com/download?id=${d.id}&export=download`);
  if (d.resourceKey) u.searchParams.set('resourcekey', d.resourceKey);
  let target = u.href;
  for (let n = 0; n < 2; n++) {
    const { res, result } = await googleFetch(target, fetcher, signal, true);
    if (result) return result;
    if (res.status === 404) { await res.body?.cancel(); return 'missing'; }
    if ([401, 403].includes(res.status)) { await res.body?.cancel(); return 'download-blocked'; }
    if (![200, 206].includes(res.status)) { await res.body?.cancel(); return 'unknown'; }
    const type = (res.headers.get('content-type') || '').split(';')[0].toLowerCase();
    if (type && !['text/html', 'application/xhtml+xml'].includes(type) && res.headers.get('content-disposition')?.includes('attachment')) {
      // Read a small prefix to prove bytes are available, then cancel even if Range was ignored.
      const reader = res.body?.getReader();
      if (!reader) return 'unknown';
      try {
        const { value, done } = await reader.read();
        return !done && value?.length ? 'shared' : 'unknown';
      } finally { await reader.cancel().catch(() => {}); }
    }
    const text = await limitedText(res);
    if (/ServiceLogin|accounts\.google\.com\/v3\/signin|You need access|Request access/i.test(text)) return 'not-shared';
    if (/download (?:has been |is )?disabled|cannot download|can't download this file/i.test(text)) return 'download-blocked';
    // A virus-scan interstitial is not proof. Follow its confirmation form and require file bytes.
    const form = text.match(/<form\b[^>]*\bid=["']download-form["'][^>]*>([\s\S]*?)<\/form>/i);
    if (!form) return 'unknown';
    const action = new URL(attr(form[0], 'action'), target);
    if (!safeGoogleUrl(action.href)) return 'unknown';
    for (const input of form[1].matchAll(/<input\b[^>]*>/gi)) {
      const name = attr(input[0], 'name');
      if (['id', 'export', 'confirm', 'uuid', 'resourcekey'].includes(name)) action.searchParams.set(name, attr(input[0], 'value'));
    }
    if (action.searchParams.get('id') !== d.id) return 'unknown';
    target = action.href;
  }
  return 'unknown';
}

async function verifyFolder(d, ctx, depth = 0) {
  if (depth > 5 || ctx.seen.has(d.id)) return 'unknown';
  ctx.seen.add(d.id);
  if (++ctx.folders > 10) return 'too-large';
  const u = new URL(`https://drive.google.com/embeddedfolderview?id=${d.id}`);
  if (d.resourceKey) u.searchParams.set('resourcekey', d.resourceKey);
  const { res, result } = await googleFetch(u.href, ctx.fetcher, ctx.signal);
  if (result) return result;
  if (res.status === 404) { await res.body?.cancel(); return 'missing'; }
  if ([401, 403].includes(res.status)) { await res.body?.cancel(); return 'not-shared'; }
  if (res.status !== 200) { await res.body?.cancel(); return 'unknown'; }
  const text = await limitedText(res);
  if (/You need access|Request access|ServiceLogin/i.test(text)) return 'not-shared';
  const children = new Map();
  for (const a of text.matchAll(/<a\b[^>]*>/gi)) {
    const child = parseDriveUrl(attr(a[0], 'href'));
    if (child.ok && child.id !== d.id) children.set(child.id, child);
  }
  if (!children.size) return 'empty';
  for (const child of children.values()) {
    if (++ctx.items > 50) return 'too-large';
    const state = child.kind === 'folder' ? await verifyFolder(child, ctx, depth + 1) : await verifyFile(child, ctx.fetcher, ctx.signal);
    if (state !== 'shared') return state;
  }
  return 'shared';
}

/** Only verified anonymous downloads return 'shared'. Uncertainty blocks submission.
 * fetcher is injected by tests; no environment variable bypasses production verification. */
export async function checkDriveAccess(link, { fetcher = fetch, timeoutMs = 25000 } = {}) {
  const d = parseDriveUrl(link);
  if (!d.ok) return 'missing';
  const signal = AbortSignal.timeout(timeoutMs);
  try {
    return d.kind === 'file' ? await verifyFile(d, fetcher, signal)
      : await verifyFolder(d, { fetcher, signal, items: 0, folders: 0, seen: new Set() });
  } catch { return 'unknown'; }
}
