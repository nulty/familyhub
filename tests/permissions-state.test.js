import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { currentRole, canWrite, canManage, setCurrentRole } from '../src/state.js';

describe('role-derived stores', () => {
  beforeEach(() => setCurrentRole(null));

  it('undetermined role (null) → fail safe: canWrite=false, canManage=false', () => {
    expect(get(currentRole)).toBeNull();
    expect(get(canWrite)).toBe(false);
    expect(get(canManage)).toBe(false);
  });

  it('local mode (role="local") → canWrite=true, canManage=true', () => {
    setCurrentRole('local');
    expect(get(canWrite)).toBe(true);
    expect(get(canManage)).toBe(true);
  });

  it('viewer → canWrite=false, canManage=false', () => {
    setCurrentRole('viewer');
    expect(get(canWrite)).toBe(false);
    expect(get(canManage)).toBe(false);
  });

  it('editor → canWrite=true, canManage=false', () => {
    setCurrentRole('editor');
    expect(get(canWrite)).toBe(true);
    expect(get(canManage)).toBe(false);
  });

  it('owner → canWrite=true, canManage=true', () => {
    setCurrentRole('owner');
    expect(get(canWrite)).toBe(true);
    expect(get(canManage)).toBe(true);
  });
});
