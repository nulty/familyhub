<script>
  import { relationships } from '../../db/db.js';
  import { emit, DATA_CHANGED } from '../../state.js';
  import { showToast } from '../shared/toast-store.js';
  import Modal from './Modal.svelte';
  import PersonPicker from '../pickers/PersonPicker.svelte';
  import { openPersonForm } from '../shared/open.js';
  import { planChildRelationships } from './child-relationships.js';

  let { person, type, onclose } = $props();

  const typeLabels = { parent: 'Parent', partner: 'Partner', child: 'Child' };
  const fullName = [person.given_name, person.surname].filter(Boolean).join(' ') || 'Unnamed';
  const title = `Add ${typeLabels[type]} for ${fullName}`;

  function nameOf(p) {
    return [p.given_name, p.surname].filter(Boolean).join(' ') || 'Unnamed';
  }

  let selectedPerson = $state(null);
  let childPicker = $state(null);

  // Other-parent state (child path only).
  let partners = $state([]);
  let otherParentChoice = $state('none'); // a partner id | 'none' | 'someone-else'
  let otherParentPerson = $state(null);
  let otherParentPicker = $state(null);

  $effect(() => {
    if (type !== 'child') return;
    (async () => {
      const fam = await relationships.getFamily(person.id);
      partners = fam.partners || [];
      // Default to the sole partner when there's exactly one; otherwise force
      // an explicit choice so we never silently link the wrong co-parent.
      if (partners.length === 1) otherParentChoice = partners[0].id;
    })();
  });

  function handleSelect(p) {
    selectedPerson = p;
  }

  function handleCreate() {
    openPersonForm(null, (newPerson) => {
      selectedPerson = newPerson;
      childPicker?.setValue(nameOf(newPerson));
    });
  }

  function handleOtherParentSelect(p) {
    otherParentPerson = p;
  }

  function handleOtherParentCreate() {
    openPersonForm(null, (newPerson) => {
      otherParentPerson = newPerson;
      otherParentPicker?.setValue(nameOf(newPerson));
    });
  }

  function resolveOtherParentId() {
    if (otherParentChoice === 'none') return null;
    if (otherParentChoice === 'someone-else') return otherParentPerson?.id ?? null;
    return otherParentChoice; // a partner id
  }

  async function saveChild() {
    const ops = planChildRelationships({
      personId: person.id,
      childId: selectedPerson.id,
      otherParentId: resolveOtherParentId(),
      partnerIds: partners.map((p) => p.id),
    });
    for (const op of ops) {
      if (op.kind === 'parent_child') {
        await relationships.addParentChild(op.parentId, op.childId);
      } else {
        await relationships.addPartner(op.aId, op.bId);
      }
    }
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
        await saveChild();
      } else if (type === 'partner') {
        await relationships.addPartner(person.id, selectedPerson.id);
      }
      onclose?.();
      emit(DATA_CHANGED);
      showToast(`Added ${typeLabels[type].toLowerCase()}: ${nameOf(selectedPerson)}`);
    } catch (err) {
      showToast('Error: ' + err.message);
    }
  }
</script>

<Modal {title} onclose={onclose}>
  <div class="form-group">
    <label>{type === 'child' ? 'Child' : 'Select Person'}</label>
    <PersonPicker bind:this={childPicker} onselect={handleSelect} excludeIds={[person.id]} oncreate={handleCreate} />
    <button type="button" class="btn btn-sm btn-link" onclick={handleCreate}>+ Create New Person</button>
  </div>

  {#if type === 'child'}
    <div class="form-group">
      <label for="rf-other-parent">Other parent</label>
      <select id="rf-other-parent" bind:value={otherParentChoice}>
        {#each partners as pr}
          <option value={pr.id}>{nameOf(pr)} (partner)</option>
        {/each}
        <option value="none">Unknown / none</option>
        <option value="someone-else">Someone else…</option>
      </select>
      {#if otherParentChoice === 'someone-else'}
        <div class="other-parent-picker">
          <PersonPicker
            bind:this={otherParentPicker}
            onselect={handleOtherParentSelect}
            excludeIds={[person.id, selectedPerson?.id].filter(Boolean)}
            oncreate={handleOtherParentCreate}
          />
          <button type="button" class="btn btn-sm btn-link" onclick={handleOtherParentCreate}>+ Create New Person</button>
        </div>
      {/if}
    </div>
  {/if}

  <div class="form-actions">
    <button type="button" class="btn" onclick={() => onclose?.()}>Cancel</button>
    <button type="button" class="btn btn-primary" onclick={handleSave}>Add {typeLabels[type]}</button>
  </div>
</Modal>

<style>
  .other-parent-picker { margin-top: 8px; }
</style>
