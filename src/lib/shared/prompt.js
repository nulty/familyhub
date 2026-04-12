/**
 * prompt.js — Async prompt dialog backed by the modal stack.
 *
 * Usage:
 *   const name = await showPrompt({ title: 'Tree name', placeholder: 'My Family' });
 *   if (!name) return;
 */
import { pushModal } from './modal-stack.svelte.js';
import PromptModal from '../components/PromptModal.svelte';

/**
 * @param {object} opts
 * @param {string} opts.title           - Dialog title
 * @param {string} [opts.message]       - Optional body text
 * @param {string} [opts.placeholder]   - Input placeholder
 * @param {string} [opts.confirm]       - Confirm button label (default "OK")
 * @returns {Promise<string|null>}      - Trimmed input or null if cancelled
 */
export function showPrompt({ title, message = '', placeholder = '', confirm = 'OK' }) {
  let resolved = false;
  return new Promise((resolve) => {
    pushModal(PromptModal, {
      title,
      message,
      placeholder,
      confirm,
      onresult(result) {
        if (resolved) return;
        resolved = true;
        resolve(result);
      },
    });
  });
}
