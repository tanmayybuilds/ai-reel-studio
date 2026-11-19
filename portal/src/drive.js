// Google Drive links: everything (client footage, edited versions, finals) is shared as a Drive link,
// so the portal stores no video files itself.

const DRIVE_HOSTS = new Set(['drive.google.com', 'docs.google.com']);

/**
 * Understand a pasted Drive link.
 * @returns {{ ok: boolean, kind?: 'file'|'folder', id?: string, url?: string }}
 */
export function parseDriveUrl(input) {
  let u;
  try {
    u = new URL(String(input || '').trim());
  } catch {
    return { ok: false };
  }
  if (u.protocol !== 'https:' || !DRIVE_HOSTS.has(u.hostname)) return { ok: false };
  const path = u.pathname;
  let m = path.match(/\/(?:drive\/(?:u\/\d+\/)?)?folders\/([\w-]{10,})/);
  if (m) return { ok: true, kind: 'folder', id: m[1], url: `https://drive.google.com/drive/folders/${m[1]}` };
  m = path.match(/\/file\/(?:u\/\d+\/)?d\/([\w-]{10,})/) || path.match(/\/(?:document|presentation|spreadsheets)\/d\/([\w-]{10,})/);
  if (m) return { ok: true, kind: 'file', id: m[1], url: `https://drive.google.com/file/d/${m[1]}/view` };
  const id = u.searchParams.get('id');
  if (id && /^[\w-]{10,}$/.test(id)) return { ok: true, kind: 'file', id, url: `https://drive.google.com/file/d/${id}/view` };
  return { ok: false };
}

/** Player that plays a shared Drive video inside our page. */
export const drivePreviewUrl = (link) => {
  const d = parseDriveUrl(link);
  return d.ok && d.kind === 'file' ? `https://drive.google.com/file/d/${d.id}/preview` : null;
};

/** Direct download of a shared Drive file (big files show Google's "can't scan for viruses" page first). */
export const driveDownloadUrl = (link) => {
  const d = parseDriveUrl(link);
  return d.ok && d.kind === 'file' ? `https://drive.google.com/uc?export=download&id=${d.id}` : null;
};

/**
 * Ask Drive, as an anonymous visitor, whether the editor will be able to open the link.
 * Only definite answers block a submission: 'not-shared' (Google sends us to its sign-in page)
 * and 'missing' (404). Anything else, including a timeout or Google rate-limiting us, is 'unknown'.
 * Set DRIVE_LINK_CHECK=off to skip the check entirely.
 * @returns {Promise<'shared'|'not-shared'|'missing'|'unknown'>}
 */
export async function checkDriveAccess(link) {
  if (process.env.DRIVE_LINK_CHECK === 'off') return 'unknown';
  const d = parseDriveUrl(link);
  if (!d.ok) return 'missing';
  try {
    const res = await fetch(d.url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(6000),
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ReelStudioPortal/1.0; link check)' },
    });
    const location = res.headers.get('location') || '';
    if (res.status >= 300 && res.status < 400 && /accounts\.google\.com|ServiceLogin/i.test(location)) return 'not-shared';
    if (res.status === 404) return 'missing';
    if (res.status === 200) return 'shared';
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

export const DRIVE_PROBLEM = {
  'not-shared': 'That Drive link isn’t shared yet. In Google Drive: Share → General access → “Anyone with the link”, then copy the link again.',
  missing: 'That Drive link doesn’t open. Check you copied the whole link, and that it’s shared with “Anyone with the link”.',
};
