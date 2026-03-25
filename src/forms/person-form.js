/**
 * person-form.js — Bridge: mounts Svelte PersonForm in #modal-root.
 */
import { mount, unmount } from 'svelte';
import PersonForm from '../lib/forms/PersonForm.svelte';

export async function openPersonForm(personId, onCreated) {
  const target = document.getElementById('modal-root');
  const container = document.createElement('div');
  target.appendChild(container);

  let component;

  function close() {
    if (component) unmount(component);
    container.remove();
  }

  component = mount(PersonForm, {
    target: container,
    props: {
      personId,
      onclose: close,
      oncreated: (created) => {
        onCreated?.(created);
      },
    },
  });
}
