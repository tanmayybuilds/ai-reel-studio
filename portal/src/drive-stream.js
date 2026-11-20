// Streams a shared Google Drive video through the portal, so phones can play it in their own player.
//
// Why: Google refuses (403) to serve Drive files directly to a web page's <video> element, and Drive's
// embedded player is fragile on phones (sign-in redirects, iPhone cookie rules). Google does serve the
// file to a plain server request, so we fetch it and pass it through. Nothing is stored.
//
// - Only Google hosts are ever contacted (every redirect is checked).
// - Range requests are forwarded, so seeking works and iPhones can play it.
// - If Google sends a web page instead of video (a very large file behind the virus-scan notice, or a link
//   that stopped being shared), we answer 502 and the page falls back to Drive's own player.
import { Readable } from 'node:stream';
import { driveStreamUrl, safeGoogleUrl } from './drive.js';

const PASS_HEADERS = ['content-type', 'content-length', 'content-range', 'accept-ranges', 'last-modified', 'etag'];

export async function streamDriveVideo(req, res, link) {
  let url = driveStreamUrl(link);
  if (!url) return res.status(404).end();

  const controller = new AbortController();
  res.on('close', () => controller.abort()); // viewer left or seeked: stop pulling from Google
  const headers = { 'User-Agent': 'Mozilla/5.0 ReelStudioPortal/1.0' };
  if (req.headers.range && /^bytes=\d*-\d*$/.test(req.headers.range)) headers.Range = req.headers.range;

  try {
    let upstream;
    for (let hop = 0; hop < 5; hop++) {
      if (!safeGoogleUrl(url)) return res.status(502).end();
      upstream = await fetch(url, { headers, redirect: 'manual', signal: controller.signal });
      if (upstream.status >= 300 && upstream.status < 400 && upstream.headers.get('location')) {
        await upstream.body?.cancel();
        url = new URL(upstream.headers.get('location'), url).href;
        continue;
      }
      break;
    }
    const type = (upstream.headers.get('content-type') || '').split(';')[0].toLowerCase();
    if (![200, 206].includes(upstream.status) || !/^(video|audio)\/|^application\/octet-stream$/.test(type)) {
      await upstream.body?.cancel();
      return res.status(upstream.status === 416 ? 416 : 502).end();
    }
    res.status(upstream.status);
    for (const h of PASS_HEADERS) {
      const v = upstream.headers.get(h);
      if (v) res.setHeader(h, v);
    }
    if (type === 'application/octet-stream') res.setHeader('content-type', 'video/mp4');
    res.setHeader('Cache-Control', 'private, max-age=600');
    res.setHeader('Content-Disposition', 'inline');
    Readable.fromWeb(upstream.body).on('error', () => res.destroy()).pipe(res);
  } catch (err) {
    if (err.name !== 'AbortError' && !res.headersSent) res.status(502).end();
    else res.destroy();
  }
}
