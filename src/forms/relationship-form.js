/**
 * relationship-form.js — Bridge: mounts Svelte RelationshipForm in #modal-root.
 */
import { mount, unmount } from 'svelte';
import RelationshipForm from '../lib/forms/RelationshipForm.svelte';

export function openRelationshipForm(person, type) {
  const target = document.getElementById('modal-root');
  const container = document.createElement('div');
  target.appendChild(container);

  let component;

  function close() {
    if (component) unmount(component);
    container.remove();
  }

  component = mount(RelationshipForm, {
    target: container,
    props: {
      person,
      type,
      onclose: close,
    },
  });
}
