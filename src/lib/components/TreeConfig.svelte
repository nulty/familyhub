<script>
  import { setConfig } from '../../config.js';
  import { rebuildTree } from '../../ui/tree.js';
  import { getTreeConfig } from '../../ui/tree-config.js';
  import { applyChartColors, themeDefaultColor } from '../../ui/chart-colors.js';

  const DEFAULTS = {
    // null = follow the active theme (see src/ui/chart-colors.js)
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

  const COLOR_ROWS = [
    { key: 'maleColor', label: 'Male' },
    { key: 'femaleColor', label: 'Female' },
    { key: 'otherColor', label: 'Other' },
    { key: 'bgColor', label: 'Background' },
    { key: 'lineColor', label: 'Lines' },
  ];

  const DEPTH_OPTIONS = [1, 2, 3, 4, 5, 10];

  let { onclose } = $props();

  let cfg = $state({ ...DEFAULTS, ...getTreeConfig() });

  function save() {
    setConfig('treeConfig', cfg);
  }

  function applyColors() {
    applyChartColors(cfg);
  }

  /** Value shown in the color input: user override, else the theme default. */
  function displayColor(key) {
    return cfg[key] ?? themeDefaultColor(key);
  }

  function applyDisplay() {
    const cont = document.getElementById('FamilyChart');
    if (!cont) return;
    cont.classList.toggle('hide-life-years', !cfg.showLifeYears);
    cont.classList.toggle('hide-birth-date', !cfg.showBirthDate);
    cont.classList.toggle('hide-birth-place', !cfg.showBirthPlace);
    cont.classList.toggle('hide-death-date', !cfg.showDeathDate);
    cont.classList.toggle('hide-death-place', !cfg.showDeathPlace);
  }

  function handleColor(key, value) {
    cfg[key] = value;
    save();
    applyColors();
  }

  function handleRange(key, value) {
    cfg[key] = parseInt(value, 10);
    save();
    rebuildTree();
  }

  function handleCheckbox(key, checked) {
    cfg[key] = checked;
    save();
    applyDisplay();
  }

  function handleSelect(key, value) {
    cfg[key] = isNaN(parseInt(value)) ? value : parseInt(value, 10);
    save();
    rebuildTree();
  }

  function resetColor(key) {
    cfg[key] = null;   // back to following the theme
    save();
    applyColors();
  }

  function resetAll() {
    cfg = { ...DEFAULTS };
    save();
    applyColors();
    onclose?.();
    rebuildTree();
  }
</script>

<div class="tree-config-header">
  <h3>Display Settings</h3>
  <button class="panel-close" onclick={() => onclose?.()}>&times;</button>
</div>
<div class="tree-config-body">
  {#each COLOR_ROWS as row (row.key)}
    <div class="cfg-row">
      <label>{row.label}</label>
      <input type="color" value={displayColor(row.key)} oninput={(e) => handleColor(row.key, e.target.value)}>
      {#if cfg[row.key] !== null}
        <button class="btn-link btn-sm" title="Back to theme default" onclick={() => resetColor(row.key)}>reset</button>
      {:else}
        <span class="cfg-value" title="Following the theme">theme</span>
      {/if}
    </div>
  {/each}

  <div class="cfg-section-label">Layout</div>
  <div class="cfg-row">
    <label>Orientation</label>
    <select value={cfg.orientation} onchange={(e) => handleSelect('orientation', e.target.value)}>
      <option value="vertical">Vertical</option>
      <option value="horizontal">Horizontal</option>
    </select>
  </div>
  <div class="cfg-row">
    <label>Ancestors</label>
    <select value={cfg.ancestryDepth} onchange={(e) => handleSelect('ancestryDepth', e.target.value)}>
      {#each DEPTH_OPTIONS as n}
        <option value={n}>{n} gen</option>
      {/each}
    </select>
  </div>
  <div class="cfg-row">
    <label>Descendants</label>
    <select value={cfg.progenyDepth} onchange={(e) => handleSelect('progenyDepth', e.target.value)}>
      {#each DEPTH_OPTIONS as n}
        <option value={n}>{n} gen</option>
      {/each}
    </select>
  </div>

  <div class="cfg-section-label">Card Display</div>
  <div class="cfg-row">
    <label>Life years</label>
    <input type="checkbox" checked={cfg.showLifeYears} onchange={(e) => handleCheckbox('showLifeYears', e.target.checked)}>
  </div>
  <div class="cfg-row">
    <label>Birth date</label>
    <input type="checkbox" checked={cfg.showBirthDate} onchange={(e) => handleCheckbox('showBirthDate', e.target.checked)}>
  </div>
  <div class="cfg-row">
    <label>Birth place</label>
    <input type="checkbox" checked={cfg.showBirthPlace} onchange={(e) => handleCheckbox('showBirthPlace', e.target.checked)}>
  </div>
  <div class="cfg-row">
    <label>Death date</label>
    <input type="checkbox" checked={cfg.showDeathDate} onchange={(e) => handleCheckbox('showDeathDate', e.target.checked)}>
  </div>
  <div class="cfg-row">
    <label>Death place</label>
    <input type="checkbox" checked={cfg.showDeathPlace} onchange={(e) => handleCheckbox('showDeathPlace', e.target.checked)}>
  </div>

  <div class="cfg-section-label">Card Size</div>
  <div class="cfg-row">
    <label>Width</label>
    <input type="range" min="120" max="300" step="10" value={cfg.cardWidth} oninput={(e) => handleRange('cardWidth', e.target.value)}>
    <span class="cfg-value">{cfg.cardWidth}</span>
  </div>
  <div class="cfg-row">
    <label>Height</label>
    <input type="range" min="30" max="80" step="5" value={cfg.cardHeight} oninput={(e) => handleRange('cardHeight', e.target.value)}>
    <span class="cfg-value">{cfg.cardHeight}</span>
  </div>

  <div class="cfg-section-label">Spacing</div>
  <div class="cfg-row">
    <label>Horizontal</label>
    <input type="range" min="150" max="400" step="10" value={cfg.xSpacing} oninput={(e) => handleRange('xSpacing', e.target.value)}>
    <span class="cfg-value">{cfg.xSpacing}</span>
  </div>
  <div class="cfg-row">
    <label>Vertical</label>
    <input type="range" min="80" max="300" step="10" value={cfg.ySpacing} oninput={(e) => handleRange('ySpacing', e.target.value)}>
    <span class="cfg-value">{cfg.ySpacing}</span>
  </div>

  <div class="cfg-actions">
    <button class="btn btn-sm" onclick={resetAll}>Reset All</button>
  </div>
</div>
