const STORAGE_VERSION = 1;

// Item statuses — the funnel stages a queued place moves through:
//   'pending'    — enqueued, candidates not yet fetched (S1 input)
//   'ready'      — 2+ candidates fetched, awaiting review (S2)
//   'correction' — no candidates, or rejected in review (S3)
// A place leaves the queue only by being organized (decomposed/typed) or deleted.
export const QUEUE_STATUSES = ['pending', 'ready', 'correction'];

export class GeocodeQueue {
  #storageKey;
  #storage;

  constructor(treeId, storage = localStorage) {
    this.#storageKey = `geocode_queue_${treeId}`;
    this.#storage = storage;
  }

  #load() {
    const raw = this.#storage.getItem(this.#storageKey);
    if (!raw) return { version: STORAGE_VERSION, items: [] };
    try {
      const data = JSON.parse(raw);
      if (data.version !== STORAGE_VERSION) return { version: STORAGE_VERSION, items: [] };
      // Legacy status from before the correction stage existed
      for (const item of data.items) {
        if (item.status === 'no_results') item.status = 'correction';
      }
      return data;
    } catch {
      return { version: STORAGE_VERSION, items: [] };
    }
  }

  #save(data) {
    this.#storage.setItem(this.#storageKey, JSON.stringify(data));
  }

  getItems() {
    return this.#load().items;
  }

  count() {
    return this.#load().items.length;
  }

  countByStatus() {
    const counts = { pending: 0, ready: 0, correction: 0 };
    for (const item of this.#load().items) {
      if (item.status in counts) counts[item.status]++;
    }
    return counts;
  }

  hasPlace(placeId) {
    return this.#load().items.some(i => i.place_id === placeId);
  }

  getStatus(placeId) {
    return this.#load().items.find(i => i.place_id === placeId)?.status ?? null;
  }

  addItem(item) {
    const data = this.#load();
    data.items.push(item);
    this.#save(data);
  }

  /**
   * Add or replace by place_id — used when a fetch resolves a 'pending' entry
   * so a place never appears twice in the queue.
   */
  upsertItem(item) {
    const data = this.#load();
    const idx = data.items.findIndex(i => i.place_id === item.place_id);
    if (idx >= 0) data.items[idx] = { ...data.items[idx], ...item };
    else data.items.push(item);
    this.#save(data);
  }

  /**
   * Enqueue places as 'pending' (awaiting fetch). Skips places that already
   * have coordinates or are already queued. Returns the number added.
   */
  addPendingPlaces(places) {
    const data = this.#load();
    const queued = new Set(data.items.map(i => i.place_id));
    let added = 0;
    for (const p of places) {
      if (p.latitude != null || p.longitude != null) continue;
      if (queued.has(p.id)) continue;
      data.items.push({ place_id: p.id, place_name: p.name, query: p.name, status: 'pending', results: [] });
      queued.add(p.id);
      added++;
    }
    if (added > 0) this.#save(data);
    return added;
  }

  removeItem(placeId) {
    const data = this.#load();
    data.items = data.items.filter(i => i.place_id !== placeId);
    this.#save(data);
  }

  updateItem(placeId, fields) {
    const data = this.#load();
    const item = data.items.find(i => i.place_id === placeId);
    if (item) Object.assign(item, fields);
    this.#save(data);
  }

  clear() {
    this.#storage.removeItem(this.#storageKey);
  }
}
