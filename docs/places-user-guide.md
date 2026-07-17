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

Imported places flow through a **funnel**: every place ends up geocoded (or manually typed and filed), because until then it won't appear in place searches or on the map.

1. **Import** your GEDCOM — every imported place is queued automatically, and you're offered a shortcut straight to the Places page.
2. **Merge** any obvious duplicate place names (optional but recommended — it shrinks the geocoding run).
3. **Geocode** — each place is looked up and routed by its result: a single unambiguous match is applied automatically; multiple matches go to **Review**; no match goes to **Correct**.
4. **Review** — pick the right candidate (or reject them all, which moves the place to Correct).
5. **Correct** — fix the name and retry, or resolve by hand (assign a type and parent; the **Manual structure** wizard helps with batches of historic addresses).
6. From this point on, **add new places one at a time** as you create new events — those are born organized.

The Places toolbar shows a chip for each stage that still has work — **Geocode (N)**, **Review (N)**, **Correct (N)** — and the chips disappear as the counts hit zero. You don't have to do it in one sitting: the queue is saved between visits, and nothing falls out of it until it's resolved.

---

## Step 1 — Import your GEDCOM

Open Import, pick your `.ged` file, and confirm. After import you'll see a summary that includes a place count, e.g. `Places: 47 (3 variants merged)`.

The "variants merged" number means the app collapsed obvious typing differences automatically — `"Dublin, Ireland"` and `"dublin,ireland"` are treated as the same place, so you only get one record.

At this point your places are a **flat list**, all queued for geocoding. A prompt offers **Organize places** — it takes you straight to the Places page; **Later** just closes, and the toolbar chips will be waiting whenever you open Places yourself.

## Step 2 — (Recommended) Merge duplicates

Open **Places** from the main menu, then pick **Merge duplicates** from the **Tools ▾** menu.

This tool operates on untyped, top-level places — exactly what you have right after a GEDCOM import. It shows you three things:

- **Auto-grouped duplicates.** Sets of places whose names match after normalising case and spacing. For each group, the row with the most events attached is pre-selected as "keep". Click another row to change which one survives, then click **Merge**. The keep record absorbs the events, coordinates (if it doesn't already have any), and notes from the others, and the duplicates are deleted.
- **Matches with organized places.** Flat records whose name matches a place you've already organized (e.g. a leftover flat `"Birmingham?"` next to an organized Birmingham › England). One click merges the flat record into the organized one — its events are repointed and the flat record is removed.
- **All untyped places.** A flat, filterable list. Click rows to select multiple places that you know are the same but spelled too differently for the auto-grouper to catch (e.g. `"Dub."` and `"Dublin"`). Shift-click to select a range. Once you've selected two or more, a merge bar appears — click any selected row to mark it as the keep target, then click **Merge**.

If nothing looks duplicated, skip this step. You can always come back later.

### Edge cases for merging

- **You're not sure they're the same place.** Don't merge. You can always merge later, but you can't un-merge. If in doubt, geocode first — if both records geocode to the same coordinates, that's strong evidence.
- **One of the duplicates has coordinates and the others don't.** The keep record will inherit coordinates if it doesn't already have any. If multiple records have coordinates, the keep record's own coordinates win — pick the one with the right ones.
- **The records have different notes.** Notes are appended together, separated by a divider, so nothing is lost.

## Step 3 — Geocode

Click the **Geocode (N)** chip on the Places toolbar (or **Tools ▾ → Geocode places…**). A picker appears.

- **Select which places to geocode.** Everything eligible (no coordinates yet, and not already awaiting review or correction) is pre-selected — including everything queued by the import. Filter by name, click rows to deselect, shift-click for a range, or use **Select all** / **Select none**.
- **Set a region bias** (optional but very helpful). Type something like `Ireland` or `Massachusetts USA`. Each query gets that suffix added unless the place name already contains it. Without a bias, ambiguous names like "Springfield" can match anywhere in the world. The bias is remembered for next time.

Click **Start geocoding**. Each place is routed by its own result:

- **Exactly one match** → applied automatically. Done.
- **Two or more matches** → goes to **Review** for you to pick.
- **No match** → goes to **Correct** for fixing or manual resolution.

Progress is shown in a toast at the bottom of the screen, and the summary tells you how each pile came out (e.g. "28 matched automatically, 12 need review, 7 need correction"). Geocoding is rate-limited to about one place per second (a hard limit set by the free OpenStreetMap geocoder we use), so a few hundred places will take a few minutes. You can click **Stop geocoding** at any time — anything already processed stays processed.

When a place is accepted (whether automatically or by you in the next step), the app does three things in one go:

1. Splits the geocoder's result into a hierarchy (country → region → county → city → suburb → street, etc.) and creates only the parts that don't already exist.
2. Stores the coordinates on the most specific level.
3. Repoints all events from the original flat record to the new specific record, then deletes the original flat record.

This means each event ends up linked to a precise, typed, coordinate-bearing place — and shared parts of the hierarchy (e.g. "Ireland", "Leinster") are reused across all your places, not duplicated.

## Step 4 — Review what didn't auto-resolve

If any places came back with multiple matches, a **Review (N)** chip appears on the Places toolbar; places with no match show up in the **Correct (N)** chip. Both open the same panel, which has two sections:

### Results

Places where the geocoder returned at least one candidate. For each candidate you'll see its full address (small grey text) and a confidence percentage, plus a row of clickable **level chips** like:

> `United States` › `New York` › `Suffolk County` › `Southampton` › `Main St` › `123`

Click any chip to accept the result truncated at that level. Clicking the rightmost chip gives you the most specific record (street/house). Clicking an earlier chip — say `Southampton` — drops everything more specific, so the place ends up filed as a town rather than a post office. This is the fix for results that come back too specific (a business at the right town gets you "Southampton" if you click the town chip instead of the building name).

If none of the candidates are right, click **None of these** — the place moves to the correction pile instead of being forgotten. You can also edit the query in the box below the results and click **Retry**; a retry that comes back with exactly one match is applied automatically.

There's also an **Accept all top results** button at the top of the review panel. It accepts the first candidate per item at full specificity — useful when you've eyeballed the list and the top guesses look right.

### Needs correction

Places with no usable match — either the geocoder found nothing, or you rejected its candidates. Each one offers two ways out:

- **Retry with a better name.** Edit the query (add a country, fix a typo, drop the `(1901)` annotation, simplify the address) and click **Retry**. One match applies automatically; several send it back to Results; none keeps it here.
- **Resolve manually.** Opens the place editor where you assign a type and parent by hand (coordinates optional). Once it has a type it's organized — searchable, and off the worklist.

### Edge cases for review

- **The right answer is "this place no longer exists."** The geocoder can only find places that exist today. For historic places — old townlands, demolished buildings, renamed villages — either search for the modern locality and accept that, or use **Resolve manually** to file it under the right type and parent yourself.
- **The query is right but the geocoder is being unhelpful.** Try **Retry** with a simpler version of the address. Often dropping the street number, then dropping the street, then dropping the suburb gets you a usable result. The hierarchy will be less specific but the coordinates will be roughly correct.
- **You accidentally accepted the wrong result.** Open the place from the Places list and click **Edit**. You can change the name, type, parent, and coordinates by hand. If a whole hierarchy got created from a bad accept, you can also just delete the leaf and let the parent records stay (they may be useful for other places).
- **You want to start over.** **Tools ▾ → Reset queue** wipes all queued geocode work without affecting places that have already been accepted.

## Step 5 — Manual structure (for places the geocoder couldn't find)

Some addresses don't exist in modern maps: townlands that have been absorbed into larger administrative areas, demolished farms, defunct civil parishes, fictional or family-only place names. Nominatim returns nothing for these, so the geocoder skips them.

After you've worked through the review queue, anything still left as a flat untyped place — especially anything with commas in its name, like `"Knockboy, Glenoe, Antrim"` — can be tackled with **Manual structure** (the button on the Places toolbar).

This opens a wizard that:

- Reads every comma-separated piece across your remaining flat places.
- Walks you through each unique segment one at a time, most-frequent first.
- For each segment, lets you build the whole thing in one form: a clean name, a type, and the **chain of places it sits inside** — type each broader level inline (with its own type), or pick an existing place at any level to stop there (its ancestry carries the rest). No hopping into separate forms.
- Optionally finds **coordinates** for the composed chain with one click (or type them in), so even a manually-filed place can appear on the map.
- Restructures the flat places that contain that segment to point at the newly typed record — and if the segment *is* a whole flat record, that record itself is updated in place, so its events stay attached and it leaves the geocode worklist.

Use it when:

- You have historic addresses Nominatim doesn't know.
- You want to file places under custom types (e.g. "townland", "civil parish") without internet round-trips.
- You're working offline.
- Geocoding misclassified something at a coarse level and you want to set the proper structure manually.

Skip it if all your remaining places are standard modern addresses — Geocode + Review will get those done faster.

The wizard remembers segments you've already resolved or skipped, so if you close it and come back, you pick up where you left off.

## Step 6 — Adding new places later

After the import is cleaned up, you'll mostly add places one at a time as you enter new events. From an event form, the place picker offers existing places and lets you create new ones inline. The new-place form is **search-first**: type the address, pick a result, and the preview shows the hierarchy that will be created ("Will create Dublin › Leinster › Ireland"). Accepting runs the same hierarchy/decomposition logic as the batch flow, so a new "23 Main Street, Dublin" entry joins an existing Ireland → Leinster → Dublin chain instead of creating duplicates — no review round-trip needed.

If the search can't find it, open **"Can't find it? Enter manually"**:

- **Pick on map** — drops you onto the map view with a crosshair. Click the exact spot and you're returned to the form with the coordinates filled in **and a suggested hierarchy for that point already selected** (the app reverse-geocodes your pick; your clicked coordinates are kept, not the geocoder's). Accept it, or ignore it and fill the fields yourself.
- **Type everything by hand** — name, type, parent, optional coordinates. If you save without a type, the place is automatically queued for geocoding (you'll see it in the **Geocode (N)** chip) because untyped places don't appear in searches.

## A few other things worth knowing

- **Place types are customisable.** **Tools ▾ → Place types** renames labels (e.g. call `municipality` "town" if that fits your country) or adds custom types (e.g. "civil parish", "townland"). Custom types you create yourself can be deleted; built-in ones can only be relabelled.
- **The geocode queue is local to your browser.** It persists between sessions but it isn't synced. If you want to clear it without acting on the items, use **Tools ▾ → Reset queue**.
- **You can re-run Geocode any time.** It acts on places with no coordinates that aren't already awaiting review or correction, so running it again after adding more events is safe.
- **Nothing falls out of the funnel silently.** A place leaves the worklist only by being organized (a geocode accepted, or a type assigned manually), merged, or deleted. Rejecting candidates moves the place to **Correct**, it doesn't discard it. The one escape hatch is **Reset queue**, which clears all queued work at once.

---

## Quick reference: what to do when…

| Situation | Action |
|---|---|
| Just imported a GEDCOM | Take the "Organize places" prompt (or open Places later) → Merge duplicates if needed → Geocode chip |
| Geocoding found 0 results for a place | It's in **Correct** — edit the query and Retry, or Resolve manually |
| Geocoding's top result is wrong but option 2 or 3 is right | Click any of that result's chips |
| The right result is too specific (a post office, not the town) | Click an earlier chip (e.g. the town chip) to truncate |
| All the results are wrong | Click **None of these** — the place moves to Correct for fixing |
| The place doesn't exist on modern maps (defunct townland, demolished farm) | In Correct, click **Resolve manually** and file it under a custom type + parent |
| You have many comma-separated names with no Nominatim equivalent | **Tools ▾ → Manual structure** — work through segments most-frequent first |
| A flat leftover matches a place you already organized | **Tools ▾ → Merge duplicates** — see "Matches with organized places" |
| You want to start the geocode process over | **Tools ▾ → Reset queue**, then re-run Geocode |
| Adding a single new place from an event | Use the place picker; the new-place form is search-first with a hierarchy preview |
