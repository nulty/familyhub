/**
 * feedback-queue.js
 * Holds feedback reports that could not be delivered (offline, or a server error)
 * and retries them later.
 *
 * The app is explicitly offline-capable, so a "could not send" dead end on the one
 * screen where someone is already frustrated is the worst possible outcome. Reports
 * are queued locally and flushed on next boot and whenever the browser comes online.
 *
 * Modelled on GeocodeQueue (src/util/geocode-queue.js) so there is one queue idiom
 * in the codebase, not two.
 */
const STORAGE_VERSION = 1;
const STORAGE_KEY = 'feedback_queue';

/** Give up after this many attempts and let the UI offer a mailto: fallback. */
export const MAX_ATTEMPTS = 5;

export class FeedbackQueue {
  #storage;

  constructor(storage = localStorage) {
    this.#storage = storage;
  }

  #load() {
    const raw = this.#storage.getItem(STORAGE_KEY);
    if (!raw) return { version: STORAGE_VERSION, items: [] };
    try {
      const data = JSON.parse(raw);
      if (data.version !== STORAGE_VERSION) return { version: STORAGE_VERSION, items: [] };
      return data;
    } catch {
      return { version: STORAGE_VERSION, items: [] };
    }
  }

  #save(data) {
    this.#storage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  getItems() {
    return this.#load().items;
  }

  count() {
    return this.#load().items.length;
  }

  add(report) {
    const data = this.#load();
    data.items.push({ ...report, attempts: 0, queued_at: Date.now() });
    this.#save(data);
  }

  remove(queuedAt) {
    const data = this.#load();
    data.items = data.items.filter(i => i.queued_at !== queuedAt);
    this.#save(data);
  }

  /** Record a failed attempt; drops the item once MAX_ATTEMPTS is reached. */
  recordFailure(queuedAt) {
    const data = this.#load();
    const item = data.items.find(i => i.queued_at === queuedAt);
    if (!item) return false;

    item.attempts += 1;
    const exhausted = item.attempts >= MAX_ATTEMPTS;
    if (exhausted) data.items = data.items.filter(i => i.queued_at !== queuedAt);

    this.#save(data);
    return exhausted;
  }

  clear() {
    this.#save({ version: STORAGE_VERSION, items: [] });
  }
}
