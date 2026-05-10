# Working with places — a guide for new users

Read this before importing your GEDCOM. It walks you through the whole place workflow from start to finish, and tells you what to do when things don't go cleanly the first time.

## What "places" means here

Every event in your tree (birth, marriage, residence, death, …) can be attached to a place. A place is just a record with:

- a name (free text),
- an optional type (city, country, parish, …),
- an optional parent place (so "Dublin" can sit under "Ireland"),
- optional latitude/longitude coordinates (so it can show on the map).

When you import a GEDCOM file, the app reads the address strings out of every event and creates one place record per distinct address it finds. Those records start out **flat**: no type, no parent, no coordinates. Most of the work in this guide is about turning that flat list into a clean, geocoded hierarchy — automatically where possible, with you handling only the edge cases.

## The full workflow at a glance

1. **Import** your GEDCOM.
2. **Merge** any obvious duplicate place names (optional but recommended).
3. **Batch-geocode** the places.
4. **Review** anything the geocoder couldn't handle on its own.
5. **Manual structure** — for places the geocoder couldn't find at all (historic, defunct, non-standard).
6. From this point on, **add new places one at a time** as you create new events.

You don't have to do all of this in one sitting. The review queue is saved between visits, so you can come back to leftover problems whenever you like.

---

## Step 1 — Import your GEDCOM

Open Import, pick your `.ged` file, and confirm. After import you'll see a summary that includes a place count, e.g. `Places: 47 (3 variants merged)`.

The "variants merged" number means the app collapsed obvious typing differences automatically — `"Dublin, Ireland"` and `"dublin,ireland"` are treated as the same place, so you only get one record.

At this point your places are a **flat list**. None of them are geocoded yet, and none of them are organised into a hierarchy. That's normal.

## Step 2 — (Recommended) Merge duplicates

Open **Places** from the main menu, then click **Merge Duplicates**.

This tool only operates on untyped, top-level places — exactly what you have right after a GEDCOM import. It shows you two things:

- **Auto-grouped duplicates.** Sets of places whose names match after normalising case and spacing. For each group, the row with the most events attached is pre-selected as "keep". Click another row to change which one survives, then click **Merge**. The keep record absorbs the events, coordinates (if it doesn't already have any), and notes from the others, and the duplicates are deleted.
- **All untyped places.** A flat, filterable list. Click rows to select multiple places that you know are the same but spelled too differently for the auto-grouper to catch (e.g. `"Dub."` and `"Dublin"`). Shift-click to select a range. Once you've selected two or more, a merge bar appears — click any selected row to mark it as the keep target, then click **Merge**.

If nothing looks duplicated, skip this step. You can always come back later.

### Edge cases for merging

- **You're not sure they're the same place.** Don't merge. You can always merge later, but you can't un-merge. If in doubt, geocode first — if both records geocode to the same coordinates, that's strong evidence.
- **One of the duplicates has coordinates and the others don't.** The keep record will inherit coordinates if it doesn't already have any. If multiple records have coordinates, the keep record's own coordinates win — pick the one with the right ones.
- **The records have different notes.** Notes are appended together, separated by a divider, so nothing is lost.

## Step 3 — Batch-geocode

Click **Geocode** on the Places page. A picker appears.

- **Select which places to geocode.** Everything eligible (no coordinates yet, not already in the review queue) is pre-selected. Filter by name, click rows to deselect, shift-click for a range, or use **Select all** / **Select none**.
- **Set a region bias** (optional but very helpful). Type something like `Ireland` or `Massachusetts USA`. Each query gets that suffix added unless the place name already contains it. Without a bias, ambiguous names like "Springfield" can match anywhere in the world. The bias is remembered for next time.
- **Pick a mode:**
  - **Queue for review** — fetches the top 3 candidates per place and stores them for you to triage. Slower per-place but you stay in control.
  - **Auto-accept top** — takes the geocoder's best guess automatically. Fastest. Anything with no result still goes to the queue for you to retry.

Click **Start geocoding**. Progress is shown in a toast at the bottom of the screen. Geocoding is rate-limited to about one place per second (this is a hard limit set by the free OpenStreetMap geocoder we use), so a few hundred places will take a few minutes. You can click **Stop Geocoding** at any time — anything already processed stays processed.

When a place is accepted (whether automatically or by you in the next step), the app does three things in one go:

1. Splits the geocoder's result into a hierarchy (country → region → county → city → suburb → street, etc.) and creates only the parts that don't already exist.
2. Stores the coordinates on the most specific level.
3. Repoints all events from the original flat record to the new specific record, then deletes the original flat record.

This means each event ends up linked to a precise, typed, coordinate-bearing place — and shared parts of the hierarchy (e.g. "Ireland", "Leinster") are reused across all your places, not duplicated.

## Step 4 — Review what didn't auto-resolve

If you used **Queue for review** mode, or any place came back with no result in **Auto-accept** mode, you'll see a **Review (N)** button on the Places toolbar. Click it.

The review panel has two sections:

### Results

Places where the geocoder returned at least one candidate. For each candidate you'll see its full address (small grey text) and a confidence percentage, plus a row of clickable **level chips** like:

> `United States` › `New York` › `Suffolk County` › `Southampton` › `Main St` › `123`

Click any chip to accept the result truncated at that level. Clicking the rightmost chip gives you the most specific record (street/house). Clicking an earlier chip — say `Southampton` — drops everything more specific, so the place ends up filed as a town rather than a post office. This is the fix for results that come back too specific (a business at the right town gets you "Southampton" if you click the town chip instead of the building name).

If none of the candidates are useful, click **Skip**, or edit the query in the box below the results and click **Retry**.

There's also an **Accept all top results** button at the top of the review panel. It accepts the first candidate per item at full specificity — useful when you've eyeballed the list and the top guesses look right.

### No results

Places the geocoder couldn't find at all. You get an editable text box pre-filled with the query that was tried. Edit it (add a country, fix a typo, simplify the address) and click **Retry**. The result moves to the Results section if anything is found, or stays here if not.

### Edge cases for review

- **All three suggestions look wrong.** Click **Skip**. The place stays as-is. You can run Geocode again later (with a different region bias, or after merging it with a sibling), or set the coordinates manually (Step 5).
- **The right answer is "this place no longer exists."** The geocoder can only find places that exist today. For historic places — old townlands, demolished buildings, renamed villages — you'll usually have to search for the modern locality and accept that, or skip and add coordinates manually if you know them.
- **The query is right but the geocoder is being unhelpful.** Try **Retry** with a simpler version of the address. Often dropping the street number, then dropping the street, then dropping the suburb gets you a usable result. The hierarchy will be less specific but the coordinates will be roughly correct.
- **You accidentally accepted the wrong result.** Open the place from the Places list and click **Edit**. You can change the name, type, parent, and coordinates by hand. If a whole hierarchy got created from a bad accept, you can also just delete the leaf and let the parent records stay (they may be useful for other places).
- **You want to start over.** Click **Reset Queue** to wipe the review queue without affecting any places that have already been accepted.

## Step 5 — Manual structure (for places the geocoder couldn't find)

Some addresses don't exist in modern maps: townlands that have been absorbed into larger administrative areas, demolished farms, defunct civil parishes, fictional or family-only place names. Nominatim returns nothing for these, so the geocoder skips them.

After you've worked through the review queue, anything still left as a flat untyped place — especially anything with commas in its name, like `"Knockboy, Glenoe, Antrim"` — can be tackled with **Manual structure** (the button on the Places toolbar).

This opens a wizard that:

- Reads every comma-separated piece across your remaining flat places.
- Walks you through each unique segment one at a time, most-frequent first.
- For each segment, asks for: a clean name, a type, and a parent place (optionally creating a new parent inline).
- Restructures the flat places that contain that segment to point at the newly typed record.

Use it when:

- You have historic addresses Nominatim doesn't know.
- You want to file places under custom types (e.g. "townland", "civil parish") without internet round-trips.
- You're working offline.
- Geocoding misclassified something at a coarse level and you want to set the proper structure manually.

Skip it if all your remaining places are standard modern addresses — Geocode + Review will get those done faster.

The wizard remembers segments you've already resolved or skipped, so if you close it and come back, you pick up where you left off.

## Step 6 — Adding new places later

After the import is cleaned up, you'll mostly add places one at a time as you enter new events. From an event form, the place picker offers existing places and lets you create new ones inline. When you create a new place, you have three ways to set its coordinates:

- **Type them in by hand**, if you know them.
- **Pick on map** — drops you onto the map view with a crosshair. Click anywhere to set the coordinates and return to the form.
- **Geocode** — opens an inline search box pre-filled with the place's hierarchy. Click Search; the app fetches the top 3 candidates, queues them for review, and takes you to the review panel. Picking a result there will run the same hierarchy/decomposition logic as the batch flow, so a single new "23 Main Street, Dublin" entry can become part of an existing Ireland → Leinster → Dublin chain rather than creating duplicates.

## A few other things worth knowing

- **Place types are customisable.** Click **Types** on the Places page to rename labels (e.g. call `municipality` "town" if that fits your country) or add custom types (e.g. "civil parish", "townland"). Custom types you create yourself can be deleted; built-in ones can only be relabelled.
- **The review queue is local to your browser.** It persists between sessions but it isn't synced. If you want to clear it without acting on the items, use **Reset Queue**.
- **You can re-run Geocode any time.** It only acts on places that have no coordinates and aren't already queued, so running it again after adding more events is safe.
- **You don't have to break addresses into a hierarchy if you don't want to.** Skip every queue item and your places will stay as flat strings. Geocoding still attaches coordinates so the map view works. Hierarchy is only created when you accept a geocoder result.

---

## Quick reference: what to do when…

| Situation | Action |
|---|---|
| Just imported a GEDCOM | Open Places → Merge Duplicates if needed, then Geocode |
| Geocoding found 0 results for a place | Use Retry in the review panel, simplify the query |
| Geocoding's top result is wrong but option 2 or 3 is right | Click any of that result's chips |
| The right result is too specific (a post office, not the town) | Click an earlier chip (e.g. the town chip) to truncate |
| All 3 results are wrong | Skip and try again later, or set coordinates manually |
| The place doesn't exist on modern maps (defunct townland, demolished farm) | Skip it during Geocode, then use Manual structure to file it under a custom type |
| You have many comma-separated names with no Nominatim equivalent | Use Manual structure — work through segments most-frequent first |
| Two places turned out to be the same after geocoding | Edit one's events to point at the other, then delete the empty one (the merge tool only handles flat untyped places) |
| You want to start the geocode process over | Reset Queue, then re-run Geocode |
| Adding a single new place from an event | Use the place picker; click Geocode in the place form for one-off lookups |
