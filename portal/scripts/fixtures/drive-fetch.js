// Explicit test-process preload. Production never imports this module.
const nativeFetch = globalThis.fetch;
globalThis.fetch = async (url, options) => {
  const u = new URL(url);
  if (!['drive.google.com', 'drive.usercontent.google.com'].includes(u.hostname)) return nativeFetch(url, options);
  const id = u.searchParams.get('id') || u.pathname.split('/')[3] || '';
  if (id.startsWith('1PRIVATE')) return new Response('', { status: 302, headers: { location: 'https://accounts.google.com/ServiceLogin' } });
  if (id.startsWith('1UNKNOWN')) return new Response('Try later', { status: 503 });
  if (id.startsWith('1BLOCKED')) return new Response('Forbidden', { status: 403 });
  if (u.pathname === '/embeddedfolderview') return new Response('<title>Footage</title><a href="https://drive.google.com/file/d/1CAMERAFILE00000000000000/view">Camera.mp4</a>', { headers: { 'content-type': 'text/html' } });
  return new Response(new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112]), { status: 206, headers: { 'content-type': 'video/mp4', 'content-disposition': 'attachment; filename="sample.mp4"' } });
};
