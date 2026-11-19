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

Open http://localhost:4400. Sign in with `ADMIN_EMAIL` and `ADMIN_PASSWORD` from `.env`, and you land on the **Queue**. Needs Node 22.13 or newer (it uses Node's built-in SQLite). The normal Drive workflow does not need FFmpeg; only the legacy demo/local-preview helper uses it.

`npm run dev` restarts the server whenever a file changes.

### Check everything still works

```bash
npm test
```

This runs Drive-verification and database-migration tests, followed by end-to-end checks against a throwaway portal on port 4499. It covers access failures, queued jobs, admin start/hold/resume/cancel/reopen controls, manual editing stages, footage replacement, chat, ETA, versions, stale approvals, delivery, emails, Drive styles, the installable app, production checks and access rules. Test processes explicitly preload fake Google responses; production has no verification bypass. Real data is never touched. Run it after any change.

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

New footage, edits, finals and style samples stay on Drive; the host stores accounts, messages, links, history and briefs. Existing local samples and older uploaded jobs are preserved.

- **Clients** share their footage as a Google Drive link (one folder with the camera files, voiceover and screenshots works best). The New video form needs a **title**, a **reference reel or one of your styles**, the **Drive link**, a tick confirming it's shared as **Anyone with the link**, and an **email**. Notes are optional.
- When they tap **Send**, the portal requests a tiny download range without a Google login and requires actual file bytes. A successful Drive webpage alone does not count. Private, missing, download-disabled and uncertain links are refused without creating a job, and the form keeps its values. Large-file confirmation screens must lead to real bytes before verification succeeds. Checks have a 25-second deadline and never save footage. There is no `DRIVE_LINK_CHECK=off` bypass.
- Folder links are inspected through Google's anonymous folder listing. Visible files and subfolders must pass download verification (up to 50 entries, 10 folders and 5 levels). Empty, unreadable or oversized folders are refused. A Google-native document is not a footage file; put camera files, audio and image assets in the folder. If Google's listing changes or cannot be checked, use a direct video file link. Checks establish access at that moment; sharing can be changed later, so admin has a **Recheck Drive access** control.
- Resource keys on shared links are preserved. Only HTTPS Drive file/folder links are accepted, and every download redirect is restricted to expected Google hosts.
- **You** send each edit and the final as a Drive link too. A *file* link plays inside the client's portal using Google Drive's player. A *folder* link shows an "Open in Google Drive" button. Links are tidied automatically (`open?id=`, `?usp=sharing` and so on).
- Reviews and Drive style samples have an explicit **Play video** button, loading feedback, **Reload player**, and a direct Drive link. Video playback stays on Google; the portal never proxies it. Playback still depends on Google's processing, sharing and browser support.
- Videos from before this change keep their stored files and still play.

## Styles (for clients without a reference)

- **Admin → Styles** lets you add a verified Google Drive video link, rename it, describe it, reorder it, hide it or remove it. New style videos stay on Drive. Existing local previews continue working; paste a Drive link into their edit form to switch playback. Original files are preserved, and the website no longer exposes a video-upload endpoint.
- On **New video**, step 2 ("The look") has a toggle: **I have a reference reel** (paste a link) or **No reference? Pick our style**, which shows tappable preview cards. The chosen style appears in the chat ("Style picked: …"), the admin workspace and `brief.md`.

## While a video is being edited

- **Client:** after verified submission, the client sees **Queued**. Only your **Start editing** action begins editing and the estimated countdown. Editing stages are set by you; they never advance because time passed. Requested revisions wait for your Start revision action too. Hold/cancel states show your reason and no countdown. The client can close the window and return to the same saved job, with unread-message badges. The countdown is an estimate, not a render-progress monitor.
- **You:** **Queue** (`/admin/queue`) lists every video. Due jobs come first, with a timer that turns amber in the last 10 minutes and red when overdue, and a "new" badge for unread messages. The list refreshes every 15 seconds. Open a video to see its files (download, copy the path, Show in Finder), the client's links and notes, the chat, and the ETA buttons (−15 / +15 / +30 / +1 hr / 1 hr from now). The client's countdown updates within a few seconds.
- The chat checks for new messages every 4 seconds while the page is open (every 20 seconds in a background tab).
- **Job controls:** start a queued job; set the current editing stage; hold with a client-visible reason; resume; cancel with a reason; reopen a cancelled or delivered job. Reopening keeps history and versions, clears the previous approval, and requires a new version and fresh client approval before delivery. No control bypasses client approval or deletes their material. Stale actions from another tab are refused.
- **Footage controls:** recheck access, replace a link only after verifying it, or ask the client in chat to use **What you sent → Replace footage link**. Replacement links are recorded in history and appended to the original generated brief.
- **History:** submissions, controls, access checks, link replacements, deadlines, versions, approvals and deliveries are recorded with their actor and time. Previous final links are retained when reopening.

## Review and delivery

1. **Send the edit.** In the video workspace, paste the Drive link to the edit and an optional note. It becomes **v1** (then v2, v3…). The client gets an email, and their open screen switches to review on its own. Under the version you'll find **Send via Gmail** (opens Gmail with the email already written), **WhatsApp** and **Copy message**, which work even before the portal's own email is set up.
2. **The client reviews** in the embedded player and taps **Looks great, finalise it** or **Request changes** (with times like "at 0:12"). Older-version pages display that version's note and a link to the latest; approval/change forms are hidden there. The server also rejects stale or omitted version numbers.
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
2. Open the job, tap **Start editing**, and **Open the footage in Google Drive**. Download it into your local `Raw/` and edit with the studio skills as usual. Set the current editing stage, use chat, and adjust the ETA when needed. The portal does not automatically invoke the editing skills.
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

## Running on AWS Lightsail

The live portal runs on a Lightsail server (`reel-portal`, Ubuntu 24.04, Sydney, $5/month plan) with a static IP. The scripts are in `deploy/lightsail/`:

| Script | Where it runs | What it does |
| --- | --- | --- |
| `setup.sh <admin-email> <ip>` | the server, once | Swap, security updates, Node 24 (checksum-verified), Caddy for HTTPS, a locked-down `portal` service, and `/etc/portal/portal.env` with a generated admin password |
| `deploy.sh <ip> <key.pem>` | your Mac | Uploads the code (never `.env`, `data/` or tests), backs up the database, restarts, checks `/healthz`, and rolls back if the new version doesn't come up |
| `set-domain.sh <domain>` | the server | After your DNS A record points at the static IP: switches Caddy to the domain with a free, auto-renewing certificate and updates `SITE_URL` |

On the server, data lives in `/var/lib/portal` (database, daily backups, briefs) and settings in `/etc/portal/portal.env`. After editing settings (for example Gmail), run `sudo systemctl restart portal`.

## Going live (later)

**Recommended for this implementation: Railway with one application instance and a persistent volume.** Railway Pro supports the existing Gmail/SMTP sender. Hobby needs an email provider's HTTPS API instead; that sender is not implemented here. See [Railway email restrictions](https://docs.railway.com/networking/outbound-networking) and [pricing](https://docs.railway.com/pricing/plans). Vercel requires moving SQLite and remaining filesystem writes to external services; a Drive-only media flow does not remove the need for a database.

The included `Dockerfile` uses Node 24, and `railway.toml` configures the build, health check and restart behaviour. Docker was not available on the development Mac during preparation, so the image still needs a real build/deploy check.

1. Deploy the standalone portal repository (whose root contains this README and `Dockerfile`). If using the full studio repository, set the service root directory to `portal` and the config-file path to `/portal/railway.toml`.
2. Mount a persistent volume at `/data`. The image sets `PORTAL_DATA_DIR=/data/portal` and `STUDIO_ROOT=/data/studio` so both the database and generated briefs survive deploys. Do not put either on ephemeral storage.
3. Set `ADMIN_EMAIL`, a strong `ADMIN_PASSWORD`, `ADMIN_NAME`, `SITE_URL=https://<your-subdomain>`, `TRUST_PROXY=1`, `TZ=Asia/Kolkata` and your Gmail/SMTP settings in Railway variables. Keep app sleeping off. Use a single instance: SQLite and the attached volume are not a multiple-replica design.
4. Add your subdomain and Railway's requested DNS records; HTTPS is issued by Railway. Verify login, real Drive playback, email delivery and persistence across a restart/redeploy.
5. Enable scheduled volume backups and keep an independent copy of the SQLite backups. Test a restore before real client use. A mounted volume is storage, not an independent backup. Expect a brief interruption when a volume-backed service redeploys.

Existing demo data is local and will not appear automatically in a fresh deployment. For a migration, copy a consistent database backup and any legacy style previews, and update legacy absolute file paths as needed. New Drive styles have no local video paths. Cloud-generated briefs are not automatically synchronised to this Mac; use the portal links/brief information when editing locally.

Right now the portal listens only on this Mac (`HOST=127.0.0.1`). To let clients reach it:

- **Keep it on this Mac:** install `cloudflared` and run a Cloudflare Tunnel to `http://localhost:4400` with your domain. Set `SITE_URL=https://your-domain` in `.env`. The Mac must stay on and awake.
- **Or move to a server:** copy the `portal/` folder, set `STUDIO_ROOT` to where the footage should live, and sync that folder to your Mac for editing.
- Before going live: change `ADMIN_PASSWORD` to something long, set up Gmail, and back up `data/portal.db`.

## Build status

All six phases are done, plus a production pass: accounts, Drive-based submissions, the editing screen and chat, review and delivery, emails, the installable phone app, and the end-to-end test.
