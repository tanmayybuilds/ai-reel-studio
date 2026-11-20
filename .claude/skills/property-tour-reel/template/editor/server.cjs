// Local editor server for a property tour project. Serves the editor, the media, and saves tour.json and reviews.json.
// Every save of tour.json keeps the previous version in history/, so nothing the user or Claude wrote is lost.
// Usage (from the project folder): node editor/server.cjs        Local requests only.
const http = require('node:http');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

const TYPES = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.mp4': 'video/mp4', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.srt': 'text/plain; charset=utf-8'};

function createServer(root) {
  const file = name => path.join(root, name);
  const readJson = (name, fallback) => { try { return JSON.parse(fs.readFileSync(file(name), 'utf8').replace(/^﻿/, '')); } catch { return fallback; } };
  let queue = Promise.resolve();
  const writeJson = (name, value) => {
    const job = queue.then(async () => {
      const target = file(name);
      if (name === 'tour.json' && fs.existsSync(target)) {
        await fsp.mkdir(file('history'), {recursive: true});
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        await fsp.copyFile(target, path.join(root, 'history', `tour-${stamp}.json`));
      }
      await fsp.writeFile(target + '.tmp', JSON.stringify(value, null, 2));
      await fsp.rename(target + '.tmp', target);
    });
    queue = job.catch(() => {});
    return job;
  };
  const readBody = async (req, limit) => {
    let body = '';
    for await (const chunk of req) { body += chunk; if (Buffer.byteLength(body) > limit) throw Object.assign(new Error('too large'), {code: 413}); }
    return JSON.parse(body);
  };

  return http.createServer(async (req, res) => {
    const json = (code, value) => { res.writeHead(code, {'Content-Type': 'application/json', 'Cache-Control': 'no-store'}); res.end(JSON.stringify(value)); };
    try {
      if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(req.headers.host || '')) return json(403, {error: 'Local requests only.'});
      const url = new URL(req.url, `http://${req.headers.host}`);
      const p = url.pathname;
      if (req.method === 'POST') {
        if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) return json(403, {error: 'Origin not allowed.'});
        if (!(req.headers['content-type'] || '').startsWith('application/json')) return json(415, {error: 'Use JSON.'});
        if (p === '/api/tour') {
          const tour = await readBody(req, 2_000_000);
          if (!tour || !Array.isArray(tour.shots) || !tour.shots.every(s => s && typeof s.id === 'string' && typeof s.dur === 'number' && s.dur > 0)) return json(400, {error: 'tour.json needs shots with an id and a positive dur.'});
          await writeJson('tour.json', tour);
          return json(200, {saved: true, at: new Date().toISOString()});
        }
        if (p === '/api/reviews') {
          const data = await readBody(req, 20000);
          const ids = new Set((readJson('tour.json', {shots: []}).shots || []).map(s => s.id).concat(['_overall']));
          if (!data || !ids.has(data.id) || !['pending', 'approved', 'rejected'].includes(data.status) || typeof data.feedback !== 'string' || data.feedback.length > 4000) return json(400, {error: 'Choose a valid shot, status and feedback (max 4000 characters).'});
          const reviews = readJson('reviews.json', {});
          reviews[data.id] = {status: data.status, feedback: data.feedback, updatedAt: new Date().toISOString()};
          await writeJson('reviews.json', reviews);
          return json(200, reviews[data.id]);
        }
        return json(404, {error: 'Unknown endpoint.'});
      }
      if (!['GET', 'HEAD'].includes(req.method)) return json(405, {error: 'Method not allowed.'});
      if (p === '/api/tour') return json(200, readJson('tour.json', {shots: []}));
      if (p === '/api/media') return json(200, readJson('media.json', {}));
      if (p === '/api/reviews') return json(200, readJson('reviews.json', {}));
      if (p === '/api/project') return json(200, readJson('project.json', {}));
      if (p === '/api/status') {
        const mtime = n => { try { return fs.statSync(file(n)).mtimeMs; } catch { return 0; } };
        return json(200, {tour: mtime('tour.json'), mix: mtime('media/mix.wav'), mixTour: readJson('media/mix.json', {}).tourHash || null});
      }
      const decoded = decodeURIComponent(p);
      let base = path.join(root, 'editor'), rel = decoded === '/' ? 'index.html' : decoded.slice(1);
      if (decoded.startsWith('/media/')) { base = path.join(root, 'media'); rel = decoded.slice(7); }
      const target = path.resolve(base, rel);
      if (!target.startsWith(path.resolve(base) + path.sep)) return json(403, {error: 'Path not allowed.'});
      let stat;
      try { stat = await fsp.stat(target); } catch { return json(404, {error: 'File not found.'}); }
      if (!stat.isFile()) return json(404, {error: 'File not found.'});
      let start = 0, end = stat.size - 1, status = 200;
      const headers = {'Content-Type': TYPES[path.extname(target).toLowerCase()] || 'application/octet-stream', 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff'};
      if (req.headers.range) {
        const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
        if (!m || (!m[1] && !m[2])) { res.writeHead(416, {'Content-Range': `bytes */${stat.size}`}); return res.end(); }
        start = m[1] ? Number(m[1]) : Math.max(0, stat.size - Number(m[2]));
        end = m[1] && m[2] ? Math.min(Number(m[2]), stat.size - 1) : stat.size - 1;
        if (start > end || start >= stat.size) { res.writeHead(416, {'Content-Range': `bytes */${stat.size}`}); return res.end(); }
        status = 206; headers['Content-Range'] = `bytes ${start}-${end}/${stat.size}`;
      }
      headers['Content-Length'] = stat.size ? end - start + 1 : 0;
      res.writeHead(status, headers);
      if (req.method === 'HEAD' || !stat.size) return res.end();
      const stream = fs.createReadStream(target, {start, end});
      stream.on('error', () => res.destroy());
      res.on('close', () => stream.destroy());
      stream.pipe(res);
    } catch (error) {
      if (!res.headersSent) json(error.code === 413 ? 413 : 500, {error: error.code === 413 ? 'Too large.' : 'Could not read or save the project.'});
      else res.destroy();
      if (error.code !== 413) console.error(error.message);
    }
  });
}

module.exports = {createServer};
if (require.main === module) {
  const root = path.resolve(__dirname, '..');
  const config = JSON.parse(fs.readFileSync(path.join(root, 'project.json'), 'utf8'));
  const port = Number(process.env.TOUR_PORT || config.port);
  const server = createServer(root);
  server.on('error', e => { console.error(e.message); process.exitCode = 1; });
  server.listen(port, '127.0.0.1', () => console.log(`${config.title} tour editor: http://127.0.0.1:${port}`));
}
