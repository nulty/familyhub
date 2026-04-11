// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Hoisted mocks — vi.mock is hoisted above the imports by vitest.
const mocks = vi.hoisted(() => ({
  getCollabState: vi.fn(),
  setCollabState: vi.fn(),
  switchDatabase: vi.fn(async () => {}),
  clearDatabase: vi.fn(async () => {}),
  apiFetch: vi.fn(async () => ({ ok: true })),
  getCurrentUser: vi.fn(() => ({ id: 'USER01' })),
  emit: vi.fn(),
  COLLAB_MODE_CHANGED: 'COLLAB_MODE_CHANGED',
  DATA_CHANGED: 'DATA_CHANGED',
  stopPollingSpy: vi.fn(),
}));

vi.mock('../src/config.js', () => ({
  getCollabState: mocks.getCollabState,
  setCollabState: mocks.setCollabState,
  clearCollabState: vi.fn(),
  getMode: vi.fn(() => 'collab'),
}));

vi.mock('../src/db/db.js', () => ({
  initDB: vi.fn(),
  switchDatabase: mocks.switchDatabase,
  syncDown: vi.fn(async () => {}),
  bulk: { exportAll: vi.fn(async () => ({})), import: vi.fn(async () => {}) },
  nukeDatabase: vi.fn(),
  clearDatabase: mocks.clearDatabase,
}));

vi.mock('../src/db/remote.js', () => ({
  apiFetch: mocks.apiFetch,
  remoteCall: vi.fn(),
}));

vi.mock('../src/auth.js', () => ({
  isAuthenticated: vi.fn(() => true),
  signOut: vi.fn(),
  getCurrentUser: mocks.getCurrentUser,
  getAccessToken: vi.fn(async () => 'token'),
}));

vi.mock('../src/state.js', () => ({
  emit: mocks.emit,
  COLLAB_MODE_CHANGED: mocks.COLLAB_MODE_CHANGED,
  DATA_CHANGED: mocks.DATA_CHANGED,
  COLLAB_SYNC_STATUS: 'COLLAB_SYNC_STATUS',
  on: vi.fn(),
}));

vi.mock('../src/poll.js', () => ({
  createPoller: vi.fn(() => ({
    start: vi.fn(),
    stop: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    tick: vi.fn(async () => {}),
  })),
}));

vi.mock('../src/lib/shared/toast-store.js', () => ({
  showToast: vi.fn(),
}));

describe('disconnectFromTree', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCollabState.mockReturnValue({
      mode: 'collab',
      treeId: 'TREE01',
      treeName: 'Smith Family',
      userId: 'USER01',
    });
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('calls DELETE /trees/:id/members/:me with the current user id', async () => {
    const { disconnectFromTree } = await import('../src/collab.js');
    await disconnectFromTree();
    expect(mocks.apiFetch).toHaveBeenCalledWith(
      '/trees/TREE01/members/USER01',
      { method: 'DELETE' }
    );
  });

  it('switches the worker to the local DB and clears the collab cache file', async () => {
    const { disconnectFromTree } = await import('../src/collab.js');
    await disconnectFromTree();

    expect(mocks.switchDatabase).toHaveBeenCalledWith('familytree-local.db');
    expect(mocks.clearDatabase).toHaveBeenCalledWith('familytree-collab-TREE01.db');

    // switchDatabase MUST run before clearDatabase (you can't delete an open file).
    const switchOrder = mocks.switchDatabase.mock.invocationCallOrder[0];
    const clearOrder = mocks.clearDatabase.mock.invocationCallOrder[0];
    expect(switchOrder).toBeLessThan(clearOrder);
  });

  it('clears treeId/treeName and flips mode to local in collabState', async () => {
    const { disconnectFromTree } = await import('../src/collab.js');
    await disconnectFromTree();
    const stateArg = mocks.setCollabState.mock.calls.at(-1)[0];
    expect(stateArg.mode).toBe('local');
    expect(stateArg.treeId).toBeNull();
    expect(stateArg.treeName).toBeNull();
  });

  it('emits COLLAB_MODE_CHANGED and DATA_CHANGED after the switch', async () => {
    const { disconnectFromTree } = await import('../src/collab.js');
    await disconnectFromTree();
    expect(mocks.emit).toHaveBeenCalledWith('COLLAB_MODE_CHANGED', 'local');
    expect(mocks.emit).toHaveBeenCalledWith('DATA_CHANGED');
  });

  it('throws without touching local state when the server call fails', async () => {
    mocks.apiFetch.mockRejectedValueOnce(new Error('network boom'));
    const { disconnectFromTree } = await import('../src/collab.js');
    await expect(disconnectFromTree()).rejects.toThrow('network boom');

    expect(mocks.switchDatabase).not.toHaveBeenCalled();
    expect(mocks.clearDatabase).not.toHaveBeenCalled();
    expect(mocks.setCollabState).not.toHaveBeenCalled();
  });
});
