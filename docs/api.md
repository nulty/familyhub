# API Reference

All database access goes through `src/db/db.js`. Every method is async and forwards to the SQLite Web Worker via postMessage RPC.

```js
import { initDB, people, relationships, events, sources, graph, bulk, getStats } from './src/db/db.js';
```

## Initialization

```js
await initDB();   // call once at startup
```

## People

```js
const person = await people.create({ given_name: 'Mary', surname: 'Kavanagh', gender: 'F' });
await people.update(person.id, { notes: 'Born in Dublin' });
const p = await people.get(person.id);
await people.delete(person.id);

// Search by name (returns up to 50 results)
const results = await people.search('kav');

// Full person with events, participating events, and family
const full = await people.getWithEvents(person.id);
// Returns: { person, events, participatingEvents, parents, children, partners }
```

## Events

```js
const ev = await events.create(person.id, {
  type: 'residence',
  date: '1901',
  place: '3 Dunnes Row, Dublin',
  notes: '',
});
await events.update(ev.id, { place: 'Updated place' });
await events.delete(ev.id);
const list = await events.list(person.id);
```

**Event types:** `birth`, `death`, `burial`, `residence`, `marriage`, `divorce`, `census`, `immigration`, `emigration`, `naturalisation`, `occupation`, `other`

## Sources

```js
await sources.create(ev.id, {
  title: 'Ireland Census 1901',
  url: 'https://census.nationalarchives.ie/...',
});
await sources.update(sourceId, { title: 'Updated title' });
await sources.delete(sourceId);
const list = await sources.list(ev.id);
```

## Relationships

```js
await relationships.addPartner(personAId, personBId);
await relationships.addParentChild(parentId, childId);  // person_a = parent, person_b = child
await relationships.remove(relationshipId);
const family = await relationships.getFamily(personId);
// Returns: { parents, children, partners }
```

## Event Participants

```js
await events.addParticipant(eventId, personId, 'witness');
await events.removeParticipant(eventId, personId);
await events.updateParticipantRole(eventId, personId, 'informant');
const participants = await events.getParticipants(eventId);
const participatingIn = await events.getForParticipant(personId);
```

## Graph

```js
// Returns family-chart compatible node array
const nodes = await graph.getData();
// Each node: { id, data: { given_name, surname, gender }, rels: { father, mother, spouses[], children[] } }
```

## GEDCOM Import/Export

```js
import { parseGEDCOM } from './src/gedcom/import.js';
const { data, warnings, stats } = parseGEDCOM(gedcomText);
await bulk.import(data);

import { exportGEDCOM } from './src/gedcom/export.js';
const gedText = exportGEDCOM(await bulk.exportAll());
```

## Database Export

```js
const bytes = await bulk.exportDatabase();  // Uint8Array of SQLite file
```

## Stats

```js
const stats = await getStats();
// Returns: { people: number, events: number, sources: number, relationships: number }
```
