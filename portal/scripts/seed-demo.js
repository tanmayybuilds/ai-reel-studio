// Set up a demo: the style library (from approved reels) and a demo client login.
// Writes every link and login to data/DEMO-LOGINS.md (git-ignored).
//
//   npm run demo                       # uses <studio>/Approved Videos
//   npm run demo -- "/path/to/Approved Videos"
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../src/config.js';
import { db, now } from '../src/db.js';
import { hashPassword, generatePassword, ensureAdmin } from '../src/auth.js';
import { listStyles, createStyle } from '../src/styles.js';

const approvedDir = path.resolve(process.argv[2] || path.join(config.studioRoot, 'Approved Videos'));

// How each approved reel is presented to clients. Matched on the file name; anything else gets its folder name.
const KNOWN = [
  [/whitestair/i, 'Bright & punchy', 'Big green and orange hero words, website screenshots, pill buttons and quick cuts.'],
  [/handy|wispr/i, 'Product cards', 'Real product cards (pricing, GitHub) pop in on the spoken word, gold hero words, focus-blur transitions.'],
  [/voicestudio/i, 'Dark cinematic', 'Warm, moody grade with purple gradient hero words, glowing terminal and option chips.'],
  [/muse/i, 'Step-by-step explainer', 'Title-card opener, step progress chips and side-by-side comparison tiles.'],
];

await ensureAdmin();

// ---------- styles ----------
if (listStyles().length) {
  console.log(`Styles already set up (${listStyles().length}). Manage them at /admin/styles.`);
} else if (!fs.existsSync(approvedDir)) {
  console.log(`No ${approvedDir}. Add styles at /admin/styles instead.`);
} else {
  const reels = [];
  for (const folder of fs.readdirSync(approvedDir, { withFileTypes: true })) {
    if (!folder.isDirectory()) continue;
    for (const f of fs.readdirSync(path.join(approvedDir, folder.name))) {
      if (/\.(mp4|mov|m4v)$/i.test(f)) reels.push({ folder: folder.name, file: f, full: path.join(approvedDir, folder.name, f) });
    }
  }
  reels.sort((a, b) => {
    const rank = (r) => { const i = KNOWN.findIndex(([re]) => re.test(r.file)); return i < 0 ? 99 : i; };
    return rank(a) - rank(b);
  });
  for (const r of reels.slice(0, 5)) {
    const known = KNOWN.find(([re]) => re.test(r.file));
    process.stdout.write(`Making style from ${r.file}… `);
    const s = await createStyle({ file: r.full, name: known?.[1] || r.folder, description: known?.[2] || '', sourceName: r.file });
    console.log(`"${s.name}"`);
  }
}

// ---------- demo client ----------
const DEMO_EMAIL = 'test.client@example.com';
let client = db.prepare('SELECT * FROM users WHERE email = ?').get(DEMO_EMAIL);
const clientPassword = generatePassword();
if (client) {
  db.prepare('UPDATE users SET password_hash = ?, disabled = 0 WHERE id = ?').run(await hashPassword(clientPassword), client.id);
} else {
  db.prepare("INSERT INTO users (role, name, email, company, password_hash, created_at) VALUES ('client', 'Test Client', ?, 'Demo Co.', ?, ?)")
    .run(DEMO_EMAIL, await hashPassword(clientPassword), now());
  client = db.prepare('SELECT * FROM users WHERE email = ?').get(DEMO_EMAIL);
}
db.prepare('DELETE FROM sessions WHERE user_id = ?').run(client.id);

const site = config.siteUrl;
const lines = [
  '# Demo logins (private, git-ignored)',
  '',
  `Generated ${new Date().toLocaleString('en-GB')}. Run \`npm run demo\` again for a fresh client password.`,
  '',
  '## Admin (you)',
  `- Link: ${site}/admin`,
  `- Email: ${config.admin.email}`,
  `- Password: ${config.admin.password}  (set in portal/.env)`,
  '',
  '## Demo client',
  `- Link: ${site}/login`,
  `- Email: ${DEMO_EMAIL}`,
  `- Password: ${clientPassword}`,
  '',
  '## Tip',
  'Sign in as the client in a private/incognito window and as admin in a normal one, so you can watch both sides at once.',
  '',
];
fs.writeFileSync(path.join(config.dataDir, 'DEMO-LOGINS.md'), lines.join('\n'));
console.log(`\nLogins written to ${path.join(config.dataDir, 'DEMO-LOGINS.md')}`);
