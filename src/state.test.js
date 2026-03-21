import { describe, it, expect, vi } from 'vitest';
import { on, emit, PERSON_SELECTED, DATA_CHANGED } from './state.js';

describe('event bus', () => {
  it('fires listener with payload on emit', () => {
    const fn = vi.fn();
    const unsub = on('TEST_EVENT', fn);
    emit('TEST_EVENT', { id: '123' });
    expect(fn).toHaveBeenCalledWith({ id: '123' });
    unsub();
  });

  it('fires multiple listeners on same event', () => {
    const fn1 = vi.fn();
    const fn2 = vi.fn();
    const unsub1 = on('MULTI', fn1);
    const unsub2 = on('MULTI', fn2);
    emit('MULTI', 'data');
    expect(fn1).toHaveBeenCalledWith('data');
    expect(fn2).toHaveBeenCalledWith('data');
    unsub1();
    unsub2();
  });

  it('unsubscribe removes listener', () => {
    const fn = vi.fn();
    const unsub = on('UNSUB_TEST', fn);
    unsub();
    emit('UNSUB_TEST', 'data');
    expect(fn).not.toHaveBeenCalled();
  });

  it('emit with no listeners does not throw', () => {
    expect(() => emit('NO_LISTENERS', 'data')).not.toThrow();
  });

  it('listener error does not block other listeners', () => {
    const fn1 = vi.fn(() => { throw new Error('boom'); });
    const fn2 = vi.fn();
    const unsub1 = on('ERR_TEST', fn1);
    const unsub2 = on('ERR_TEST', fn2);
    emit('ERR_TEST', 'data');
    expect(fn2).toHaveBeenCalledWith('data');
    unsub1();
    unsub2();
  });

  it('exports event name constants as strings', () => {
    expect(typeof PERSON_SELECTED).toBe('string');
    expect(typeof DATA_CHANGED).toBe('string');
  });
});
