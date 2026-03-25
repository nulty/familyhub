/**
 * place-form.js — Bridge: mounts Svelte PlaceForm in #modal-root.
 */
import { mount, unmount } from 'svelte';
import PlaceForm from '../lib/forms/PlaceForm.svelte';

export async function openPlaceForm(placeId, onComplete) {
  const target = document.getElementById('modal-root');
  const container = document.createElement('div');
  target.appendChild(container);

  let component;

  function close() {
    if (component) unmount(component);
    container.remove();
  }

  component = mount(PlaceForm, {
    target: container,
    props: {
      placeId,
      onclose: close,
      oncomplete: (result) => {
        onComplete?.(result);
      },
    },
  });
}
