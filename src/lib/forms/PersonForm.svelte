<script>
  import { people, personNames } from '../../db/db.js';
  import { emit, DATA_CHANGED } from '../../state.js';
  import { showToast } from '../shared/toast-store.js';
  import Modal from './Modal.svelte';

  const NAME_TYPES = [
    { value: 'birth', label: 'Birth' },
    { value: 'married', label: 'Married' },
    { value: 'nickname', label: 'Nickname' },
    { value: 'legal', label: 'Legal' },
    { value: 'aka', label: 'Also known as' },
  ];

  let { personId = null, onclose, oncreated } = $props();

  let givenName = $state('');
  let surname = $state('');
  let gender = $state('U');
  let notes = $state('');
  let nameEntries = $state([]);
  let isEdit = $state(false);
  let title = $state('New Person');
  let inputEl;

  $effect(() => {
    if (personId) {
      isEdit = true;
      (async () => {
        const p = await people.get(personId);
        if (!p) { onclose?.(); return; }
        givenName = p.given_name || '';
        surname = p.surname || '';
        gender = p.gender || 'U';
        notes = p.notes || '';
        title = `Edit ${[p.given_name, p.surname].filter(Boolean).join(' ')}`;

        const existingNames = await personNames.list(personId);
        nameEntries = existingNames.map(n => ({
          id: n.id,
          given_name: n.given_name || '',
          surname: n.surname || '',
          type: n.type || '',
          date: n.date || '',
          deleted: false,
        }));
      })();
    }
  });

  function addName() {
    nameEntries = [...nameEntries, { given_name: '', surname: '', type: '', date: '', deleted: false }];
  }

  function removeName(idx) {
    nameEntries = nameEntries.map((n, i) => i === idx ? { ...n, deleted: true } : n);
  }

  function updateName(idx, field, value) {
    nameEntries = nameEntries.map((n, i) => i === idx ? { ...n, [field]: value } : n);
  }

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
        for (const n of nameEntries) {
          if (n.deleted && n.id) {
            await personNames.delete(n.id);
          } else if (n.id && !n.deleted) {
            await personNames.update(n.id, { given_name: n.given_name, surname: n.surname, type: n.type, date: n.date });
          } else if (!n.id && !n.deleted && (n.given_name || n.surname)) {
            await personNames.create({ person_id: personId, given_name: n.given_name, surname: n.surname, type: n.type, date: n.date });
          }
        }
        onclose?.();
        emit(DATA_CHANGED);
        showToast('Person updated');
      } else {
        const created = await people.create(data);
        for (const n of nameEntries) {
          if (!n.deleted && (n.given_name || n.surname)) {
            await personNames.create({ person_id: created.id, given_name: n.given_name, surname: n.surname, type: n.type, date: n.date });
          }
        }
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
    <!-- Other Names -->
    <div class="form-group">
      <label>Other Names</label>
      <div>
        {#each nameEntries as n, idx}
          {#if !n.deleted}
            <div class="name-row">
              <select value={n.type} onchange={(e) => updateName(idx, 'type', e.target.value)}>
                <option value="">(type)</option>
                {#each NAME_TYPES as t}
                  <option value={t.value}>{t.label}</option>
                {/each}
              </select>
              <input type="text" placeholder="Given name" value={n.given_name} oninput={(e) => updateName(idx, 'given_name', e.target.value)}>
              <input type="text" placeholder="Surname" value={n.surname} oninput={(e) => updateName(idx, 'surname', e.target.value)}>
              <input type="text" placeholder="Date" value={n.date} oninput={(e) => updateName(idx, 'date', e.target.value)}>
              <button type="button" class="btn-link btn-sm" style="color:var(--danger)" onclick={() => removeName(idx)}>Remove</button>
            </div>
          {/if}
        {/each}
      </div>
      <button type="button" class="btn btn-sm btn-link" onclick={addName}>+ Add Name</button>
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
