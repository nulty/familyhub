/**
 * relationship-form.js — Modal form for adding relationships
 */

import { relationships } from '../db/db.js';
import { emit, DATA_CHANGED } from '../state.js';
import { openModal } from '../ui/modal.js';
import { showToast } from '../ui/toast.js';
import { createPersonPicker } from './person-picker.js';

/**
 * @param {Object} person - current person object
 * @param {'parent'|'partner'|'child'} type
 */
export function openRelationshipForm(person, type) {
  const fullName = [person.given_name, person.surname].filter(Boolean).join(' ') || 'Unnamed';
  const typeLabels = { parent: 'Parent', partner: 'Partner', child: 'Child' };
  const title = `Add ${typeLabels[type]} for ${fullName}`;

  const content = document.createElement('div');
  let selectedPerson = null;

  const picker = createPersonPicker({
    onSelect: (p) => { selectedPerson = p; },
    excludeIds: [person.id],
  });

  const label = document.createElement('label');
  label.className = 'form-group';
  label.innerHTML = `<span style="font-size:12px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.03em">Select Person</span>`;
  label.appendChild(picker);

  const actions = document.createElement('div');
  actions.className = 'form-actions';
  actions.innerHTML = `
    <button type="button" class="btn" data-action="cancel">Cancel</button>
    <button type="button" class="btn btn-primary" data-action="save">Add ${typeLabels[type]}</button>
  `;

  content.appendChild(label);
  content.appendChild(actions);

  const { close } = openModal({ title, content });

  actions.querySelector('[data-action="cancel"]').onclick = close;

  actions.querySelector('[data-action="save"]').onclick = async () => {
    if (!selectedPerson) {
      showToast('Please select a person');
      return;
    }

    try {
      if (type === 'parent') {
        await relationships.addParentChild(selectedPerson.id, person.id);
      } else if (type === 'child') {
        await relationships.addParentChild(person.id, selectedPerson.id);
      } else if (type === 'partner') {
        await relationships.addPartner(person.id, selectedPerson.id);
      }
      close();
      emit(DATA_CHANGED);
      const relName = [selectedPerson.given_name, selectedPerson.surname].filter(Boolean).join(' ');
      showToast(`Added ${typeLabels[type].toLowerCase()}: ${relName}`);
    } catch (err) {
      showToast('Error: ' + err.message);
    }
  };

  picker.focus();
}
