// Email templates. Inline styles and tables only, so they look right in Gmail, Apple Mail and Outlook.
import { esc } from './html.js';
import { config } from './config.js';

const A = config.accent;
const link = (p) => `${config.siteUrl}${p}`;
const first = (name) => String(name || '').split(' ')[0] || 'there';

function button(href, label, primary = true) {
  const bg = primary ? A : '#ffffff';
  const border = primary ? A : '#d6d9e0';
  return `<a href="${esc(href)}" style="display:inline-block;background:${bg};border:1px solid ${border};color:#0b1412;font-weight:700;font-size:15px;line-height:1;text-decoration:none;padding:14px 22px;border-radius:10px;margin:4px 8px 4px 0">${esc(label)}</a>`;
}

function quote(text) {
  return `<div style="margin:18px 0;padding:12px 16px;border-left:3px solid ${A};background:#f5f7f9;border-radius:0 8px 8px 0;color:#2b3038;font-size:15px;line-height:1.55;white-space:pre-wrap">${esc(text)}</div>`;
}

function row(label, value) {
  return value ? `<tr><td style="padding:6px 12px 6px 0;color:#6b7280;font-size:14px;vertical-align:top;white-space:nowrap">${esc(label)}</td><td style="padding:6px 0;color:#111827;font-size:14px;word-break:break-word">${value}</td></tr>` : '';
}

/** Wrap content in the branded layout. `preheader` is the grey preview line in the inbox. */
function layout({ preheader, heading, body, footer }) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(heading)}</title></head>
<body style="margin:0;padding:0;background:#eef0f3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111827">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef0f3;padding:28px 12px"><tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
    <tr><td style="padding:0 4px 16px">
      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
        <td style="width:28px;height:28px;background:#0a0b0e;border-radius:7px;text-align:center;vertical-align:middle;color:${A};font-size:12px">&#9654;</td>
        <td style="padding-left:10px;font-weight:700;font-size:15px;color:#111827">${esc(config.portalName)}</td>
      </tr></table>
    </td></tr>
    <tr><td style="background:#ffffff;border-radius:16px;padding:32px 28px;border:1px solid #e3e6eb">
      <h1 style="margin:0 0 14px;font-size:23px;line-height:1.3;color:#0b0d12">${esc(heading)}</h1>
      ${body}
    </td></tr>
    <tr><td style="padding:16px 8px;color:#8a909c;font-size:12.5px;line-height:1.5">${footer || `You’re getting this because you have a video with ${esc(config.portalName)}.`}</td></tr>
  </table>
</td></tr></table>
</body></html>`;
}

const p = (t) => `<p style="margin:0 0 14px;font-size:15.5px;line-height:1.6;color:#2b3038">${t}</p>`;
const small = (t) => `<p style="margin:18px 0 0;font-size:13px;line-height:1.5;color:#6b7280">${t}</p>`;

// ---------- to the client ----------

export function versionReadyEmail({ video, client, version }) {
  const url = link(`/videos/${video.id}`);
  const subject = version.number === 1
    ? `Your video “${video.title}” is ready`
    : `Version ${version.number} of “${video.title}” is ready`;
  const html = layout({
    preheader: 'Watch it, ask for changes, or approve it for the final file.',
    heading: version.number === 1 ? 'Your video is ready to watch' : `Version ${version.number} is ready`,
    body:
      p(`Hi ${esc(first(client.name))},`) +
      p(`${version.number === 1 ? 'Your edit of' : 'The updated edit of'} <strong>${esc(video.title)}</strong> is ready. Watch it in your portal, then ask for changes or approve it to get the final file.`) +
      (version.note ? quote(version.note) : '') +
      `<div style="margin:22px 0 4px">${button(url, 'Watch and review')}</div>` +
      small(`Or open your dashboard and click the video. Button not working? Paste this into your browser:<br><a href="${esc(url)}" style="color:#6b7280">${esc(url)}</a>`),
  });
  const text = `Hi ${first(client.name)},\n\n${version.number === 1 ? 'Your edit of' : 'The updated edit of'} "${video.title}" is ready (v${version.number}).\n` +
    (version.note ? `\nNote from the studio:\n${version.note}\n` : '') +
    `\nWatch it, ask for changes, or approve it:\n${url}\n\n${config.portalName}\n`;
  return { subject, html, text };
}

export function deliveredEmail({ video, client, final }) {
  const url = link(`/videos/${video.id}`);
  const subject = `Your final video “${video.title}” is ready to download`;
  const html = layout({
    preheader: 'Download the full-quality file from your portal.',
    heading: 'Your final video is ready \u{1F389}',
    body:
      p(`Hi ${esc(first(client.name))},`) +
      p(`The final, full-quality version of <strong>${esc(video.title)}</strong> is ready. It stays in your portal whenever you need it.`) +
      `<div style="margin:22px 0 4px">${final ? button(url, 'Download your video') : ''}${video.final_drive_url ? button(video.final_drive_url, 'Open in Google Drive', !final) : ''}</div>` +
      small(`Want another reel? Sign in and click <strong>New video</strong>.<br><a href="${esc(url)}" style="color:#6b7280">${esc(url)}</a>`),
  });
  const text = `Hi ${first(client.name)},\n\nThe final version of "${video.title}" is ready.\n\n` +
    (final ? `Download it here:\n${url}\n\n` : '') +
    (video.final_drive_url ? `Google Drive:\n${video.final_drive_url}\n\n` : '') +
    `${config.portalName}\n`;
  return { subject, html, text };
}

// ---------- to the studio ----------

const adminFooter = () => `Studio alert from your ${esc(config.portalName)} portal.`;

export function adminNewVideoEmail({ video, client, files }) {
  const url = link(`/admin/videos/${video.id}`);
  const raw = files.filter((f) => f.kind === 'raw');
  const subject = `New video from ${client.name}: “${video.title}”`;
  const eta = video.eta_at ? new Date(video.eta_at).toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true }) : '';
  const html = layout({
    preheader: `${client.name} sent footage. The client sees ready at ${eta}.`,
    heading: 'New video to edit',
    footer: adminFooter(),
    body:
      p(`<strong>${esc(client.name)}</strong>${client.company ? ` (${esc(client.company)})` : ''} sent <strong>${esc(video.title)}</strong>.`) +
      `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 16px">
        ${row('Raw footage', raw.length ? `${raw.length} file${raw.length === 1 ? '' : 's'} in <code>${esc(video.folder)}/</code>` : '')}
        ${row('Google Drive', video.drive_url ? `<a href="${esc(video.drive_url)}">${esc(video.drive_url)}</a>` : '')}
        ${row('Reference', video.reference_url ? `<a href="${esc(video.reference_url)}">${esc(video.reference_url)}</a>` : '')}
        ${row('Style picked', video.style_name ? esc(video.style_name) : '')}
        ${row('Client sees ready at', esc(eta))}
      </table>` +
      (video.notes ? quote(video.notes) : '') +
      `<div style="margin:18px 0 0">${button(url, 'Open in admin')}</div>`,
  });
  const text = `New video from ${client.name}: "${video.title}"\n\n` +
    (raw.length ? `Raw footage: ${raw.length} file(s) in ${video.folder}/\n` : '') +
    (video.drive_url ? `Google Drive: ${video.drive_url}\n` : '') +
    (video.reference_url ? `Reference: ${video.reference_url}\n` : '') +
    (video.style_name ? `Style picked: ${video.style_name}\n` : '') +
    `Client sees ready at: ${eta}\n` + (video.notes ? `\nNotes:\n${video.notes}\n` : '') + `\n${url}\n`;
  return { subject, html, text };
}

export function adminChangesEmail({ video, client, versionNumber, request }) {
  const url = link(`/admin/videos/${video.id}`);
  const subject = `${first(client.name)} asked for changes on “${video.title}” (v${versionNumber})`;
  const html = layout({
    preheader: request.slice(0, 120),
    heading: 'Changes requested',
    footer: adminFooter(),
    body: p(`<strong>${esc(client.name)}</strong> watched v${versionNumber} of <strong>${esc(video.title)}</strong> and asked for:`) +
      quote(request) + `<div style="margin:18px 0 0">${button(url, 'Open in admin')}</div>`,
  });
  return { subject, html, text: `${client.name} asked for changes on "${video.title}" (v${versionNumber}):\n\n${request}\n\n${url}\n` };
}

export function adminApprovedEmail({ video, client, versionNumber }) {
  const url = link(`/admin/videos/${video.id}`);
  const subject = `✅ ${first(client.name)} approved “${video.title}”. Send the final`;
  const html = layout({
    preheader: `v${versionNumber} approved. Deliver the final file.`,
    heading: `v${versionNumber} approved`,
    footer: adminFooter(),
    body: p(`<strong>${esc(client.name)}</strong> approved version ${versionNumber} of <strong>${esc(video.title)}</strong>. Deliver the final file or a Drive link.`) +
      `<div style="margin:18px 0 0">${button(url, 'Deliver the final')}</div>`,
  });
  return { subject, html, text: `${client.name} approved v${versionNumber} of "${video.title}". Deliver the final:\n${url}\n` };
}

export function testEmail() {
  const subject = `Test email from your ${config.portalName} portal`;
  const html = layout({
    preheader: 'Email is working.',
    heading: 'Email is working ✅',
    footer: adminFooter(),
    body: p('If you can read this, clients will get their “Your video is ready” emails.') +
      `<div style="margin:18px 0 0">${button(link('/admin/queue'), 'Open the queue')}</div>`,
  });
  return { subject, html, text: `Email is working. Clients will get their "Your video is ready" emails.\n${link('/admin/queue')}\n` };
}
