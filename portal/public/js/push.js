// Notifications page: turn phone notifications on/off for this device and send a test.
(() => {
  const card = document.querySelector('[data-push-card]');
  if (!card) return;
  const csrf = document.querySelector('meta[name="csrf-token"]').content;
  const status = card.querySelector('[data-push-status]');
  const on = card.querySelector('[data-push-on]');
  const test = card.querySelector('[data-push-test]');
  const off = card.querySelector('[data-push-off]');
  const iosHint = card.querySelector('[data-push-ios]');
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

  const post = (url, body) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: JSON.stringify(body || {}) })
    .then((r) => r.json().then((d) => { if (!r.ok) throw new Error(d.error || 'Something went wrong'); return d; }));
  const keyBytes = (b64) => {
    const raw = atob((b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(raw, (c) => c.charCodeAt(0));
  };

  function show(subscribed, text) {
    on.hidden = subscribed;
    test.hidden = !subscribed;
    off.hidden = !subscribed;
    if (text) status.textContent = text;
  }

  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    on.hidden = true;
    if (isIOS && !standalone) { iosHint.hidden = false; status.textContent = 'Phone notifications need the installed app on iPhone.'; }
    else status.textContent = 'This browser can’t show notifications. Try Chrome on Android or the installed app.';
    return;
  }
  if (isIOS && !standalone) iosHint.hidden = false;

  navigator.serviceWorker.ready.then(async (reg) => {
    const sub = await reg.pushManager.getSubscription();
    if (sub && Notification.permission === 'granted') show(true, 'On for this device. You’ll get a notification for every new project, message, change request and approval.');
    if (Notification.permission === 'denied') {
      on.disabled = true;
      status.textContent = 'Notifications are blocked for this site. Allow them in your browser’s site settings, then reload.';
    }

    on.addEventListener('click', async () => {
      on.disabled = true;
      try {
        const perm = await Notification.requestPermission();
        if (perm !== 'granted') throw new Error('Notifications weren’t allowed. You can allow them in your browser’s site settings.');
        const s = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(card.dataset.key) });
        await post('/admin/api/push/subscribe', { subscription: s.toJSON() });
        show(true, 'On for this device. Sending a test now…');
        await post('/admin/api/push/test');
      } catch (err) {
        status.textContent = err.message;
      } finally {
        on.disabled = false;
      }
    });
    test.addEventListener('click', () => post('/admin/api/push/test').then(() => window.portalToast?.('Test sent')).catch((e) => window.portalToast?.(e.message)));
    off.addEventListener('click', async () => {
      const s = await reg.pushManager.getSubscription();
      if (s) { await post('/admin/api/push/unsubscribe', { endpoint: s.endpoint }).catch(() => {}); await s.unsubscribe().catch(() => {}); }
      show(false, 'Off for this device.');
    });
  });
})();
