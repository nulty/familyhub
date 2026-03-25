/**
 * source-form.js — Bridge: mounts Svelte SourceForm in #modal-root.
 */
import { mount, unmount } from 'svelte';
import SourceForm from '../lib/forms/SourceForm.svelte';

export async function openSourceForm(sourceId, onComplete, prefill) {
  const target = document.getElementById('modal-root');
  const container = document.createElement('div');
  target.appendChild(container);

  let component;

  function close() {
    if (component) unmount(component);
    container.remove();
  }

  component = mount(SourceForm, {
    target: container,
    props: {
      sourceId,
      onclose: close,
      oncomplete: (result) => {
        onComplete?.(result);
      },
      prefill,
    },
  });
}
