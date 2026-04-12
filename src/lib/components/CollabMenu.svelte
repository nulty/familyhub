<script>
  import { getCollabState } from '../../config.js';
  import { getMembers, generateInviteCode, removeMember, disconnectFromTree, getActivity } from '../../collab.js';
  import { getCurrentUser } from '../../auth.js';
  import { showToast } from '../shared/toast-store.js';
  import { showConfirm } from '../shared/confirm.js';
  import { openExportModal } from '../shared/open.js';
  import Modal from '../forms/Modal.svelte';

  let { onclose } = $props();
  const close = onclose;

  let members = $state([]);
  let activity = $state([]);
  let inviteCode = $state(null);
  let loading = $state(true);
  let offline = $state(false);

  const collabState = getCollabState();
  const currentUser = getCurrentUser();

  $effect(() => {
    if (!navigator.onLine) {
      loading = false;
      offline = true;
      return;
    }
    Promise.all([getMembers(), getActivity()])
      .then(([m, a]) => {
        members = m;
        activity = a;
        loading = false;
      })
      .catch(() => {
        loading = false;
        offline = true;
      });
  });

  const isSolo = $derived(members.length > 0 && members.length === 1);

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
    if (!await showConfirm({ title: `Remove ${name}?`, message: 'They will lose access to this shared tree.', confirm: 'Remove', danger: true })) return;
    try {
      await removeMember(userId);
      members = members.filter(m => m.user_id !== userId);
      showToast(`${name} removed`);
    } catch (e) {
      showToast('Failed: ' + e.message);
    }
  }

  function handleExport() {
    close();
    openExportModal();
  }

  async function handleDelete() {
    const treeName = collabState?.treeName || 'this tree';
    const confirmed = await showConfirm({
      title: `Delete "${treeName}"?`,
      message: `This permanently deletes the cloud copy. It cannot be undone.\n\nYour local data will not be kept. Use Export to download a copy first.`,
      confirm: 'Delete',
      danger: true,
    });
    if (!confirmed) return;
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
    const confirmed = await showConfirm({
      title: `Leave "${treeName}"?`,
      message: 'Other members will keep editing the shared tree. You can rejoin with a new invite code.',
      confirm: 'Leave',
    });
    if (!confirmed) return;
    try {
      await disconnectFromTree();
      showToast('Left the tree');
      close();
    } catch (e) {
      showToast('Failed: ' + e.message);
    }
  }

  function formatTime(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    const now = new Date();
    const diff = now - d;
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
    return d.toLocaleDateString();
  }
</script>

<Modal title={collabState?.treeName || 'Collaboration'} onclose={close} wide>
  {#if loading}
    <p>Loading...</p>
  {:else if offline}
    <p class="offline-msg">You're offline. Collaboration details will be available when you reconnect.</p>
  {:else}
    <section>
      <h3>Members</h3>
      <ul class="member-list">
        {#each members as member}
          <li class="member-item">
            <span class="member-name">
              {member.name || member.email}
              {#if member.user_id === currentUser?.id}
                <span class="member-you">(you)</span>
              {/if}
            </span>
            {#if member.user_id !== currentUser?.id}
              <button class="btn-small btn-remove" onclick={() => handleRemove(member.user_id, member.name)}>Remove</button>
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
        <button class="btn" onclick={handleInvite}>Generate Invite Code</button>
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
              <span class="activity-time">{formatTime(entry.created_at)}</span>
            </li>
          {/each}
        </ul>
      </section>
    {/if}

    <section class="section-danger">
      {#if isSolo}
        <p class="form-hint">You're the only member. You can <button class="btn-link" onclick={handleExport}>export a copy</button> before deleting.</p>
        <button class="btn btn-danger" onclick={handleDelete}>Delete tree</button>
      {:else}
        <p class="form-hint">Leave this tree? Other members will continue editing. You can rejoin with a new invite.</p>
        <button class="btn" onclick={handleLeave}>Leave tree</button>
      {/if}
    </section>
  {/if}
</Modal>

<style>
  .offline-msg { color: var(--text-muted); font-size: 14px; padding: 1rem 0; }
  section { margin-bottom: 1.5rem; }
  .section-danger { border-top: 1px solid var(--border); padding-top: 1rem; }
  h3 { font-size: 14px; font-weight: 600; margin-bottom: 0.5rem; }
  .member-list { list-style: none; padding: 0; margin: 0; }
  .member-item { display: flex; align-items: center; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid var(--border); }
  .member-name { font-size: 14px; }
  .member-you { font-size: 12px; color: var(--text-muted); margin-left: 4px; }
  .btn-small { font-size: 12px; padding: 2px 8px; border: 1px solid var(--border); border-radius: 4px; background: transparent; cursor: pointer; }
  .btn-remove { color: var(--text-muted); }
  .btn-remove:hover { color: var(--danger); border-color: var(--danger); }
  .btn-link { background: none; border: none; color: var(--accent); cursor: pointer; font-size: inherit; padding: 0; text-decoration: underline; }
  .invite-code { display: flex; align-items: center; gap: 8px; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; }
  .invite-code code { font-size: 14px; word-break: break-all; flex: 1; }
  .activity-list { list-style: none; padding: 0; margin: 0; max-height: 200px; overflow-y: auto; }
  .activity-item { font-size: 13px; padding: 4px 0; border-bottom: 1px solid var(--border); display: flex; gap: 4px; align-items: baseline; }
  .activity-user { font-weight: 500; white-space: nowrap; }
  .activity-summary { color: var(--text-muted); flex: 1; }
  .activity-time { color: var(--text-muted); font-size: 11px; white-space: nowrap; }
  .btn-danger { background: var(--danger); color: white; border-color: var(--danger); }
  .btn-danger:hover { background: var(--danger-hover); border-color: var(--danger-hover); }
</style>
