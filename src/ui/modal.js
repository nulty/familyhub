/**
 * modal.js — Generic modal shell
 */

export function openModal({ title, content, onClose } = {}) {
  const root = document.getElementById('modal-root');

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';

  const modal = document.createElement('div');
  modal.className = 'modal';

  const header = document.createElement('div');
  header.className = 'modal-header';
  header.innerHTML = `<h2>${title || ''}</h2><button class="modal-close" aria-label="Close">&times;</button>`;

  const body = document.createElement('div');
  body.className = 'modal-body';
  if (typeof content === 'string') body.innerHTML = content;
  else if (content instanceof Node) body.appendChild(content);

  modal.appendChild(header);
  modal.appendChild(body);
  backdrop.appendChild(modal);
  root.appendChild(backdrop);

  function close() {
    backdrop.remove();
    onClose?.();
  }

  header.querySelector('.modal-close').onclick = close;
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });

  function onKey(e) {
    if (e.key === 'Escape') {
      close();
      window.removeEventListener('keydown', onKey);
    }
  }
  window.addEventListener('keydown', onKey);

  return { close, body };
}
