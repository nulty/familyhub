import { describe, it, expect } from 'vitest';
import { setupTestDB } from './db-helpers.js';

// A corrupt parent_child edge that makes a person their own ancestor sends the
// family-chart ancestry/progeny walk into an infinite loop and freezes the app.
// addParentChild must refuse to create such an edge.
describe('addParentChild cycle guard', () => {
  async function people(handlers, ids) {
    for (const id of ids) await handlers.createPerson({ id, given_name: id, surname: 'X' });
  }

  it('allows a normal parent -> child edge', async () => {
    const { handlers } = setupTestDB();
    await people(handlers, ['A', 'B']);
    const rel = await handlers.addParentChild('R1', 'A', 'B');
    expect(rel.person_a_id).toBe('A');
    expect(rel.person_b_id).toBe('B');
  });

  it('rejects making a person their own parent', async () => {
    const { handlers } = setupTestDB();
    await people(handlers, ['A']);
    await expect(handlers.addParentChild('R1', 'A', 'A')).rejects.toThrow();
  });

  it('rejects an edge that would close an ancestry loop', async () => {
    const { handlers, helpers } = setupTestDB();
    const { get } = helpers;
    await people(handlers, ['A', 'B', 'C']);
    await handlers.addParentChild('R1', 'A', 'B'); // A parent of B
    await handlers.addParentChild('R2', 'B', 'C'); // B parent of C
    // C as parent of A would make A its own ancestor (A->B->C->A).
    await expect(handlers.addParentChild('R3', 'C', 'A')).rejects.toThrow();
    // and nothing was inserted
    const stray = get('SELECT id FROM relationships WHERE id = ?', ['R3']);
    expect(stray).toBeNull();
  });

  it('rejects the reciprocal reverse edge (the real bug: two same-named people)', async () => {
    const { handlers } = setupTestDB();
    await people(handlers, ['MOTHER', 'DAUGHTER']);
    await handlers.addParentChild('R1', 'MOTHER', 'DAUGHTER'); // legit
    // Wrongly adding DAUGHTER as a parent of MOTHER must be refused.
    await expect(handlers.addParentChild('R2', 'DAUGHTER', 'MOTHER')).rejects.toThrow();
  });

  it('terminates (does not hang) when the existing data already contains a cycle', async () => {
    const { handlers, helpers } = setupTestDB();
    const { run } = helpers;
    await people(handlers, ['X', 'Y', 'Z']);
    // Plant a pre-existing corrupt cycle X<->Y directly, bypassing the guard.
    run(`INSERT INTO relationships (id, person_a_id, person_b_id, type, created_at) VALUES (?,?,?,'parent_child',?)`, ['BAD1', 'X', 'Y', 0]);
    run(`INSERT INTO relationships (id, person_a_id, person_b_id, type, created_at) VALUES (?,?,?,'parent_child',?)`, ['BAD2', 'Y', 'X', 0]);
    // Adding Z as a parent of X must still return promptly (visited-guarded walk),
    // since Z is not part of the cycle.
    const rel = await handlers.addParentChild('R1', 'Z', 'X');
    expect(rel.person_a_id).toBe('Z');
  });
});

// Defense-in-depth: even if corrupt cyclic data already exists (older DBs,
// pre-guard edits), the graph handed to family-chart must be acyclic so its
// recursive layout can't loop forever.
describe('getGraphData breaks ancestry cycles', () => {
  function isOwnAncestor(nodes, id) {
    const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
    const seen = new Set();
    const stack = [];
    const start = byId[id];
    for (const p of [start.rels.father, start.rels.mother]) if (p) stack.push(p);
    while (stack.length) {
      const n = stack.pop();
      if (n === id) return true;
      if (seen.has(n)) continue;
      seen.add(n);
      const node = byId[n];
      if (!node) continue;
      for (const p of [node.rels.father, node.rels.mother]) if (p) stack.push(p);
    }
    return false;
  }

  it('never returns a node that is its own ancestor', async () => {
    const { handlers, helpers } = setupTestDB();
    const { run } = helpers;
    await handlers.createPerson({ id: 'A', given_name: 'A', surname: 'X', gender: 'M' });
    await handlers.createPerson({ id: 'B', given_name: 'B', surname: 'X', gender: 'F' });
    // Plant a corrupt cycle A<->B directly.
    run(`INSERT INTO relationships (id, person_a_id, person_b_id, type, created_at) VALUES (?,?,?,'parent_child',?)`, ['BAD1', 'A', 'B', 0]);
    run(`INSERT INTO relationships (id, person_a_id, person_b_id, type, created_at) VALUES (?,?,?,'parent_child',?)`, ['BAD2', 'B', 'A', 0]);

    const nodes = await handlers.getGraphData();
    expect(isOwnAncestor(nodes, 'A')).toBe(false);
    expect(isOwnAncestor(nodes, 'B')).toBe(false);
  });
});
