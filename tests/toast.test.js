import { describe, it, expect, beforeEach, vi } from 'vitest';
import { showToast, updateToast, dismissToast, toasts } from '../src/lib/shared/toast-store.js';
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

describe('updateToast', () => {
  beforeEach(() => {
    toasts.set([]);
  });

  it('updates the message of an existing toast', () => {
    const id = showToast('initial', 0);
    updateToast(id, 'updated');
    const list = get(toasts);
    expect(list).toHaveLength(1);
    expect(list[0].message).toBe('updated');
    dismissToast(id);
  });

  it('does nothing if toast id does not exist', () => {
    const id = showToast('hello', 0);
    updateToast(999, 'nope');
    const list = get(toasts);
    expect(list[0].message).toBe('hello');
    dismissToast(id);
  });
});

describe('dismissToast', () => {
  beforeEach(() => {
    toasts.set([]);
  });

  it('removes a toast by id', () => {
    const id = showToast('bye', 0);
    expect(get(toasts)).toHaveLength(1);
    dismissToast(id);
    expect(get(toasts)).toHaveLength(0);
  });
});

describe('persistent toast (duration = 0)', () => {
  beforeEach(() => {
    toasts.set([]);
  });

  it('does not auto-dismiss when duration is 0', () => {
    vi.useFakeTimers();
    const id = showToast('persistent', 0);
    vi.advanceTimersByTime(10000);
    expect(get(toasts)).toHaveLength(1);
    dismissToast(id);
    vi.useRealTimers();
  });
});
