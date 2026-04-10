/**
 * collab.js — Collaboration management: create/join/leave trees,
 * invite codes, member list, mode switching.
 */

import { getCollabState, setCollabState, clearCollabState, getMode } from './config.js';
import { initDB, switchDatabase, syncDown, bulk, nukeDatabase } from './db/db.js';
import { apiFetch, remoteCall } from './db/remote.js';
import { isAuthenticated, signOut as authSignOut, getCurrentUser, getAccessToken } from './auth.js';
import { emit, COLLAB_MODE_CHANGED, DATA_CHANGED } from './state.js';
import { createPoller } from './poll.js';

/**
 * Tell the server which tree (or local mode) we're now on, so sign-in
 * on another device can restore it. Best-effort — failures are ignored
 * since this is a convenience, not a correctness requirement.
 */
async function setLastTreeRemote(treeId) {
  try {
    await apiFetch('/users/me/last-tree', {
      method: 'POST',
      body: JSON.stringify({ treeId }),
    });
  } catch (e) {
    console.warn('[collab] failed to record last tree:', e.message);
  }
}

/**
 * Share the current local tree — upload to API and switch to collab mode.
 */
export async function shareTree(name) {
  if (!isAuthenticated()) throw new Error('Not authenticated');

  // Export local data before creating the tree
  const data = await bulk.exportAll();

  // Create empty tree on the API
  const { tree } = await apiFetch('/trees', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });

  const state = getCollabState();

  try {
    // Import data to the remote tree via the dedicated batch import endpoint
    if (data && Object.keys(data).some(k => Array.isArray(data[k]) && data[k].length > 0)) {
      await apiFetch(`/trees/${tree.id}/import`, {
        method: 'POST',
        body: JSON.stringify(data),
      });
    }

    // Switch to collab mode
    setCollabState({
      ...state,
      mode: 'collab',
      treeId: tree.id,
      treeName: tree.name,
      hasLocalTree: true,
    });
    setLastTreeRemote(tree.id);

    // Switch OPFS to collab cache and sync down
    await switchDatabase(`familytree-collab-${tree.id}.db`);
    await syncDown();

    emit(COLLAB_MODE_CHANGED, 'collab');
    emit(DATA_CHANGED);
  } catch (e) {
    // Clean up the remote tree if import or setup failed
    try {
      await apiFetch(`/trees/${tree.id}/members/${state.userId}`, { method: 'DELETE' });
    } catch {}
    throw e;
  }
}

/**
 * Join a collaborative tree via invite code.
 */
export async function joinTree(code) {
  if (!isAuthenticated()) throw new Error('Not authenticated');

  const state = getCollabState();
  const hasLocalTree = getMode() === 'local';

  const { tree } = await apiFetch('/trees/_/join', {
    method: 'POST',
    body: JSON.stringify({ code }),
  });

  setCollabState({
    ...state,
    mode: 'collab',
    treeId: tree.id,
    treeName: tree.name,
    hasLocalTree,
  });
  setLastTreeRemote(tree.id);

  await switchDatabase(`familytree-collab-${tree.id}.db`);
  await syncDown();

  emit(COLLAB_MODE_CHANGED, 'collab');
  emit(DATA_CHANGED);

  return tree;
}

/**
 * Disconnect from collab tree — fork data to local.
 */
export async function forkToLocal() {
  const state = getCollabState();
  if (!state?.treeId) throw new Error('No collaborative tree');

  // Try to fork from server — if it fails (404, offline), just switch to local
  try {
    const { data } = await apiFetch(`/trees/${state.treeId}/fork`, {
      method: 'POST',
    });
    await switchDatabase('familytree-local.db');
    await bulk.import(data);
  } catch {
    await switchDatabase('familytree-local.db');
  }

  setCollabState({
    ...state,
    mode: 'local',
    treeId: null,
    treeName: null,
    hasLocalTree: true,
  });
  setLastTreeRemote(null);

  emit(COLLAB_MODE_CHANGED, 'local');
  emit(DATA_CHANGED);
}

/**
 * Switch to local tree (without forking).
 */
export async function switchToLocal() {
  const state = getCollabState();
  setCollabState({ ...state, mode: 'local' });
  await switchDatabase('familytree-local.db');
  setLastTreeRemote(null);

  emit(COLLAB_MODE_CHANGED, 'local');
  emit(DATA_CHANGED);
}

/**
 * Switch to collab tree.
 */
export async function switchToCollab() {
  const state = getCollabState();
  if (!state?.treeId) throw new Error('No collaborative tree to switch to');

  setCollabState({ ...state, mode: 'collab' });
  await switchDatabase(`familytree-collab-${state.treeId}.db`);
  await syncDown();
  setLastTreeRemote(state.treeId);

  emit(COLLAB_MODE_CHANGED, 'collab');
  emit(DATA_CHANGED);
}

/**
 * Generate an invite code for the current tree.
 */
export async function generateInviteCode() {
  const state = getCollabState();
  if (!state?.treeId) throw new Error('No collaborative tree');
  const { code } = await apiFetch(`/trees/${state.treeId}/invite`, { method: 'POST' });
  return code;
}

/**
 * Get the member list for the current tree.
 */
export async function getMembers() {
  const state = getCollabState();
  if (!state?.treeId) throw new Error('No collaborative tree');
  const { members } = await apiFetch(`/trees/${state.treeId}/members`);
  return members;
}

/**
 * Remove a member from the current tree.
 */
export async function removeMember(userId) {
  const state = getCollabState();
  if (!state?.treeId) throw new Error('No collaborative tree');
  await apiFetch(`/trees/${state.treeId}/members/${userId}`, { method: 'DELETE' });
}

/**
 * Get recent activity for the current tree.
 */
export async function getActivity() {
  const state = getCollabState();
  if (!state?.treeId) throw new Error('No collaborative tree');
  const { activity } = await apiFetch(`/trees/${state.treeId}/activity`);
  return activity;
}

/**
 * List all trees the user is a member of.
 */
export async function listTrees() {
  const { trees } = await apiFetch('/trees');
  return trees;
}

/**
 * Sign out and clear collab state.
 */
export function collabSignOut() {
  authSignOut();
  emit(COLLAB_MODE_CHANGED, 'local');
}

// ─── Real-time polling wrapper ──────────────────────────────────────────────
// Thin glue between createPoller (pure core in ./poll.js) and the real
// fetch/timers/DOM events. Not unit-tested — exercised via manual/integration
// testing against the deployed Worker.

const POLL_API_URL = import.meta.env.VITE_API_URL || 'https://api.sinsear.org';

let currentPoller = null;
let currentPollTreeId = null;

async function fetchTreeVersion(treeId, lastKnown) {
  const token = await getAccessToken();
  if (!token) throw new Error('No auth token');

  const apiUrl = getCollabState()?.apiUrl || POLL_API_URL;
  const headers = { Authorization: `Bearer ${token}` };
  if (lastKnown !== null) {
    headers['If-None-Match'] = `"${lastKnown}"`;
  }

  const res = await fetch(`${apiUrl}/trees/${treeId}/version`, { headers });

  if (res.status === 304) return { version: lastKnown };
  if (!res.ok) throw new Error(`version fetch failed: ${res.status}`);

  const { version } = await res.json();
  return { version };
}

function handlePollVisibility() {
  if (!currentPoller) return;
  if (document.hidden) {
    currentPoller.pause();
  } else {
    currentPoller.resume();
  }
}

function handlePollOnline() {
  if (!currentPoller) return;
  currentPoller.tick();
}

/**
 * Start polling for version changes on the given tree.
 * Idempotent: no-op if already polling this tree; swaps target if polling a different one.
 */
export function startPolling(treeId) {
  if (currentPoller && currentPollTreeId === treeId) return;
  stopPolling();

  currentPollTreeId = treeId;
  currentPoller = createPoller({
    fetchVersion: (lastKnown) => fetchTreeVersion(treeId, lastKnown),
    onChange: () => {
      syncDown().then(() => emit(DATA_CHANGED)).catch(() => {});
    },
  });
  currentPoller.start();

  document.addEventListener('visibilitychange', handlePollVisibility);
  window.addEventListener('online', handlePollOnline);
}

/**
 * Stop polling and detach event listeners. Safe to call when not polling.
 */
export function stopPolling() {
  if (currentPoller) {
    currentPoller.stop();
    currentPoller = null;
    currentPollTreeId = null;
  }
  document.removeEventListener('visibilitychange', handlePollVisibility);
  window.removeEventListener('online', handlePollOnline);
}
