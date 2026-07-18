/**
 * tree-config.js — Bridge: mounts Svelte TreeConfig into #tree-config.
 * Exports getTreeConfig, applyTreeColors, applyCardDisplay for tree.js.
 */
import { mount, unmount } from 'svelte';
import TreeConfig from '../lib/components/TreeConfig.svelte';
import { getConfig, setConfig } from '../config.js';
import { migrateColors, applyChartColors } from './chart-colors.js';

const DEFAULTS = {
  // Chart colors are nullable: null = follow the active theme (stylesheet
  // defaults from semantic tokens); a hex string is a user override.
  maleColor: null,
  femaleColor: null,
  otherColor: null,
  bgColor: null,
  lineColor: null,
  orientation: 'vertical',
  ancestryDepth: 3,
  progenyDepth: 3,
  cardWidth: 200,
  cardHeight: 50,
  xSpacing: 300,
  ySpacing: 200,
  showLifeYears: false,
  showBirthDate: false,
  showBirthPlace: false,
  showDeathDate: false,
  showDeathPlace: false,
};

export function getTreeConfig() {
  const stored = getConfig('treeConfig', {});
  // Lazy migration: colors equal to the pre-token hard defaults were never a
  // deliberate choice — rewrite them to null (follow theme) once.
  const { config, changed } = migrateColors(stored);
  if (changed) setConfig('treeConfig', config);
  return { ...DEFAULTS, ...config };
}

export function applyCardDisplay(cfg) {
  const cont = document.getElementById('FamilyChart');
  if (!cont) return;
  cont.classList.toggle('hide-life-years', !cfg.showLifeYears);
  cont.classList.toggle('hide-birth-date', !cfg.showBirthDate);
  cont.classList.toggle('hide-birth-place', !cfg.showBirthPlace);
  cont.classList.toggle('hide-death-date', !cfg.showDeathDate);
  cont.classList.toggle('hide-death-place', !cfg.showDeathPlace);
}

export function applyTreeColors(cfg) {
  applyChartColors(cfg);
}

let component = null;

function closeConfig() {
  const panel = document.getElementById('tree-config');
  panel.classList.remove('open');
  document.querySelector('.drawer-backdrop')?.remove();
  if (component) {
    unmount(component);
    component = null;
    panel.innerHTML = '';
  }
}

function addBackdrop() {
  if (window.innerWidth > 768) return;
  const existing = document.querySelector('.drawer-backdrop');
  if (existing) return;
  const backdrop = document.createElement('div');
  backdrop.className = 'drawer-backdrop';
  backdrop.addEventListener('click', closeConfig);
  document.body.appendChild(backdrop);
}

export function openTreeConfig() {
  const panel = document.getElementById('tree-config');
  if (panel.classList.contains('open')) {
    closeConfig();
    return;
  }

  panel.innerHTML = '';
  component = mount(TreeConfig, {
    target: panel,
    props: { onclose: closeConfig },
  });

  panel.classList.add('open');
  addBackdrop();
}
