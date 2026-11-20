// Drive videos play in the phone's own player first; if that fails, we switch to Drive's embedded player.
(() => {
  document.querySelectorAll('[data-drive-player]').forEach((root) => {
    const video = root.querySelector('[data-drive-video]');
    const frame = root.querySelector('iframe');
    const retry = root.querySelector('[data-drive-retry]');
    const status = root.querySelector('[data-drive-status]');
    let switched = false;
    let timer;

    const say = (text) => { status.textContent = text; status.hidden = !text; };

    function useEmbed() {
      if (switched) return;
      switched = true;
      clearTimeout(timer);
      video.removeAttribute('src');
      video.load();
      video.hidden = true;
      loadFrame();
    }
    function loadFrame() {
      say('Loading the Google Drive player…');
      frame.hidden = false;
      retry.hidden = false;
      frame.src = frame.dataset.driveSrc;
      clearTimeout(timer);
      timer = setTimeout(() => say('Taking longer than usual. Tap “Reload player” or open it in Google Drive.'), 20000);
    }
    frame.addEventListener('load', () => { if (frame.getAttribute('src')) { clearTimeout(timer); say(''); } });
    retry.addEventListener('click', loadFrame);

    // Native playback: metadata arriving means the phone can play it.
    video.addEventListener('loadedmetadata', () => { clearTimeout(timer); say(''); });
    video.addEventListener('error', useEmbed);
    // Some networks stall instead of failing; give the stream a fair chance, then fall back.
    timer = setTimeout(() => { if (video.readyState < 1) useEmbed(); }, 12000);
  });
})();
