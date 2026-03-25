<script>
  import { relationships } from '../../db/db.js';
  import { emit, DATA_CHANGED } from '../../state.js';
  import { showToast } from '../shared/toast-store.js';
  import Modal from './Modal.svelte';
  import PersonPicker from '../pickers/PersonPicker.svelte';
  import { openPersonForm } from '../shared/open.js';

  let { person, type, onclose } = $props();

  const typeLabels = { parent: 'Parent', partner: 'Partner', child: 'Child' };
  const fullName = [person.given_name, person.surname].filter(Boolean).join(' ') || 'Unnamed';
  const title = `Add ${typeLabels[type]} for ${fullName}`;

  let selectedPerson = $state(null);

  function handleSelect(p) {
    selectedPerson = p;
  }

  function handleCreate() {
    openPersonForm(null, (newPerson) => {
      selectedPerson = newPerson;
    });
  }

  async function handleSave() {
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
      onclose?.();
      emit(DATA_CHANGED);
      const relName = [selectedPerson.given_name, selectedPerson.surname].filter(Boolean).join(' ');
      showToast(`Added ${typeLabels[type].toLowerCase()}: ${relName}`);
    } catch (err) {
      showToast('Error: ' + err.message);
    }
  }
</script>

<Modal {title} onclose={onclose}>
  <div class="form-group">
    <label>Select Person</label>
    <PersonPicker onselect={handleSelect} excludeIds={[person.id]} oncreate={handleCreate} />
  </div>
  <div class="form-actions">
    <button type="button" class="btn" onclick={() => onclose?.()}>Cancel</button>
    <button type="button" class="btn btn-primary" onclick={handleSave}>Add {typeLabels[type]}</button>
  </div>
</Modal>
