/**
 * gedcom/export.js
 * Converts our DB export back to a valid GEDCOM 5.5.1 file.
 */

const EVENT_TYPE_TO_TAG = {
  birth:          'BIRT',
  death:          'DEAT',
  burial:         'BURI',
  residence:      'RESI',
  marriage:       'MARR',
  divorce:        'DIV',
  census:         'CENS',
  immigration:    'IMMI',
  emigration:     'EMIG',
  naturalisation: 'NATU',
  occupation:     'OCCU',
  other:          'EVEN',
};

export function exportGEDCOM({ people, relationships, events, sources, citations, citation_events, participants, person_names }) {
  const lines = [];

  const now = new Date();
  const gedDate = now.toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric'
  }).toUpperCase().replace(/ /g, ' ');

  lines.push('0 HEAD');
  lines.push('1 SOUR FamilyTree App');
  lines.push('1 DATE ' + gedDate);
  lines.push('1 GEDC');
  lines.push('2 VERS 5.5.1');
  lines.push('2 FORM LINEAGE-LINKED');
  lines.push('1 CHAR UTF-8');

  // Index events by person (owned events)
  const eventsByPerson = {};
  const sharedEvents = []; // events with null person_id
  for (const ev of events) {
    if (ev.person_id) {
      if (!eventsByPerson[ev.person_id]) eventsByPerson[ev.person_id] = [];
      eventsByPerson[ev.person_id].push(ev);
    } else {
      sharedEvents.push(ev);
    }
  }

  // Index shared events by participant
  const sharedEventsByPerson = {};
  for (const ep of (participants || [])) {
    const ev = sharedEvents.find(e => e.id === ep.event_id);
    if (ev) {
      if (!sharedEventsByPerson[ep.person_id]) sharedEventsByPerson[ep.person_id] = [];
      sharedEventsByPerson[ep.person_id].push({ ...ev, participant_role: ep.role });
    }
  }

  // Build citation lookup: event_id -> [{ source, citation }]
  const sourceById = {};
  for (const src of (sources || [])) {
    sourceById[src.id] = src;
  }

  const citationById = {};
  for (const c of (citations || [])) {
    citationById[c.id] = c;
  }

  const citationsByEvent = {};
  for (const ce of (citation_events || [])) {
    if (!citationsByEvent[ce.event_id]) citationsByEvent[ce.event_id] = [];
    const c = citationById[ce.citation_id];
    const source = c ? sourceById[c.source_id] : null;
    if (c && source) {
      citationsByEvent[ce.event_id].push({ citation: c, source });
    }
  }

  const participantsByEvent = {};
  for (const ep of (participants || [])) {
    if (!participantsByEvent[ep.event_id]) participantsByEvent[ep.event_id] = [];
    participantsByEvent[ep.event_id].push(ep);
  }

  // Index relationships
  const partners   = {}; // personId → [personId]
  const famGroups  = []; // { id, husbId, wifeId, childIds[] }

  for (const rel of relationships) {
    if (rel.type === 'partner') {
      if (!partners[rel.person_a_id]) partners[rel.person_a_id] = [];
      if (!partners[rel.person_b_id]) partners[rel.person_b_id] = [];
      partners[rel.person_a_id].push(rel.person_b_id);
      partners[rel.person_b_id].push(rel.person_a_id);
    }
  }

  // Build family groups
  const famMap = {}; // "personA:personB" → famId
  let famCounter = 1;

  const getFamId = (a, b) => {
    const key = [a, b].sort().join(':');
    if (!famMap[key]) famMap[key] = `F${famCounter++}`;
    return famMap[key];
  };

  for (const rel of relationships) {
    if (rel.type === 'parent_child') {
      const parentPartners = partners[rel.person_a_id] || [];
      const famKey = rel.person_a_id;
      if (!famMap['solo_' + famKey]) famMap['solo_' + famKey] = `F${famCounter++}`;
    }
  }

  // Simpler approach: build FAM records from partner pairs
  const processedFams = new Set();
  const personFams = {}; // personId → [famId] as spouse
  const personFamc = {}; // personId → famId as child

  for (const rel of relationships) {
    if (rel.type !== 'partner') continue;
    const famId = getFamId(rel.person_a_id, rel.person_b_id);
    if (!processedFams.has(famId)) {
      processedFams.add(famId);
      famGroups.push({ famId, a: rel.person_a_id, b: rel.person_b_id, childIds: [] });
    }
    if (!personFams[rel.person_a_id]) personFams[rel.person_a_id] = [];
    if (!personFams[rel.person_b_id]) personFams[rel.person_b_id] = [];
    personFams[rel.person_a_id].push(famId);
    personFams[rel.person_b_id].push(famId);
  }

  // Assign children to families
  for (const rel of relationships) {
    if (rel.type !== 'parent_child') continue;
    const parentFams = personFams[rel.person_a_id] || [];
    if (parentFams.length > 0) {
      const fam = famGroups.find(f => f.famId === parentFams[0]);
      if (fam && !fam.childIds.includes(rel.person_b_id)) {
        fam.childIds.push(rel.person_b_id);
        personFamc[rel.person_b_id] = fam.famId;
      }
    } else {
      const famId = `F${famCounter++}`;
      famGroups.push({ famId, a: rel.person_a_id, b: null, childIds: [rel.person_b_id] });
      if (!personFams[rel.person_a_id]) personFams[rel.person_a_id] = [];
      personFams[rel.person_a_id].push(famId);
      personFamc[rel.person_b_id] = famId;
    }
  }

  // ── Write INDI records ────────────────────────────────────────────────────

  const personById = {};
  for (const p of people) personById[p.id] = p;

  const namesByPerson = {};
  for (const n of (person_names || [])) {
    if (!namesByPerson[n.person_id]) namesByPerson[n.person_id] = [];
    namesByPerson[n.person_id].push(n);
  }

  const GEDCOM_NAME_TYPE = { birth: 'birth', married: 'married', nickname: 'aka', legal: 'immigrant', aka: 'aka' };

  for (const p of people) {
    lines.push(`0 @${p.id}@ INDI`);
    lines.push(`1 NAME ${p.given_name} /${p.surname}/`);
    if (p.given_name) lines.push(`2 GIVN ${p.given_name}`);
    if (p.surname)    lines.push(`2 SURN ${p.surname}`);

    // Additional names
    for (const n of (namesByPerson[p.id] || [])) {
      lines.push(`1 NAME ${n.given_name} /${n.surname}/`);
      if (n.given_name) lines.push(`2 GIVN ${n.given_name}`);
      if (n.surname)    lines.push(`2 SURN ${n.surname}`);
      if (n.type) lines.push(`2 TYPE ${GEDCOM_NAME_TYPE[n.type] || n.type}`);
    }

    if (p.gender !== 'U') lines.push(`1 SEX ${p.gender}`);

    // Events
    const personEvents = (eventsByPerson[p.id] || [])
      .filter(e => e.type !== 'marriage'); // marriages go on FAM records

    for (const ev of personEvents) {
      const tag = EVENT_TYPE_TO_TAG[ev.type] || 'EVEN';
      lines.push(`1 ${tag}`);
      if (ev.date)  lines.push(`2 DATE ${ev.date}`);
      if (ev.place) lines.push(`2 PLAC ${ev.place}`);
      if (ev.notes) {
        const noteLines = ev.notes.split('\n');
        lines.push(`2 NOTE ${noteLines[0]}`);
        for (let i = 1; i < noteLines.length; i++) {
          lines.push(`3 CONT ${noteLines[i]}`);
        }
      }
      // Citations → SOUR records
      const evCitations = citationsByEvent[ev.id] || [];
      for (const { citation, source } of evCitations) {
        const sourVal = source.url || source.title;
        if (sourVal) {
          lines.push(`2 SOUR ${sourVal}`);
          if (citation.detail) lines.push(`3 PAGE ${citation.detail}`);
          if (citation.url && citation.url !== source.url) lines.push(`3 WWW ${citation.url}`);
        }
      }
      // Participants (ASSO records)
      const evParticipants = participantsByEvent[ev.id] || [];
      for (const ep of evParticipants) {
        lines.push(`2 ASSO @${ep.person_id}@`);
        if (ep.role) lines.push(`3 RELA ${ep.role}`);
      }
    }

    if (p.notes) {
      const noteLines = p.notes.split('\n');
      lines.push(`1 NOTE ${noteLines[0]}`);
      for (let i = 1; i < noteLines.length; i++) {
        lines.push(`2 CONT ${noteLines[i]}`);
      }
    }

    // Family links
    for (const famId of (personFams[p.id] || [])) {
      lines.push(`1 FAMS @${famId}@`);
    }
    if (personFamc[p.id]) {
      lines.push(`1 FAMC @${personFamc[p.id]}@`);
    }
  }

  // ── Write FAM records ─────────────────────────────────────────────────────

  for (const fam of famGroups) {
    lines.push(`0 @${fam.famId}@ FAM`);
    if (fam.a) {
      const pa = personById[fam.a];
      const tag = pa?.gender === 'F' ? 'WIFE' : 'HUSB';
      lines.push(`1 ${tag} @${fam.a}@`);
    }
    if (fam.b) {
      const pb = personById[fam.b];
      const tag = pb?.gender === 'F' ? 'WIFE' : 'HUSB';
      lines.push(`1 ${tag} @${fam.b}@`);
    }

    // Marriage events — find shared marriage events where either spouse is a participant
    const emittedMarriages = new Set();
    for (const spouseId of [fam.a, fam.b].filter(Boolean)) {
      // Check shared events (person_id IS NULL)
      const spouseShared = (sharedEventsByPerson[spouseId] || []).filter(e => e.type === 'marriage');
      for (const ev of spouseShared) {
        if (emittedMarriages.has(ev.id)) continue; // don't emit same marriage twice
        emittedMarriages.add(ev.id);
        lines.push('1 MARR');
        if (ev.date)  lines.push(`2 DATE ${ev.date}`);
        if (ev.place) lines.push(`2 PLAC ${ev.place}`);
        if (ev.notes) {
          const noteLines = ev.notes.split('\n');
          lines.push(`2 NOTE ${noteLines[0]}`);
          for (let i = 1; i < noteLines.length; i++) {
            lines.push(`3 CONT ${noteLines[i]}`);
          }
        }
        const evCitations = citationsByEvent[ev.id] || [];
        for (const { citation, source } of evCitations) {
          const sourVal = source.url || source.title;
          if (sourVal) {
            lines.push(`2 SOUR ${sourVal}`);
            if (citation.detail) lines.push(`3 PAGE ${citation.detail}`);
            if (citation.url && citation.url !== source.url) lines.push(`3 WWW ${citation.url}`);
          }
        }
      }
      // Also check owned marriage events (legacy data)
      const ownedMarriages = (eventsByPerson[spouseId] || []).filter(e => e.type === 'marriage');
      for (const ev of ownedMarriages) {
        if (emittedMarriages.has(ev.id)) continue;
        emittedMarriages.add(ev.id);
        lines.push('1 MARR');
        if (ev.date)  lines.push(`2 DATE ${ev.date}`);
        if (ev.place) lines.push(`2 PLAC ${ev.place}`);
      }
    }

    for (const childId of fam.childIds) {
      lines.push(`1 CHIL @${childId}@`);
    }
  }

  lines.push('0 TRLR');
  return lines.join('\r\n');
}
