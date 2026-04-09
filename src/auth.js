/**
 * auth.js — Google OAuth redirect flow + JWT management.
 * Stores tokens in localStorage via config.js.
 */

import { getCollabState, setCollabState, clearCollabState } from './config.js';

const API_URL = import.meta.env.VITE_API_URL || 'https://api.sinsear.org';
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

/**
 * Redirect to Google's OAuth consent screen.
 */
export function startGoogleSignIn() {
  const redirectUri = `${window.location.origin}/auth/callback`;
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    prompt: 'select_account',
  });
  window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

/**
 * Handle the OAuth callback — exchange code for tokens.
 */
export async function handleAuthCallback(code) {
  const redirectUri = `${window.location.origin}/auth/callback`;
  const res = await fetch(`${API_URL}/auth/google`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, redirectUri }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Authentication failed');
  }

  const data = await res.json();
  setCollabState({
    mode: 'local',
    apiUrl: API_URL,
    jwt: data.accessToken,
    refreshToken: data.refreshToken,
    userId: data.user.id,
    userName: data.user.name,
    userEmail: data.user.email,
  });

  return data.user;
}

/**
 * Get the current JWT, refreshing if needed.
 * Returns null if not authenticated.
 */
export async function getAccessToken() {
  const state = getCollabState();
  if (!state?.jwt) return null;

  try {
    const payload = JSON.parse(atob(state.jwt.split('.')[1]));
    const expiresAt = payload.exp * 1000;
    const fiveMinutes = 5 * 60 * 1000;
    if (Date.now() < expiresAt - fiveMinutes) {
      return state.jwt;
    }
  } catch {}

  return refreshAccessToken();
}

async function refreshAccessToken() {
  const state = getCollabState();
  if (!state?.refreshToken) {
    clearCollabState();
    return null;
  }

  const apiUrl = state.apiUrl || API_URL;
  try {
    const res = await fetch(`${apiUrl}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: state.refreshToken }),
    });

    if (!res.ok) {
      clearCollabState();
      return null;
    }

    const data = await res.json();
    setCollabState({
      ...state,
      jwt: data.accessToken,
      refreshToken: data.refreshToken,
      userName: data.user.name,
    });

    return data.accessToken;
  } catch {
    return null;
  }
}

export function signOut() {
  clearCollabState();
}

export function isAuthenticated() {
  const state = getCollabState();
  return !!(state?.jwt && state?.refreshToken);
}

export function getCurrentUser() {
  const state = getCollabState();
  if (!state?.userId) return null;
  return {
    id: state.userId,
    name: state.userName,
    email: state.userEmail,
  };
}
