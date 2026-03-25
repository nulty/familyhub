/**
 * citation-form.js — Bridge: mounts Svelte CitationForm in #modal-root.
 */
import { mount, unmount } from 'svelte';
import CitationForm from '../lib/forms/CitationForm.svelte';

export async function openCitationForm(citationId, onComplete, prefill) {
  const target = document.getElementById('modal-root');
  const container = document.createElement('div');
  target.appendChild(container);

  let component;

  function close() {
    if (component) unmount(component);
    container.remove();
  }

  component = mount(CitationForm, {
    target: container,
    props: {
      citationId,
      onclose: close,
      oncomplete: (result) => {
        onComplete?.(result);
      },
      prefill,
    },
  });
}
