import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createPoller } from './poll.js';

describe('createPoller', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('does not fire onChange on the first fetch (initial sync already done)', async () => {
    const fetchVersion = vi.fn().mockResolvedValue({ version: 100 });
    const onChange = vi.fn();

    const poller = createPoller({ fetchVersion, onChange, intervalMs: 1000 });
    poller.start();
    await vi.runOnlyPendingTimersAsync();

    expect(fetchVersion).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalled();
    expect(poller.getLastVersion()).toBe(100);
  });

  it('fires onChange when the version changes', async () => {
    const fetchVersion = vi.fn()
      .mockResolvedValueOnce({ version: 100 })
      .mockResolvedValueOnce({ version: 200 });
    const onChange = vi.fn();

    const poller = createPoller({ fetchVersion, onChange, intervalMs: 1000 });
    poller.start();
    await vi.runOnlyPendingTimersAsync(); // first immediate tick

    await vi.advanceTimersByTimeAsync(1000);

    expect(fetchVersion).toHaveBeenCalledTimes(2);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(poller.getLastVersion()).toBe(200);
  });

  it('does not fire onChange when the version is unchanged (304 path)', async () => {
    // fetchVersion returns the same version each time (simulates 304 → lastKnown)
    const fetchVersion = vi.fn()
      .mockResolvedValueOnce({ version: 100 })
      .mockResolvedValueOnce({ version: 100 });
    const onChange = vi.fn();

    const poller = createPoller({ fetchVersion, onChange, intervalMs: 1000 });
    poller.start();
    await vi.runOnlyPendingTimersAsync();
    await vi.advanceTimersByTimeAsync(1000);

    expect(onChange).not.toHaveBeenCalled();
  });

  it('swallows fetch errors (retries silently on next tick)', async () => {
    const fetchVersion = vi.fn()
      .mockRejectedValueOnce(new Error('network fail'))
      .mockResolvedValueOnce({ version: 100 });
    const onChange = vi.fn();

    const poller = createPoller({ fetchVersion, onChange, intervalMs: 1000 });
    poller.start();
    await vi.runOnlyPendingTimersAsync();

    // No throw, no onChange yet (first successful fetch = initial)
    expect(onChange).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchVersion).toHaveBeenCalledTimes(2);
    expect(poller.getLastVersion()).toBe(100);
  });

  it('stop() cancels the interval and prevents further ticks', async () => {
    const fetchVersion = vi.fn().mockResolvedValue({ version: 100 });
    const onChange = vi.fn();

    const poller = createPoller({ fetchVersion, onChange, intervalMs: 1000 });
    poller.start();
    await vi.runOnlyPendingTimersAsync();

    poller.stop();
    await vi.advanceTimersByTimeAsync(5000);

    expect(fetchVersion).toHaveBeenCalledTimes(1);
  });

  it('pause() stops ticking but preserves lastVersion; resume() kicks an immediate tick', async () => {
    const fetchVersion = vi.fn()
      .mockResolvedValueOnce({ version: 100 }) // initial
      .mockResolvedValueOnce({ version: 200 }); // resume tick
    const onChange = vi.fn();

    const poller = createPoller({ fetchVersion, onChange, intervalMs: 1000 });
    poller.start();
    await vi.runOnlyPendingTimersAsync();

    poller.pause();
    await vi.advanceTimersByTimeAsync(5000);
    expect(fetchVersion).toHaveBeenCalledTimes(1);
    expect(poller.getLastVersion()).toBe(100);

    poller.resume();
    await vi.runOnlyPendingTimersAsync();
    expect(fetchVersion).toHaveBeenCalledTimes(2);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(poller.getLastVersion()).toBe(200);
  });

  it('start() is idempotent — a second start is a no-op', async () => {
    const fetchVersion = vi.fn().mockResolvedValue({ version: 100 });
    const onChange = vi.fn();

    const poller = createPoller({ fetchVersion, onChange, intervalMs: 1000 });
    poller.start();
    poller.start();
    await vi.runOnlyPendingTimersAsync();

    expect(fetchVersion).toHaveBeenCalledTimes(1);
  });
});
