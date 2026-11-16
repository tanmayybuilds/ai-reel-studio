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

This runs 21 end-to-end checks against a throwaway copy of the portal on port 4499: accounts, verified uploads, chat, ETA, versions, changes, approval, delivery with a byte-for-byte download check, emails and access rules. It never touches your real data. Run it after any change.

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
- There is no sign-up page. Clients who open any `/admin` URL get a 404.

## Uploads

- Files are sent in 32 MB chunks. Each chunk's SHA-256 is computed in the browser and checked by the server, so a stored file is byte-for-byte the client's original. Nothing is re-encoded.
- If the connection drops, the upload retries by itself. If the page is closed, the client picks the same file again and the upload continues from where it stopped.
- Raw footage: MP4, MOV, M4V, MKV, WEBM, MTS, AVI. Voiceover: WAV, MP3, M4A, AAC, AIFF, FLAC. Assets: images and screen recordings. The limit is 50 GB per file, and the portal suggests a Drive link for files over 5 GB or uploads that will take more than 30 minutes.
- On **Continue**, the files move to `Raw/<Client>/<YYYY-MM-DD Title>/`. Existing files are never overwritten (a clash gets ` (2)`).

## Styles (for clients without a reference)

- **Admin → Styles** shows 2–5 sample reels you've edited. You can add one from `Approved Videos/` or upload one, then rename it, describe what makes it different, reorder it, hide it or remove it. Each style gets a light 720p preview and a poster in `data/styles/<id>/`. Your original reel is never touched.
- On **New video**, step 2 ("The look") has a toggle: **I have a reference reel** (paste a link) or **No reference? Pick our style**, which shows tappable preview cards. The chosen style appears in the chat ("Style picked: …"), the admin workspace and `brief.md`.

## While a video is being edited

- **Client:** after Continue, the client sees the "being edited" screen. It shows a live countdown to the ready time, the editing stages, an animated preview and a chat with you. They can close the window. The page reopens in the same state from the dashboard, which shows "N new messages" when you've replied. Once the time passes, the client sees "Almost there", never a negative number.
- **You:** **Queue** (`/admin/queue`) lists every video. Due jobs come first, with a timer that turns amber in the last 10 minutes and red when overdue, and a "new" badge for unread messages. The list refreshes every 15 seconds. Open a video to see its files (download, copy the path, Show in Finder), the client's links and notes, the chat, and the ETA buttons (−15 / +15 / +30 / +1 hr / 1 hr from now). The client's countdown updates within a few seconds.
- The chat checks for new messages every 4 seconds while the page is open (every 20 seconds in a background tab).

## Review and delivery

1. **Send the edit.** In the video workspace, upload a cut from your computer, or pick a render the editing skills already put in `Exports/` (that file stays where it is). Add an optional note. It becomes **v1** (then v2, v3…), and the client's screen switches to review on its own.
2. **The client reviews.** They get a vertical player, your note and two choices:
   - **Request changes.** A text box with **Add time**, which drops the player's position (e.g. `[0:12]`) into the note. The request shows in your workspace and in the chat (tagged "Change request"), and the client gets a new countdown.
   - **Looks great, export it.** The status becomes *Preparing final* with a 15-minute countdown (`EXPORT_ETA_MINUTES` in `.env`).
3. **Deliver.** Pick the final: the approved version as it is, a new render from `Exports/`, an uploaded file, or a Google Drive link only. You can add a Drive link to any of them.
4. **The client downloads.** They see *Your final video is ready* with **Download** (the original file, never re-encoded) and **Open in Google Drive**. It stays on their dashboard.

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
| `data/portal.db` | The database: accounts, sessions, videos, chat (git-ignored, so back it up) |
| `data/uploads/<id>/` | Uploads in progress, before the client clicks Continue |
| `../Raw/<Client>/<YYYY-MM-DD Title>/` | Submitted footage, voiceover, `Assets/` and a `brief.md` with the links and notes |
| `../Exports/<Client>/<YYYY-MM-DD Title>/` | Edited versions (`<Title>-v1.mp4`, `-v2`…) and uploaded finals (`<Title>-final.mp4`) |
| `data/posters/` | Poster frames for edits |

## A day with the portal

1. A client signs in, clicks **New video**, sends footage (upload or Drive), a reference or a style, and clicks **Continue**. You get an email and the job appears in **Queue**, with a badge on the nav.
2. Open the job and click **Show in Finder** (or check `brief.md` in its `Raw/` folder). Edit it with the studio skills as usual. Use the chat or the ETA buttons if it's taking longer.
3. When the render is in `Exports/`, pick it under **Send the edit**. The client gets an email and a review screen.
4. Changes come back as a "Change request" with timestamps. Send the next version the same way.
5. When they approve, **Deliver** the approved version (and a Drive link if you like). They get an email and a Download button.

## Security

- One admin account, set only in `.env`. No sign-up page. Clients get a 404 for every admin URL.
- Passwords are stored as salted scrypt hashes. Sessions are http-only cookies (secure once `SITE_URL` is https). Sign-in is rate-limited, every form and API call is CSRF-protected, and there's a strict Content-Security-Policy with no framing.
- Each client sees only their own videos and files. Every download and stream checks who's asking, and raw footage is never served back to clients.
- `.env`, `data/` (database, uploads, outbox) and `node_modules/` are git-ignored.

## Going live (later)

Right now the portal listens only on this Mac (`HOST=127.0.0.1`). To let clients reach it:

- **Keep it on this Mac:** install `cloudflared` and run a Cloudflare Tunnel to `http://localhost:4400` with your domain. Set `SITE_URL=https://your-domain` in `.env` (this also makes cookies secure and fixes the links in emails). Uploads already go in 32 MB chunks, under Cloudflare's 100 MB request limit. The Mac must stay on and awake.
- **Or move to a server:** copy the `portal/` folder, set `STUDIO_ROOT` to where the footage should live, and sync that folder to your Mac for editing.
- Before going live: change `ADMIN_PASSWORD` to something long, set up Gmail, and back up `data/portal.db`.

## Build status

All six phases are done: accounts, uploads, editing screen and chat, review and delivery, emails, and polish with the end-to-end test.
