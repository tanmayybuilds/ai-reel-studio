import { html } from '../html.js';
import { drivePreviewUrl } from '../drive.js';

// User-triggered embeds avoid an empty, lazily loaded frame looking like a broken video.
export const drivePlayer = (link, title) => html`<div class="drive-preview" data-drive-player>
  <button class="btn btn-primary drive-preview-start" type="button" data-drive-play>▶ Play video</button>
  <p class="drive-preview-status" data-drive-status role="status" hidden>Loading Google Drive player…</p>
  <iframe data-drive-src="${drivePreviewUrl(link)}" title="${title}" allow="autoplay; fullscreen" allowfullscreen referrerpolicy="no-referrer" hidden></iframe>
  <button class="btn btn-ghost btn-sm drive-preview-retry" type="button" data-drive-retry hidden>Reload player</button>
  <noscript><a href="${link}" target="_blank" rel="noopener noreferrer">Open video in Google Drive</a></noscript>
</div>`;
