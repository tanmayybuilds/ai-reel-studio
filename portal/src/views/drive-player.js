import { html } from '../html.js';
import { drivePreviewUrl } from '../drive.js';

/**
 * Plays a shared Google Drive video.
 * 1. The phone's own video player, streamed through the portal (`stream`, see src/drive-stream.js).
 * 2. If that can't play it (e.g. a very large file behind Google's virus-scan page), Drive's own embedded player.
 * 3. Always: "Open in Google Drive".
 */
export const drivePlayer = (link, title, stream) => html`<div class="drive-preview" data-drive-player>
  <video src="${stream}" title="${title}" controls playsinline preload="metadata" data-drive-video></video>
  <p class="drive-preview-status" data-drive-status role="status" hidden></p>
  <iframe data-drive-src="${drivePreviewUrl(link)}" title="${title}" allow="autoplay; fullscreen" allowfullscreen
    referrerpolicy="strict-origin-when-cross-origin" hidden></iframe>
  <button class="btn btn-ghost btn-sm drive-preview-retry" type="button" data-drive-retry hidden>Reload player</button>
  <noscript><a href="${link}" target="_blank" rel="noopener noreferrer">Open video in Google Drive</a></noscript>
</div>`;
