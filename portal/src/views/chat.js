import { html } from '../html.js';
import { icon } from './layout.js';

const clock = (ms) => new Date(ms).toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true });

export function messageItem(m) {
  if (m.kind === 'system') {
    return html`<li class="msg msg-system" data-id="${m.id}"><span>${m.body}</span> <time data-ts="${m.created_at}">${clock(m.created_at)}</time></li>`;
  }
  return html`
  <li class="msg ${m.mine ? 'msg-mine' : 'msg-theirs'} ${m.kind === 'changes' ? 'msg-changes' : ''}" data-id="${m.id}">
    <div class="msg-meta"><strong>${m.author}</strong>${m.kind === 'changes' ? html` <span class="msg-tag">Change request</span>` : ''} <time data-ts="${m.created_at}">${clock(m.created_at)}</time></div>
    <div class="msg-body">${m.body}</div>
  </li>`;
}

/**
 * Live chat panel. live.js polls `stateUrl` for new messages and posts to `postUrl`.
 * @param {object} o
 */
export function chatPanel({ req, messages, stateUrl, postUrl, title = 'Messages', subtitle = '', hint = '', placeholder = 'Write a message…', empty = 'No messages yet.', unread = 0 }) {
  const lastId = messages.length ? messages[messages.length - 1].id : 0;
  // A floating chat button (bottom right, above the tab bar) that opens this project's own chat.
  return html`
  <button class="chat-fab" type="button" data-chat-open aria-haspopup="dialog" aria-label="Messages${unread ? ` (${unread} new)` : ''}">
    ${icon.chat}
    <span class="chat-fab-badge" data-chat-badge ${unread ? '' : 'hidden'}>${unread || ''}</span>
  </button>
  <div class="chat-sheet" data-chat-sheet hidden role="dialog" aria-modal="true" aria-label="${title}">
    <div class="chat-backdrop" data-chat-close></div>
    <section class="card chat" data-chat data-state-url="${stateUrl}" data-post-url="${postUrl}" data-last-id="${lastId}">
      <header class="chat-head">
        <div class="chat-head-text">
          <h2>${title}</h2>
          ${subtitle ? html`<p class="chat-sub small">${subtitle}</p>` : ''}
          ${hint ? html`<p class="muted small">${hint}</p>` : ''}
        </div>
        <button class="icon-btn chat-close" type="button" data-chat-close aria-label="Close messages">${icon.x}</button>
      </header>
      <ol class="msgs" data-msgs aria-live="polite">
        ${messages.length ? messages.map(messageItem) : ''}
        <li class="msgs-empty" ${messages.some((m) => m.kind !== 'system') ? 'hidden' : ''}>${empty}</li>
      </ol>
      <form class="chat-form" data-chat-form>
        <textarea name="body" rows="1" maxlength="4000" placeholder="${placeholder}" aria-label="Message" required></textarea>
        <button class="btn btn-primary chat-send" type="submit" aria-label="Send">${icon.send}</button>
      </form>
      <input type="hidden" data-csrf value="${req.csrf}">
    </section>
  </div>`;
}
