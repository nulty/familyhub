# API Reference

All database access goes through `src/db/db.js`. Every method is async and forwards to the SQLite Web Worker via postMessage RPC.

```js
import {
  initDB, runMigrations, getStats, nukeDatabase, resetDatabase,
  people, personNames, relationships, events,
  repositories, sources, citations, places,
  temporal, graph, bulk,
} from './src/db/db.js';
```

## Initialization

```js
const result = await initDB();   // call once at startup
// result.pendingMigrations — array of { version, description } if upgrade needed

await runMigrations();           // apply pending migrations (after user confirms)
```

## People

```js
const person = await people.create({ given_name: 'Mary', surname: 'Kavanagh', gender: 'F' });
await people.update(person.id, { notes: 'Born in Dublin' });
const p = await people.get(person.id);
await people.delete(person.id);

const results = await people.search('kav');  // up to 50 results

// Full person with events, participating events, and family
const full = await people.getWithEvents(person.id);
// Returns: { person, events, participatingEvents, parents, children, partners }
// Each event includes ev.citations array with source_title, source_url, repository_name
```

## Person Names

```js
const name = await personNames.create({ person_id, given_name: 'Mary', surname: 'Smith', type: 'married' });
await personNames.update(name.id, { surname: 'Jones' });
await personNames.delete(name.id);
const names = await personNames.list(personId);
```

**Name types:** `''` (default), `birth`, `married`, `nickname`, `legal`, `aka`

## Relationships

```js
await relationships.addPartner(personAId, personBId);
await relationships.addParentChild(parentId, childId);  // person_a = parent, person_b = child
await relationships.remove(relationshipId);
const family = await relationships.getFamily(personId);
// Returns: { parents, children, partners }
```

## Events

```js
const ev = await events.create(personId, {
  type: 'residence',
  date: '1901',
  place: '3 Dunnes Row, Dublin',
  place_id: placeId,  // optional
  notes: '',
});
// personId can be null for shared events (e.g. marriages)

await events.update(ev.id, { place: 'Updated place' });
await events.delete(ev.id);
const ev = await events.get(eventId);
const list = await events.list(personId);
```

**Event types:** `birth`, `death`, `burial`, `residence`, `marriage`, `divorce`, `census`, `immigration`, `emigration`, `naturalisation`, `occupation`, `other`

### Participants

```js
await events.addParticipant(eventId, personId, 'spouse');
await events.removeParticipant(eventId, personId);
await events.updateParticipantRole(eventId, personId, 'informant');
const participants = await events.getParticipants(eventId);
const participatingIn = await events.getForParticipant(personId);
```

**Roles:** `father`, `mother`, `spouse`, `witness`, `godfather`, `godmother`, `informant`, `other`

## Repositories

```js
const repo = await repositories.create({ name: 'National Archives', type: 'archive', url: '', address: '' });
await repositories.update(repo.id, { url: 'https://...' });
await repositories.delete(repo.id);  // sets repository_id to NULL on linked sources
const repo = await repositories.get(repoId);
const all = await repositories.list();
const results = await repositories.search('national');
```

**Repository types:** `''`, `archive`, `library`, `website`, `database`, `church`, `government`, `personal`, `other`

## Sources

```js
const source = await sources.create({ repository_id: repoId, title: 'Civil Birth Records', type: 'register', url: '' });
await sources.update(source.id, { title: 'Updated' });
await sources.delete(source.id);  // cascades to citations
const source = await sources.get(sourceId);
const all = await sources.list();
const results = await sources.search('birth');
const forEvent = await sources.listForEvent(eventId);  // sources cited for this event
```

**Source types:** `''`, `document`, `register`, `census`, `webpage`, `book`, `newspaper`, `certificate`, `photograph`, `other`

## Citations

```js
const citation = await citations.create({ source_id: sourceId, detail: 'p. 42', url: 'https://...', confidence: 'primary' });
await citations.update(citation.id, { detail: 'p. 43' });
await citations.delete(citation.id);
const citation = await citations.get(citationId);
const results = await citations.search('birth');

// Link/unlink citations to events (many-to-many via citation_events)
await citations.linkEvent(citationId, eventId);
await citations.unlinkEvent(citationId, eventId);
const forEvent = await citations.listForEvent(eventId);
const forSource = await citations.listForSource(sourceId);
```

**Confidence levels:** `''`, `primary`, `secondary`, `questionable`

## Places

```js
const place = await places.create({ name: 'Dublin', type: 'city', parent_id: leinsterPlaceId });
await places.update(place.id, { type: 'county' });
await places.delete(place.id);
const place = await places.get(placeId);
const all = await places.list();
const tree = await places.tree();            // hierarchical tree structure
const results = await places.search('dub');  // includes computed full_name (e.g. "Dublin, Leinster, Ireland")

const found = await places.findByNameTypeParent('Dublin', 'city', parentId);  // exact match
const ancestors = await places.hierarchy(placeId);   // walk up parent chain
const kids = await places.children(parentId);
const ppl = await places.people(placeId);    // people with events at this place
const evts = await places.events(placeId);   // events at this place
```

**Place types:** `''`, `country`, `province`, `county`, `barony`, `civil_parish`, `church_parish`, `parish`, `townland`, `city`, `town`, `suburb`, `village`, `street`, `address`, `cemetery`

## Temporal

Find events near a date or near another event.

```js
const nearby = await temporal.findNearDate('1901', { windowYears: 2 });
const nearby = await temporal.findNearEvent(eventId, { windowYears: 2 });
```

## Graph

```js
const nodes = await graph.getData();
// Returns family-chart compatible node array
// Each node: { id, data: { given_name, surname, gender }, rels: { father, mother, spouses[], children[] } }
```

## Bulk / GEDCOM

```js
import { parseGEDCOM } from './src/gedcom/import.js';
const { data, warnings, stats } = parseGEDCOM(gedcomText);
await bulk.import(data);

import { exportGEDCOM } from './src/gedcom/export.js';
const gedText = exportGEDCOM(await bulk.exportAll());
```

## Database Management

```js
const bytes = await bulk.exportDatabase();          // Uint8Array of SQLite file
const result = await bulk.importDatabase(bytes);    // returns { ok, pendingMigrations }

await nukeDatabase();     // drop all tables, re-apply schema from scratch
await resetDatabase();    // reset database

const stats = await getStats();
// Returns: { people, events, sources, relationships, citations, repositories, places }
```
