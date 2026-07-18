import { describe, it, expect, beforeEach } from 'vitest';
import { FeedbackQueue, MAX_ATTEMPTS } from '../src/util/feedback-queue.js';

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

const REPORT = { kind: 'bug', message: 'it broke', email: null };

describe('FeedbackQueue', () => {
  let storage;
  let queue;

  beforeEach(() => {
    storage = memoryStorage();
    queue = new FeedbackQueue(storage);
  });

  it('starts empty', () => {
    expect(queue.count()).toBe(0);
    expect(queue.getItems()).toEqual([]);
  });

  it('stores a report with attempt tracking', () => {
    queue.add(REPORT);
    const [item] = queue.getItems();
    expect(item.message).toBe('it broke');
    expect(item.attempts).toBe(0);
    expect(item.queued_at).toBeTypeOf('number');
  });

  it('removes a delivered report', () => {
    queue.add(REPORT);
    queue.remove(queue.getItems()[0].queued_at);
    expect(queue.count()).toBe(0);
  });

  it('increments attempts on failure and keeps the item', () => {
    queue.add(REPORT);
    const { queued_at } = queue.getItems()[0];

    expect(queue.recordFailure(queued_at)).toBe(false);
    expect(queue.getItems()[0].attempts).toBe(1);
    expect(queue.count()).toBe(1);
  });

  it('drops the item once MAX_ATTEMPTS is reached', () => {
    queue.add(REPORT);
    const { queued_at } = queue.getItems()[0];

    let exhausted = false;
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      exhausted = queue.recordFailure(queued_at);
    }

    expect(exhausted).toBe(true);
    expect(queue.count()).toBe(0);
  });

  it('survives a round trip through storage', () => {
    queue.add(REPORT);
    expect(new FeedbackQueue(storage).count()).toBe(1);
  });

  it('discards corrupt stored data rather than throwing', () => {
    storage.setItem('feedback_queue', 'not json');
    expect(queue.getItems()).toEqual([]);
  });

  it('discards data written by a different storage version', () => {
    storage.setItem('feedback_queue', JSON.stringify({ version: 99, items: [REPORT] }));
    expect(queue.getItems()).toEqual([]);
  });

  it('recordFailure is a no-op for an unknown item', () => {
    expect(queue.recordFailure(12345)).toBe(false);
  });
});
