# FamilyHub

A browser-based family tree application. All data is stored locally in your browser using SQLite — no server, no accounts, no cloud. Your data stays on your device.

## Features

### Tree Visualization
- Interactive, zoomable family tree powered by family-chart and D3
- Pan and zoom with mouse or touch gestures
- Click a person to focus on them; click again to view their details
- Configurable tree orientation (vertical or horizontal)
- Adjustable ancestry and descendant depth (1–10 generations)

### People
- Create, edit, and delete people with given name, surname, gender, and notes
- Notes support clickable URLs
- Deceased people are visually distinguished on the tree

### Relationships
- Add parents, partners, and children
- Search for existing people or create new ones when adding relationships
- Remove relationships individually

### Events
- Add life events: birth, death, marriage, burial, residence, census, immigration, emigration, occupation, and more
- Each event can have a date (free text — supports formats like "3 SEP 1913", "ABT 1890", "BET 1889 AND 1890"), place, and notes
- Events are sorted chronologically in the detail panel

### Sources
- Attach sources to any event with a title and URL
- Sources display as clickable links in the detail panel

### GEDCOM
- Import GEDCOM 5.5.1 files — preview stats before importing
- Export your tree as a GEDCOM file for use in other genealogy software

### Search
- Search across all people by name from the header search bar
- Click a result to focus on that person in the tree

### Display Settings
- Customizable card colours (male, female, other, background, connecting lines)
- Adjustable card width, height, and spacing — all update live
- Toggle card info: life years, birth date, birth place, death date, death place
- Settings persist across sessions

### Data Management
- Download the raw SQLite database file for backup or external analysis
- Data persists in the browser via OPFS (Origin Private File System)
- Works offline after first load

### Mobile Support
- Responsive layout — action buttons move to a bottom bar on small screens
- Detail panel opens as a full-screen overlay on mobile
- Settings panel opens as a bottom drawer on mobile
- Touch-friendly tap targets and input sizing

## Getting Started

```bash
npm install
npm run dev
```

Open the app in your browser. You can either:
- Click **+ Person** to create your first family member
- Click **Import** to load an existing GEDCOM file

### Accessing from other devices on your network

The dev server runs over HTTPS (self-signed certificate) so that OPFS storage works on LAN connections. Accept the browser certificate warning when accessing from another device.

## Deployment

The app deploys to GitHub Pages automatically on push to `main` via GitHub Actions. To set up:

1. Go to your repo's **Settings > Pages**
2. Set **Source** to **GitHub Actions**
3. Push to `main`

The app works on any static host — see [docs/storage.md](docs/storage.md) for header requirements.

## Browser Support

- Chrome / Edge: full support
- Safari 17+: supported
- Firefox 111+: supported

OPFS requires a secure context (HTTPS or localhost). On unsupported browsers, data falls back to in-memory storage and won't persist across reloads.

## Documentation

- [API Reference](docs/api.md) — database API for developers
- [Database Schema](docs/schema.md) — table definitions and relationships
- [Storage & Cross-Origin Isolation](docs/storage.md) — how data persistence and COOP/COEP headers work

## Tech Stack

- Vanilla JavaScript ES Modules — no framework
- [SQLite WASM](https://sqlite.org/wasm) with OPFS for persistent client-side storage
- [family-chart](https://github.com/donatso/family-chart) (D3-based) for tree visualization
- [Vite](https://vite.dev) for dev server and builds
- [Vitest](https://vitest.dev) with better-sqlite3 for testing
