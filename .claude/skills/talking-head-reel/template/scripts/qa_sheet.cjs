// Contact sheets of the real dashboard cards (scene video plus live captions and graphics) at chosen points in each beat.
// Usage: node qa_sheet.cjs <outDir> [fraction ...]   e.g. node qa_sheet.cjs analysis/qa 0.3 0.7 0.95
const path = require('node:path');
const fs = require('node:fs');
const edit = path.resolve(__dirname, '..');
const config = JSON.parse(fs.readFileSync(path.join(edit, 'project.json'), 'utf8'));
const puppeteer = require(path.join(config.studio, 'Tools', 'node_modules', 'puppeteer-core'));

(async () => {
  const [outDir, ...fractions] = process.argv.slice(2);
  fs.mkdirSync(outDir, {recursive: true});
  const browser = await puppeteer.launch({executablePath: config.chrome, headless: true, args: ['--autoplay-policy=no-user-gesture-required']});
  const page = await browser.newPage();
  await page.setViewport({width: 2100, height: 1520, deviceScaleFactor: 1});
  await page.goto(`http://127.0.0.1:${config.port}`, {waitUntil: 'networkidle2'});
  await page.addStyleTag({content: '.top,.progress-bar,.info,.controls{display:none!important}main{max-width:none!important;padding:6px!important;grid-template-columns:repeat(7,1fr)!important;gap:6px!important}.beat-card{display:block!important;padding:0!important;border:0!important;border-radius:0!important}'});
  for (const fraction of (fractions.length ? fractions : ['0.5']).map(Number)) {
    await page.evaluate(async f => {
      await document.fonts.ready;
      await Promise.all([...document.querySelectorAll('.beat-card video')].map(v => new Promise(done => {
        const go = () => { if (Math.abs(v.currentTime - v.duration * f) < .01) return done(); v.addEventListener('seeked', () => done(), {once: true}); v.currentTime = v.duration * f; };
        if (v.readyState >= 2) go(); else v.addEventListener('loadeddata', go, {once: true});
        setTimeout(done, 6000);
      })));
    }, fraction);
    await new Promise(r => setTimeout(r, 900));
    const file = path.join(outDir, `qa-${String(Math.round(fraction * 100)).padStart(3, '0')}.jpg`);
    await page.screenshot({path: file, quality: 82, type: 'jpeg', fullPage: true});
    console.log(file);
  }
  await browser.close();
})().catch(error => { console.error(error); process.exit(1); });
