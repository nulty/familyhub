// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { showToast } from './toast.js';

describe('showToast', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="toast-root"></div>';
  });

  it('creates a toast element in #toast-root', () => {
    showToast('Hello');
    const root = document.getElementById('toast-root');
    expect(root.querySelector('.toast')).toBeTruthy();
  });

  it('sets the message text', () => {
    showToast('Test message');
    const toast = document.querySelector('.toast');
    expect(toast.textContent).toBe('Test message');
  });

  it('removes toast after duration', () => {
    vi.useFakeTimers();
    showToast('Bye', 1000);

    // Flush the rAF that adds toast-visible
    vi.advanceTimersByTime(0);

    // Advance past duration
    vi.advanceTimersByTime(1100);

    // Trigger transitionend to remove element
    const toast = document.querySelector('.toast');
    if (toast) {
      toast.dispatchEvent(new Event('transitionend'));
    }

    expect(document.querySelector('.toast')).toBeNull();
    vi.useRealTimers();
  });
});
