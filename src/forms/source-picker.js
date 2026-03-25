/**
 * source-picker.js — Bridge: mounts Svelte SourcePicker as a vanilla HTMLElement.
 */
import { mount } from 'svelte';
import SourcePicker from '../lib/pickers/SourcePicker.svelte';
import { openSourceForm } from './source-form.js';

export function createSourcePicker({ onSelect, excludeIds = [] }) {
  const wrapper = document.createElement('div');
  const component = mount(SourcePicker, {
    target: wrapper,
    props: {
      onselect: onSelect,
      excludeIds,
      oncreate: () => {
        openSourceForm(null, (newSource) => {
          component.setValue(newSource.title);
          onSelect(newSource);
        });
      },
    },
  });

  wrapper.focus = () => component.focus();
  return wrapper;
}
