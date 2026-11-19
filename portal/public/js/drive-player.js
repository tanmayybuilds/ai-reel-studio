(() => {
  document.querySelectorAll('[data-drive-player]').forEach((root) => {
    const frame = root.querySelector('iframe');
    const start = root.querySelector('[data-drive-play]');
    const retry = root.querySelector('[data-drive-retry]');
    const status = root.querySelector('[data-drive-status]');
    let timer;
    const load = () => {
      clearTimeout(timer);
      start.hidden = true;
      retry.hidden = false;
      status.hidden = false;
      status.textContent = 'Loading Google Drive player…';
      frame.hidden = false;
      frame.src = frame.dataset.driveSrc;
      timer = setTimeout(() => {
        status.textContent = 'Taking longer than usual. Reload the player or open the video in Google Drive.';
      }, 15000);
    };
    frame.addEventListener('load', () => {
      if (!frame.getAttribute('src')) return;
      clearTimeout(timer);
      status.hidden = true;
    });
    start.addEventListener('click', load);
    retry.addEventListener('click', load);
  });
})();
