// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { getConfig, setConfig } from './config.js';

describe('config', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns default when key does not exist', () => {
    expect(getConfig('missing', 42)).toBe(42);
  });

  it('returns null default when no default provided', () => {
    expect(getConfig('missing')).toBeNull();
  });

  it('stores and retrieves a string', () => {
    setConfig('name', 'Alice');
    expect(getConfig('name')).toBe('Alice');
  });

  it('stores and retrieves an object', () => {
    setConfig('prefs', { color: 'blue', size: 10 });
    expect(getConfig('prefs')).toEqual({ color: 'blue', size: 10 });
  });

  it('stores and retrieves a boolean', () => {
    setConfig('flag', false);
    expect(getConfig('flag', true)).toBe(false);
  });

  it('overwrites existing value', () => {
    setConfig('x', 1);
    setConfig('x', 2);
    expect(getConfig('x')).toBe(2);
  });

  it('uses familyhub: prefix in localStorage', () => {
    setConfig('test', 'val');
    expect(localStorage.getItem('familyhub:test')).toBe('"val"');
  });
});
