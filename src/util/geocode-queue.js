const STORAGE_VERSION = 1;

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

  hasPlace(placeId) {
    return this.#load().items.some(i => i.place_id === placeId);
  }

  addItem(item) {
    const data = this.#load();
    data.items.push(item);
    this.#save(data);
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
