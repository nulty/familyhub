<script>
  import { getCollabState } from '../../config.js';
  import { getMembers, generateInviteCode, removeMember, disconnectFromTree, getActivity } from '../../collab.js';
  import { getCurrentUser } from '../../auth.js';
  import { showToast } from '../shared/toast-store.js';
  import { bulk } from '../../db/db.js';
  import { triggerExport } from '../../gedcom/gedcom.js';
  import Modal from '../forms/Modal.svelte';

  let { onclose } = $props();
  const close = onclose;

  let members = $state([]);
  let activity = $state([]);
  let inviteCode = $state(null);
  let loading = $state(true);

  const collabState = getCollabState();
  const currentUser = getCurrentUser();

  $effect(() => {
    Promise.all([getMembers(), getActivity()])
      .then(([m, a]) => {
        members = m;
        activity = a;
        loading = false;
      })
      .catch(() => { loading = false; });
  });

  const isSolo = $derived(members.length === 1);

  async function handleInvite() {
    try {
      inviteCode = await generateInviteCode();
    } catch (e) {
      showToast('Failed to generate invite: ' + e.message);
    }
  }

  async function copyCode() {
    if (inviteCode) {
      await navigator.clipboard.writeText(inviteCode);
      showToast('Invite code copied');
    }
  }

  async function handleRemove(userId, name) {
    if (!confirm(`Remove ${name} from this tree?`)) return;
    try {
      await removeMember(userId);
      members = members.filter(m => m.user_id !== userId);
      showToast(`${name} removed`);
    } catch (e) {
      showToast('Failed: ' + e.message);
    }
  }

  async function downloadSqlite() {
    const bytes = await bulk.exportDatabase();
    const blob = new Blob([bytes], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${collabState?.treeName || 'familytree'}.db`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function downloadGedcom() {
    triggerExport();
  }

  async function handleDelete() {
    const treeName = collabState?.treeName || 'this tree';
    const msg = `Delete "${treeName}"?\n\n`
      + `This permanently deletes the cloud copy. It cannot be undone.\n\n`
      + `If you want to keep a copy, cancel and use the Download buttons first — `
      + `the tree will NOT be saved to your local tree.`;
    if (!confirm(msg)) return;
    try {
      await disconnectFromTree();
      showToast('Tree deleted');
      close();
    } catch (e) {
      showToast('Failed: ' + e.message);
    }
  }

  async function handleLeave() {
    const treeName = collabState?.treeName || 'this tree';
    const msg = `Leave "${treeName}"?\n\n`
      + `Other members will keep editing the shared tree. `
      + `You can rejoin with a new invite code.`;
    if (!confirm(msg)) return;
    try {
      await disconnectFromTree();
      showToast('Left the tree');
      close();
    } catch (e) {
      showToast('Failed: ' + e.message);
    }
  }
</script>

<Modal title={collabState?.treeName || 'Collaboration'} onclose={close} wide>
  {#if loading}
    <p>Loading...</p>
  {:else}
    <section>
      <h3>Members</h3>
      <ul class="member-list">
        {#each members as member}
          <li class="member-item">
            <span class="member-name">{member.name || member.email}</span>
            {#if member.user_id !== currentUser?.id}
              <button class="btn-small btn-danger" onclick={() => handleRemove(member.user_id, member.name)}>Remove</button>
            {:else}
              <span class="member-you">(you)</span>
            {/if}
          </li>
        {/each}
      </ul>
    </section>

    <section>
      <h3>Invite</h3>
      {#if inviteCode}
        <div class="invite-code">
          <code>{inviteCode}</code>
          <button class="btn-small" onclick={copyCode}>Copy</button>
        </div>
        <p class="form-hint">Single-use. Share this code with someone to invite them.</p>
      {:else}
        <button class="btn btn-primary" onclick={handleInvite}>Generate Invite Code</button>
      {/if}
    </section>

    {#if activity.length > 0}
      <section>
        <h3>Recent Activity</h3>
        <ul class="activity-list">
          {#each activity.slice(0, 20) as entry}
            <li class="activity-item">
              <span class="activity-user">{entry.user_name}</span>
              <span class="activity-summary">{entry.summary}</span>
            </li>
          {/each}
        </ul>
      </section>
    {/if}

    <section>
      <hr class="menu-divider" />
      {#if isSolo}
        <h3>Delete tree</h3>
        <p class="form-hint">
          You're the only member. Deleting permanently removes the cloud copy — it
          will <strong>not</strong> be saved to your local tree. Download a copy first if you
          want to keep the data.
        </p>
        <div class="download-row">
          <button class="btn" onclick={downloadGedcom}>Download GEDCOM</button>
          <button class="btn" onclick={downloadSqlite}>Download SQLite</button>
        </div>
        <button class="btn btn-danger" onclick={handleDelete}>Delete tree</button>
      {:else}
        <h3>Leave tree</h3>
        <p class="form-hint">
          Other members will keep editing the shared tree. You can rejoin with a new invite code.
        </p>
        <button class="btn" onclick={handleLeave}>Leave tree</button>
      {/if}
    </section>
  {/if}
</Modal>

<style>
  section { margin-bottom: 1.5rem; }
  h3 { font-size: 14px; font-weight: 600; margin-bottom: 0.5rem; }
  .member-list { list-style: none; padding: 0; margin: 0; }
  .member-item { display: flex; align-items: center; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid var(--border); }
  .member-name { font-size: 14px; }
  .member-you { font-size: 12px; color: var(--text-muted); }
  .btn-small { font-size: 12px; padding: 2px 8px; border: 1px solid var(--border); border-radius: 4px; background: transparent; cursor: pointer; }
  .btn-danger { color: #ef4444; border-color: #ef4444; }
  .invite-code { display: flex; align-items: center; gap: 8px; padding: 8px; background: var(--bg-raised); border-radius: 6px; }
  .invite-code code { font-size: 14px; word-break: break-all; flex: 1; }
  .activity-list { list-style: none; padding: 0; margin: 0; max-height: 200px; overflow-y: auto; }
  .activity-item { font-size: 13px; padding: 4px 0; border-bottom: 1px solid var(--border); }
  .activity-user { font-weight: 500; margin-right: 4px; }
  .activity-summary { color: var(--text-muted); }
  .download-row { display: flex; gap: 8px; margin-bottom: 0.75rem; }
</style>
