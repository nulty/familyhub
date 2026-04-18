import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GeocodeQueue } from '../src/util/geocode-queue.js';

// Mock localStorage
const store = {};
const mockStorage = {
  getItem: vi.fn(k => store[k] ?? null),
  setItem: vi.fn((k, v) => { store[k] = v; }),
  removeItem: vi.fn(k => { delete store[k]; }),
};

describe('GeocodeQueue', () => {
  let queue;

  beforeEach(() => {
    Object.keys(store).forEach(k => delete store[k]);
    vi.clearAllMocks();
    queue = new GeocodeQueue('tree_123', mockStorage);
  });

  it('starts empty', () => {
    expect(queue.getItems()).toEqual([]);
    expect(queue.count()).toBe(0);
  });

  it('adds a result item', () => {
    queue.addItem({
      place_id: 'p1',
      place_name: 'Dublin',
      query: 'Dublin',
      status: 'ready',
      results: [{ lat: 53.35, lon: -6.26, display_name: 'Dublin, Ireland', address: { city: 'Dublin', country: 'Ireland' }, importance: 0.7, addresstype: 'city' }],
    });
    expect(queue.count()).toBe(1);
    expect(queue.getItems()[0].place_id).toBe('p1');
  });

  it('adds a no_results item', () => {
    queue.addItem({ place_id: 'p2', place_name: 'Nowhere', query: 'Nowhere', status: 'no_results', results: [] });
    const items = queue.getItems();
    expect(items[0].status).toBe('no_results');
  });

  it('removes an item', () => {
    queue.addItem({ place_id: 'p1', place_name: 'Dublin', query: 'Dublin', status: 'ready', results: [] });
    queue.removeItem('p1');
    expect(queue.count()).toBe(0);
  });

  it('updates an item', () => {
    queue.addItem({ place_id: 'p1', place_name: 'X', query: 'X', status: 'no_results', results: [] });
    queue.updateItem('p1', { status: 'ready', results: [{ lat: 1, lon: 2 }] });
    expect(queue.getItems()[0].status).toBe('ready');
    expect(queue.getItems()[0].results.length).toBe(1);
  });

  it('persists to and loads from storage', () => {
    queue.addItem({ place_id: 'p1', place_name: 'Dublin', query: 'Dublin', status: 'ready', results: [] });

    // Create a new queue pointing at the same storage
    const queue2 = new GeocodeQueue('tree_123', mockStorage);
    expect(queue2.count()).toBe(1);
  });

  it('clear removes all items', () => {
    queue.addItem({ place_id: 'p1', place_name: 'A', query: 'A', status: 'ready', results: [] });
    queue.addItem({ place_id: 'p2', place_name: 'B', query: 'B', status: 'ready', results: [] });
    queue.clear();
    expect(queue.count()).toBe(0);
  });

  it('hasPlace checks if a place is in the queue', () => {
    queue.addItem({ place_id: 'p1', place_name: 'A', query: 'A', status: 'ready', results: [] });
    expect(queue.hasPlace('p1')).toBe(true);
    expect(queue.hasPlace('p2')).toBe(false);
  });

  it('isolates queues by tree ID', () => {
    queue.addItem({ place_id: 'p1', place_name: 'A', query: 'A', status: 'ready', results: [] });
    const otherQueue = new GeocodeQueue('tree_456', mockStorage);
    expect(otherQueue.count()).toBe(0);
  });
});
