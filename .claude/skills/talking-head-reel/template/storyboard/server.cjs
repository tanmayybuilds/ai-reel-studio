// Local storyboard server: serves the dashboard, the beat scenes in media/, and saves reviews to reviews.json.
// storyboard.json is read on every request, so edits show up on reload without a restart.
const http = require('node:http');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

function createServer(root) {
  const readManifest = () => JSON.parse(fs.readFileSync(path.join(root, 'storyboard.json'), 'utf8').replace(/^﻿/, ''));
  const reviewFile = path.join(root, 'reviews.json');
  let reviews = fs.existsSync(reviewFile) ? JSON.parse(fs.readFileSync(reviewFile, 'utf8')) : {};
  let writeQueue = Promise.resolve();
  const types = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.mp4': 'video/mp4', '.wav': 'audio/wav', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.vtt': 'text/vtt; charset=utf-8', '.srt': 'text/plain; charset=utf-8'};
  return http.createServer(async (req, res) => {
    const json = (code, value) => { res.writeHead(code, {'Content-Type': 'application/json', 'Cache-Control': 'no-store'}); res.end(JSON.stringify(value)); };
    try {
      if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(req.headers.host || '')) return json(403, {error: 'Local requests only.'});
      const url = new URL(req.url, `http://${req.headers.host}`);
      if (url.pathname === '/api/storyboard' && req.method === 'GET') return json(200, readManifest());
      if (url.pathname === '/api/reviews' && req.method === 'GET') return json(200, reviews);
      if (url.pathname === '/api/reviews' && req.method === 'POST') {
        if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) return json(403, {error: 'Origin not allowed.'});
        if (!(req.headers['content-type'] || '').startsWith('application/json')) return json(415, {error: 'Use JSON.'});
        let body = '';
        for await (const chunk of req) { body += chunk; if (Buffer.byteLength(body) > 20000) return json(413, {error: 'Feedback is too large.'}); }
        let data;
        try { data = JSON.parse(body); } catch { return json(400, {error: 'Invalid JSON.'}); }
        const beatIds = new Set(readManifest().beats.map(beat => beat.id));
        if (!data || !beatIds.has(data.id) || !['pending', 'approved', 'rejected'].includes(data.status) || typeof data.feedback !== 'string' || data.feedback.length > 4000) return json(400, {error: 'Choose a valid beat, status, and feedback of at most 4000 characters.'});
        const entry = {status: data.status, feedback: data.feedback, updatedAt: new Date().toISOString()};
        const save = writeQueue.then(async () => {
          const next = {...reviews, [data.id]: entry};
          await fsp.writeFile(reviewFile + '.tmp', JSON.stringify(next, null, 2));
          await fsp.rename(reviewFile + '.tmp', reviewFile);
          reviews = next;
        });
        writeQueue = save.catch(() => {});
        await save;
        return json(200, entry);
      }
      if (!['GET', 'HEAD'].includes(req.method)) return json(405, {error: 'Method not allowed.'});
      const decoded = decodeURIComponent(url.pathname);
      let base = path.join(root, 'storyboard');
      let relative = decoded === '/' ? 'index.html' : decoded.slice(1);
      if (decoded.startsWith('/media/')) { base = path.join(root, 'media'); relative = decoded.slice(7); }
      const file = path.resolve(base, relative);
      if (file !== base && !file.startsWith(path.resolve(base) + path.sep)) return json(403, {error: 'Path not allowed.'});
      let stat;
      try { stat = await fsp.stat(file); } catch { return json(404, {error: 'File not found.'}); }
      if (!stat.isFile()) return json(404, {error: 'File not found.'});
      let start = 0, end = stat.size - 1, status = 200;
      const headers = {'Content-Type': types[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff'};
      if (req.headers.range) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
        if (!match || (!match[1] && !match[2])) { res.writeHead(416, {'Content-Range': `bytes */${stat.size}`}); return res.end(); }
        start = match[1] ? Number(match[1]) : Math.max(0, stat.size - Number(match[2]));
        end = match[1] && match[2] ? Math.min(Number(match[2]), stat.size - 1) : stat.size - 1;
        if (start > end || start >= stat.size || !Number.isSafeInteger(start) || !Number.isSafeInteger(end)) { res.writeHead(416, {'Content-Range': `bytes */${stat.size}`}); return res.end(); }
        status = 206;
        headers['Content-Range'] = `bytes ${start}-${end}/${stat.size}`;
      }
      headers['Content-Length'] = stat.size ? end - start + 1 : 0;
      res.writeHead(status, headers);
      if (req.method === 'HEAD' || !stat.size) return res.end();
      const stream = fs.createReadStream(file, {start, end});
      stream.on('error', () => res.destroy());
      res.on('close', () => stream.destroy());
      stream.pipe(res);
    } catch (error) {
      if (!res.headersSent) json(500, {error: 'Could not save or read the local project. Check disk access and retry.'});
      else res.destroy();
      console.error(error.message);
    }
  });
}

module.exports = {createServer};
if (require.main === module) {
  const root = path.resolve(__dirname, '..');
  const config = JSON.parse(fs.readFileSync(path.join(root, 'project.json'), 'utf8'));
  const port = Number(process.env.STORYBOARD_PORT || config.port);
  const server = createServer(root);
  server.on('error', error => { console.error(error.message); process.exitCode = 1; });
  server.listen(port, '127.0.0.1', () => console.log(`${config.title} storyboard: http://127.0.0.1:${port}`));
}
