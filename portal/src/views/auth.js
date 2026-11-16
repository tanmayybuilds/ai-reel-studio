import { html } from '../html.js';
import { config } from '../config.js';
import { page, logoMark } from './layout.js';

export function loginPage(req, { error = '', email = '', next = '' } = {}) {
  return page({
    title: 'Sign in',
    req,
    shell: 'auth',
    body: html`
    <div class="auth-wrap">
      <div class="auth-art" aria-hidden="true">
        <div class="phone">
          <div class="phone-screen">
            <div class="scan"></div>
            <div class="cap cap-1"></div>
            <div class="cap cap-2"></div>
          </div>
        </div>
        <div class="strip">${Array.from({ length: 7 }, () => html`<span></span>`)}</div>
      </div>
      <form class="card auth-card" method="post" action="/login" novalidate>
        <div class="brand brand-lg">${logoMark}<span>${config.portalName}</span></div>
        <h1>Sign in</h1>
        <p class="muted">Use the email and password your editor sent you.</p>
        ${req.query.expired ? html`<div class="flash flash-info">Your session expired. Please sign in again.</div>` : ''}
        ${error ? html`<div class="flash flash-error" role="alert">${error}</div>` : ''}
        <input type="hidden" name="_csrf" value="${req.csrf}">
        <input type="hidden" name="next" value="${next}">
        <label class="field">
          <span>Email</span>
          <input type="email" name="email" value="${email}" autocomplete="username" required autofocus>
        </label>
        <label class="field">
          <span>Password</span>
          <div class="pw">
            <input type="password" name="password" autocomplete="current-password" required>
            <button type="button" class="pw-toggle" data-toggle-password aria-label="Show password">Show</button>
          </div>
        </label>
        <button class="btn btn-primary btn-block" type="submit">Sign in</button>
        <p class="fine">Forgot your password? Message your editor and they'll send you a new one.</p>
      </form>
    </div>`,
  });
}
