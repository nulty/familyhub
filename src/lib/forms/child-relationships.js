/**
 * Compute the relationship operations needed to add a child to a person,
 * optionally with another parent. Pure: no DB access, no side effects.
 *
 * @param {Object} args
 * @param {string} args.personId        - the person the child is being added to
 * @param {string} args.childId         - the selected/created child
 * @param {string|null} [args.otherParentId] - the chosen other parent, or null
 * @param {string[]} [args.partnerIds]  - ids of the person's existing partners
 * @returns {Array<
 *   {kind:'parent_child', parentId:string, childId:string} |
 *   {kind:'partner', aId:string, bId:string}
 * >}
 */
export function planChildRelationships({ personId, childId, otherParentId = null, partnerIds = [] }) {
  const ops = [{ kind: 'parent_child', parentId: personId, childId }];

  if (otherParentId && otherParentId !== personId && otherParentId !== childId) {
    ops.push({ kind: 'parent_child', parentId: otherParentId, childId });
    if (!partnerIds.includes(otherParentId)) {
      ops.push({ kind: 'partner', aId: personId, bId: otherParentId });
    }
  }

  return ops;
}
