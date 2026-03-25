/**
 * event-form.js — Bridge: mounts Svelte EventForm in #modal-root.
 */
import { mount, unmount } from 'svelte';
import EventForm from '../lib/forms/EventForm.svelte';

export async function openEventForm(personId, eventId) {
  const target = document.getElementById('modal-root');
  const container = document.createElement('div');
  target.appendChild(container);

  let component;

  function close() {
    if (component) unmount(component);
    container.remove();
  }

  component = mount(EventForm, {
    target: container,
    props: {
      personId,
      eventId,
      onclose: close,
    },
  });
}
