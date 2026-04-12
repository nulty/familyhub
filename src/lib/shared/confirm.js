/**
 * confirm.js — Async confirm dialog backed by the modal stack.
 *
 * Usage:
 *   const ok = await showConfirm({ title: 'Delete?', message: 'Gone forever.', confirm: 'Delete', danger: true });
 *   if (!ok) return;
 */
import { pushModal } from './modal-stack.svelte.js';
import ConfirmModal from '../components/ConfirmModal.svelte';

/**
 * @param {object} opts
 * @param {string} opts.title          - Dialog title
 * @param {string} opts.message        - Body text (newlines rendered)
 * @param {string} [opts.confirm]      - Confirm button label (default "Confirm")
 * @param {boolean} [opts.danger]      - Red confirm button
 * @returns {Promise<boolean>}
 */
export function showConfirm({ title, message, confirm = 'Confirm', danger = false }) {
  let resolved = false;
  return new Promise((resolve) => {
    pushModal(ConfirmModal, {
      title,
      message,
      confirmLabel: confirm,
      danger,
      onresult(result) {
        if (resolved) return;
        resolved = true;
        resolve(result);
      },
    });
    // pushModal injects onclose (for stack removal) which ConfirmModal
    // receives as a prop. The modal calls onresult → pushModal's onclose
    // fires when the modal is removed from the stack by the component.
  });
}
