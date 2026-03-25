/**
 * sources-page.js — Bridge: mounts Svelte SourcesPage in #modal-root.
 */
import { mount, unmount } from 'svelte';
import SourcesPage from '../lib/components/SourcesPage.svelte';

export async function openSourcesPage() {
  const target = document.getElementById('modal-root');
  const container = document.createElement('div');
  target.appendChild(container);

  let component;

  function close() {
    if (component) unmount(component);
    container.remove();
  }

  component = mount(SourcesPage, {
    target: container,
    props: { onclose: close },
  });
}
