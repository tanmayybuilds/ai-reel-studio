// Review page: "Add time" drops the player's current position into the changes box, e.g. "[0:12] ".
(() => {
  const video = document.querySelector('[data-review-player]');
  const stamp = document.querySelector('[data-stamp]');
  const box = document.querySelector('.review-changes textarea');
  if (!video || !stamp || !box) return;
  const fmt = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
  const label = stamp.querySelector('span');
  video.addEventListener('timeupdate', () => { label.textContent = `Add time ${fmt(video.currentTime)}`; });
  stamp.addEventListener('click', () => {
    const tag = `[${fmt(video.currentTime)}] `;
    const at = box.selectionStart ?? box.value.length;
    const before = box.value.slice(0, at);
    const lead = before && !before.endsWith('\n') ? '\n' : '';
    box.value = before + lead + tag + box.value.slice(at);
    const pos = (before + lead + tag).length;
    box.focus();
    box.setSelectionRange(pos, pos);
    video.pause();
  });
})();
