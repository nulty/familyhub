import { describe, it, expect } from 'vitest';
import { planChildRelationships } from '../src/lib/forms/child-relationships.js';

describe('planChildRelationships', () => {
  it('links only the person when there is no other parent', () => {
    const ops = planChildRelationships({
      personId: 'P', childId: 'C', otherParentId: null, partnerIds: [],
    });
    expect(ops).toEqual([
      { kind: 'parent_child', parentId: 'P', childId: 'C' },
    ]);
  });

  it('links both parents and adds a partner link when the other parent is not yet a partner', () => {
    const ops = planChildRelationships({
      personId: 'P', childId: 'C', otherParentId: 'O', partnerIds: [],
    });
    expect(ops).toEqual([
      { kind: 'parent_child', parentId: 'P', childId: 'C' },
      { kind: 'parent_child', parentId: 'O', childId: 'C' },
      { kind: 'partner', aId: 'P', bId: 'O' },
    ]);
  });

  it('does not add a partner link when the other parent is already a partner', () => {
    const ops = planChildRelationships({
      personId: 'P', childId: 'C', otherParentId: 'O', partnerIds: ['O'],
    });
    expect(ops).toEqual([
      { kind: 'parent_child', parentId: 'P', childId: 'C' },
      { kind: 'parent_child', parentId: 'O', childId: 'C' },
    ]);
  });

  it('ignores an other parent equal to the person or the child', () => {
    expect(planChildRelationships({ personId: 'P', childId: 'C', otherParentId: 'P', partnerIds: [] }))
      .toEqual([{ kind: 'parent_child', parentId: 'P', childId: 'C' }]);
    expect(planChildRelationships({ personId: 'P', childId: 'C', otherParentId: 'C', partnerIds: [] }))
      .toEqual([{ kind: 'parent_child', parentId: 'P', childId: 'C' }]);
  });

  it('defaults partnerIds to an empty list', () => {
    const ops = planChildRelationships({ personId: 'P', childId: 'C', otherParentId: 'O' });
    expect(ops).toContainEqual({ kind: 'partner', aId: 'P', bId: 'O' });
  });
});
