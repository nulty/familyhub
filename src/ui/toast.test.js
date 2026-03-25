import { describe, it, expect, beforeEach, vi } from 'vitest';
import { showToast } from './toast.js';
import { toasts } from '../lib/shared/toast-store.js';
import { get } from 'svelte/store';

describe('showToast', () => {
  beforeEach(() => {
    toasts.set([]);
  });

  it('adds a toast to the store', () => {
    showToast('Hello');
    const items = get(toasts);
    expect(items).toHaveLength(1);
    expect(items[0].message).toBe('Hello');
  });

  it('sets the message text', () => {
    showToast('Test message');
    const items = get(toasts);
    expect(items[0].message).toBe('Test message');
  });

  it('removes toast after duration', () => {
    vi.useFakeTimers();
    showToast('Bye', 1000);

    expect(get(toasts)).toHaveLength(1);

    vi.advanceTimersByTime(1100);

    expect(get(toasts)).toHaveLength(0);
    vi.useRealTimers();
  });
});
