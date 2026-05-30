import { describe, it, expect } from 'vitest';
import { setupTestDB } from './db-helpers.js';

// Places form a hierarchy via parent_id, assigned through a same-name-prone
// picker / organize wizard. A cyclic parent chain makes resolvePlaceName (which
// walks parents to build the full place name) loop forever and freeze the app —
// the same bug class as the parent_child ancestry cycle.
describe('place hierarchy cycle guard', () => {
  it('updatePlace allows a normal re-parent', async () => {
    const { handlers } = setupTestDB();
    await handlers.createPlace({ id: 'PL1', name: 'Ireland', type: 'country' });
    await handlers.createPlace({ id: 'PL2', name: 'Leinster', type: 'province' });
    const updated = await handlers.updatePlace('PL2', { parent_id: 'PL1' });
    expect(updated.parent_id).toBe('PL1');
  });

  it('updatePlace rejects making a place its own parent', async () => {
    const { handlers } = setupTestDB();
    await handlers.createPlace({ id: 'PL1', name: 'Ireland' });
    await expect(handlers.updatePlace('PL1', { parent_id: 'PL1' })).rejects.toThrow();
  });

  it('updatePlace rejects a parent that is already a descendant (would loop)', async () => {
    const { handlers } = setupTestDB();
    await handlers.createPlace({ id: 'PL1', name: 'Ireland' });
    await handlers.createPlace({ id: 'PL2', name: 'Leinster', parent_id: 'PL1' });
    await handlers.createPlace({ id: 'PL3', name: 'Dublin', parent_id: 'PL2' });
    // Making PL1's parent PL3 closes the loop PL1->PL3->PL2->PL1.
    await expect(handlers.updatePlace('PL1', { parent_id: 'PL3' })).rejects.toThrow();
  });

  it('resolvePlaceName terminates when the data already contains a place cycle', async () => {
    const { handlers, helpers } = setupTestDB();
    const { run } = helpers;
    await handlers.createPlace({ id: 'PL1', name: 'Ireland' });
    await handlers.createPlace({ id: 'PL2', name: 'Leinster', parent_id: 'PL1' });
    // Plant a corrupt cycle PL1 -> PL2 -> PL1 directly, bypassing the guard.
    run(`UPDATE places SET parent_id = ? WHERE id = ?`, ['PL2', 'PL1']);

    await handlers.createPerson({ id: 'P1', given_name: 'Tom', surname: 'Gaffney' });
    await handlers.createEvent({ id: 'E1', person_id: 'P1', place: 'Ireland', place_id: 'PL1' });

    // Must not hang; the visited-guarded walk breaks the cycle.
    const result = await handlers.getPersonWithEvents('P1');
    expect(result.events).toHaveLength(1);
    expect(result.events[0].place).toBe('Ireland, Leinster');
  }, 3000);
});
