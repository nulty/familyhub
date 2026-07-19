/**
 * print.js — Print the visible tree (Ctrl-P / File > Print).
 *
 * The chart pans/zooms via a CSS transform on two layers (SVG links + HTML
 * cards) inside an overflow:hidden canvas, so a plain window.print() would
 * capture only the clipped viewport. Before printing we override that
 * transform so the whole tree lands on the page, size the canvas to match,
 * and restore everything afterwards. The d3-zoom state is never touched, so
 * restoring the saved inline styles puts the screen view back exactly as it
 * was. Print-only styling lives under `body.printing-tree` in the
 * @media print block of styles.css.
 *
 * Page size comes from the tree config's `printPageSize`:
 *  - 'auto' (default): the page is sized to the tree at 100% scale (min A4),
 *    so a saved PDF keeps full card detail at any zoom. Chrome scales an
 *    oversized CSS page down to the selected paper when printing physically.
 *  - 'a4' | 'a3' | 'a2': fixed paper, oriented to the tree's aspect, with
 *    the tree scaled down to fit on one page (never scaled up).
 */

const PX_PER_MM = 96 / 25.4; // CSS mm→px is exact at 96dpi
export const PAGE_MARGIN_MM = 10;

const PAPER_MM = { a4: [210, 297], a3: [297, 420], a2: [420, 594] };

/**
 * Pure page/scale calculation from the measured ink extent of the rendered
 * tree ({width, height} in px). Returns the CSS page size and the scale k
 * to apply to the tree.
 */
export function computePrintLayout({ width, height }, paper = 'auto') {
  const landscape = width > height;
  if (!PAPER_MM[paper]) {
    // Natural size: page wraps the tree, minimum A4 oriented to its aspect.
    const [minShort, minLong] = PAPER_MM.a4;
    return {
      pageWidthMm: Math.max(Math.ceil(width / PX_PER_MM) + 2 * PAGE_MARGIN_MM, landscape ? minLong : minShort),
      pageHeightMm: Math.max(Math.ceil(height / PX_PER_MM) + 2 * PAGE_MARGIN_MM, landscape ? minShort : minLong),
      k: 1,
    };
  }
  const [short, long] = PAPER_MM[paper];
  const pageWidthMm = landscape ? long : short;
  const pageHeightMm = landscape ? short : long;
  const k = Math.min(
    ((pageWidthMm - 2 * PAGE_MARGIN_MM) * PX_PER_MM) / width,
    ((pageHeightMm - 2 * PAGE_MARGIN_MM) * PX_PER_MM) / height,
    1
  );
  return { pageWidthMm, pageHeightMm, k };
}

let saved = null;

export function beginTreePrint(dim, paper = 'auto') {
  const cont = document.getElementById('FamilyChart');
  const canvas = cont?.querySelector('#f3Canvas');
  const svgView = cont?.querySelector('svg.main_svg .view');
  const htmlView = cont?.querySelector('#htmlSvg .cards_view');
  if (!canvas || !svgView || !htmlView || saved) return;

  saved = {
    svgTransform: svgView.style.transform,
    htmlTransform: htmlView.style.transform,
    canvasWidth: canvas.style.width,
    canvasHeight: canvas.style.height,
    canvasMarginTop: canvas.style.marginTop,
  };

  // First pass: place the tree at 100% with the layout engine's own offset,
  // then measure where ink actually is. The engine's dim assumes fixed card
  // heights, but rendered cards are height:auto and can poke past it (e.g.
  // extra display fields with tight spacing), which would spill onto a
  // second page if trusted blindly.
  const baseTransform = `translate(${dim.x_off}px, ${dim.y_off}px)`;
  svgView.style.transform = baseTransform;
  htmlView.style.transform = baseTransform;

  const cbox = canvas.getBoundingClientRect();
  let minX = 0, minY = 0, maxX = dim.width, maxY = dim.height;
  for (const el of cont.querySelectorAll('div.card_cont .card, path.link')) {
    const b = el.getBoundingClientRect();
    if (b.width === 0 && b.height === 0) continue;
    minX = Math.min(minX, b.left - cbox.left);
    minY = Math.min(minY, b.top - cbox.top);
    maxX = Math.max(maxX, b.right - cbox.left);
    maxY = Math.max(maxY, b.bottom - cbox.top);
  }
  const ink = { width: maxX - minX, height: maxY - minY };

  const layout = computePrintLayout(ink, paper);
  const k = layout.k;

  const transform = `translate(${k * (dim.x_off - minX)}px, ${k * (dim.y_off - minY)}px) scale(${k})`;
  svgView.style.transform = transform;
  htmlView.style.transform = transform;
  canvas.style.width = Math.ceil(k * ink.width) + 'px';
  canvas.style.height = Math.ceil(k * ink.height) + 'px';

  // Centre vertically on the page (horizontal centring comes from the
  // print stylesheet's margin auto).
  const printableH = (layout.pageHeightMm - 2 * PAGE_MARGIN_MM) * PX_PER_MM;
  canvas.style.marginTop = Math.max(0, Math.floor((printableH - k * ink.height) / 2)) + 'px';

  const style = document.createElement('style');
  style.id = 'print-page-style';
  style.textContent = `@page { size: ${layout.pageWidthMm}mm ${layout.pageHeightMm}mm; margin: ${PAGE_MARGIN_MM}mm; }`;
  document.head.appendChild(style);

  document.body.classList.add('printing-tree');
}

export function endTreePrint() {
  if (!saved) return;
  const cont = document.getElementById('FamilyChart');
  const canvas = cont?.querySelector('#f3Canvas');
  const svgView = cont?.querySelector('svg.main_svg .view');
  const htmlView = cont?.querySelector('#htmlSvg .cards_view');

  if (svgView) svgView.style.transform = saved.svgTransform;
  if (htmlView) htmlView.style.transform = saved.htmlTransform;
  if (canvas) {
    canvas.style.width = saved.canvasWidth;
    canvas.style.height = saved.canvasHeight;
    canvas.style.marginTop = saved.canvasMarginTop;
  }

  document.getElementById('print-page-style')?.remove();
  document.body.classList.remove('printing-tree');
  saved = null;
}
