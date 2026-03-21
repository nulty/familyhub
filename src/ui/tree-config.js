/**
 * tree-config.js — Tree display settings panel
 */

import { getConfig, setConfig } from '../config.js';
import { rebuildTree } from './tree.js';

const DEFAULTS = {
  // Colours
  maleColor: '#93c5fd',
  femaleColor: '#f9a8d4',
  otherColor: '#e5e7eb',
  bgColor: '#fafafa',
  lineColor: '#555555',
  // Layout
  orientation: 'vertical',
  ancestryDepth: 3,
  progenyDepth: 3,
  // Card sizing
  cardWidth: 200,
  cardHeight: 50,
  xSpacing: 300,
  ySpacing: 200,
  // Card display
  showLifeYears: false,
  showBirthDate: false,
  showBirthPlace: false,
  showDeathDate: false,
  showDeathPlace: false,
};

export function getTreeConfig() {
  return { ...DEFAULTS, ...getConfig('treeConfig', {}) };
}

function saveTreeConfig(cfg) {
  setConfig('treeConfig', cfg);
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

  // Update existing link strokes
  for (const l of document.querySelectorAll('.f3 .link')) {
    l.style.stroke = cfg.lineColor;
  }
}

function closeConfig() {
  const panel = document.getElementById('tree-config');
  panel.classList.remove('open');
  document.querySelector('.drawer-backdrop')?.remove();
}

function addBackdrop() {
  // Only add backdrop on mobile (when the panel is a drawer)
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

  const cfg = getTreeConfig();

  panel.innerHTML = `
    <div class="tree-config-header">
      <h3>Display Settings</h3>
      <button class="panel-close" data-action="close">&times;</button>
    </div>
    <div class="tree-config-body">
      <div class="cfg-row">
        <label>Male</label>
        <input type="color" data-key="maleColor" value="${cfg.maleColor}">
        <button class="btn-link btn-sm" data-reset="maleColor">reset</button>
      </div>
      <div class="cfg-row">
        <label>Female</label>
        <input type="color" data-key="femaleColor" value="${cfg.femaleColor}">
        <button class="btn-link btn-sm" data-reset="femaleColor">reset</button>
      </div>
      <div class="cfg-row">
        <label>Other</label>
        <input type="color" data-key="otherColor" value="${cfg.otherColor}">
        <button class="btn-link btn-sm" data-reset="otherColor">reset</button>
      </div>
      <div class="cfg-row">
        <label>Background</label>
        <input type="color" data-key="bgColor" value="${cfg.bgColor}">
        <button class="btn-link btn-sm" data-reset="bgColor">reset</button>
      </div>
      <div class="cfg-row">
        <label>Lines</label>
        <input type="color" data-key="lineColor" value="${cfg.lineColor}">
        <button class="btn-link btn-sm" data-reset="lineColor">reset</button>
      </div>
      <div class="cfg-section-label">Layout</div>
      <div class="cfg-row">
        <label>Orientation</label>
        <select data-key="orientation" data-rebuild>
          <option value="vertical" ${cfg.orientation === 'vertical' ? 'selected' : ''}>Vertical</option>
          <option value="horizontal" ${cfg.orientation === 'horizontal' ? 'selected' : ''}>Horizontal</option>
        </select>
      </div>
      <div class="cfg-row">
        <label>Ancestors</label>
        <select data-key="ancestryDepth" data-rebuild>
          ${[1,2,3,4,5,10].map(n => `<option value="${n}" ${cfg.ancestryDepth === n ? 'selected' : ''}>${n} gen</option>`).join('')}
        </select>
      </div>
      <div class="cfg-row">
        <label>Descendants</label>
        <select data-key="progenyDepth" data-rebuild>
          ${[1,2,3,4,5,10].map(n => `<option value="${n}" ${cfg.progenyDepth === n ? 'selected' : ''}>${n} gen</option>`).join('')}
        </select>
      </div>

      <div class="cfg-section-label">Card Display</div>
      <div class="cfg-row">
        <label>Life years</label>
        <input type="checkbox" data-key="showLifeYears" ${cfg.showLifeYears ? 'checked' : ''}>
      </div>
      <div class="cfg-row">
        <label>Birth date</label>
        <input type="checkbox" data-key="showBirthDate" ${cfg.showBirthDate ? 'checked' : ''}>
      </div>
      <div class="cfg-row">
        <label>Birth place</label>
        <input type="checkbox" data-key="showBirthPlace" ${cfg.showBirthPlace ? 'checked' : ''}>
      </div>
      <div class="cfg-row">
        <label>Death date</label>
        <input type="checkbox" data-key="showDeathDate" ${cfg.showDeathDate ? 'checked' : ''}>
      </div>
      <div class="cfg-row">
        <label>Death place</label>
        <input type="checkbox" data-key="showDeathPlace" ${cfg.showDeathPlace ? 'checked' : ''}>
      </div>

      <div class="cfg-section-label">Card Size</div>
      <div class="cfg-row">
        <label>Width</label>
        <input type="range" data-key="cardWidth" min="120" max="300" step="10" value="${cfg.cardWidth}">
        <span class="cfg-value">${cfg.cardWidth}</span>
      </div>
      <div class="cfg-row">
        <label>Height</label>
        <input type="range" data-key="cardHeight" min="30" max="80" step="5" value="${cfg.cardHeight}">
        <span class="cfg-value">${cfg.cardHeight}</span>
      </div>

      <div class="cfg-section-label">Spacing</div>
      <div class="cfg-row">
        <label>Horizontal</label>
        <input type="range" data-key="xSpacing" min="150" max="400" step="10" value="${cfg.xSpacing}">
        <span class="cfg-value">${cfg.xSpacing}</span>
      </div>
      <div class="cfg-row">
        <label>Vertical</label>
        <input type="range" data-key="ySpacing" min="80" max="300" step="10" value="${cfg.ySpacing}">
        <span class="cfg-value">${cfg.ySpacing}</span>
      </div>

      <div class="cfg-actions">
        <button class="btn btn-sm" data-action="reset-all">Reset All</button>
      </div>
    </div>
  `;

  panel.classList.add('open');
  addBackdrop();

  // Live colour updates
  panel.querySelectorAll('input[type="color"]').forEach(input => {
    input.addEventListener('input', () => {
      cfg[input.dataset.key] = input.value;
      saveTreeConfig(cfg);
      applyTreeColors(cfg);
    });
  });

  // Range sliders — update tree live as you drag, save on release
  panel.querySelectorAll('input[type="range"]').forEach(input => {
    const span = input.parentElement.querySelector('.cfg-value');
    input.addEventListener('input', () => {
      if (span) span.textContent = input.value;
      cfg[input.dataset.key] = parseInt(input.value, 10);
      saveTreeConfig(cfg);
      rebuildTree();
    });
  });

  // Checkboxes — toggle CSS visibility, no rebuild needed
  panel.querySelectorAll('input[type="checkbox"]').forEach(input => {
    input.addEventListener('change', () => {
      cfg[input.dataset.key] = input.checked;
      saveTreeConfig(cfg);
      applyCardDisplay(cfg);
    });
  });

  // Layout selects — save and rebuild tree
  panel.querySelectorAll('select[data-key]').forEach(select => {
    select.addEventListener('change', () => {
      let value = select.value;
      if (!isNaN(parseInt(value))) value = parseInt(value, 10);
      cfg[select.dataset.key] = value;
      saveTreeConfig(cfg);
      rebuildTree();
    });
  });

  // Reset individual
  panel.querySelectorAll('[data-reset]').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.reset;
      cfg[key] = DEFAULTS[key];
      panel.querySelector(`[data-key="${key}"]`).value = DEFAULTS[key];
      saveTreeConfig(cfg);
      applyTreeColors(cfg);
    });
  });

  // Reset all
  panel.querySelector('[data-action="reset-all"]').addEventListener('click', () => {
    Object.assign(cfg, DEFAULTS);
    saveTreeConfig(cfg);
    applyTreeColors(cfg);
    closeConfig();
    rebuildTree();
  });

  // Close
  panel.querySelector('[data-action="close"]').addEventListener('click', closeConfig);
}
