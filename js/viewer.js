// Anteprima dei file scaricati (come Quick Look). Le immagini si possono ingrandire e
// scorrere: pulsanti in basso, Ctrl + rotellina (o il pizzico sul trackpad), pizzico e
// doppio tocco sui telefoni, trascinamento col mouse, tasti + − 0. PDF e testo usano il
// visore del browser. A schermo intero l'anteprima riempie la finestra e i controlli
// restano in alto.

import { icon } from './icons.js';
import { esc } from './util.js';

/** Stato iniziale dell'anteprima: dimensione adattata e, sui telefoni, a schermo intero. */
export function viewerState(file) {
  return { ...file, zoom: 1, fit: null, full: window.innerWidth < 600 };
}

const isImage = (v) => v.type.startsWith('image/');

/** Ingrandimento massimo rispetto alla dimensione adattata (fino a 4 volte la dimensione reale). */
const maxZoom = (v) => Math.min(30, Math.max(2, 4 / (v.fit || 1)));

/** Dimensione dell'immagine ingrandita: la stessa nel disegno e durante i gesti. */
function imageSize(v) {
  return { w: Math.round(v.nw * v.fit * v.zoom), h: Math.round(v.nh * v.fit * v.zoom) };
}

export function renderViewer(v) {
  let body;
  if (isImage(v)) {
    const zoomed = v.zoom > 1 && v.fit;
    const size = zoomed ? imageSize(v) : null;
    body = `<div class="viewer-scroll ${zoomed ? 'zoomed' : ''}" data-scroll="viewer">
      <div class="viewer-stage"><img src="${v.url}" alt="${esc(v.name)}" draggable="false" data-dblclick="viewer-zoom-toggle"${size ? ` style="width:${size.w}px;height:${size.h}px"` : ''}></div></div>
      ${toolbar(v)}`;
  } else if (v.type.includes('pdf') || v.type.startsWith('text/')) {
    body = `<div class="viewer-body"><iframe src="${v.url}" title="${esc(v.name)}"></iframe></div>`;
  } else {
    body = `<div class="viewer-body"><div class="empty-state"><h3>${esc(v.name)}</h3><p>L'anteprima non è disponibile per questo tipo di file. Puoi aprirlo in una nuova scheda o scaricarlo.</p></div></div>`;
  }
  const fullLabel = v.full ? 'Esci dallo schermo intero' : 'Schermo intero';
  return `<div class="sheet-layer centered viewer-layer ${v.full ? 'full' : ''}" data-key="viewer">
    <div class="scrim" data-action="viewer-close"></div>
    <div class="sheet viewer large" role="dialog" aria-modal="true" aria-label="${esc(v.name)}">
      <header class="sheet-bar viewer-bar"><div class="sheet-lead"><button class="icon-btn" data-action="viewer-close" aria-label="Chiudi" title="Chiudi">${icon('x')}</button></div>
        <h2 title="${esc(v.name)}">${esc(v.name)}</h2>
        <div class="sheet-trail">
          <a class="icon-btn" href="${v.url}" target="_blank" rel="noopener" aria-label="Apri in una nuova scheda" title="Apri in una nuova scheda">${icon('externalLink')}</a>
          <button class="icon-btn" data-action="viewer-full" aria-label="${fullLabel}" title="${fullLabel}">${icon(v.full ? 'fullscreenExit' : 'fullscreen')}</button>
          <a class="btn xs tonal viewer-download" href="${v.url}" download="${esc(v.name)}" title="Scarica">${icon('download')}<span>Scarica</span></a>
        </div></header>
      ${body}</div></div>`;
}

/** Barra galleggiante dello zoom (come le barre degli strumenti di M3 Expressive). */
function toolbar(v) {
  const label = v.zoom > 1 && v.fit ? `${Math.round(v.fit * v.zoom * 100)}%` : 'Adatta';
  return `<div class="viewer-toolbar" role="toolbar" aria-label="Zoom">
    <button class="icon-btn" data-action="viewer-zoom" data-delta="-1" aria-label="Riduci" title="Riduci (−)"${v.zoom <= 1 ? ' disabled' : ''}>${icon('zoomOut')}</button>
    <button class="viewer-zoom-label numeral" data-action="viewer-zoom-fit" title="Adatta alla finestra (0)">${label}</button>
    <button class="icon-btn" data-action="viewer-zoom" data-delta="1" aria-label="Ingrandisci" title="Ingrandisci (+)"${v.fit && v.zoom >= maxZoom(v) ? ' disabled' : ''}>${icon('zoomIn')}</button>
    <span class="viewer-toolbar-divider"></span>
    <button class="icon-btn" data-action="viewer-zoom-width" aria-label="Adatta alla larghezza" title="Adatta alla larghezza">${icon('fitWidth')}</button>
  </div>`;
}

// MARK: - Zoom

function elements() {
  const scroller = document.querySelector('.viewer-layer .viewer-scroll');
  const img = scroller?.querySelector('img');
  return img?.naturalWidth ? { scroller, img } : null;
}

/**
 * Porta lo zoom a `target` tenendo fermo il punto sotto `focal` (coordinate della finestra;
 * il centro dell'area se manca). Aggiorna subito l'immagine, poi l'interfaccia (`update`).
 */
function setZoom(app, target, focal, { live = false } = {}) {
  const v = app.viewer;
  const found = elements();
  if (!v || !found) return;
  const { scroller, img } = found;
  if (v.zoom <= 1 || !v.fit) {
    // Dimensione adattata: quella dell'immagine non ingrandita.
    v.nw = img.naturalWidth;
    v.nh = img.naturalHeight;
    v.fit = img.clientWidth / img.naturalWidth || 1;
  }
  const zoom = Math.min(maxZoom(v), Math.max(1, target));
  if (zoom === v.zoom) return;
  const area = scroller.getBoundingClientRect();
  const fx = focal ? focal.x : area.left + scroller.clientWidth / 2;
  const fy = focal ? focal.y : area.top + scroller.clientHeight / 2;
  const before = img.getBoundingClientRect();
  const px = Math.min(1, Math.max(0, (fx - before.left) / before.width));
  const py = Math.min(1, Math.max(0, (fy - before.top) / before.height));
  v.zoom = zoom;
  const zoomed = zoom > 1;
  scroller.classList.toggle('zoomed', zoomed);
  const size = imageSize(v);
  img.style.width = zoomed ? `${size.w}px` : '';
  img.style.height = zoomed ? `${size.h}px` : '';
  const after = img.getBoundingClientRect();
  scroller.scrollLeft += after.left + px * after.width - fx;
  scroller.scrollTop += after.top + py * after.height - fy;
  if (!live) app.update();
}

function fitWidth(app) {
  const v = app.viewer;
  const found = elements();
  if (!v || !found) return;
  const { scroller, img } = found;
  const fit = v.zoom > 1 && v.fit ? v.fit : img.clientWidth / img.naturalWidth;
  const target = scroller.clientWidth / (img.naturalWidth * fit);
  // In alto al centro: dopo lo zoom si legge dall'inizio.
  const area = scroller.getBoundingClientRect();
  setZoom(app, target, { x: area.left + scroller.clientWidth / 2, y: area.top });
}

export function viewerActions(app) {
  return {
    'viewer-close': () => { app.viewer = null; app.update(); },
    'viewer-full': () => {
      app.viewer.full = !app.viewer.full;
      // Cambiando lo spazio, lo zoom torna ad adattarsi.
      app.viewer.zoom = 1;
      app.viewer.fit = null;
      app.update();
    },
    'viewer-zoom': (ctx, el) => setZoom(app, app.viewer.zoom * (Number(el.dataset.delta) > 0 ? 1.5 : 1 / 1.5)),
    'viewer-zoom-fit': () => setZoom(app, 1),
    'viewer-zoom-width': () => fitWidth(app),
    'viewer-zoom-toggle': (ctx, el, event) => {
      const focal = event ? { x: event.clientX, y: event.clientY } : null;
      setZoom(app, app.viewer.zoom > 1 ? 1 : 2.5, focal);
    },
  };
}

/** Tasti dell'anteprima: + e − per lo zoom, 0 per adattare. Restituisce `true` se gestito. */
export function viewerKey(event, app) {
  if (!app.viewer || !isImage(app.viewer) || event.metaKey || event.ctrlKey || event.altKey) return false;
  if (event.key === '+' || event.key === '=') setZoom(app, app.viewer.zoom * 1.5);
  else if (event.key === '-') setZoom(app, app.viewer.zoom / 1.5);
  else if (event.key === '0') setZoom(app, 1);
  else return false;
  event.preventDefault();
  return true;
}

// MARK: - Gesti

const distance = (touches) => Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);
const midpoint = (touches) => ({ x: (touches[0].clientX + touches[1].clientX) / 2, y: (touches[0].clientY + touches[1].clientY) / 2 });

export function installViewerGestures(root, app) {
  // Pizzico sui telefoni (il browser non ingrandisce la pagina: `touch-action` nel CSS).
  let pinch = null;
  root.addEventListener('touchstart', (event) => {
    if (event.touches.length !== 2 || !app.viewer || !event.target.closest('.viewer-scroll')) return;
    pinch = { distance: distance(event.touches), zoom: app.viewer.zoom };
  }, { passive: true });
  root.addEventListener('touchmove', (event) => {
    if (!pinch || event.touches.length !== 2) return;
    event.preventDefault();
    setZoom(app, pinch.zoom * distance(event.touches) / pinch.distance, midpoint(event.touches), { live: true });
  }, { passive: false });
  root.addEventListener('touchend', (event) => {
    if (!pinch || event.touches.length >= 2) return;
    pinch = null;
    app.update();
  }, { passive: true });

  // Ctrl + rotellina, o il pizzico sul trackpad (che il browser invia così).
  let wheelTimer = null;
  root.addEventListener('wheel', (event) => {
    if (!event.ctrlKey || !app.viewer || !event.target.closest?.('.viewer-scroll')) return;
    event.preventDefault();
    setZoom(app, app.viewer.zoom * Math.exp(-event.deltaY * 0.01), { x: event.clientX, y: event.clientY }, { live: true });
    clearTimeout(wheelTimer);
    wheelTimer = setTimeout(() => app.update(), 120);
  }, { passive: false });

  // Trascinamento col mouse per spostarsi nell'immagine ingrandita.
  let drag = null;
  root.addEventListener('pointerdown', (event) => {
    if (event.pointerType !== 'mouse' || event.button !== 0) return;
    const scroller = event.target.closest('.viewer-scroll.zoomed');
    if (!scroller) return;
    event.preventDefault();
    drag = { scroller, x: event.clientX, y: event.clientY, left: scroller.scrollLeft, top: scroller.scrollTop };
    scroller.classList.add('dragging');
  });
  window.addEventListener('pointermove', (event) => {
    if (!drag) return;
    drag.scroller.scrollLeft = drag.left - (event.clientX - drag.x);
    drag.scroller.scrollTop = drag.top - (event.clientY - drag.y);
  });
  window.addEventListener('pointerup', () => {
    if (!drag) return;
    drag.scroller.classList.remove('dragging');
    drag = null;
  });
}
