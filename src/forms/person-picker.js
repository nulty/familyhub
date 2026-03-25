/**
 * person-picker.js — Bridge: mounts Svelte PersonPicker as a vanilla HTMLElement.
 */
import { mount } from 'svelte';
import PersonPicker from '../lib/pickers/PersonPicker.svelte';
import { openPersonForm } from './person-form.js';

export function createPersonPicker({ onSelect, excludeIds = [] }) {
  const wrapper = document.createElement('div');
  const component = mount(PersonPicker, {
    target: wrapper,
    props: {
      onselect: onSelect,
      excludeIds,
      oncreate: () => {
        openPersonForm(null, (newPerson) => {
          const name = [newPerson.given_name, newPerson.surname].filter(Boolean).join(' ') || 'Unnamed';
          component.setValue(name);
          onSelect(newPerson);
        });
      },
    },
  });

  wrapper.focus = () => component.focus();
  return wrapper;
}
