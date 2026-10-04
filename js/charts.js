// Grafici in SVG: andamento della media e voti di una materia (come Swift Charts).
// Le viste lasciano un segnaposto `[data-chart]`; il grafico viene disegnato dopo,
// quando si conosce la larghezza reale del contenitore.

import { fmt, startOfMonth, addMonths } from './util.js';

const specs = new Map();

/** Registra un grafico e restituisce il segnaposto da inserire nella pagina. */
export function chartPlaceholder(id, spec) {
  specs.set(id, spec);
  return `<div class="chart" data-chart="${id}" data-morph-skip style="height:${spec.height}px"></div>`;
}

/** Interpolazione monotona (Fritsch–Carlson): la curva non supera mai i punti. */
function monotonePath(pts) {
  if (pts.length === 0) return '';
  if (pts.length === 1) return `M${pts[0].x},${pts[0].y}`;
  const n = pts.length;
  const dx = [];
  const slope = [];
  for (let i = 0; i < n - 1; i++) {
    dx.push(pts[i + 1].x - pts[i].x);
    slope.push(dx[i] === 0 ? 0 : (pts[i + 1].y - pts[i].y) / dx[i]);
  }
  const m = [slope[0]];
  for (let i = 1; i < n - 1; i++) {
    m.push(slope[i - 1] * slope[i] <= 0 ? 0 : (slope[i - 1] + slope[i]) / 2);
  }
  m.push(slope[n - 2]);
  for (let i = 0; i < n - 1; i++) {
    if (slope[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i] / slope[i];
    const b = m[i + 1] / slope[i];
    const h = a * a + b * b;
    if (h > 9) {
      const t = 3 / Math.sqrt(h);
      m[i] = t * a * slope[i];
      m[i + 1] = t * b * slope[i];
    }
  }
  let d = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d += ` C${(pts[i].x + h).toFixed(1)},${(pts[i].y + m[i] * h).toFixed(1)} ` +
      `${(pts[i + 1].x - h).toFixed(1)},${(pts[i + 1].y - m[i + 1] * h).toFixed(1)} ` +
      `${pts[i + 1].x.toFixed(1)},${pts[i + 1].y.toFixed(1)}`;
  }
  return d;
}

function render(spec, width) {
  const { height, domain: [lo, hi], ticks, line = [], dots = [], color = 'var(--accent)', area = false } = spec;
  const axisRight = 24;
  const axisBottom = spec.monthAxis ? 18 : 6;
  const top = 6;
  const plotW = Math.max(40, width - axisRight - 4);
  const plotH = height - axisBottom - top;
  const times = [...line.map((p) => p.date.getTime()), ...dots.map((p) => p.date.getTime())];
  let t0 = Math.min(...times);
  let t1 = Math.max(...times);
  if (t0 === t1) { t0 -= 86_400_000; t1 += 86_400_000; }
  const x = (date) => 4 + ((date.getTime() - t0) / (t1 - t0)) * (plotW - 8);
  const y = (v) => top + (1 - (Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo)) * plotH;

  let svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${spec.label ?? 'Grafico'}">`;
  svg += `<defs><linearGradient id="g-${spec.id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".25"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>`;
  for (const tick of ticks) {
    svg += `<line x1="0" x2="${plotW}" y1="${y(tick)}" y2="${y(tick)}" class="chart-grid"/>`;
    svg += `<text x="${plotW + 6}" y="${y(tick) + 3.5}" class="chart-label">${tick}</text>`;
  }
  if (spec.monthAxis) {
    for (let m = addMonths(startOfMonth(new Date(t0)), 1); m.getTime() <= t1; m = addMonths(m, 1)) {
      const mx = x(m);
      if (mx < 10 || mx > plotW - 10) continue;
      svg += `<text x="${mx}" y="${height - 4}" class="chart-label" text-anchor="middle">${fmt.monthShort(m)}</text>`;
    }
  }
  // Linea della sufficienza.
  svg += `<line x1="0" x2="${plotW}" y1="${y(6)}" y2="${y(6)}" class="chart-rule"/>`;
  if (line.length) {
    const pts = line.map((p) => ({ x: x(p.date), y: y(p.value) }));
    const path = monotonePath(pts);
    if (area) {
      const base = y(lo);
      svg += `<path d="${path} L${pts[pts.length - 1].x.toFixed(1)},${base} L${pts[0].x.toFixed(1)},${base} Z" fill="url(#g-${spec.id})"/>`;
    }
    svg += `<path d="${path}" fill="none" stroke="${color}" stroke-width="${spec.lineWidth ?? 2.5}" stroke-linecap="round" stroke-linejoin="round"/>`;
  }
  for (const dot of dots) {
    svg += `<circle cx="${x(dot.date)}" cy="${y(dot.value)}" r="4.4" fill="${dot.color}"><title>${dot.title ?? ''}</title></circle>`;
  }
  return svg + '</svg>';
}

/** Disegna (o ridisegna, se cambiati) i grafici presenti nella pagina. */
export function drawCharts(root) {
  for (const el of root.querySelectorAll('[data-chart]')) {
    const spec = specs.get(el.dataset.chart);
    if (!spec) continue;
    const width = Math.floor(el.clientWidth);
    if (!width) continue;
    const signature = `${width}|${spec.signature}`;
    if (el.dataset.signature === signature) continue;
    el.dataset.signature = signature;
    el.innerHTML = render(spec, width);
  }
}
