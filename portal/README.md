# Client portal

A private website for the studio. Clients sign in, send footage and get their edited reel back. You run everything from `/admin`. The full plan is in [Client Portal Plan.pdf](Client%20Portal%20Plan.pdf).

It's built for [AI Reel Studio](https://github.com/tanmayybuilds/ai-reel-studio), where it lives in the `portal/` folder and saves footage to the studio's `Raw/` and `Exports/` folders. If you clone it on its own, set `STUDIO_ROOT` in `.env` to your studio folder. Otherwise it uses the folder above this one.

## Run it

```bash
cd portal
npm install            # first time only
cp .env.example .env   # first time only, then edit .env
npm start
```

Open http://localhost:4400. Sign in with `ADMIN_EMAIL` and `ADMIN_PASSWORD` from `.env`, and you land on the **Queue**. Needs Node 22.13 or newer (it uses Node's built-in SQLite) and `ffmpeg` for poster frames and style previews. Without ffmpeg everything still works, just without posters.

`npm run dev` restarts the server whenever a file changes.

### Check everything still works

```bash
npm test
```

This runs 30 end-to-end checks against a throwaway copy of the portal on port 4499. It covers accounts and password changes, the Drive-only New video form (every required field, links tidied), the installable app, chat, ETA, versions and changes, refusing an approval for a version the client never saw, double-click-safe delivery with a byte-for-byte download check, emails, health checks, the production safety checks and access rules. It never touches your real data. Run it after any change.

### Demo

```bash
npm run demo
```

This builds the style library from up to five reels in `../Approved Videos/` (or pass another folder: `npm run demo -- "/path/to/Approved Videos"`). It also gives the demo client (`test.client@example.com`) a fresh password and writes every link and login to `data/DEMO-LOGINS.md`, which is private and git-ignored.

| Who | Link |
| --- | --- |
| Client portal | http://localhost:4400/login |
| Admin portal | http://localhost:4400/admin |

## Accounts

- **Admin (only you).** This account comes from `.env`. To change your email or password, edit `.env` and restart. Changing the password signs out every admin session.
- **Clients.** Create them under **Clients**. You can type a password or let the portal generate one. The password is shown **once**, and *Copy message for client* gives you a ready-to-send login message. **New password** replaces a client's password and signs them out. **Turn off** blocks a client's login straight away and keeps their videos.
- **Edit** next to a client changes their name, email (their sign-in) or company, and lists their videos.
- Clients change their own password under **Account** (their name in the top bar). Other devices are signed out when they do.
- There is no sign-up page. Clients who open any `/admin` URL get a 404.

## Everything goes through Google Drive

The portal stores no footage, so hosting stays small and cheap.

- **Clients** share their footage as a Google Drive link (one folder with the camera files, voiceover and screenshots works best). The New video form needs a **title**, a **reference reel or one of your styles**, the **Drive link**, a tick confirming it's shared as **Anyone with the link**, and an **email**. Notes are optional.
- When they tap **Send**, the portal asks Google, as an anonymous visitor, whether the link opens. A link that isn't shared yet or doesn't exist is refused, with the fix spelled out. If Google doesn't give a clear answer, the link is accepted. Set `DRIVE_LINK_CHECK=off` to skip the check.
- **You** send each edit and the final as a Drive link too. A *file* link plays inside the client's portal (Google Drive's own player). A *folder* link shows an "Open in Google Drive" button. Links are tidied automatically (`open?id=`, `?usp=sharing` and so on).
- Videos from before this change keep their stored files and still play.

## Styles (for clients without a reference)

- **Admin → Styles** shows 2–5 sample reels you've edited. You can add one from `Approved Videos/` or upload one, then rename it, describe what makes it different, reorder it, hide it or remove it. Each style gets a light 720p preview and a poster in `data/styles/<id>/`. Your original reel is never touched.
- On **New video**, step 2 ("The look") has a toggle: **I have a reference reel** (paste a link) or **No reference? Pick our style**, which shows tappable preview cards. The chosen style appears in the chat ("Style picked: …"), the admin workspace and `brief.md`.

## While a video is being edited

- **Client:** after Continue, the client sees the "being edited" screen. It shows a live countdown to the ready time, the editing stages, an animated preview and a chat with you. They can close the window. The page reopens in the same state from the dashboard, which shows "N new messages" when you've replied. Once the time passes, the client sees "Almost there", never a negative number.
- **You:** **Queue** (`/admin/queue`) lists every video. Due jobs come first, with a timer that turns amber in the last 10 minutes and red when overdue, and a "new" badge for unread messages. The list refreshes every 15 seconds. Open a video to see its files (download, copy the path, Show in Finder), the client's links and notes, the chat, and the ETA buttons (−15 / +15 / +30 / +1 hr / 1 hr from now). The client's countdown updates within a few seconds.
- The chat checks for new messages every 4 seconds while the page is open (every 20 seconds in a background tab).

## Review and delivery

1. **Send the edit.** In the video workspace, paste the Drive link to the edit and an optional note. It becomes **v1** (then v2, v3…). The client gets an email, and their open screen switches to review on its own. Under the version you'll find **Send via Gmail** (opens Gmail with the email already written), **WhatsApp** and **Copy message**, which work even before the portal's own email is set up.
2. **The client reviews** in the embedded player and taps **Looks great, finalise it** or **Request changes** (with times like "at 0:12"). Approving only works for the version they're looking at.
3. **Deliver.** One tap delivers the approved version's link, or paste a different Drive link (for example a full-quality export).
4. **The client downloads.** They get **Download video** (Google Drive's download) and **Open in Google Drive**, plus the same share buttons for you.

## Emails

| When | Who gets it | Email |
| --- | --- | --- |
| A client clicks Continue on a new video | You | "New video from Priya: …" with the links, style and notes |
| You send an edit (v1, v2…) | Client | "Your video … is ready" with your note and a **Watch and review** button |
| The client asks for changes | You | The change request, word for word |
| The client approves | You | "Priya approved … Send the final" |
| You deliver | Client | "Your final video … is ready to download", with Download and Google Drive buttons |

Buttons link straight to that video. A signed-out client signs in once and lands on it.

**Turn on Gmail:** create an app password (Google Account → Security → 2-Step Verification → App passwords), then add `GMAIL_USER`, `GMAIL_APP_PASSWORD` and `ALERT_EMAIL` to `.env` and restart. **Admin → Emails** shows whether email is on, has a **Send test email** button, and lists every email with **Preview** and **Resend**. Until Gmail is set, emails are saved to `data/outbox/` instead of being sent, so nothing breaks. Any other SMTP server works too (`SMTP_HOST` and the rest; see `.env.example`).

Gmail's limit is about 500 emails a day. Until the portal has a public address, links in emails point to `localhost` and only work on this Mac.

## Where things live

| Path | What |
| --- | --- |
| `.env` | Your settings and secrets (git-ignored) |
| `data/portal.db` | The database: accounts, sessions, videos, links, chat (git-ignored, backed up daily to `data/backups/`) |
| `data/styles/<id>/` | Preview and poster of each style reel |
| `../Raw/<Client>/<YYYY-MM-DD Title>/brief.md` | Each video's brief: the Drive link, reference or style, and notes (handy for the editing skills) |

Client footage, edits and finals live in Google Drive, not on the server.

## A day with the portal

1. A client opens the app, taps **New**, gives a title, a reference reel or one of your styles, and the Drive link (shared and ticked), and taps **Send to the editor**. You get an email, and the job appears in **Queue** with a badge.
2. Open the job and tap **Open the footage in Google Drive**. Download it into `Raw/` and edit with the studio skills as usual. Use the chat or the ETA buttons if it's taking longer.
3. Upload the render to Google Drive, share it, and paste the link under **Send the edit**. The client gets an email, and you can also send it with **Send via Gmail** or **WhatsApp**.
4. Changes come back as a "Change request" with times. Send the next version the same way.
5. When they approve, tap **Deliver v2 as the final** (or paste a full-quality link). They get an email with Download and Google Drive buttons.

## Phone app (installable)

More than 80% of clients use a phone, so the portal is built phone-first and installs like an app:

- **Android / Chrome:** an **Install the app** card appears on the dashboard. One tap adds the app to the home screen, and it opens full screen with its own icon.
- **iPhone / iPad:** the same card shows the two taps (**Share → Add to Home Screen**).
- There's a bottom tab bar on phones (clients: Videos, New, Account; you: Queue, Clients, Styles, Emails), a Send button that stays in thumb reach, 16 px inputs so iPhone doesn't zoom in, and safe-area spacing for notched phones.
- A service worker caches only the app's look (CSS, JS, icons) and shows an offline page with no connection. Pages, messages and videos are never cached.
- Installing needs HTTPS, so it works once the portal is on your domain (and on `localhost` for testing).

## Housekeeping

Every hour (and at start-up) the portal:
- **Backs up the database** once a day to `data/backups/portal-YYYY-MM-DD.db`, keeping the last 14 (`BACKUP_KEEP`). Run `npm run backup` for one right now.
- **Removes client drafts** nobody has touched for 30 days (`DRAFT_RETENTION_DAYS`, `0` keeps them). These are submissions a client started but never sent (from the time clients could upload files).
- **Cleans up** expired sign-ins and your half-finished uploads older than two days.

`GET /healthz` returns `{"ok":true}` for uptime monitors and hosts.

## Security

- One admin account, set only in `.env`. No sign-up page. Clients get a 404 for every admin URL.
- Passwords are stored as salted scrypt hashes. Sessions are http-only `__Host-` cookies once `SITE_URL` is https (plus HSTS). Sign-in is rate-limited by IP and by email (set `TRUST_PROXY` behind a host so the real IP is used). Every form and API call is CSRF-protected, and there's a strict Content-Security-Policy with no framing.
- Status changes are atomic, so a double click or a second tab can't deliver twice. A client can only approve or change the version they actually watched.
- Every page sends `noindex` and `robots.txt` disallows everything, so the portal stays out of search engines.
- With `NODE_ENV=production` the portal refuses to start if `ADMIN_PASSWORD` is short or a placeholder, or `SITE_URL` isn't https.
- Each client sees only their own videos and files. Every download and stream checks who's asking, and raw footage is never served back to clients.
- `.env`, `data/` (database, uploads, outbox) and `node_modules/` are git-ignored.

## Going live (later)

Right now the portal listens only on this Mac (`HOST=127.0.0.1`). To let clients reach it:

- **Keep it on this Mac:** install `cloudflared` and run a Cloudflare Tunnel to `http://localhost:4400` with your domain. Set `SITE_URL=https://your-domain` in `.env` (this also makes cookies secure and fixes the links in emails). Uploads already go in 32 MB chunks, under Cloudflare's 100 MB request limit. The Mac must stay on and awake.
- **Or move to a server:** copy the `portal/` folder, set `STUDIO_ROOT` to where the footage should live, and sync that folder to your Mac for editing.
- Before going live: change `ADMIN_PASSWORD` to something long, set up Gmail, and back up `data/portal.db`.

## Build status

All six phases are done, plus a production pass: accounts, Drive-based submissions, the editing screen and chat, review and delivery, emails, the installable phone app, and the end-to-end test.
