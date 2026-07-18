/**
 * feedback.js
 * Submits feedback reports to the API, with offline queueing and retry.
 */
import { FeedbackQueue } from './feedback-queue.js';
import { getAccessToken } from '../auth.js';

const API_URL = import.meta.env.VITE_API_URL || 'https://api.sinsear.org';

export const MAX_MESSAGE_LENGTH = 5000;

const queue = new FeedbackQueue();

/**
 * POST one report. Resolves true on success.
 * A 4xx is a permanent rejection (bad payload) — not worth retrying, so it throws.
 * Network errors and 5xx are transient and reported as false so the caller queues.
 */
async function post(report) {
  const headers = { 'Content-Type': 'application/json' };

  // Attribution only — the endpoint is public and works fine without a token.
  try {
    const token = await getAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  } catch {
    // Not signed in, or the refresh failed. Submit anonymously.
  }

  const res = await fetch(`${API_URL}/feedback`, {
    method: 'POST',
    headers,
    body: JSON.stringify(report),
  });

  if (res.ok) return true;

  if (res.status >= 400 && res.status < 500) {
    const { error } = await res.json().catch(() => ({}));
    const err = new Error(error || 'Your report could not be sent.');
    err.permanent = true;
    throw err;
  }

  return false;
}

/**
 * Send a report, queueing it for retry if the network is unavailable.
 * @returns {Promise<'sent' | 'queued'>}
 * @throws when the server permanently rejects the payload (4xx).
 */
export async function submitFeedback(report) {
  if (!navigator.onLine) {
    queue.add(report);
    return 'queued';
  }

  try {
    if (await post(report)) return 'sent';
  } catch (e) {
    if (e.permanent) throw e;
  }

  queue.add(report);
  return 'queued';
}

/**
 * Attempt to deliver everything queued. Silent by design — this runs on boot and
 * on 'online', where surfacing errors would be noise the user cannot act on.
 * @returns {Promise<{ sent: number, failed: number, exhausted: number }>}
 */
export async function flushQueue() {
  const result = { sent: 0, failed: 0, exhausted: 0 };
  if (!navigator.onLine) return result;

  for (const item of queue.getItems()) {
    const { attempts, queued_at, ...report } = item;
    try {
      if (await post(report)) {
        queue.remove(queued_at);
        result.sent++;
        continue;
      }
      if (queue.recordFailure(queued_at)) result.exhausted++;
      else result.failed++;
    } catch (e) {
      // Permanently rejected — retrying will never help, so drop it.
      queue.remove(queued_at);
      result.exhausted++;
    }
  }

  return result;
}

export function queuedCount() {
  return queue.count();
}

/** Retry queued reports on boot and whenever connectivity returns. */
export function initFeedbackRetry() {
  flushQueue();
  window.addEventListener('online', () => flushQueue());
}
