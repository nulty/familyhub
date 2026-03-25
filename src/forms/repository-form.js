/**
 * repository-form.js — Bridge: mounts Svelte RepositoryForm in #modal-root.
 */
import { mount, unmount } from 'svelte';
import RepositoryForm from '../lib/forms/RepositoryForm.svelte';

export async function openRepositoryForm(repoId, onComplete) {
  const target = document.getElementById('modal-root');
  const container = document.createElement('div');
  target.appendChild(container);

  let component;

  function close() {
    if (component) unmount(component);
    container.remove();
  }

  component = mount(RepositoryForm, {
    target: container,
    props: {
      repoId,
      onclose: close,
      oncomplete: (result) => {
        onComplete?.(result);
      },
    },
  });
}
