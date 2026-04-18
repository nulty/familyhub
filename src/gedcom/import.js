/**
 * gedcom/import.js
 * Parses a GEDCOM file and returns { people, relationships, events, repositories, sources, citations }
 * ready for db.bulk.import()
 */

import { ulid } from '../util/ulid.js';
import { parseSortDate } from '../util/dates.js';

/**
 * Normalize a place name for deduplication:
 * trim, lowercase, collapse whitespace, normalize comma spacing.
 * "Dublin, Ireland" | "Dublin,Ireland" | "DUBLIN , IRELAND" → "dublin, ireland"
 */
export function normalizePlaceName(s) {
  if (!s) return '';
  return s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/\s*,\s*/g, ', ');
}

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
            names: [], // { given, surname, type }
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
          let given = '', surn = '';
          const parts = val.match(/^([^/]*)\s*\/([^/]*)\//);
          if (parts) {
            given = parts[1].trim();
            surn = parts[2].trim();
          } else {
            const nameStr = val.replace(/\//g, '').trim();
            const words = nameStr.split(' ');
            surn = words.pop() || '';
            given = words.join(' ');
          }
          // First NAME becomes the primary display name
          if (!current.given && !current.surname) {
            current.given = given;
            current.surname = surn;
            current.name = val.replace(/\//g, '').trim();
          }
          // All NAMEs collected — type parsed at level 2
          current.names.push({ given, surname: surn, type: '' });
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
      } else if (currentLevel1Tag === 'NAME' && current?._type === 'INDI' && current.names.length > 0) {
        const lastNameRec = current.names[current.names.length - 1];
        if (tag === 'TYPE') {
          const typeMap = { birth: 'birth', married: 'married', immigrant: 'legal', maiden: 'birth', aka: 'aka' };
          lastNameRec.type = typeMap[val.toLowerCase()] || val.toLowerCase();
        } else if (tag === 'NICK') {
          // Add nickname as a separate name entry
          current.names.push({ given: val, surname: '', type: 'nickname' });
        } else if (tag === 'GIVN') {
          lastNameRec.given = val;
        } else if (tag === 'SURN') {
          lastNameRec.surname = val;
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
      if (tag === 'PAGE') {
        // PAGE inside a SOUR citation — use as detail
        if (currentEventBuf && currentEventBuf.sources.length > 0) {
          currentEventBuf.sources[currentEventBuf.sources.length - 1].detail = val;
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
  const outPersonNames = [];
  const outRelationships = [];
  const outEvents = [];
  const outRepositories = [];
  const outSources = [];
  const outCitations = [];
  const outParticipants = [];

  // Map GEDCOM xref IDs to our ULIDs
  const idMap = {};
  const getId = (xref) => {
    if (!idMap[xref]) idMap[xref] = ulid();
    return idMap[xref];
  };

  // De-duplicate repositories by domain and sources by (repo + title)
  const repoByDomain = {}; // domain -> repository object
  const sourceByKey = {};  // "repoId|title" -> source object

  // Known domains → proper repository names and types
  const KNOWN_REPOS = {
    'nationalarchives.ie':            { name: 'National Archives of Ireland', type: 'archive', url: 'https://nationalarchives.ie' },
    'census.nationalarchives.ie':     { name: 'National Archives of Ireland', type: 'archive', url: 'https://nationalarchives.ie' },
    'civilrecords.irishgenealogy.ie': { name: 'General Register Office', type: 'government', url: 'https://civilrecords.irishgenealogy.ie' },
    'churchrecords.irishgenealogy.ie': { name: 'IrishGenealogy.ie Church Records', type: 'church', url: 'https://churchrecords.irishgenealogy.ie' },
    'registers.nli.ie':              { name: 'National Library of Ireland', type: 'library', url: 'https://registers.nli.ie' },
    'familysearch.org':              { name: 'FamilySearch', type: 'church', url: 'https://familysearch.org' },
    'ancestry.com':                  { name: 'Ancestry', type: 'database', url: 'https://ancestry.com' },
    'ancestry.co.uk':                { name: 'Ancestry', type: 'database', url: 'https://ancestry.com' },
    'findmypast.ie':                 { name: 'Findmypast', type: 'database', url: 'https://findmypast.ie' },
    'findmypast.co.uk':              { name: 'Findmypast', type: 'database', url: 'https://findmypast.co.uk' },
    'rootsireland.ie':               { name: 'RootsIreland', type: 'database', url: 'https://rootsireland.ie' },
  };

  function getOrCreateRepo(url) {
    if (!url) return null;
    try {
      const u = new URL(url);
      const domain = u.hostname.replace(/^www\./, '');
      const known = KNOWN_REPOS[domain];
      // Use the known name as de-dup key so e.g. census.nationalarchives.ie and nationalarchives.ie merge
      const repoKey = known?.name || domain;
      if (!repoByDomain[repoKey]) {
        repoByDomain[repoKey] = {
          id: ulid(),
          name: repoKey,
          type: known?.type || 'website',
          url: known?.url || u.origin,
          address: '',
          notes: '',
        };
        outRepositories.push(repoByDomain[repoKey]);
      }
      return repoByDomain[repoKey];
    } catch {
      return null;
    }
  }

  function getOrCreateSource(repoId, title, url) {
    const key = `${repoId || ''}|${title || ''}`;
    if (!sourceByKey[key]) {
      sourceByKey[key] = {
        id: ulid(),
        repository_id: repoId || null,
        title: title || '',
        type: url ? 'webpage' : '',
        url: url || '',
        author: '',
        publisher: '',
        year: '',
        notes: '',
      };
      outSources.push(sourceByKey[key]);
    }
    return sourceByKey[key];
  }

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

    // Additional names (skip the first one which is the primary display name)
    for (let i = 1; i < rec.names.length; i++) {
      const n = rec.names[i];
      if (n.given || n.surname) {
        outPersonNames.push({
          id: ulid(),
          person_id: pid,
          given_name: n.given || '',
          surname: n.surname || '',
          type: n.type || '',
          date: '',
          sort_order: i,
        });
      }
    }
    // If the first name has a type, store it too (e.g. birth name when there are married names)
    if (rec.names.length > 1 && rec.names[0].type) {
      outPersonNames.unshift({
        id: ulid(),
        person_id: pid,
        given_name: rec.names[0].given || '',
        surname: rec.names[0].surname || '',
        type: rec.names[0].type,
        date: '',
        sort_order: 0,
      });
    }

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
          const repo = getOrCreateRepo(src.url);
          const title = src.title || inferTitle(src.url, ev);
          const source = getOrCreateSource(repo?.id, title, src.url);
          outCitations.push({
            id: ulid(),
            source_id: source.id,
            event_id: eid,
            detail: src.detail || '',
            url: src.url || '',
            accessed: '',
            confidence: '',
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

    // Marriage event — shared event (no owner), both spouses as participants
    for (const ev of rec.events) {
      if (ev.tag !== 'MARR' || (!ev.date && !ev.place)) continue;
      if (parents.length === 0) continue;
      const eid = ulid();
      outEvents.push({
        id: eid,
        person_id: null,
        type: 'marriage',
        date: ev.date,
        place: ev.place,
        notes: ev.notes.trim(),
        sort_date: parseSortDate(ev.date),
      });
      for (const xref of parents) {
        outParticipants.push({
          id: ulid(),
          event_id: eid,
          person_id: getId(xref),
          role: 'spouse',
        });
      }
      for (const src of ev.sources) {
        if (src.url || src.title) {
          const repo = getOrCreateRepo(src.url);
          const title = src.title || inferTitle(src.url, ev);
          const source = getOrCreateSource(repo?.id, title, src.url);
          outCitations.push({
            id: ulid(),
            source_id: source.id,
            event_id: eid,
            detail: src.detail || '',
            url: src.url || '',
            accessed: '',
            confidence: '',
            notes: '',
          });
        }
      }
    }
  }

  // Build place records from distinct event place strings (normalized dedup)
  const outPlaces = [];
  const placeMap = {};  // normalized name -> placeId
  let mergedVariants = 0;
  for (const ev of outEvents) {
    if (!ev.place) continue;
    const key = normalizePlaceName(ev.place);
    if (!placeMap[key]) {
      const placeId = ulid();
      placeMap[key] = placeId;
      // Keep the first variant seen as the display name
      outPlaces.push({ id: placeId, name: ev.place, type: '', parent_id: null, notes: '' });
    } else {
      mergedVariants++;
    }
    ev.place_id = placeMap[key];
  }

  const warnings = [];
  return {
    data: {
      people: outPeople,
      person_names: outPersonNames,
      relationships: outRelationships,
      events: outEvents,
      repositories: outRepositories,
      sources: outSources,
      citations: outCitations,
      participants: outParticipants,
      places: outPlaces,
    },
    warnings,
    stats: {
      people: outPeople.length,
      person_names: outPersonNames.length,
      relationships: outRelationships.length,
      events: outEvents.length,
      repositories: outRepositories.length,
      sources: outSources.length,
      citations: outCitations.length,
      participants: outParticipants.length,
      places: outPlaces.length,
      placeVariantsMerged: mergedVariants,
    }
  };
}

function inferTitle(url, ev) {
  if (!url) return '';
  if (url.includes('census.nationalarchives') || url.includes('nationalarchives.ie/collections/search-the-census')) {
    const m = url.match(/\/(\d{4})\//);
    return m ? `Census of Ireland ${m[1]}` : 'Census of Ireland';
  }
  if (url.includes('civilrecords.irishgenealogy')) {
    if (url.includes('birth')) return 'Civil Birth Records';
    if (url.includes('marriage')) return 'Civil Marriage Records';
    if (url.includes('death')) return 'Civil Death Records';
    return 'Civil Records';
  }
  if (url.includes('churchrecords.irishgenealogy')) {
    return 'Church Records';
  }
  if (url.includes('registers.nli.ie')) {
    return 'Catholic Parish Registers';
  }
  try {
    return new URL(url).hostname.replace('www.', '');
  } catch {
    return url.slice(0, 60);
  }
}
