/**
 * chart-colors.js — user-overridable chart colors over theme defaults.
 *
 * Chart colors are nullable: null means "follow the active theme" (the
 * stylesheet supplies defaults from semantic tokens); a hex string is an
 * explicit user override applied as an inline custom property on .f3.
 *
 * Dependency-free on purpose — imported by both tree-config.js and
 * TreeConfig.svelte, and unit-tested in Node without DOM/Svelte.
 */

export const CHART_COLOR_KEYS = ['maleColor', 'femaleColor', 'otherColor', 'bgColor', 'lineColor'];

/** Pre-token hard defaults. A stored value equal to one of these was never a
 *  deliberate user choice — migrate it to null (follow theme). */
export const LEGACY_COLOR_DEFAULTS = {
  maleColor: '#93c5fd',
  femaleColor: '#f9a8d4',
  otherColor: '#e5e7eb',
  bgColor: '#fafafa',
  lineColor: '#555555',
};

/** Semantic token each override shadows — used by the settings UI to show
 *  the theme's resolved default in the color input when unset. */
export const COLOR_TOKEN = {
  maleColor: '--sex-m-fill',
  femaleColor: '--sex-f-fill',
  otherColor: '--sex-u-fill',
  bgColor: '--chart-bg',
  lineColor: '--chart-line',
};

/** Custom property each override writes on .f3. */
const COLOR_PROP = {
  maleColor: '--male-color',
  femaleColor: '--female-color',
  otherColor: '--genderless-color',
  bgColor: '--background-color',
  lineColor: '--chart-line',
};

/**
 * Migrate a stored treeConfig object: legacy-default colors become null.
 * Pure. Returns { config, changed }.
 */
export function migrateColors(stored) {
  const config = { ...stored };
  let changed = false;
  for (const key of CHART_COLOR_KEYS) {
    if (config[key] !== undefined && config[key] === LEGACY_COLOR_DEFAULTS[key]) {
      config[key] = null;
      changed = true;
    }
  }
  return { config, changed };
}

/**
 * Apply overrides as inline custom properties on .f3; null removes the
 * property so the theme's stylesheet default shows through.
 */
export function applyChartColors(cfg) {
  const f3 = document.querySelector('.f3');
  if (!f3) return;
  for (const key of CHART_COLOR_KEYS) {
    const prop = COLOR_PROP[key];
    if (cfg[key]) f3.style.setProperty(prop, cfg[key]);
    else f3.style.removeProperty(prop);
  }
  // main_svg carries its own background (set by family-chart markup)
  const svg = document.querySelector('.f3 .main_svg');
  if (svg) {
    if (cfg.bgColor) svg.style.setProperty('background', cfg.bgColor);
    else svg.style.removeProperty('background');
  }
}

/** Resolved theme default for a color key, for display in the settings UI. */
export function themeDefaultColor(key) {
  const f3 = document.querySelector('.f3') || document.documentElement;
  return getComputedStyle(f3).getPropertyValue(COLOR_TOKEN[key]).trim();
}
