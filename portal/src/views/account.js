import { html } from '../html.js';
import { page } from './layout.js';

export function accountPage(req, { error = '' }) {
  return page({
    title: 'Your account',
    req,
    tab: 'account',
    body: html`
    <div class="nv-head">
      <a class="back" href="/dashboard">← Your videos</a>
      <h1>Your account</h1>
      <p class="muted">${req.user.name} · ${req.user.email}</p>
    </div>
    <section class="card account-card">
      <h2 class="card-title">Change your password</h2>
      <p class="muted small">Replace the password your editor sent you with one only you know.</p>
      ${error ? html`<div class="flash flash-error" role="alert">${error}</div>` : ''}
      <form method="post" action="/account/password" class="stack">
        <input type="hidden" name="_csrf" value="${req.csrf}">
        <label class="field"><span>Current password</span>
          <div class="pw"><input type="password" name="current" autocomplete="current-password" required>
          <button type="button" class="pw-toggle" data-toggle-password aria-label="Show password">Show</button></div></label>
        <label class="field"><span>New password <em>at least 10 characters</em></span>
          <div class="pw"><input type="password" name="password" autocomplete="new-password" minlength="10" required>
          <button type="button" class="pw-toggle" data-toggle-password aria-label="Show password">Show</button></div></label>
        <label class="field"><span>New password again</span>
          <input type="password" name="confirm" autocomplete="new-password" minlength="10" required></label>
        <button class="btn btn-primary" type="submit">Change password</button>
      </form>
    </section>
    <section class="card account-card account-signout">
      <div><strong>Signed in as ${req.user.email}</strong><p class="muted small">Sign out on shared devices.</p></div>
      <form method="post" action="/logout"><input type="hidden" name="_csrf" value="${req.csrf}"><button class="btn btn-ghost" type="submit">Sign out</button></form>
    </section>`,
  });
}
