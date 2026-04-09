/**
 * collab.js — Collaboration management: create/join/leave trees,
 * invite codes, member list, mode switching.
 */

import { getCollabState, setCollabState, clearCollabState, getMode } from './config.js';
import { initDB, switchDatabase, syncDown, bulk, nukeDatabase } from './db/db.js';
import { apiFetch } from './db/remote.js';
import { isAuthenticated, signOut as authSignOut, getCurrentUser } from './auth.js';
import { emit, COLLAB_MODE_CHANGED, DATA_CHANGED } from './state.js';

/**
 * Share the current local tree — upload to API and switch to collab mode.
 */
export async function shareTree(name) {
  if (!isAuthenticated()) throw new Error('Not authenticated');

  const data = await bulk.exportAll();

  const { tree } = await apiFetch('/trees', {
    method: 'POST',
    body: JSON.stringify({ name, data }),
  });

  const state = getCollabState();
  setCollabState({
    ...state,
    mode: 'collab',
    treeId: tree.id,
    treeName: tree.name,
    hasLocalTree: true,
  });

  await switchDatabase(`familytree-collab-${tree.id}.db`);
  await syncDown();

  emit(COLLAB_MODE_CHANGED, 'collab');
  emit(DATA_CHANGED);
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

  const { data } = await apiFetch(`/trees/${state.treeId}/fork`, {
    method: 'POST',
  });

  await switchDatabase('familytree-local.db');
  await bulk.import(data);

  setCollabState({
    ...state,
    mode: 'local',
    treeId: null,
    treeName: null,
    hasLocalTree: true,
  });

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
