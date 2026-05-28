import Fuse from 'fuse.js';

function withFullName(p) {
  return {
    ...p,
    full_name: [p.given_name, p.surname].filter(Boolean).join(' ').trim(),
  };
}

export function createPersonSearchIndex(rows) {
  return new Fuse(rows.map(withFullName), {
    keys: ['full_name', 'given_name', 'surname'],
    threshold: 0.4,
    ignoreLocation: true,
    includeScore: true,
    minMatchCharLength: 2,
    // Extended search lets us pass "tom gaf" as two AND-tokens that can each
    // match a different key — necessary for fragmented queries like "tomgaf".
    useExtendedSearch: true,
  });
}

// For a single-token query like "tomgaf", produce every interior split where
// each side is ≥ 2 chars. ("tomgaf" → ["to mgaf", "tom gaf", "tomg af"]). The
// original query is searched too, so single-word queries still rank.
function splitVariants(query) {
  if (query.includes(' ')) return [];
  if (query.length < 4) return [];
  const variants = [];
  for (let i = 2; i <= query.length - 2; i++) {
    variants.push(`${query.slice(0, i)} ${query.slice(i)}`);
  }
  return variants;
}

export function searchPersonIndex(fuse, query, limit = 20) {
  const queries = [query, ...splitVariants(query)];
  const bestById = new Map();
  for (const q of queries) {
    for (const m of fuse.search(q, { limit })) {
      const prev = bestById.get(m.item.id);
      if (!prev || m.score < prev.score) bestById.set(m.item.id, m);
    }
  }
  const matches = [...bestById.values()].sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score;
    return (a.item.surname || '').localeCompare(b.item.surname || '');
  });
  return matches.slice(0, limit).map(({ item }) => {
    const { full_name, ...rest } = item;
    return rest;
  });
}
