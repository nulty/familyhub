# Theming

The UI is fully token-driven. A theme is a set of CSS custom-property values —
nothing else. There are no theme branches in components or templates.

## The two tiers

All tokens live in `src/styles.css` between `/* tokens:begin */` and
`/* tokens:end */`:

- **Tier 1 — primitives.** Named by what they *are*: `--blue-600`, `--gray-150`,
  `--azure-100`. Raw values live here and only here.
- **Tier 2 — semantics.** Named by what they *do*: `--accent`,
  `--surface-hover`, `--text-faint`, `--event-birth`. Each theme is one block
  assigning semantics from primitives.

## The hard rule

CSS outside the token markers — the rest of `styles.css` and every component
`<style>` block — may reference **tier-2 semantic tokens only**.

Never:

- literal colors (`#2563eb`, `rgba(...)`, `hsl(...)`)
- literal font sizes (`font-size: 13px`)
- tier-1 primitives (`var(--blue-600)`)
- `var()` fallbacks (`var(--accent, #3498db)`) — this pattern is how the app
  once grew a second undeclared palette that shipped to production. A token
  either exists in the token block or the reference is a bug; a fallback hides
  the bug.

`tests/token-guard.test.js` enforces all of this and fails `npm test` on
violations. Justified exceptions go in its `ALLOWLIST` with a reason.

Spacing (`padding`/`margin`/`gap`) is deliberately *not* policed — a `--s1`…
`--s7` scale exists for new code, but existing literals were left alone.
`border-radius: 50%` (circles) and `border-radius: 0` are geometry, not
styling, and stay literal.

## Adding or changing a theme

1. Add any genuinely new raw values as tier-1 primitives.
2. Add a `[data-theme="<name>"]` block assigning the tier-2 inventory.
   Copy the Classic block as the checklist — every semantic it assigns, your
   theme should assign (or knowingly inherit).
3. The theme activates via `data-theme` on `<html>`.
4. If a rule genuinely can't be expressed by token remapping, add it under
   `[data-theme="<name>"]` in `styles.css` — never in a component, and keep
   that override list short. A growing override list means the theme is
   drifting into a second UI.

Chart colors are special: users can override them in tree settings, applied as
inline styles by `src/ui/tree-config.js`. Themes provide the defaults;
persisted user overrides win. (Nullable-override migration: plan Task 6.)

## Why

Design/spec/plan: `../../docs/superpowers/specs/2026-07-18-ui-themes-design.md`
and `../../docs/superpowers/plans/2026-07-18-ui-themes.md` (workspace root).
