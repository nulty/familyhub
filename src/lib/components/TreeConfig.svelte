<script>
  import { getConfig, setConfig } from '../../config.js';
  import { rebuildTree } from '../../ui/tree.js';

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

  const DEPTH_OPTIONS = [1, 2, 3, 4, 5, 10];

  let { onclose } = $props();

  let cfg = $state({ ...DEFAULTS, ...getConfig('treeConfig', {}) });

  function save() {
    setConfig('treeConfig', cfg);
  }

  function applyColors() {
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
    cfg[key] = DEFAULTS[key];
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
  <div class="cfg-row">
    <label>Male</label>
    <input type="color" value={cfg.maleColor} oninput={(e) => handleColor('maleColor', e.target.value)}>
    <button class="btn-link btn-sm" onclick={() => resetColor('maleColor')}>reset</button>
  </div>
  <div class="cfg-row">
    <label>Female</label>
    <input type="color" value={cfg.femaleColor} oninput={(e) => handleColor('femaleColor', e.target.value)}>
    <button class="btn-link btn-sm" onclick={() => resetColor('femaleColor')}>reset</button>
  </div>
  <div class="cfg-row">
    <label>Other</label>
    <input type="color" value={cfg.otherColor} oninput={(e) => handleColor('otherColor', e.target.value)}>
    <button class="btn-link btn-sm" onclick={() => resetColor('otherColor')}>reset</button>
  </div>
  <div class="cfg-row">
    <label>Background</label>
    <input type="color" value={cfg.bgColor} oninput={(e) => handleColor('bgColor', e.target.value)}>
    <button class="btn-link btn-sm" onclick={() => resetColor('bgColor')}>reset</button>
  </div>
  <div class="cfg-row">
    <label>Lines</label>
    <input type="color" value={cfg.lineColor} oninput={(e) => handleColor('lineColor', e.target.value)}>
    <button class="btn-link btn-sm" onclick={() => resetColor('lineColor')}>reset</button>
  </div>

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
