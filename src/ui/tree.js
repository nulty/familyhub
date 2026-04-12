/**
 * tree.js — Family-chart wrapper
 */

import { createChart } from 'family-chart';
import { graph, relationships } from '../db/db.js';
import { emit, PERSON_SELECTED, DATA_CHANGED } from '../state.js';
import { getTreeConfig, applyTreeColors, applyCardDisplay } from './tree-config.js';
import { openPersonForm } from '../lib/shared/open.js';

let chart = null;
let card = null;
let currentMainId = null;

function formatData(data) {
  const ids = new Set(data.map(d => d.id));
  return data.map(d => ({
    id: d.id,
    data: {
      'first name': d.data.given_name || '',
      'last name': d.data.surname || '',
      'life years': d.data.life_years || '',
      'birth date': d.data.birth_date || '',
      'birth place': d.data.birth_place || '',
      'death date': d.data.death_date || '',
      'death place': d.data.death_place || '',
      deceased: !!d.data.death_date,
      gender: d.data.gender === 'F' ? 'F' : d.data.gender === 'M' ? 'M' : undefined,
    },
    rels: {
      spouses: (d.rels.spouses || []).filter(id => ids.has(id)),
      children: (d.rels.children || []).filter(id => ids.has(id)),
      father: ids.has(d.rels.father) ? d.rels.father : undefined,
      mother: ids.has(d.rels.mother) ? d.rels.mother : undefined,
    },
  }));
}

function cardDimFromConfig(cfg) {
  return {
    w: cfg.cardWidth ?? 200,
    h: cfg.cardHeight ?? 50,
    height_auto: true,
    text_x: 10, text_y: 15,
    img_w: 0, img_h: 0, img_x: 0, img_y: 0,
  };
}

function cardHtmlCreator(d) {
  const data = d.data?.data || d.data || {};
  const cfg = getTreeConfig();
  const name = [data['first name'], data['last name']].filter(Boolean).join(' ') || 'Unnamed';
  const deceased = data.deceased ? ' card-deceased' : '';
  const w = cfg.cardWidth ?? 200;

  const fields = [
    { key: 'life years', cls: 'card-life-years', value: data['life years'] },
    { key: 'birth date', cls: 'card-birth-date', value: data['birth date'], prefix: 'b. ' },
    { key: 'birth place', cls: 'card-birth-place', value: data['birth place'] },
    { key: 'death date', cls: 'card-death-date', value: data['death date'], prefix: 'd. ' },
    { key: 'death place', cls: 'card-death-place', value: data['death place'] },
  ];

  const extras = fields
    .filter(f => f.value)
    .map(f => `<div class="${f.cls}">${f.prefix || ''}${f.value}</div>`)
    .join('');

  return `<div class="card-inner card-rect${deceased}" style="width:${w}px">
    <div class="card-name">${name}</div>
    ${extras}
  </div>`;
}

/**
 * Create the chart for the first time. Called once on boot.
 */
export async function initTree(initialFocusId) {
  const data = await graph.getData();
  if (data.length === 0) return;

  const formatted = formatData(data);
  const cont = document.getElementById('FamilyChart');
  cont.innerHTML = '';

  const cfg = getTreeConfig();

  chart = createChart(cont, formatted)
    .setCardXSpacing(cfg.xSpacing ?? 300)
    .setCardYSpacing(cfg.ySpacing ?? 200)
    .setTransitionTime(0);

  if (cfg.orientation === 'horizontal') chart.setOrientationHorizontal();
  else chart.setOrientationVertical();

  chart.setAncestryDepth(cfg.ancestryDepth ?? 3);
  chart.setProgenyDepth(cfg.progenyDepth ?? 3);

  card = chart.setCardHtml()
    .setCardDisplay([['first name', 'last name']])
    .setStyle('rect')
    .setCardDim(cardDimFromConfig(cfg))
    .setCardInnerHtmlCreator(cardHtmlCreator)
    .setMiniTree(true)
    .setOnCardClick((e, d) => {
      if (d.data.to_add) {
        // Placeholder card from family-chart — create person and link relationships
        const gender = d.data.data?.gender || 'U';
        const rels = d.data.rels || {};
        openPersonForm(null, async (created) => {
          // Link as parent of any children
          for (const childId of (rels.children || [])) {
            await relationships.addParentChild(created.id, childId);
          }
          // Link as partner of any spouses
          for (const spouseId of (rels.spouses || [])) {
            await relationships.addPartner(created.id, spouseId);
          }
          // Link as child of any parents
          for (const parentId of (rels.parents || [])) {
            await relationships.addParentChild(parentId, created.id);
          }
          emit(DATA_CHANGED);
        }, gender);
        return;
      }
      const clickedId = d.data.id;
      if (clickedId === currentMainId) {
        emit(PERSON_SELECTED, clickedId);
      } else {
        currentMainId = clickedId;
        chart.updateMainId(clickedId);
        chart.updateTree({ tree_position: 'main_to_middle' });
      }
    })
    .setOnHoverPathToMain();

  if (initialFocusId && formatted.some(d => d.id === initialFocusId)) {
    currentMainId = initialFocusId;
    chart.updateMainId(initialFocusId);
    chart.updateTree({ initial: true, tree_position: 'main_to_middle' });
  } else {
    chart.updateTree({ initial: true, tree_position: 'fit' });
  }

  applyCardDisplay(cfg);
  chart.setTransitionTime(1000);

  // Set zoom limits
  const svg = cont.querySelector('.main_svg');
  const listener = svg?.__zoomObj ? svg : svg?.parentNode;
  if (listener?.__zoomObj) listener.__zoomObj.scaleExtent([0.05, 5]);
}

/**
 * Re-fetch data and update the existing chart. Preserves zoom/pan.
 * Called after CRUD operations (DATA_CHANGED).
 */
export async function refreshTree() {
  const data = await graph.getData();
  if (data.length === 0) {
    chart = null;
    card = null;
    return;
  }
  // If the focused person was deleted, fall back to any valid person
  if (currentMainId && !data.some(d => d.id === currentMainId)) {
    currentMainId = data[0].id;
  }
  if (!chart) {
    await initTree(currentMainId);
    applyTreeColors(getTreeConfig());
    return;
  }
  const formatted = formatData(data);
  chart.updateData(formatted);
  chart.updateMainId(currentMainId);
  chart.updateTree({ tree_position: 'inherit' });
}

/**
 * Update chart layout settings without destroying it. Preserves zoom/pan.
 * Called from settings panel when spacing, orientation, depth, or card size changes.
 */
export function rebuildTree() {
  if (!chart || !card) return;
  const cfg = getTreeConfig();

  chart.setCardXSpacing(cfg.xSpacing ?? 300);
  chart.setCardYSpacing(cfg.ySpacing ?? 200);

  if (cfg.orientation === 'horizontal') chart.setOrientationHorizontal();
  else chart.setOrientationVertical();

  chart.setAncestryDepth(cfg.ancestryDepth ?? 3);
  chart.setProgenyDepth(cfg.progenyDepth ?? 3);

  card.setCardDim(cardDimFromConfig(cfg));

  chart.updateTree({ tree_position: 'inherit' });

  // Update card inner widths (cardInnerHtmlCreator doesn't re-run for existing cards)
  const w = cfg.cardWidth ?? 200;
  for (const el of document.querySelectorAll('.f3 .card-inner.card-rect')) {
    el.style.width = w + 'px';
  }

  applyCardDisplay(cfg);
}

export function focusPerson(id) {
  if (!chart) return;
  currentMainId = id;
  chart.updateMainId(id);
  chart.updateTree({ tree_position: 'main_to_middle' });
}
