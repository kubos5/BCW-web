// Introduzione (3.3, come nell'app): alla prima apertura e, a richiesta, da Impostazioni ›
// Generale › Rivedi l'introduzione. Finché non si sceglie un colore BCW è in bianco e nero
// (`data-mono` su <html>, impostato già da `js/theme-boot.js`); i colori arrivano con un cerchio
// che si allarga dal campione toccato (`revealTheme` in `app.js`). Passaggi: accoglienza, colori,
// tema, forme e movimento, vista della Dashboard, funzioni, accesso a Classeviva, account BCW,
// orario ricavato dalle lezioni (con la scheda Orario e un account), fine. In cima a ogni
// passaggio una forma di M3 Expressive che si trasforma nella successiva; sotto, il contenuto che
// scorre di lato (asse condiviso) e le azioni ferme in fondo. Da 840 px, come la shell dell'app, la
// barra in alto sullo sfondo e un pannello in due colonne: a sinistra titolo, spiegazione e forma,
// a destra il contenuto con le azioni in fondo a destra (accoglienza e fine: la forma a sinistra,
// titolo e pulsanti a destra).

import { icon } from './icons.js';
import { shape, shapes } from './shapes.js';
import { logo } from './logo.js';
import { esc, plural } from './util.js';
import { avatar, axisPage, button, connectedGroup, listGroup, loadingIndicator, select, toggle, wavyProgress } from './components.js';
import { AccentPresets, ColorStyle, Contrast, Corners, Motion, RoundedText, DEFAULT_ACCENT, normalizeHex, loadColorLibrary, swatchColors, Theme } from './theme.js';
import { AppearanceMode } from './prefs.js';
import { Reminders } from './reminders.js';
import { Lock } from './lock.js';
import { APIError, Proxy } from './api.js';
import { BCWServer } from './cloud.js';
import { Weekday, entryColor, isBreak, timetableLayout } from './timetable.js';
import { generationFields, makeTimetableDraft } from './views/timetable-sheets.js';
import { themePreview } from './views/settings.js';
import { offerLinking, proxyWarning } from './views/login.js';

const COMPLETED_KEY = 'bcw.onboardingCompleted';

// MARK: - Prima apertura

/**
 * È la prima volta: nessuna introduzione finita e nessun segno che BCW fosse già in uso (account
 * salvati, account BCW, demo). Chi aggiorna la versione web non la vede. La stessa regola è in
 * `js/theme-boot.js`, che mette il bianco e nero prima del primo disegno.
 */
export function isFirstRun() {
  try {
    if (localStorage.getItem(COMPLETED_KEY) === '1') return false;
    const accounts = JSON.parse(localStorage.getItem('bcw.accounts') || '[]');
    const first = !(Array.isArray(accounts) && accounts.length) && !localStorage.getItem('bcw.cloud.session')
      && !JSON.parse(localStorage.getItem('bcw.demoMode') || 'null');
    if (!first) localStorage.setItem(COMPLETED_KEY, '1');
    return first;
  } catch {
    return false;
  }
}

export function markCompleted() {
  try { localStorage.setItem(COMPLETED_KEY, '1'); } catch { /* ignorato */ }
}

/** Bianco e nero: tocca solo l'interfaccia (le scelte salvate restano quelle vere). */
export function setMonochrome(on) {
  document.documentElement.toggleAttribute('data-mono', on);
}

export const isMonochrome = () => document.documentElement.hasAttribute('data-mono');

/** Lo stato dell'introduzione aperta (`app.onboarding`), che resta anche cambiando sessione. */
export function newOnboarding({ replay = false } = {}) {
  return {
    step: 'welcome', dir: 1, replay,
    // Il colore è scelto quando BCW non è più in bianco e nero.
    chosen: false, typing: false,
    username: '', password: '', error: null, loading: false, choices: [],
    bcwChoice: 'none', bcwUsername: '', bcwPassword: '', bcwConfirm: '', bcwError: null, bcwLoading: false,
    draft: null, generating: false, genError: null,
  };
}

// MARK: - Passaggi

const STEPS = {
  welcome: { shape: 'cookie12Sided', icon: null, size: 196 },
  colors: { shape: 'flower', icon: 'palette', size: 104 },
  interface: { shape: 'softBurst', icon: 'sparkles', size: 84 },
  feel: { shape: 'clover8Leaf', icon: 'corners', size: 84 },
  dashboard: { shape: 'gem', icon: 'dashboard', size: 84 },
  features: { shape: 'puffy', icon: 'tune', size: 84 },
  classeviva: { shape: 'cookie9Sided', icon: 'graduationCap', size: 84 },
  bcw: { shape: 'sunny', icon: 'cloud', size: 84 },
  timetable: { shape: 'cookie7Sided', icon: 'wand', size: 84 },
  done: { shape: 'verySunny', icon: 'check', size: 196 },
};
const ORDER = Object.keys(STEPS);

/** I passaggi che si vedono: l'orario dalle lezioni solo con la scheda Orario e un account. */
function visibleSteps(ctx) {
  return ORDER.filter((step) => step !== 'timetable' || (ctx.prefs.showsTimetableTab && ctx.model.phase === 'signedIn'));
}

function go(ctx, delta) {
  const ob = ctx.app.onboarding;
  const steps = visibleSteps(ctx);
  const index = ORDER.indexOf(ob.step);
  const target = delta > 0 ? steps.find((s) => ORDER.indexOf(s) > index) : steps.findLast((s) => ORDER.indexOf(s) < index);
  if (!target) return;
  navigator.vibrate?.(4);
  document.activeElement?.blur?.();
  ob.dir = delta > 0 ? 1 : -1;
  ob.step = target;
  ob.typing = false;
}

/** Centro di un elemento, da cui parte il cerchio dei colori. */
function centerOf(el) {
  const rect = el?.getBoundingClientRect?.();
  return rect && rect.width ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : null;
}

// MARK: - Pagina

export function renderOnboarding(ctx) {
  const ob = ctx.app.onboarding;
  const steps = visibleSteps(ctx);
  // Un passaggio sparito (l'orario, spegnendo la scheda) porta al successivo.
  if (!steps.includes(ob.step)) ob.step = steps.find((s) => ORDER.indexOf(s) > ORDER.indexOf(ob.step)) ?? 'done';
  const step = ob.step;
  const index = steps.indexOf(step);
  const wide = !!ctx.wide;
  const typing = isTyping(ctx);
  const top = step === 'welcome' || step === 'done'
    ? '<div class="ob-top-spacer"></div>'
    : `<div class="ob-top" data-key="ob-top"><button class="icon-btn" data-action="ob-back" aria-label="Indietro" title="Indietro">${icon('arrowBack')}</button>
      ${wavyProgress(index, Math.max(1, steps.length - 1), { label: "Avanzamento dell'introduzione" })}
      <button class="btn text xs" data-action="ob-skip">Salta</button></div>`;
  const parts = renderStep(ctx, step);
  // Le due pagine dell'orario (ore e anteprima) scorrono come due passaggi.
  const key = `ob-${parts.key ?? step}`;
  const attrs = 'data-key="onboarding" role="dialog" aria-modal="true" aria-label="Introduzione a BCW"';
  if (!wide) {
    const body = parts.center ? centerPage(parts) : page(parts);
    return `<div class="onboarding ${typing ? 'typing' : ''}" ${attrs}>
      <div class="ob-column">${top}${typing ? '' : hero(step)}
        ${axisPage('onboarding', ob.dir, key, body, { cls: 'ob-axis' })}</div></div>`;
  }
  // Schermi larghi: titolo e spiegazione scorrono di lato nella colonna a sinistra, sopra la
  // forma; il contenuto nella colonna a destra. Nell'accoglienza e alla fine la colonna a sinistra
  // ha solo la forma, più grande, e a destra titolo e pulsanti.
  const heading = parts.center ? '' : headingBlock(parts);
  const main = parts.center ? centerPage(parts) : page(parts, { heading: false });
  return `<div class="onboarding wide" ${attrs}><div class="ob-frame">${top}
      <div class="ob-panel ${parts.center ? 'center' : ''}">
        <div class="ob-aside">${axisPage('ob-aside', ob.dir, `${key}-aside`, heading, { cls: 'ob-aside-axis' })}${hero(step)}</div>
        ${axisPage('onboarding', ob.dir, key, main, { cls: 'ob-axis' })}</div></div></div>`;
}

/** Con la tastiera aperta sui telefoni (sugli schermi larghi c'è posto per tutto). */
const isTyping = (ctx) => !!ctx.app.onboarding?.typing && !ctx.wide;

/**
 * Le parti di un passaggio: `{ title, subtitle, content, actions }`, oppure per accoglienza e fine
 * `{ center: true, title, text, actions: [html…] }`; `key` distingue le pagine di uno stesso passaggio.
 */
function renderStep(ctx, step) {
  switch (step) {
    case 'welcome': return welcomePage();
    case 'colors': return colorsPage(ctx);
    case 'interface': return interfacePage(ctx);
    case 'feel': return feelPage(ctx);
    case 'dashboard': return dashboardPage(ctx);
    case 'features': return featuresPage(ctx);
    case 'classeviva': return classevivaPage(ctx);
    case 'bcw': return bcwPage(ctx);
    case 'timetable': return timetablePage(ctx);
    default: return donePage(ctx);
  }
}

/** Le parti di un passaggio con titolo, spiegazione, contenuto e azioni. */
const stepParts = (title, subtitle, content, actions) => ({ title, subtitle, content, actions });

const headingBlock = ({ title, subtitle }) => `<div class="ob-heading stagger" style="--i:0"><h1>${esc(title)}</h1><p>${esc(subtitle)}</p></div>`;

/** Titolo, spiegazione e contenuto che scorrono, con le azioni ferme in fondo. */
function page(parts, { heading = true } = {}) {
  return `<div class="ob-page"><div class="ob-scroll" data-bar-ignore><div class="ob-content">
      ${heading ? headingBlock(parts) : ''}${parts.content}</div></div>
    <div class="ob-actions">${parts.actions}</div></div>`;
}

/** Accoglienza e fine: titolo grande, testo e pulsanti. */
function centerPage({ title, text, done = false, actions }) {
  return `<div class="ob-page ob-center-page"><div class="ob-center">
      ${stagger(0, `<h1 class="ob-big${done ? ' done' : ''}">${esc(title)}</h1>`)}${stagger(1, `<p>${esc(text)}</p>`)}</div>
    <div class="ob-actions">${actions.map((html, i) => stagger(i + 2, html)).join('')}</div></div>`;
}

/** Il pulsante principale: "Continua" con la freccia. */
function nextButton({ title = 'Continua', action = 'ob-next', disabled = false, loading = false, attrs = '' } = {}) {
  return `<button class="btn filled m wide ob-next" data-action="${action}"${disabled ? ' disabled' : ''}${attrs}>
    ${loading ? loadingIndicator({ size: 'small' }) : `<span>${esc(title)}</span>${icon('arrowBack', { cls: 'ob-arrow' })}`}</button>`;
}

const stagger = (index, html) => `<div class="stagger" style="--i:${index}">${html}</div>`;

function formRow(label, control, { iconName, subtitle } = {}) {
  return `<div class="list-item form-row">${iconName ? `<span class="form-icon">${icon(iconName)}</span>` : ''}<span class="li-text"><strong>${esc(label)}</strong>${subtitle ? `<small>${esc(subtitle)}</small>` : ''}</span>${control}</div>`;
}

function toggleRow(label, checked, action, { iconName, subtitle, disabled = false, params = {} } = {}) {
  return `<label class="list-item form-row toggle-row ${disabled ? 'disabled' : ''}">${iconName ? `<span class="form-icon">${icon(iconName)}</span>` : ''}<span class="li-text"><strong>${esc(label)}</strong>${subtitle ? `<small>${esc(subtitle)}</small>` : ''}</span>${toggle(checked, action, { label, disabled, params })}</label>`;
}

function errorBox(message) {
  return message ? `<p class="login-error ob-error">${icon('alertTriangleFill')}<span>${esc(message)}</span></p>` : '';
}

// MARK: - Forma in cima

/**
 * La forma di ogni passaggio, che si trasforma nella successiva e ruota lentamente, con l'icona al
 * centro e altre due forme più piccole attorno; nell'accoglienza al centro c'è il logo. Le forme
 * sono disegnate da `animateMorphShapes` (fuori dal morph, `data-morph-skip`).
 */
const SATELLITES_A = ['pill', 'gem', 'cookie6Sided', 'pentagon', 'sunny', 'clover4Leaf', 'puffyDiamond', 'arch', 'pill', 'flower'];
const SATELLITES_B = ['cookie9Sided', 'pill', 'sunny', 'gem', 'puffy', 'softBoom', 'pill', 'cookie7Sided', 'clover4Leaf', 'clover8Leaf'];

function hero(step) {
  const info = STEPS[step];
  const index = ORDER.indexOf(step);
  const side = index % 2 === 0 ? 1 : -1;
  // Con la forma grande più vicine e più piccole: non devono toccare i bordi dello schermo.
  const big = info.size >= 190;
  const a = big ? { x: 0.56 * side, y: -0.42, s: 0.24 } : { x: 0.62 * side, y: -0.42, s: 0.3 };
  const b = big ? { x: -0.6 * side, y: 0.36, s: 0.3 } : { x: -0.66 * side, y: 0.34, s: 0.38 };
  const center = info.icon
    ? `<span class="ob-hero-center" data-key="ob-center-${info.icon}">${icon(info.icon)}</span>`
    : `<span class="ob-hero-center logo" data-key="ob-center-logo">${logo('ob-logo', { stacked: true })}</span>`;
  // Sugli schermi larghi più grande (`--wide`, limitata dalla finestra nel CSS). La forma con le
  // altre due scivola con la molla quando cambia posto (`data-flip`, come il logo dell'accesso).
  const wide = Math.round(info.size * (big ? 1.35 : 1.95));
  return `<div class="ob-hero ${step === 'welcome' ? 'welcome' : ''}" style="--base:${info.size}px;--wide:${wide}px" aria-hidden="true" data-key="ob-hero">
    <div class="ob-hero-art" data-flip="ob-hero">
    <span class="ob-sat a" style="--x:${a.x};--y:${a.y};--s:${a.s}">${morphSVG('ob-sat-a', SATELLITES_A[index])}</span>
    <span class="ob-sat b" style="--x:${b.x};--y:${b.y};--s:${b.s}">${morphSVG('ob-sat-b', SATELLITES_B[index])}</span>
    <span class="ob-main">${morphSVG('ob-main', info.shape)}</span>${center}
    ${step === 'done' ? shapeBurst() : ''}</div></div>`;
}

function morphSVG(key, name) {
  return `<svg class="ob-shape" viewBox="0 0 100 100" data-key="${key}" data-shape="${name}" data-morph-skip><path d="${shapes[name]}"/></svg>`;
}

/** Coriandoli di forme che escono dal centro, ruotano e svaniscono (pagina finale). */
function shapeBurst() {
  const names = ['cookie9Sided', 'sunny', 'pill', 'clover4Leaf', 'gem', 'flower', 'puffy', 'pentagon'];
  const colors = ['var(--primary)', 'var(--tertiary)', 'var(--secondary)', 'var(--primary-container)', 'var(--tertiary-container)'];
  const pieces = Array.from({ length: 18 }, (_, i) => {
    const angle = ((i * 20 + (i % 2 === 0 ? 6 : -6)) * Math.PI) / 180;
    const distance = i % 3 === 0 ? 190 : (i % 2 === 0 ? 150 : 120);
    const size = i % 3 === 0 ? 26 : 16;
    return `<i style="--dx:${(Math.cos(angle) * distance).toFixed(1)}px;--dy:${(Math.sin(angle) * distance).toFixed(1)}px;--spin:${i % 2 === 0 ? 180 : -220}deg;--piece:${size}px;color:${colors[i % 5]}">${shape(names[i % names.length])}</i>`;
  }).join('');
  return `<span class="ob-burst" data-key="ob-burst">${pieces}</span>`;
}

// MARK: Forme che si trasformano

/**
 * Come `MorphShape` nell'app: ogni forma è campionata in 180 punti alla stessa distanza lungo il
 * contorno, in senso orario, dal punto più in alto al centro; la trasformazione interpola i punti
 * con una molla. Cambiando forma a metà si riparte da dove si è, senza salti.
 */
const SAMPLES = 180;
const sampled = new Map();

/**
 * Punti del contorno di una forma (in `shapes.js` solo M, C e Z assoluti): le curve si
 * appiattiscono in tratti brevi e si ricampiona per lunghezza. Fatto a mano: `getPointAtLength`
 * del browser costava circa 0,2 s per forma e fermava il cambio di passaggio.
 */
function outline(d) {
  const numbers = (d.match(/-?\d*\.?\d+(?:e-?\d+)?/gi) ?? []).map(Number);
  const commands = d.match(/[MCZ]/gi) ?? [];
  const points = [];
  let n = 0;
  let current = [0, 0];
  for (const command of commands) {
    if (command === 'M' || command === 'm') {
      current = [numbers[n], numbers[n + 1]];
      n += 2;
      points.push(current);
    } else if (command === 'C' || command === 'c') {
      // Ogni C di `shapes.js` ha una sola curva: due punti di controllo e la fine.
      const [x0, y0] = current;
      const [x1, y1, x2, y2, x3, y3] = numbers.slice(n, n + 6);
      n += 6;
      for (let k = 1; k <= 16; k++) {
        const t = k / 16;
        const u = 1 - t;
        points.push([
          u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3,
          u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3,
        ]);
      }
      current = [x3, y3];
    }
  }
  return points;
}

function samplePoints(name) {
  if (sampled.has(name)) return sampled.get(name);
  const poly = outline(shapes[name] ?? shapes.circle);
  // Lunghezze progressive lungo il contorno chiuso.
  const lengths = [0];
  for (let i = 1; i <= poly.length; i++) {
    const [ax, ay] = poly[i - 1];
    const [bx, by] = poly[i % poly.length];
    lengths.push(lengths[i - 1] + Math.hypot(bx - ax, by - ay));
  }
  const total = lengths[lengths.length - 1];
  const count = SAMPLES * 4;
  const dense = [];
  let segment = 0;
  for (let i = 0; i < count; i++) {
    const target = (total * i) / count;
    while (segment < poly.length - 1 && lengths[segment + 1] < target) segment++;
    const [ax, ay] = poly[segment];
    const [bx, by] = poly[(segment + 1) % poly.length];
    const span = lengths[segment + 1] - lengths[segment] || 1;
    const t = (target - lengths[segment]) / span;
    dense.push([ax + (bx - ax) * t, ay + (by - ay) * t]);
  }
  // Senso orario sullo schermo (y verso il basso): area con il segno positivo.
  let area = 0;
  for (let i = 0; i < count; i++) {
    const [x1, y1] = dense[i];
    const [x2, y2] = dense[(i + 1) % count];
    area += x1 * y2 - x2 * y1;
  }
  if (area < 0) dense.reverse();
  // Si parte dal punto che sta più dritto sopra il centro.
  let start = 0;
  let best = Infinity;
  dense.forEach(([x, y], i) => {
    let diff = Math.atan2(y - 50, x - 50) + Math.PI / 2;
    diff = Math.abs(Math.atan2(Math.sin(diff), Math.cos(diff)));
    if (diff < best) { best = diff; start = i; }
  });
  const points = Array.from({ length: SAMPLES }, (_, k) => dense[(start + k * 4) % count]);
  sampled.set(name, points);
  return points;
}

const pathOf = (points) => `M${points.map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join('L')}Z`;

/** Molla smorzata (risposta 0,5 s, smorzamento 0,8), come `Motion.spatial` nell'app. */
function springEase(seconds) {
  const omega = (2 * Math.PI) / 0.5;
  const zeta = 0.8;
  const damped = omega * Math.sqrt(1 - zeta * zeta);
  return 1 - Math.exp(-zeta * omega * seconds) * (Math.cos(damped * seconds) + ((zeta * omega) / damped) * Math.sin(damped * seconds));
}

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.motion === 'reduced';

/** Dopo ogni disegno: le forme a cui è cambiato `data-shape` si trasformano nella nuova. */
export function animateMorphShapes(root) {
  for (const svg of root.querySelectorAll('svg.ob-shape[data-shape]')) {
    const target = svg.dataset.shape;
    if (svg.morphShape === target) continue;
    const previous = svg.morphShape;
    svg.morphShape = target;
    if (!previous) continue;
    const path = svg.firstElementChild;
    const to = samplePoints(target);
    const from = svg.morphPoints ?? samplePoints(previous);
    cancelAnimationFrame(svg.morphFrame);
    if (reducedMotion()) {
      svg.morphPoints = to;
      path.setAttribute('d', pathOf(to));
      continue;
    }
    const begin = performance.now();
    const frame = (now) => {
      const seconds = (now - begin) / 1000;
      const done = seconds >= 0.75;
      const t = done ? 1 : springEase(seconds);
      const points = from.map(([x, y], i) => [x + (to[i][0] - x) * t, y + (to[i][1] - y) * t]);
      svg.morphPoints = points;
      path.setAttribute('d', pathOf(points));
      if (!done) svg.morphFrame = requestAnimationFrame(frame);
    };
    svg.morphFrame = requestAnimationFrame(frame);
  }
}

// MARK: - Accoglienza

function welcomePage() {
  return {
    center: true,
    title: 'Ciao! Questa è BCW',
    text: "Better ClasseViVa: voti, compiti, orario e comunicazioni di Classeviva, in un'app fatta su misura per te.",
    actions: [nextButton({ title: 'Inizia' }), '<button class="btn text m wide" data-action="ob-skip">Salta introduzione</button>'],
  };
}

// MARK: - Colori

/** Le forme dei campioni: ogni colore la sua. */
const SWATCH_SHAPES = ['cookie9Sided', 'sunny', 'clover4Leaf', 'cookie6Sided', 'gem', 'softBurst', 'flower', 'puffy', 'cookie12Sided', 'pentagon'];

const maskOf = (name) => `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="${shapes[name]}"/></svg>`)}")`;

function isDark(ctx) {
  const mode = ctx.prefs.get('appearance');
  return mode === 'dark' || (mode === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
}

function colorsPage(ctx) {
  const ob = ctx.app.onboarding;
  const prefs = ctx.prefs;
  const lib = Theme.library;
  // La libreria dei colori serve per i campioni: si carica una volta sola.
  if (!lib) ctx.task('color-library', () => loadColorLibrary().catch(() => {}));
  const accent = normalizeHex(prefs.get('accentColor')) ?? DEFAULT_ACCENT;
  const dark = isDark(ctx);
  const isCustom = !AccentPresets.some(([hex]) => hex === accent);
  const swatches = AccentPresets.map(([hex, name], i) => {
    const [c1, c2, c3] = lib ? swatchColors(lib, hex, prefs.get('colorStyle'), dark) : [hex, hex, hex];
    const selected = ob.chosen && hex === accent;
    const title = name.replace(' (BCW)', '');
    return stagger(i + 1, `<button class="ob-swatch ${selected ? 'selected' : ''}" data-action="ob-color" data-value="${hex}" aria-label="${esc(title)}" aria-pressed="${selected}">
      <span class="ob-swatch-art"><span class="ob-swatch-fill" style="--c1:${c1};--c2:${c2};--c3:${c3};--mask:${esc(maskOf(SWATCH_SHAPES[i % SWATCH_SHAPES.length]))}"></span>${selected ? `<span class="ob-swatch-check">${icon('check')}</span>` : ''}</span>
      <span class="ob-swatch-name">${esc(title)}</span></button>`);
  }).join('');
  // Un colore qualsiasi, come "Altro" nell'app (qui il selettore dei colori del browser).
  const custom = stagger(AccentPresets.length + 1, `<label class="ob-swatch custom ${ob.chosen && isCustom ? 'selected' : ''}" title="Scegli un colore qualsiasi">
    <span class="ob-swatch-art"><span class="ob-swatch-fill rainbow" style="--mask:${esc(maskOf('arch'))}"></span>${ob.chosen && isCustom ? `<span class="ob-swatch-check">${icon('check')}</span>` : ''}</span>
    <span class="ob-swatch-name">Altro</span><input type="color" value="${accent}" data-change="ob-color-pick" aria-label="Scegli un colore qualsiasi"></label>`);
  return stepParts('Scegli i tuoi colori',
    "Da qui comincia tutto: l'app prende il colore che tocchi. Potrai cambiarlo quando vuoi in Impostazioni › Aspetto.",
    `<div class="ob-swatches">${swatches}${custom}</div>`,
    nextButton({ disabled: !ob.chosen }));
}

/** Sceglie un colore: BCW esce dal bianco e nero con un cerchio che parte dal campione. */
function chooseColor(ctx, hex, point) {
  const ob = ctx.app.onboarding;
  navigator.vibrate?.(6);
  ctx.revealTheme(point, async () => {
    setMonochrome(false);
    ctx.prefs.set('accentColor', hex);
    ob.chosen = true;
    await Theme.applyColors(ctx.prefs);
  });
}

// MARK: - Tema

function interfacePage(ctx) {
  const prefs = ctx.prefs;
  const icons = { system: 'contrast', light: 'sun', dark: 'circleFill' };
  const modes = connectedGroup(Object.entries(AppearanceMode).map(([value, title]) => [value, `<span class="ob-mode">${icon(icons[value])}<span>${esc(title)}</span></span>`]),
    prefs.get('appearance'), 'ob-appearance', { height: 64 });
  return stepParts("Com'è la tua app?",
    'Chiara o scura, e con quanto contrasto tra i colori. Si cambia anche dopo, in Impostazioni › Aspetto.',
    stagger(1, `<div class="stack gap-8"><h3 class="list-header">Tema</h3>${modes}</div>`)
      + stagger(2, listGroup([formRow('Contrasto', select(Object.entries(Contrast), prefs.get('contrast'), 'pref-contrast', { label: 'Contrasto' }), { iconName: 'contrast' })],
        { footer: 'Più contrasto rende testi e pulsanti più netti sullo sfondo.' })),
    nextButton());
}

// MARK: - Forme e movimento

function feelPage(ctx) {
  const p = ctx.prefs;
  return stepParts('Forme e movimento',
    "Quanto arrotondare, come muovere e con che accostamenti di colore. L'anteprima cambia mentre scegli.",
    stagger(1, listGroup([themePreview()]))
      + stagger(2, listGroup([
        formRow('Angoli', select(Object.entries(Corners), p.get('corners'), 'pref-corners', { label: 'Angoli' }), { iconName: 'corners' }),
        formRow('Animazioni', select(Object.entries(Motion), p.get('motion'), 'pref-motion', { label: 'Animazioni' }), { iconName: 'motion' }),
        formRow('Stile dei colori', select(Object.entries(ColorStyle).map(([k, v]) => [k, v.title]), p.get('colorStyle'), 'pref-color-style', { label: 'Stile dei colori' }),
          { iconName: 'colorStyle', subtitle: ColorStyle[p.get('colorStyle')]?.subtitle }),
        formRow('Caratteri arrotondati', select(Object.entries(RoundedText), p.get('roundedText'), 'pref-rounded-text', { label: 'Caratteri arrotondati' }), { iconName: 'textStyle' }),
      ])),
    nextButton());
}

// MARK: - Dashboard

/** Una scelta tra due, in una card grande con un'anteprima stilizzata. */
function previewChoice(title, subtitle, selected, action, value, preview) {
  return `<button class="ob-choice ${selected ? 'selected' : ''}" data-action="${action}" data-value="${value}" aria-pressed="${selected}">
    <span class="ob-choice-preview">${preview}</span>
    <span class="ob-choice-text"><strong>${esc(title)}</strong><small>${esc(subtitle)}</small></span>
    ${selected ? `<span class="ob-choice-check">${icon('checkCircleFill')}</span>` : ''}</button>`;
}

function dashboardPreview(mode) {
  const row = (cls) => `<i class="ob-pv-row ${cls}"></i>`;
  if (mode === 'list') {
    const week = Array.from({ length: 5 }, (_, i) => `<i class="${i === 2 ? 'on' : ''}"></i>`).join('');
    return `<span class="ob-pv"><span class="ob-pv-week">${week}</span><i class="ob-pv-title"></i>${row('accent')}${row('')}${row('')}</span>`;
  }
  const month = Array.from({ length: 28 }, (_, i) => `<i class="${i === 10 ? 'on' : ''}"></i>`).join('');
  return `<span class="ob-pv"><span class="ob-pv-month">${month}</span>${row('accent')}${row('')}</span>`;
}

function dashboardPage(ctx) {
  const mode = ctx.prefs.dashboardMode;
  return stepParts('Come vuoi la Dashboard?',
    'È la prima cosa che vedi: i prossimi compiti, le verifiche e gli eventi. Si cambia anche dopo, in Impostazioni › Dashboard.',
    stagger(1, `<div class="ob-choices">${previewChoice('Lista', 'Vista compatta', mode === 'list', 'ob-dashboard', 'list', dashboardPreview('list'))}
      ${previewChoice('Calendario', 'Vista estesa', mode === 'calendar', 'ob-dashboard', 'calendar', dashboardPreview('calendar'))}</div>`),
    nextButton());
}

// MARK: - Funzioni

function featuresPage(ctx) {
  const p = ctx.prefs;
  const supported = Reminders.supported;
  const lockLabel = Lock.biometryAvailable ? 'Blocca con passkey' : 'Blocca con un codice';
  return stepParts('Cosa ti serve?', "Puoi tenere tutto così com'è: ogni scelta si cambia in Impostazioni.",
    stagger(1, listGroup([
      toggleRow('Scheda Orario', p.showsTimetableTab, 'pref-tt-tab', { iconName: 'timetable', subtitle: 'Il tuo orario settimanale, tra Dashboard e Voti' }),
      toggleRow("Verifiche nell'orario", p.timetableShowsTests, 'pref-tt-tests', { iconName: 'test', subtitle: 'Segna nella lista le verifiche di Classeviva' }),
    ], { header: 'Orario' }))
    + stagger(2, listGroup([
      toggleRow('Promemoria', p.get('homeworkReminders'), 'pref-reminders', { iconName: 'bell', subtitle: 'La sera prima di compiti e verifiche', disabled: !supported }),
      toggleRow('Novità', p.get('newsNotifications').length > 0, 'ob-news', { iconName: 'bellActive', subtitle: 'Voti, comunicazioni, note e assenze', disabled: !supported }),
    ], { header: 'Notifiche', footer: supported ? '' : 'Questo browser non supporta le notifiche.' }))
    + stagger(3, listGroup([
      toggleRow(lockLabel, p.get('useLock') && !!Lock.method, 'pref-lock', { iconName: 'lock', subtitle: 'Ogni volta che torni su BCW' }),
    ], { header: 'Sicurezza' })),
    nextButton());
}

// MARK: - Classeviva

/** L'accesso a Classeviva, spiegato. Chi ha già un account vede chi è e può aggiungerne un altro. */
function classevivaPage(ctx) {
  const ob = ctx.app.onboarding;
  const model = ctx.model;
  const signedIn = model.phase === 'signedIn' && !model.isDemo;
  if (signedIn) {
    const count = model.accounts.length;
    return stepParts("Hai già effettuato l'accesso", 'Puoi aggiungere altri account, per esempio quello di un fratello o di una sorella.',
      stagger(1, `<div class="stack gap-12"><div class="ob-summary">${avatar(model.initials, { size: 56, shapeName: 'cookie9Sided' })}
        <span class="grow"><strong>${esc(model.displayName)}</strong><small>${count === 1 ? '1 account' : `${count} account`}</small></span></div>
        ${button(model.isCloud ? 'Abbina un altro account' : 'Aggiungi un altro account', { action: 'add-account', iconName: 'userPlus', style: 'tonal', cls: 's wide' })}</div>`),
      nextButton());
  }
  ctx.task(`proxy-check-${Proxy.base}`, () => Proxy.check());
  const focus = ' data-focus="ob-focus" data-blur="ob-blur"';
  const form = `${proxyWarning()}<form class="login-form ob-form" data-submit="ob-signin" autocomplete="on">
    <div class="login-fields">
      <label class="login-field" data-key="ob-user">${icon('person')}<input name="username" type="text" inputmode="email" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false"
        placeholder="Codice utente o email" value="${esc(ob.username)}" data-input="ob-field" data-field="username" aria-label="Codice utente o email"${focus}></label>
      <label class="login-field" data-key="ob-pass">${icon('key')}<input name="password" type="password" autocomplete="current-password"
        placeholder="Password" value="${esc(ob.password)}" data-input="ob-field" data-field="password" aria-label="Password"${focus}></label>
    </div>${errorBox(ob.error)}<p class="ob-note">BCW non è affiliata a Gruppo Spaggiari Parma.</p>
    <button type="submit" hidden></button></form>`;
  const disabled = !ob.username || !ob.password || ob.loading;
  return stepParts('Accedi a Classeviva',
    'Usa le stesse credenziali del registro: codice utente (o email) e password. Restano solo in questo browser e vanno soltanto ai server di Classeviva.',
    stagger(1, form),
    nextButton({ title: model.isCloud ? 'Abbina' : 'Accedi', action: 'ob-signin', disabled, loading: ob.loading })
      + (isTyping(ctx) ? '' : `<div class="ob-row">${button('Prova la demo', { action: 'ob-demo', iconName: 'sparkles', style: 'tonal', cls: 's wide' })}
        <button class="btn text s wide" data-action="ob-next">Più tardi</button></div>`));
}

async function signIn(ctx, ident = null) {
  const ob = ctx.app.onboarding;
  if (!ob || !ob.username || !ob.password || ob.loading) return;
  document.activeElement?.blur?.();
  ob.loading = true;
  ob.error = null;
  ctx.update();
  try {
    await ctx.model.signIn(ob.username.trim(), ob.password, ident);
    ob.password = '';
    ob.choices = [];
    navigator.vibrate?.(10);
    if (ctx.app.onboarding === ob && ob.step === 'classeviva') go(ctx, 1);
  } catch (error) {
    if (error instanceof APIError && error.kind === 'needsProfileChoice') {
      ob.choices = error.choices;
      ctx.openSheet(profileSheet());
    } else {
      ob.error = error.message;
    }
  } finally {
    ob.loading = false;
    ctx.update();
  }
}

/** Account genitore con più figli: si sceglie il profilo. */
function profileSheet() {
  return {
    id: 'ob-profile',
    render: (ctx) => ({
      title: 'Scegli il profilo',
      size: 'medium',
      body: `<div class="sheet-pad"><div class="list-group">${(ctx.app.onboarding?.choices ?? []).map((c, i) => `<button class="list-item" data-action="ob-profile" data-index="${i}">
        <span class="li-text"><strong>${esc(c.name)}</strong><small>${esc(c.school)}</small></span>${icon('chevronRight', { cls: 'trailing-icon' })}</button>`).join('')}</div></div>`,
    }),
  };
}

// MARK: - Account BCW

/** L'account BCW, facoltativo: a cosa serve, e crearlo o accedere. */
function bcwPage(ctx) {
  const ob = ctx.app.onboarding;
  const model = ctx.model;
  if (model.isCloud) {
    return stepParts('Sei nel tuo account BCW', 'Impostazioni, orario e account abbinati ti seguono su ogni dispositivo.',
      stagger(1, `<div class="ob-summary"><span class="ob-summary-art shaped">${shape('cookie9Sided')}${icon('cloud')}</span>
        <span class="grow"><strong>${esc(model.cloudUser?.username ?? '')}</strong><small>${esc(BCWServer.isConfigured ? hostOf(BCWServer.base) : '')}</small></span></div>`),
      nextButton());
  }
  const subtitle = "È facoltativo. Con un nome utente e una password ritrovi tutto su ogni dispositivo, anche nell'app per iPhone e iPad.";
  if (ob.bcwChoice === 'none') {
    const benefit = (iconName, title, sub) => `<div class="list-item form-row"><span class="form-icon">${icon(iconName)}</span><span class="li-text"><strong>${esc(title)}</strong><small>${esc(sub)}</small></span></div>`;
    return stepParts('Vuoi un account BCW?', subtitle,
      stagger(1, listGroup([
        benefit('users', 'Tutti i tuoi account insieme', 'Più account Classeviva, un solo accesso'),
        benefit('timetable', 'Orario e impostazioni ovunque', "Nell'app per iPhone e iPad e nel browser"),
        benefit('lock', 'Credenziali cifrate', 'Salvate cifrate sul server di BCW'),
      ])),
      `${button('Crea un account BCW', { action: 'ob-bcw-choice', params: { value: 'create' }, iconName: 'userPlus', style: 'filled', cls: 'm wide' })}
      <div class="ob-row">${button('Ho già un account', { action: 'ob-bcw-choice', params: { value: 'signIn' }, style: 'tonal', cls: 's wide' })}
        <button class="btn text s wide" data-action="ob-next">No, grazie</button></div>`);
  }
  const create = ob.bcwChoice === 'create';
  const focus = ' data-focus="ob-focus" data-blur="ob-blur"';
  const missing = !BCWServer.isConfigured
    ? `<div class="proxy-warning"><div class="row gap-8">${icon('server')}<strong>Manca il server BCW</strong></div>
      <p>Per usare un account BCW inserisci l'indirizzo del server (BCW-api).</p>
      <div class="row gap-8"><button class="btn filled xs" type="button" data-action="cloud-server-sheet">Imposta il server</button></div></div>` : '';
  const form = `${missing}<form class="login-form ob-form" data-submit="ob-bcw-submit" autocomplete="on"><div class="login-fields">
      <label class="login-field" data-key="ob-bcw-user">${icon('person')}<input name="bcw-username" type="text" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false"
        placeholder="Nome utente BCW" value="${esc(ob.bcwUsername)}" data-input="ob-field" data-field="bcwUsername" aria-label="Nome utente BCW"${focus}></label>
      <label class="login-field" data-key="ob-bcw-pass">${icon('key')}<input name="bcw-password" type="password" autocomplete="${create ? 'new-password' : 'current-password'}"
        placeholder="Password" value="${esc(ob.bcwPassword)}" data-input="ob-field" data-field="bcwPassword" aria-label="Password"${focus}></label>
      ${create ? `<label class="login-field" data-key="ob-bcw-confirm">${icon('key')}<input name="bcw-confirm" type="password" autocomplete="new-password"
        placeholder="Ripeti la password" value="${esc(ob.bcwConfirm)}" data-input="ob-field" data-field="bcwConfirm" aria-label="Ripeti la password"${focus}></label>` : ''}</div>
    ${create ? '<p class="login-hint">Da 3 a 32 caratteri tra lettere, cifre, punto, trattino e trattino basso. La password deve avere almeno 8 caratteri.</p>' : ''}
    ${errorBox(ob.bcwError)}
    <button class="link-button proxy-line ob-server" type="button" data-action="cloud-server-sheet">${icon('cloud')}<span>Usa un altro server BCW</span></button>
    <button type="submit" hidden></button></form>`;
  const disabled = !ob.bcwUsername || !ob.bcwPassword || (create && !ob.bcwConfirm) || ob.bcwLoading;
  return stepParts(create ? 'Crea un account BCW' : 'Accedi con un account BCW', subtitle,
    stagger(1, form),
    nextButton({ title: create ? 'Crea account' : 'Accedi', action: 'ob-bcw-submit', disabled, loading: ob.bcwLoading })
      + (isTyping(ctx) ? '' : '<button class="btn text s wide" data-action="ob-bcw-choice" data-value="none">Indietro</button>'));
}

function hostOf(base) {
  try { return new URL(base).host; } catch { return base; }
}

async function bcwSubmit(ctx) {
  const ob = ctx.app.onboarding;
  if (!ob) return;
  const name = ob.bcwUsername.trim();
  if (!name || !ob.bcwPassword || ob.bcwLoading) return;
  const create = ob.bcwChoice === 'create';
  if (create) {
    if (ob.bcwPassword.length < 8) {
      ob.bcwError = 'La password deve avere almeno 8 caratteri.';
      return;
    }
    if (ob.bcwPassword !== ob.bcwConfirm) {
      ob.bcwError = 'Le due password non coincidono.';
      return;
    }
  }
  document.activeElement?.blur?.();
  ob.bcwLoading = true;
  ob.bcwError = null;
  ctx.update();
  try {
    const candidates = await ctx.model.cloudSignIn(name, ob.bcwPassword, { register: create });
    ob.bcwPassword = '';
    ob.bcwConfirm = '';
    navigator.vibrate?.(10);
    if (candidates.length) offerLinking(ctx, candidates);
    if (ctx.app.onboarding === ob && ob.step === 'bcw') go(ctx, 1);
  } catch (error) {
    ob.bcwError = error.message;
  } finally {
    ob.bcwLoading = false;
    ctx.update();
  }
}

// MARK: - Orario

/**
 * L'orario ricavato dalle lezioni già registrate, passo per passo: quando cominciano le ore (gli
 * stessi campi del foglio del generatore), un'anteprima della settimana e la scelta se applicarla.
 * La bozza resta qui (non in `store.draft`), così sotto l'Orario non va in anteprima. Con ore fuori
 * dalle mezz'ore applicando l'orario passa all'allineamento libero (`applyDraft`).
 */
const GEN_ID = 'ob-gen';

function genState(ctx) {
  return ctx.state(`sheet:${GEN_ID}`, () => {
    const g = ctx.model.timetable.timetable.generation;
    return { settings: { ...g, breaks: g.breaks.map((b) => ({ ...b })) } };
  });
}

function timetablePage(ctx) {
  const ob = ctx.app.onboarding;
  return ob.draft
    ? { ...previewPage(ctx, ob.draft), key: 'timetable-preview' }
    : { ...setupPage(ctx), key: 'timetable-setup' };
}

function setupPage(ctx) {
  const ob = ctx.app.onboarding;
  const store = ctx.model.timetable;
  const g = genState(ctx).settings;
  const events = store.timetable.entries.length;
  const aligned = g.firstHourStart % 30 === 0 && (g.hourLength === 30 || g.hourLength === 60);
  const footer = store.alignment === 'automatic' && !aligned
    ? "Con ore così BCW tiene gli orari esatti: applicando l'orario passerà da solo all'allineamento libero, che si cambia in Modifica orario."
    : 'Le trovi sul diario o sul sito della scuola. Se sbagli, potrai cambiarle e rigenerare.';
  const intro = events > 0 ? `Hai già un orario con ${plural(events, '1 evento', '# eventi')}. Puoi ricavarne un altro` : 'BCW può ricavarlo';
  return stepParts('Crea il tuo orario',
    `${intro} dalle lezioni già registrate su Classeviva, che però dice solo in quale ora si svolge una lezione: indica quando comincia la prima e quanto dura. Prima di applicarlo vedrai un'anteprima.`,
    stagger(1, `<div class="stack gap-20">${generationFields(ctx, GEN_ID, g, { footer })}</div>`) + errorBox(ob.genError),
    `<button class="btn filled m wide" data-action="ob-generate"${ob.generating ? ' disabled' : ''}>${ob.generating ? loadingIndicator({ size: 'small' }) : icon('wand')}<span>Crea l'anteprima</span></button>
    <button class="btn text s wide" data-action="ob-next">Lo farò dopo</button>`);
}

function previewPage(ctx, draft) {
  const lessons = draft.entries.filter((e) => !isBreak(e)).length;
  return stepParts('Ecco la tua settimana',
    `${plural(lessons, '1 lezione ricavata', '# lezioni ricavate')} da ${plural(draft.analyzedDays, '1 giorno', '# giorni')} di registro. Controlla che torni: potrai cambiarla quando vuoi nella scheda Orario.`,
    stagger(1, weekGlance(ctx, draft)),
    `${nextButton({ title: "Applica l'orario", action: 'ob-apply' })}
    <div class="ob-row">${button('Cambia le ore', { action: 'ob-regenerate', style: 'tonal', cls: 's wide' })}
      <button class="btn text s wide" data-action="ob-next">Non ora</button></div>`);
}

/**
 * La settimana dell'anteprima: una colonna per giorno, con le lezioni come pillole nella loro
 * tinta e l'onda di luce dell'anteprima dell'orario.
 */
function weekGlance(ctx, draft) {
  const store = ctx.model.timetable;
  // Sugli schermi larghi c'è posto per ore più alte.
  const hourHeight = ctx.wide ? 54 : 40;
  const days = [1, 2, 3, 4, 5, 6, 7].map((w) => ({ w, entries: draft.entries.filter((e) => e.weekday === w) })).filter((d) => d.entries.length);
  const starts = draft.entries.map((e) => e.start);
  const ends = draft.entries.map((e) => e.end);
  const first = Math.floor((starts.length ? Math.min(...starts) : 480) / 60) * 60;
  const last = Math.max(first + 60, Math.ceil((ends.length ? Math.max(...ends) : 840) / 60) * 60);
  const height = ((last - first) / 60) * hourHeight;
  let order = 0;
  const columns = days.map(({ w, entries }, column) => {
    const blocks = timetableLayout(entries).clusters.flatMap((cluster) => cluster.blocks.map((p) => ({ ...p, lanes: cluster.columns })));
    const items = blocks.map(({ block, column: lane, lanes }) => {
      const entry = block.entries[0];
      const top = ((block.start - first) / 60) * hourHeight;
      const h = Math.max(14, ((block.end - block.start) / 60) * hourHeight - 3);
      order += 1;
      const delay = (block.start / 420) % 3.4 - 3.4;
      return `<span class="ob-glance-block" style="--tint:${entryColor(entry, store)};top:${top}px;height:${h}px;left:calc(${(lane / lanes) * 100}%);width:calc(${100 / lanes}% - 2px);--i:${column + order % 6}">
        <span class="draft-sheen" style="animation-delay:${delay.toFixed(3)}s"></span><span class="ob-glance-name">${esc(entry.title || 'Senza titolo')}</span></span>`;
    }).join('');
    return `<div class="ob-glance-day"><small>${esc(Weekday.shortName(w))}</small><div class="ob-glance-col" style="height:${height}px">${items}</div></div>`;
  }).join('');
  return `<div class="ob-glance" role="img" aria-label="Anteprima della settimana">${columns}</div>`;
}

async function generate(ctx) {
  const ob = ctx.app.onboarding;
  if (!ob || ob.generating) return;
  ob.generating = true;
  ob.genError = null;
  ctx.update();
  try {
    const draft = await makeTimetableDraft(ctx.model, genState(ctx).settings);
    navigator.vibrate?.(10);
    ob.dir = 1;
    ob.draft = draft;
  } catch (error) {
    ob.genError = error.message;
  } finally {
    ob.generating = false;
    ctx.update();
  }
}

function applyDraft(ctx, replacing) {
  const ob = ctx.app.onboarding;
  const store = ctx.model.timetable;
  if (!ob?.draft) return;
  navigator.vibrate?.(10);
  store.setDraft(ob.draft);
  // Con ore fuori dalle mezz'ore passa da sé all'allineamento libero.
  store.applyDraft(replacing);
  ob.draft = null;
  go(ctx, 1);
}

// MARK: - Fine

function donePage(ctx) {
  const model = ctx.model;
  const signedIn = model.phase === 'signedIn';
  const firstName = String(model.displayName ?? '').split(' ')[0];
  const title = signedIn && !model.isDemo && firstName ? `Tutto pronto, ${firstName}!` : 'Tutto pronto!';
  const text = signedIn
    ? 'BCW è fatta su misura per te. Puoi rivedere questa introduzione quando vuoi, in Impostazioni › Generale.'
    : "Manca solo l'accesso a Classeviva: lo trovi nella prossima schermata.";
  return { center: true, done: true, title, text, actions: [nextButton({ title: signedIn ? 'Apri BCW' : "Vai all'accesso", action: 'ob-finish' })] };
}

/** Fine dell'introduzione (anche saltandola): il cerchio mostra l'accesso o BCW con i colori veri. */
function finish(ctx, el) {
  if (!ctx.app.onboarding) return;
  markCompleted();
  navigator.vibrate?.(10);
  document.activeElement?.blur?.();
  ctx.revealTheme(centerOf(el), () => {
    setMonochrome(false);
    ctx.app.onboarding = null;
  });
}

/** La riapre dalle Impostazioni: un cerchio svuota BCW dei colori e sotto c'è l'introduzione. */
export function presentOnboarding(ctx) {
  if (ctx.app.onboarding) return;
  ctx.revealTheme(null, () => {
    setMonochrome(true);
    ctx.app.onboarding = newOnboarding({ replay: true });
  });
}

// MARK: - Azioni

const appearancePoint = (el) => centerOf(el);

export const onboardingActions = {
  'ob-next': (ctx) => go(ctx, 1),
  'ob-back': (ctx) => go(ctx, -1),
  'ob-skip': (ctx, el) => finish(ctx, el),
  'ob-finish': (ctx, el) => finish(ctx, el),
  'ob-replay': (ctx) => presentOnboarding(ctx),
  'ob-color': (ctx, el) => chooseColor(ctx, el.dataset.value, centerOf(el)),
  'ob-color-pick': (ctx, el) => {
    const hex = normalizeHex(el.value);
    if (hex) chooseColor(ctx, hex, centerOf(el.closest('.ob-swatch')));
  },
  // Anche chiaro e scuro arrivano con il cerchio, dal pulsante toccato.
  'ob-appearance': (ctx, el) => {
    const value = el.dataset.value;
    if (ctx.prefs.get('appearance') === value) return;
    ctx.revealTheme(appearancePoint(el), () => { ctx.prefs.set('appearance', value); });
  },
  'ob-dashboard': (ctx, el) => {
    if (ctx.prefs.dashboardMode === el.dataset.value) return;
    navigator.vibrate?.(4);
    ctx.prefs.set('dashboardMode', el.dataset.value);
  },
  'ob-news': async (ctx, el) => {
    const kinds = ['grades', 'notices', 'notes', 'absences', 'agenda'];
    if (!el.checked) {
      ctx.prefs.set('newsNotifications', []);
      return;
    }
    ctx.prefs.set('newsNotifications', kinds);
    if (!(await Reminders.requestAuthorization())) {
      el.checked = false;
      ctx.prefs.set('newsNotifications', []);
      ctx.confirm({
        title: 'Notifiche disattivate',
        message: 'Per ricevere le notifiche consentile a questo sito nelle impostazioni del browser. Su iPhone e iPad le notifiche funzionano dopo aver aggiunto BCW alla schermata Home.',
        confirmLabel: 'OK', cancelLabel: null,
      });
    }
  },
  'ob-field': (ctx, el) => {
    const ob = ctx.app.onboarding;
    if (ob) ob[el.dataset.field] = el.value;
  },
  // Con la tastiera aperta (telefoni) la forma in cima lascia spazio ai campi, come nell'app.
  'ob-focus': (ctx) => { if (ctx.app.onboarding && !ctx.wide && matchMedia('(pointer: coarse)').matches) ctx.app.onboarding.typing = true; },
  'ob-blur': (ctx) => { if (ctx.app.onboarding) ctx.app.onboarding.typing = false; },
  'ob-signin': (ctx, el) => {
    const ob = ctx.app.onboarding;
    const form = el.tagName === 'FORM' ? el : el.closest('.onboarding')?.querySelector('form.ob-form');
    // I gestori di password a volte compilano i campi senza l'evento "input".
    if (ob && form) {
      ob.username = form.querySelector('[name="username"]')?.value ?? ob.username;
      ob.password = form.querySelector('[name="password"]')?.value ?? ob.password;
    }
    return signIn(ctx);
  },
  'ob-profile': (ctx, el) => {
    const choice = ctx.app.onboarding?.choices[Number(el.dataset.index)];
    ctx.closeSheet();
    if (choice) return signIn(ctx, choice.ident);
    return undefined;
  },
  'ob-demo': (ctx) => {
    ctx.model.startDemo();
    go(ctx, 1);
  },
  'ob-bcw-choice': (ctx, el) => {
    const ob = ctx.app.onboarding;
    if (!ob) return;
    ob.bcwChoice = el.dataset.value;
    ob.bcwError = null;
    if (ob.bcwChoice !== 'none' && !ob.bcwUsername) ob.bcwUsername = ctx.model.lastCloudUsername ?? '';
  },
  'ob-bcw-submit': (ctx) => bcwSubmit(ctx),
  'ob-generate': (ctx) => generate(ctx),
  'ob-regenerate': (ctx) => {
    const ob = ctx.app.onboarding;
    if (!ob) return;
    ob.dir = -1;
    ob.draft = null;
  },
  'ob-apply': (ctx) => {
    if (ctx.model.timetable.isEmpty) {
      applyDraft(ctx, true);
      return;
    }
    ctx.confirm({
      title: 'Hai già un orario',
      message: "Sostituendolo, eventi, note, file e verifiche segnate a mano dell'orario attuale verranno eliminati.",
      actions: [
        { label: "Sostituisci l'orario attuale", destructive: true, run: () => applyDraft(ctx, true) },
        { label: 'Aggiungi solo dove è libero', run: () => applyDraft(ctx, false) },
        { label: 'Annulla', cancel: true },
      ],
    });
  },
};
