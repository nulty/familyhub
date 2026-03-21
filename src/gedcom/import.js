/**
 * gedcom/import.js
 * Parses a GEDCOM file and returns { people, relationships, events, sources }
 * ready for db.bulk.import()
 */

import { ulid } from '../util/ulid.js';
import { parseSortDate } from '../util/dates.js';

// Map GEDCOM event tags to our event types
const EVENT_TYPE_MAP = {
  BIRT: 'birth',
  DEAT: 'death',
  BURI: 'burial',
  RESI: 'residence',
  MARR: 'marriage',
  DIV:  'divorce',
  CENS: 'census',
  IMMI: 'immigration',
  EMIG: 'emigration',
  NATU: 'naturalisation',
  OCCU: 'occupation',
  EVEN: 'other',
};

const INDI_EVENT_TAGS = new Set(Object.keys(EVENT_TYPE_MAP));

export function parseGEDCOM(text) {
  const lines = text.split(/\r?\n/);
  const records = {};
  let current = null;
  let currentLevel1Tag = null;
  let currentEventBuf = null;

  for (const raw of lines) {
    const m = raw.match(/^(\d)\s+(@[^@]+@\s+)?(\w+)(.*)?$/);
    if (!m) continue;

    const level = parseInt(m[1]);
    const xref  = (m[2] || '').trim().replace(/@/g, '');
    const tag   = m[3].trim();
    const val   = (m[4] || '').trim();

    if (level === 0) {
      currentLevel1Tag = null;
      currentEventBuf = null;
      if (xref) {
        if (tag === 'INDI') {
          current = {
            _type: 'INDI', id: xref,
            name: '', given: '', surname: '', gender: 'U',
            notes: [], events: []
          };
          records[xref] = current;
        } else if (tag === 'FAM') {
          current = {
            _type: 'FAM', id: xref,
            husb: null, wife: null, chil: [],
            events: []
          };
          records[xref] = current;
        } else {
          current = null;
        }
      } else {
        current = null;
      }
      continue;
    }

    if (!current) continue;

    if (level === 1) {
      currentLevel1Tag = tag;
      currentEventBuf = null;

      if (current._type === 'INDI') {
        if (tag === 'NAME') {
          current.name = val.replace(/\//g, '').trim();
          const parts = val.match(/^([^/]*)\s*\/([^/]*)\//);
          if (parts) {
            current.given   = parts[1].trim();
            current.surname = parts[2].trim();
          } else {
            const words = current.name.split(' ');
            current.surname = words.pop() || '';
            current.given   = words.join(' ');
          }
        } else if (tag === 'SEX') {
          current.gender = val === 'M' ? 'M' : val === 'F' ? 'F' : 'U';
        } else if (tag === 'NOTE') {
          current.notes.push(val);
        } else if (INDI_EVENT_TAGS.has(tag)) {
          currentEventBuf = { tag, date: '', place: '', notes: '', sources: [], associations: [] };
          current.events.push(currentEventBuf);
          if (val && val !== 'Y') currentEventBuf.date = val;
        } else if (tag === 'FAMS' || tag === 'FAMC') {
          // handled via FAM records
        }
      } else if (current._type === 'FAM') {
        if (tag === 'HUSB') current.husb = val.replace(/@/g, '');
        else if (tag === 'WIFE') current.wife = val.replace(/@/g, '');
        else if (tag === 'CHIL') current.chil.push(val.replace(/@/g, ''));
        else if (INDI_EVENT_TAGS.has(tag)) {
          currentEventBuf = { tag, date: '', place: '', notes: '', sources: [], associations: [] };
          current.events.push(currentEventBuf);
        }
      }
      continue;
    }

    if (level === 2) {
      if (tag === 'CONT' || tag === 'CONC') {
        // continuation of previous value
        if (currentLevel1Tag === 'NOTE' && current._type === 'INDI') {
          if (current.notes.length > 0) {
            current.notes[current.notes.length - 1] += (tag === 'CONT' ? '\n' : '') + val;
          }
        } else if (currentEventBuf) {
          currentEventBuf.notes += (tag === 'CONT' ? '\n' : '') + val;
        }
      } else if (currentEventBuf) {
        if (tag === 'DATE') currentEventBuf.date = val;
        else if (tag === 'PLAC') currentEventBuf.place = val;
        else if (tag === 'NOTE') currentEventBuf.notes += val;
        else if (tag === 'SOUR') {
          // inline source — treat as URL if it looks like one, else title
          if (val.startsWith('http')) {
            currentEventBuf.sources.push({ url: val, title: '' });
          } else {
            currentEventBuf.sources.push({ url: '', title: val });
          }
        }
        else if (tag === 'ADDR') {
          // ADDR on a RESI event — use as place if place not set
          if (!currentEventBuf.place) currentEventBuf.place = val;
        }
        else if (tag === 'ASSO') {
          // Association: linked person with optional role (RELA at level 3)
          const assoXref = val.replace(/@/g, '');
          if (assoXref) {
            currentEventBuf.associations.push({ xref: assoXref, role: 'witness' });
          }
        }
      }
      continue;
    }

    if (level === 3) {
      if ((tag === 'CONT' || tag === 'CONC') && currentEventBuf) {
        // continuation of ADDR or NOTE at level 3
        if (currentEventBuf.place && currentLevel1Tag === 'RESI') {
          // don't append address continuations — they're already handled
        }
      }
      if (tag === 'WWW' || tag === 'URL') {
        // URL inside a SOUR citation
        if (currentEventBuf && currentEventBuf.sources.length > 0) {
          currentEventBuf.sources[currentEventBuf.sources.length - 1].url = val;
        }
      }
      if (tag === 'RELA') {
        // Role for the most recent ASSO record
        if (currentEventBuf && currentEventBuf.associations && currentEventBuf.associations.length > 0) {
          currentEventBuf.associations[currentEventBuf.associations.length - 1].role = val.toLowerCase();
        }
      }
    }
  }

  // ── Build output ────────────────────────────────────────────────────────

  const outPeople = [];
  const outRelationships = [];
  const outEvents = [];
  const outSources = [];
  const outParticipants = [];

  // Map GEDCOM xref IDs to our ULIDs
  const idMap = {};
  const getId = (xref) => {
    if (!idMap[xref]) idMap[xref] = ulid();
    return idMap[xref];
  };

  // Process individuals
  for (const rec of Object.values(records)) {
    if (rec._type !== 'INDI') continue;
    const pid = getId(rec.id);
    outPeople.push({
      id: pid,
      given_name: rec.given || rec.name,
      surname: rec.surname,
      gender: rec.gender,
      notes: rec.notes.join('\n').trim(),
    });

    for (const ev of rec.events) {
      if (!ev.date && !ev.place) continue;
      const eid = ulid();
      outEvents.push({
        id: eid,
        person_id: pid,
        type: EVENT_TYPE_MAP[ev.tag] || 'other',
        date: ev.date,
        place: ev.place,
        notes: ev.notes.trim(),
        sort_date: parseSortDate(ev.date),
      });
      for (const src of ev.sources) {
        if (src.url || src.title) {
          outSources.push({
            id: ulid(),
            event_id: eid,
            title: src.title || inferTitle(src.url, ev),
            url: src.url,
            accessed: '',
            notes: '',
          });
        }
      }
      for (const asso of (ev.associations || [])) {
        if (asso.xref && records[asso.xref]) {
          outParticipants.push({
            id: ulid(),
            event_id: eid,
            person_id: getId(asso.xref),
            role: asso.role || 'witness',
          });
        }
      }
    }
  }

  // Process families → relationships
  for (const rec of Object.values(records)) {
    if (rec._type !== 'FAM') continue;

    if (rec.husb && rec.wife) {
      outRelationships.push({
        id: ulid(),
        person_a_id: getId(rec.husb),
        person_b_id: getId(rec.wife),
        type: 'partner',
      });
    }

    const parents = [rec.husb, rec.wife].filter(Boolean);
    for (const childXref of rec.chil) {
      for (const parentXref of parents) {
        outRelationships.push({
          id: ulid(),
          person_a_id: getId(parentXref),
          person_b_id: getId(childXref),
          type: 'parent_child',
        });
      }
    }

    // Marriage event on both spouses
    for (const ev of rec.events) {
      if (ev.tag !== 'MARR' || (!ev.date && !ev.place)) continue;
      for (const xref of parents) {
        const eid = ulid();
        outEvents.push({
          id: eid,
          person_id: getId(xref),
          type: 'marriage',
          date: ev.date,
          place: ev.place,
          notes: ev.notes.trim(),
          sort_date: parseSortDate(ev.date),
        });
      }
    }
  }

  const warnings = [];
  return {
    data: { people: outPeople, relationships: outRelationships, events: outEvents, sources: outSources, participants: outParticipants },
    warnings,
    stats: {
      people: outPeople.length,
      relationships: outRelationships.length,
      events: outEvents.length,
      sources: outSources.length,
      participants: outParticipants.length,
    }
  };
}

function inferTitle(url, ev) {
  if (!url) return '';
  if (url.includes('census.nationalarchives')) {
    const m = url.match(/\/(\d{4})\//);
    return m ? `Ireland Census ${m[1]}` : 'Ireland Census';
  }
  if (url.includes('civilrecords.irishgenealogy')) {
    if (url.includes('birth')) return 'Irish Civil Birth Record';
    if (url.includes('marriage')) return 'Irish Civil Marriage Record';
    if (url.includes('death')) return 'Irish Civil Death Record';
    return 'Irish Civil Record';
  }
  try {
    return new URL(url).hostname.replace('www.', '');
  } catch {
    return url.slice(0, 60);
  }
}
