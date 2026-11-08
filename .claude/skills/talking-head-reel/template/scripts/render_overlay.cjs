// Renders the motion layer frame by frame from the running dashboard (start it first: node storyboard/server.cjs).
// Usage: node render_overlay.cjs [media/overlay.mov]   or   node render_overlay.cjs --stills <dir> <t1> <t2> ...
const path = require('node:path');
const fs = require('node:fs');
const {spawn} = require('node:child_process');
const edit = path.resolve(__dirname, '..');
const config = JSON.parse(fs.readFileSync(path.join(edit, 'project.json'), 'utf8'));
const puppeteer = require(path.join(config.studio, 'Tools', 'node_modules', 'puppeteer-core'));
const FPS = config.fps;

(async () => {
  const args = process.argv.slice(2);
  const browser = await puppeteer.launch({executablePath: config.chrome, headless: true, args: ['--disable-gpu', '--force-device-scale-factor=1']});
  const page = await browser.newPage();
  page.on('pageerror', e => console.error('page error', e.message));
  await page.setViewport({width: 1080, height: 1920, deviceScaleFactor: 1});
  await page.goto(`http://127.0.0.1:${config.port}/render.html`, {waitUntil: 'networkidle2'});
  await page.waitForFunction('window.ready === true', {timeout: 60000});
  if (args[0] === '--stills') {
    fs.mkdirSync(args[1], {recursive: true});
    for (const t of args.slice(2)) {
      await page.evaluate(v => window.seekTo(v), Number(t));
      await page.screenshot({path: path.join(args[1], `o-${String(t).padStart(6, '0')}.png`), omitBackground: true});
    }
  } else {
    const out = path.resolve(edit, args[0] || 'media/overlay.mov');
    const duration = await page.evaluate('window.duration');
    const frames = Math.round(duration * FPS);
    // qtrle keeps the alpha channel, so the layer composites cleanly over the A-roll.
    const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'png', '-i', '-', '-c:v', 'qtrle', '-pix_fmt', 'argb', out], {stdio: ['pipe', 'inherit', 'inherit']});
    const started = Date.now();
    for (let n = 0; n < frames; n++) {
      await page.evaluate(v => window.seekTo(v), n / FPS);
      const shot = await page.screenshot({omitBackground: true, type: 'png'});
      if (!ff.stdin.write(shot)) await new Promise(r => ff.stdin.once('drain', r));
      if (n % 100 === 0) console.log(n, '/', frames, Math.round((Date.now() - started) / 1000) + 's');
    }
    ff.stdin.end();
    await new Promise(r => ff.on('close', r));
    console.log('done', frames, 'frames ->', out);
  }
  await browser.close();
})().catch(error => { console.error(error); process.exit(1); });
