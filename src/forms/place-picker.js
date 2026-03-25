/**
 * place-picker.js — Bridge: mounts Svelte PlacePicker as a vanilla HTMLElement.
 */
import { mount } from 'svelte';
import PlacePicker from '../lib/pickers/PlacePicker.svelte';
import { openPlaceForm } from './place-form.js';

export function createPlacePicker({ onSelect, excludeIds = [] }) {
  const wrapper = document.createElement('div');
  const component = mount(PlacePicker, {
    target: wrapper,
    props: {
      onselect: onSelect,
      excludeIds,
      oncreate: () => {
        openPlaceForm(null, (newPlace) => {
          component.setValue(newPlace.name);
          onSelect(newPlace);
        });
      },
    },
  });

  wrapper.focus = () => component.focus();
  return wrapper;
}
