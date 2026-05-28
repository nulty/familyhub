/**
 * remote.js — Fetch-based transport to the collaboration API.
 * Mirrors the worker postMessage interface: call(method, ...args) → result.
 */

import { getAccessToken } from '../auth.js';
import { getCollabState } from '../config.js';

const API_URL = import.meta.env.VITE_API_URL || 'https://api.sinsear.org';

/**
 * Send a handler method call to the API.
 * Returns the result from the handler (same shape as the worker).
 */
export async function remoteCall(method, ...args) {
  const state = getCollabState();
  if (!state?.treeId) throw new Error('No collaborative tree selected');

  const token = await getAccessToken();
  if (!token) throw new Error('Not authenticated — please sign in again');

  const apiUrl = state.apiUrl || API_URL;
  const res = await fetch(`${apiUrl}/trees/${state.treeId}/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ method, args }),
  });

  if (res.status === 401) {
    throw new Error('Session expired — please sign in again');
  }

  if (res.status === 400) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Bad request');
  }

  if (res.status === 403) {
    const err = await res.json().catch(() => ({}));
    // Best-effort UX: notify and trigger a sync so the role state catches up.
    // Dynamic imports avoid circular deps.
    try {
      const { showToast } = await import('../lib/shared/toast-store.js');
      showToast('Your role may have changed. Refresh the page to see the current state.');
    } catch {}
    try {
      const { syncDown } = await import('./db.js');
      syncDown().catch(() => {});
    } catch {}
    throw new Error(err.error || 'You do not have permission to do this');
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `API error: ${res.status}`);
  }

  const data = await res.json();
  return data.result;
}

/**
 * Fetch a tree management endpoint (not a handler proxy).
 */
export async function apiFetch(path, options = {}) {
  const state = getCollabState();
  const token = await getAccessToken();
  if (!token) throw new Error('Not authenticated');

  const apiUrl = state?.apiUrl || API_URL;
  const res = await fetch(`${apiUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...options.headers,
    },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `API error: ${res.status}`);
  }

  return res.json();
}

/**
 * Check if the API is reachable.
 */
export async function checkConnectivity() {
  try {
    const apiUrl = getCollabState()?.apiUrl || API_URL;
    const res = await fetch(`${apiUrl}/health`, { method: 'GET' });
    return res.ok;
  } catch {
    return false;
  }
}
