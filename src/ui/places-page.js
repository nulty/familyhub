/**
 * places-page.js — Bridge: mounts Svelte PlacesPage in #modal-root.
 */
import { mount, unmount } from 'svelte';
import PlacesPage from '../lib/components/PlacesPage.svelte';

export async function openPlacesPage() {
  const target = document.getElementById('modal-root');
  const container = document.createElement('div');
  target.appendChild(container);

  let component;

  function close() {
    if (component) unmount(component);
    container.remove();
  }

  component = mount(PlacesPage, {
    target: container,
    props: { onclose: close },
  });
}
