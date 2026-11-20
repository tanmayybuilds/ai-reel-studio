// Render the tour frame by frame in headless Chrome (same engine as the editor) and encode it with FFmpeg.
// Starts its own copy of the editor server on a free port, so the editor does not need to be running.
//   node scripts/render_tour.cjs                      -> media/video.mp4 (1080x1920, silent)
//   node scripts/render_tour.cjs --preview            -> media/preview.mp4 (540x960, faster check)
//   node scripts/render_tour.cjs --stills 0.5,3.2,7   -> analysis/stills/t-0003.200.jpg ...
//   node scripts/render_tour.cjs --from 10 --to 14    -> render a time range only
const path = require('node:path');
const fs = require('node:fs');
const {spawn} = require('node:child_process');
const proj = path.resolve(__dirname, '..');
const config = JSON.parse(fs.readFileSync(path.join(proj, 'project.json'), 'utf8'));
const puppeteer = require(path.join(config.studio, 'Tools', 'node_modules', 'puppeteer-core'));
const {createServer} = require(path.join(proj, 'editor', 'server.cjs'));

const args = process.argv.slice(2);
const opt = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const has = name => args.includes(name);

(async () => {
  const server = createServer(proj);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const browser = await puppeteer.launch({
    executablePath: config.chrome, headless: true,
    args: ['--force-device-scale-factor=1', '--autoplay-policy=no-user-gesture-required', '--enable-webgl', '--ignore-gpu-blocklist',
           '--use-angle=' + (process.platform === 'darwin' ? 'metal' : 'swiftshader'), '--enable-unsafe-swiftshader', '--hide-scrollbars'],
  });
  const page = await browser.newPage();
  page.on('pageerror', e => console.error('page error:', e.message));
  page.on('console', m => { if (m.type() === 'error') console.error('console:', m.text()); });
  await page.setViewport({width: 1080, height: 1920, deviceScaleFactor: 1});
  await page.goto(`http://127.0.0.1:${port}/render.html`, {waitUntil: 'networkidle2'});
  await page.waitForFunction('window.ready === true || window.renderError', {timeout: 120000});
  const err = await page.evaluate('window.renderError');
  if (err) throw new Error(err);
  const duration = await page.evaluate('window.duration');
  const fps = await page.evaluate('window.fps');
  const shoot = () => page.screenshot({type: 'jpeg', quality: 95, optimizeForSpeed: true, clip: {x: 0, y: 0, width: 1080, height: 1920}});

  if (has('--stills')) {
    const dir = path.join(proj, opt('--out') || 'analysis/stills');
    fs.mkdirSync(dir, {recursive: true});
    for (const t of opt('--stills').split(',').map(Number)) {
      await page.evaluate(v => window.seekTo(v), t);
      fs.writeFileSync(path.join(dir, `t-${t.toFixed(3).padStart(8, '0')}.jpg`), await shoot());
    }
    console.log('stills ->', path.relative(proj, dir));
  } else {
    const preview = has('--preview');
    const from = Number(opt('--from') || 0), to = Math.min(duration, Number(opt('--to') || duration));
    const out = path.join(proj, opt('--out') || (preview ? 'media/preview.mp4' : 'media/video.mp4'));
    const first = Math.round(from * fps), last = Math.round(to * fps);
    const vf = preview ? ['-vf', 'scale=540:960:flags=lanczos'] : [];
    const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-', ...vf,
      '-c:v', 'libx264', '-preset', preview ? 'veryfast' : 'slow', '-crf', preview ? '23' : '16', '-pix_fmt', 'yuv420p',
      '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-movflags', '+faststart', out], {stdio: ['pipe', 'inherit', 'inherit']});
    const started = Date.now();
    for (let n = first; n < last; n++) {
      await page.evaluate(v => window.seekTo(v), n / fps);
      const img = await shoot();
      if (!ff.stdin.write(img)) await new Promise(r => ff.stdin.once('drain', r));
      if ((n - first) % 60 === 0) {
        const done = n - first, el = (Date.now() - started) / 1000;
        const eta = done ? Math.round(el / done * (last - n)) : 0;
        console.log(`${done}/${last - first} frames  ${Math.round(el)}s elapsed  ~${eta}s left`);
      }
    }
    ff.stdin.end();
    await new Promise(r => ff.on('close', r));
    console.log(`done: ${last - first} frames in ${Math.round((Date.now() - started) / 1000)}s -> ${path.relative(proj, out)}`);
  }
  await browser.close();
  server.close();
})().catch(e => { console.error(e); process.exit(1); });
