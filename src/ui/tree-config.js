/**
 * tree-config.js — Bridge: mounts Svelte TreeConfig into #tree-config.
 * Exports getTreeConfig, applyTreeColors, applyCardDisplay for tree.js.
 */
import { mount, unmount } from 'svelte';
import TreeConfig from '../lib/components/TreeConfig.svelte';
import { getConfig, setConfig } from '../config.js';

const DEFAULTS = {
  maleColor: '#93c5fd',
  femaleColor: '#f9a8d4',
  otherColor: '#e5e7eb',
  bgColor: '#fafafa',
  lineColor: '#555555',
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
  return { ...DEFAULTS, ...getConfig('treeConfig', {}) };
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
  const f3 = document.querySelector('.f3');
  if (!f3) return;
  f3.style.setProperty('--male-color', cfg.maleColor);
  f3.style.setProperty('--female-color', cfg.femaleColor);
  f3.style.setProperty('--genderless-color', cfg.otherColor);
  f3.style.setProperty('--background-color', cfg.bgColor);
  document.querySelector('.f3 .main_svg')?.style.setProperty('background', cfg.bgColor);
  for (const l of document.querySelectorAll('.f3 .link')) {
    l.style.stroke = cfg.lineColor;
  }
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
