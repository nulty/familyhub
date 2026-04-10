/**
 * main.js — Application entry point.
 * Acquires an exclusive Web Lock to prevent multiple tabs, then mounts the app.
 */
import { mount } from 'svelte';
import App from './lib/components/App.svelte';

const LOCK_NAME = 'familyhub-single-tab';

async function start() {
  // Skip lock check during OAuth callback — the redirect releases and re-acquires the lock
  const isAuthCallback = new URLSearchParams(window.location.search).has('code');

  // Check if another tab already holds the lock
  const locks = await navigator.locks.query();
  const held = locks.held?.some(l => l.name === LOCK_NAME);

  if (held && !isAuthCallback) {
    document.body.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;height:100vh;padding:2rem;text-align:center;font-family:system-ui,sans-serif;color:#1a1a1a">
        <div>
          <h2 style="margin-bottom:0.5rem">Sinsear is open in another tab</h2>
          <p style="color:#666;margin-bottom:1.5rem">The database can only be used by one tab at a time.<br>Close the other tab and reload this one.</p>
          <button onclick="location.reload()" style="padding:8px 20px;border:1px solid #e2e2e2;border-radius:6px;background:#2563eb;color:white;font-size:14px;cursor:pointer">Reload</button>
        </div>
      </div>`;
    return;
  }

  // Acquire the lock for the lifetime of this tab
  navigator.locks.request(LOCK_NAME, () => new Promise(() => {}));

  mount(App, { target: document.body });
}

start();
