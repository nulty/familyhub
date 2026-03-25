<script>
  import { people } from '../../db/db.js';
  import { emit, DATA_CHANGED } from '../../state.js';
  import { showToast } from '../shared/toast-store.js';
  import Modal from './Modal.svelte';

  let { personId = null, onclose, oncreated } = $props();

  let givenName = $state('');
  let surname = $state('');
  let gender = $state('U');
  let notes = $state('');
  let isEdit = $state(false);
  let title = $state('New Person');
  let inputEl;

  $effect(() => {
    if (personId) {
      isEdit = true;
      people.get(personId).then((p) => {
        if (!p) { onclose?.(); return; }
        givenName = p.given_name || '';
        surname = p.surname || '';
        gender = p.gender || 'U';
        notes = p.notes || '';
        title = `Edit ${[p.given_name, p.surname].filter(Boolean).join(' ')}`;
      });
    }
  });

  async function handleSubmit(e) {
    e.preventDefault();
    const data = {
      given_name: givenName.trim(),
      surname: surname.trim(),
      gender,
      notes: notes.trim(),
    };

    try {
      if (isEdit) {
        await people.update(personId, data);
        onclose?.();
        emit(DATA_CHANGED);
        showToast('Person updated');
      } else {
        const created = await people.create(data);
        onclose?.();
        emit(DATA_CHANGED);
        showToast(`Created ${data.given_name || 'person'}`);
        oncreated?.(created);
      }
    } catch (err) {
      showToast('Error: ' + err.message);
    }
  }
</script>

<Modal {title} onclose={onclose}>
  <form onsubmit={handleSubmit}>
    <div class="form-group">
      <label for="pf-given">Given Name</label>
      <input bind:this={inputEl} id="pf-given" type="text" bind:value={givenName} autocomplete="off">
    </div>
    <div class="form-group">
      <label for="pf-surname">Surname</label>
      <input id="pf-surname" type="text" bind:value={surname} autocomplete="off">
    </div>
    <div class="form-group">
      <label for="pf-gender">Gender</label>
      <select id="pf-gender" bind:value={gender}>
        <option value="M">Male</option>
        <option value="F">Female</option>
        <option value="U">Unknown</option>
      </select>
    </div>
    <div class="form-group">
      <label for="pf-notes">Notes</label>
      <textarea id="pf-notes" rows="3" bind:value={notes}></textarea>
    </div>
    <div class="form-actions">
      <button type="button" class="btn" onclick={() => onclose?.()}>Cancel</button>
      <button type="submit" class="btn btn-primary">{isEdit ? 'Save' : 'Create'}</button>
    </div>
  </form>
</Modal>
