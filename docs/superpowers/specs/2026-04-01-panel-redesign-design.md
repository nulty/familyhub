# Panel Redesign: Compact Cards with Browse/Edit Modes

## Overview

Redesign the person context panel (Panel.svelte) to have two distinct modes: a clean browse mode for scanning facts and navigating, and an edit mode that reveals controls for data entry. Events display as compact coloured cards. Family relationships group children by their other parent.

## Modes

### Browse Mode (default)
- Read-only, no edit/delete/add controls visible
- Optimised for scanning a person's key facts and navigating to related people
- Clicking a person chip in the Family section navigates: focuses the tree and loads their panel
- Clicking a person in the tree also navigates normally

### Edit Mode (toggle via "Edit" button in header)
- Same layout with controls revealed on each section
- Panel is locked to the current person — tree clicks focus the tree but do not update the panel
- Exiting edit mode re-enables normal navigation

## Layout (top to bottom)

### 1. Header
- Person's full name, large (22px), with a small gender colour dot (blue=M, pink=F, grey=U) to the left of the name
- Life years underneath: "1890 - 1945" derived from birth/death events. Show "(aged ~55)" if both dates known.
- "Edit" toggle button top-right. When active, shows as "Done" with a distinct style.
- No close button in edit mode to prevent accidental dismissal. Close button visible in browse mode.

### 2. Alternative Names
- Displayed as small pills/tags below the header: `[nick] Jack` `[aka] John P. Smyth`
- Only shown if the person has entries in `person_names`
- **Edit mode:** adds "+ Add Name" link after the pills. Each pill gets an "x" to delete.

### 3. Events (Compact Cards)
- Each event rendered as a card with:
  - Coloured left border (3px) by event type
  - Small coloured icon/dot matching the type
  - Event type label (capitalised) and date on the same line
  - Place on the next line (grey text)
  - For shared events (marriage, census): participant names as blue clickable links ("with Mary Jones, Thomas Smith")
  - For occupation events: notes shown as the detail (e.g. "Labourer"), place shown inline with citation
  - Citation(s) as subtle small italic text at the bottom of the card. If the citation has a URL, the text is a link.
- Sorted chronologically by sort_date (null dates at the end)

**Event type colours:**
| Type | Colour | Hex |
|------|--------|-----|
| birth | green | #22c55e |
| death | grey | #6b7280 |
| marriage | pink | #ec4899 |
| census | purple | #8b5cf6 |
| occupation | amber | #f59e0b |
| residence | cyan | #06b6d4 |
| other | slate | #94a3b8 |

**Edit mode additions:**
- Each card gets small "edit" and "delete" links (top-right of card, or on hover)
- Events without any citation show an "add citation" link at the bottom of the card
- Events without a place show an "add place" link
- "+ Add Event" button at the bottom of the events section

### 4. Family
- Single section, not three separate collapsibles
- **Parents** group: clickable chips with gender dot, name, and life dates. Format: `[dot] Thomas Smith 1860-1920`
- **Partner groups with children:** For each partner, show the partner as a chip, then their shared children as chips below. Group heading is implicit from the partner chip. Format:
  ```
  With [dot] Mary Jones 1895-1960
    [dot] Patrick Smith 1921-
    [dot] Annie Smith 1923-1990
  ```
- If children have no known other parent, group under "Other Children"
- Chips are clickable in browse mode (navigate to that person)

**Edit mode additions:**
- Each relationship chip gets an "x" remove button
- "+ Add Parent", "+ Add Partner", "+ Add Child" buttons at appropriate positions

### 5. Notes
- Person's notes displayed as text at the bottom, with URLs auto-linked
- Only shown if notes exist
- **Edit mode:** shows an "edit" link to open the person form

## Participating Events
- Events where this person is a participant on someone else's owned event (e.g. witness at a baptism)
- Shown in a separate collapsible section below Family, only if there are any
- Compact display: event type, date, role, and "on [Owner Name]" as a link
- Not affected by edit mode (these belong to other people)

## Data Requirements

The panel already receives all needed data from `getPersonWithEvents`:
- `person` — name, gender, notes
- `names` — alternative names array
- `events` — owned events with citations and participants
- `sharedEvents` — shared events (marriage, census) with citations and participants
- `participatingEvents` — events on other people where this person is a participant
- `parents`, `partners`, `children` — relationship arrays

**New data needed for children-by-partner grouping:**
- For each child, determine which partner is the other parent. This can be derived client-side: for each child, check if any of the person's partners is also a parent of that child (by checking the child's parents list against the person's partners list).
- Alternative: add a handler that returns children grouped by partner. But client-side derivation is simpler since all the data is already loaded.

**New data needed for life dates on family chips:**
- Family members (parents, partners, children) need birth/death years for the chip display
- Current `getFamily` returns basic person data but not events. Options:
  - Add birth_year/death_year subqueries to `getFamily` (like `getGraphData` does)
  - Or derive from a separate call

Recommended: add birth_year/death_year to the `getFamily` query via subqueries. Small change, avoids extra round-trips.

## Styling Notes

- Panel background: white (#fff)
- Card background: #f9fafb
- Border radius on cards: 8px
- Font sizes: name 22px, life dates 14px, section titles 11px uppercase, event content 12px, citations 10px
- Section titles: uppercase, letter-spaced, muted colour (#9ca3af), with a top border separator
- Gender dot: 8px circle, inline before name
- Relationship chips: rounded (8px), light background, blue text for names, muted text for dates
- Edit mode controls: small, muted, don't dominate — revealed but not shouting

## Files to Modify

- `src/lib/components/Panel.svelte` — complete rewrite of template and script
- `src/styles.css` — new panel styles (replace existing panel CSS)
- `src/db/handlers.js` — add birth_year/death_year to `getFamily` query
- `src/lib/components/App.svelte` — wire edit mode to prevent tree navigation when panel is editing

## Out of Scope

- Inline editing of event fields (fields are edited via modal forms as today)
- Drag-and-drop reordering
- Photos/media display
- Undo/redo
