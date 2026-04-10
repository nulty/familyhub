/**
 * poll.js — Pure, dependency-injected polling core for collaborative tree
 * version changes. Intentionally has no DOM, auth, or db imports so it stays
 * trivially testable in the vitest Node environment.
 *
 * The DOM wrapper (startPolling / stopPolling) lives in ./collab.js, which is
 * the natural home for collab-mode lifecycle logic.
 *
 * Protocol: the server's GET /trees/:id/version endpoint returns { version }
 * with an ETag. Callers should send If-None-Match on subsequent requests so
 * Cloudflare's edge cache can short-circuit with 304. The injected
 * fetchVersion(lastKnown) function is expected to return { version: lastKnown }
 * on a 304 and { version: newNumber } on a 200. On a version change after the
 * first fetch, onChange() is invoked.
 */

/**
 * Create a poller with injected dependencies.
 *
 * @param {object} deps
 * @param {(lastKnown: number|null) => Promise<{ version: number }>} deps.fetchVersion
 *   Fetches the current version. Must return { version } matching lastKnown
 *   when the server returns 304.
 * @param {() => void} deps.onChange  Called when the version changes after the first fetch.
 * @param {number} [deps.intervalMs=15000]
 * @returns {{
 *   start: () => void,
 *   stop: () => void,
 *   pause: () => void,
 *   resume: () => void,
 *   tick: () => Promise<void>,
 *   getLastVersion: () => number|null,
 * }}
 */
export function createPoller({ fetchVersion, onChange, intervalMs = 15000 }) {
  let lastVersion = null;
  let timerId = null;
  let running = false;

  async function tick() {
    try {
      const { version } = await fetchVersion(lastVersion);
      if (version !== lastVersion) {
        const wasFirst = lastVersion === null;
        lastVersion = version;
        if (!wasFirst) onChange();
      }
    } catch {
      // Silent — the next tick will retry.
    }
  }

  function clearTimer() {
    if (timerId != null) {
      clearTimeout(timerId);
      timerId = null;
    }
  }

  function scheduleImmediate() {
    // Use setTimeout(..., 0) so fake-timer helpers like
    // runOnlyPendingTimersAsync() can flush the first tick deterministically
    // without also firing the periodic interval on the same flush.
    timerId = setTimeout(async () => {
      await tick();
      if (running) {
        timerId = setInterval(tick, intervalMs);
      }
    }, 0);
  }

  function start() {
    if (running) return;
    running = true;
    scheduleImmediate();
  }

  function stop() {
    running = false;
    clearTimer();
  }

  function pause() {
    if (!running) return;
    clearTimer();
  }

  function resume() {
    if (!running) return;
    clearTimer();
    scheduleImmediate();
  }

  function getLastVersion() {
    return lastVersion;
  }

  return { start, stop, pause, resume, tick, getLastVersion };
}
