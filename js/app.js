// Shell dell'app in stile Material 3 Expressive: barra di navigazione in basso sui telefoni
// (quattro schede, la ricerca è la barra in cima alla Dashboard), barra di navigazione laterale
// sui tablet in verticale e, sugli schermi larghi, barra superiore con la ricerca e l'account
// (come Gmail e Drive) e barra di navigazione espansa con tutte le sezioni. Più barre
// superiori, menu, fogli, dialoghi, scorciatoie e gesti.

import { AppModel, accountColorID, accountInitials } from './store.js';
import { morph, data } from './dom.js';
import { icon } from './icons.js';
import { drawCharts } from './charts.js';
import { Lock } from './lock.js';
import { Theme } from './theme.js';
import { viewerState, renderViewer, viewerActions, viewerKey, installViewerGestures } from './viewer.js';
import { datePickerState, renderDatePicker, datePickerActions } from './date-picker.js';
import { Reminders } from './reminders.js';
import { Proxy } from './api.js';
import { BCWServer } from './cloud.js';
import { esc } from './util.js';
import { avatar, loadingIndicator, subjectColor } from './components.js';
import { shape } from './shapes.js';
import { logo } from './logo.js';
import { routes, sections, sectionGroups, commonActions, sectionBadge } from './views/index.js';
import { renderLogin, loginActions } from './views/login.js';
import { isFirstRun, newOnboarding, renderOnboarding, animateMorphShapes, onboardingActions } from './onboarding.js';

// MARK: - Stato

const model = new AppModel(() => app.update());

const RAIL_KEY = 'bcw.railCollapsed';

const app = {
  model,
  /** Stato locale delle viste (filtri, sezioni aperte…), azzerato a ogni cambio di sessione. */
  viewState: new Map(),
  tasks: new Set(),
  sessionID: null,
  sheet: null,
  sheetStack: [],
  dialog: null,
  menu: null,
  viewer: null,
  datePicker: null,
  toast: null,
  /** Ricerca aperta dalla barra in cima alla Dashboard (telefoni e tablet). */
  searching: false,
  /** Menu del pulsante d'azione flottante aperto. */
  fabOpen: false,
  width: window.innerWidth,
  nav: { stacks: {}, current: null },
  scroll: new Map(),
  scrolled: new Set(),
  refreshing: new Set(),
  railCollapsed: readFlag(RAIL_KEY),
  railOpen: false,
  /** Operazioni da eseguire dopo il prossimo disegno (es. scorrere a un'ora dell'orario). */
  afterRender: [],
  scheduled: false,
  lockError: null,
  pinInput: '',

  /** Finestre "espanse" di M3 (≥ 840 px): barra laterale con tutte le sezioni. */
  get wide() { return this.width >= 840; },
  /** Finestre "medie" (600–839 px): schede in una barra laterale compatta. */
  get medium() { return !this.wide && this.width >= 600; },
  /** Tra 840 e 1000 px la barra espansa si apre sopra il contenuto e di solito resta ridotta. */
  get railOverlays() { return this.wide && this.width < 1000; },
  get railIsCollapsed() { return this.railOverlays ? !this.railOpen : this.railCollapsed; },
  get railWidth() { return this.wide ? (this.railOverlays || this.railCollapsed ? 96 : 264) : (this.medium ? 88 : 0); },
  /** Larghezza dell'area principale (senza la barra laterale e i margini del pannello). */
  get mainWidth() { return this.width - this.railWidth - (this.wide ? 12 : 0); },
  /** Colonne affiancate solo se c'è spazio. */
  get splitWide() {
    const threshold = this.splitWasWide ? 768 : 792;
    this.splitWasWide = this.wide && this.mainWidth >= threshold;
    return this.splitWasWide;
  },
  splitWasWide: false,

  update() {
    if (this.scheduled) return;
    this.scheduled = true;
    requestAnimationFrame(() => {
      this.scheduled = false;
      render();
    });
  },
};

function readFlag(key) {
  try { return localStorage.getItem(key) === '1'; } catch { return false; }
}

window.bcw = app;

// MARK: - Navigazione

const tabs = ['dashboard', 'timetable', 'grades', 'you'];

/** Le schede visibili: senza l'Orario se è nascosto (Impostazioni › Orario › Mostra la scheda Orario). */
function visibleTabs() {
  return model.preferences.showsTimetableTab ? tabs : tabs.filter((tab) => tab !== 'timetable');
}

/**
 * Scorciatoia Alt+N di una sezione: le destinazioni principali sono numerate come compaiono (con
 * l'Orario nascosto 1 Dashboard, 2 Voti, 3 Tu, come ⌘1–⌘3 nell'app), le altre hanno la loro.
 */
function sectionShortcut(key) {
  const index = visibleTabs().indexOf(key);
  if (index >= 0) return String(index + 1);
  return tabs.includes(key) ? null : sections[key]?.shortcut ?? null;
}

/**
 * Con la scheda Orario nascosta l'Orario non si apre (un indirizzo `#/timetable`, l'ultima sezione
 * aperta) e, se è nascosta mentre è aperta, si passa alla Dashboard, come nell'app.
 */
function leaveHiddenTimetable() {
  if (model.preferences.showsTimetableTab || app.nav.current !== 'timetable') return;
  delete app.nav.stacks.timetable;
  app.nav.current = 'dashboard';
  app.nav.stacks.dashboard ??= ['dashboard'];
  syncHash(true);
}

function parsePath(path) {
  const parts = path.replace(/^#?\/?/, '').split('/').filter(Boolean);
  const name = parts[0] && routes[parts[0]] ? parts[0] : 'dashboard';
  return { name, param: parts[1] ?? null, path: [name, parts[1]].filter(Boolean).join('/') };
}

/** Scheda (telefono) o sezione (barra laterale) a cui appartiene un percorso. */
function stackKeyFor(path) {
  const { name } = parsePath(path);
  if (app.wide) {
    if (name === 'settings' || name === 'account') return 'you';
    return name;
  }
  if (tabs.includes(name)) return name;
  if (name === 'search') return 'dashboard';
  return 'you';
}

function currentPath() {
  const stack = app.nav.stacks[app.nav.current];
  return stack?.[stack.length - 1] ?? 'dashboard';
}

function syncHash(replace = false) {
  const hash = `#/${currentPath()}`;
  if (location.hash === hash) return;
  if (replace) history.replaceState(null, '', hash);
  else history.pushState(null, '', hash);
}

function saveScroll() {
  const page = document.querySelector('.page.active');
  if (!page) return;
  for (const el of page.querySelectorAll('[data-scroll]')) {
    app.scroll.set(`${currentPath()}|${el.dataset.scroll}`, el.scrollTop);
  }
}

/** Pagine già riportate alla posizione salvata (un attributo verrebbe tolto dal morph). */
const restoredPages = new WeakSet();

/** Chiave della posizione salvata di un'area: la pagina a cui appartiene e il nome dell'area. */
const scrollKey = (el) => `${el.closest('.page')?.dataset.path ?? currentPath()}|${el.dataset.scroll}`;

/** Aree della pagina che scorrono prima di un disegno, con la loro chiave e la posizione. */
function captureScrolls() {
  const page = document.querySelector('.page.active');
  const scrolls = new Map();
  if (!page) return scrolls;
  for (const el of page.querySelectorAll('[data-scroll]')) scrolls.set(el, { key: scrollKey(el), top: el.scrollTop });
  return scrolls;
}

/**
 * Il morph può togliere un'area o riusarla per un'altra (la ricerca dei telefoni al posto della
 * Dashboard e ritorno): l'elemento teneva la posizione dell'altra area, così chiudendo la ricerca
 * la Dashboard restava scorsa fin dove si erano scorsi i risultati. Qui ognuna riprende la sua.
 */
function swapReusedScrolls(scrolls) {
  const reused = [];
  for (const [el, before] of scrolls) {
    if (el.isConnected && scrollKey(el) === before.key) continue;
    app.scroll.set(before.key, before.top);
    if (el.isConnected) reused.push(el);
  }
  for (const el of reused) scrollQuietly(el, app.scroll.get(scrollKey(el)) ?? 0);
}

function restoreScroll() {
  const page = document.querySelector('.page.active');
  if (!page || restoredPages.has(page)) return;
  restoredPages.add(page);
  for (const el of page.querySelectorAll('[data-scroll]')) {
    el.scrollTop = app.scroll.get(`${currentPath()}|${el.dataset.scroll}`) ?? 0;
  }
}

/**
 * Stato di una pagina aperta sopra un'altra (`ctx.pageState`), come lo `@State` di una pagina
 * nell'app: si cancella quando la pagina esce dalla pila (indietro, nuovo tocco sulla scheda,
 * indirizzo cambiato), così ad esempio i voti ipotetici di una materia spariscono uscendo.
 */
const pageStateKey = (path, name) => `page:${path}|${name}`;

function forgetPages(paths) {
  const prefixes = paths.filter(Boolean).map((path) => `page:${path}|`);
  if (!prefixes.length) return;
  for (const key of [...app.viewState.keys()]) {
    if (prefixes.some((prefix) => key.startsWith(prefix))) app.viewState.delete(key);
  }
}

export function navigate(path) {
  saveScroll();
  const key = app.nav.current;
  const stack = app.nav.stacks[key] ?? [key];
  stack.push(path);
  app.nav.stacks[key] = stack;
  app.menu = null;
  syncHash();
  app.update();
}

/** Scorre la pagina attuale in cima (con un'animazione). */
function scrollToTop() {
  const scroller = root.querySelector('.page.active .page-scroll, .page.active .split-main');
  scroller?.scrollTo({ top: 0, behavior: 'smooth' });
}

const pageScroller = () => root.querySelector('.page.active .page-scroll');

export function selectSection(key) {
  if (key === 'timetable' && !model.preferences.showsTimetableTab) key = 'dashboard';
  saveScroll();
  app.menu = null;
  app.railOpen = false;
  app.fabOpen = false;
  if (!app.wide && key === 'search') {
    openSearch();
    return;
  }
  if (app.searching) {
    app.searching = false;
    const search = app.viewState.get('search');
    if (search) search.query = '';
    if (key === 'dashboard') {
      app.update();
      return;
    }
  }
  if (app.wide && key !== 'search') {
    // Scegliere una sezione chiude la ricerca generale.
    const search = app.viewState.get('search');
    if (search) search.query = '';
    app.nav.lastSection = key;
  }
  if (app.nav.current === key) {
    // Nuovo tocco sulla scheda aperta (3.3, come nell'app): il primo porta in cima la pagina in
    // vista, anche una aperta dentro la scheda; il successivo, già in cima, torna alla pagina
    // principale e poi fa l'azione della scheda (Dashboard: domani; Orario: il giorno con il
    // prossimo evento; Voti: la media dell'anno). Una pagina può saltare il primo passo
    // (`reselectSkipsTop`: la vista Giorno dell'Orario parte già scorsa alla prima ora).
    const stack = app.nav.stacks[key] ?? [key];
    const view = routes[parsePath(currentPath()).name];
    const ctx = makeContext();
    const scroller = root.querySelector('.page.active .page-scroll, .page.active .split-main');
    const skipsTop = stack.length === 1 && view?.reselectSkipsTop?.(ctx);
    if (scroller && scroller.scrollTop > 2 && !skipsTop) {
      scroller.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    if (stack.length > 1) {
      forgetPages(stack.slice(1));
      app.nav.stacks[key] = [key];
      syncHash();
      app.update();
      return;
    }
    if (view?.reselect) view.reselect(ctx);
    app.update();
    return;
  }
  app.nav.current = key;
  app.nav.stacks[key] ??= [key];
  try { localStorage.setItem('bcw.section', key); } catch { /* ignorato */ }
  syncHash();
  app.update();
}

export function back() {
  const stack = app.nav.stacks[app.nav.current];
  if (!stack || stack.length < 2) return;
  saveScroll();
  forgetPages([stack.pop()]);
  syncHash(true);
  app.update();
}

function resetNavigation(path) {
  if (!app.wide && parsePath(path).name === 'search') {
    app.searching = true;
    path = 'dashboard';
  }
  const key = stackKeyFor(path);
  // La pagina che resta aperta (es. passando da schermo stretto a largo) tiene il suo stato.
  forgetPages(Object.values(app.nav.stacks).flatMap((stack) => stack.slice(1)).filter((p) => p !== path));
  app.nav.current = key;
  app.nav.stacks = { [key]: path === key ? [key] : [key, path] };
}

window.addEventListener('popstate', () => {
  const path = parsePath(location.hash).path;
  const stack = app.nav.stacks[app.nav.current];
  const index = stack?.lastIndexOf(path) ?? -1;
  if (index >= 0) {
    forgetPages(stack.slice(index + 1));
    stack.length = index + 1;
  } else {
    resetNavigation(path);
  }
  app.update();
});

// MARK: - Contesto delle viste

function makeContext() {
  const path = currentPath();
  const route = parsePath(path);
  return {
    app,
    model,
    prefs: model.preferences,
    wide: app.wide,
    medium: app.medium,
    splitWide: app.splitWide,
    mainWidth: app.mainWidth,
    route,
    depth: app.nav.stacks[app.nav.current]?.length ?? 1,
    /** Stato locale di una vista, creato alla prima richiesta. */
    state(key, init) {
      if (!app.viewState.has(key)) app.viewState.set(key, typeof init === 'function' ? init() : { ...init });
      return app.viewState.get(key);
    },
    /** Stato della pagina aperta, cancellato quando la pagina esce dalla pila (`forgetPages`). */
    pageState(name, init) {
      const key = pageStateKey(route.path, name);
      if (!app.viewState.has(key)) app.viewState.set(key, typeof init === 'function' ? init() : { ...init });
      return { key, state: app.viewState.get(key) };
    },
    /** Esegue un'operazione asincrona una sola volta per chiave (come `.task(id:)`). */
    task(key, fn) {
      const id = `${app.sessionID}|${key}`;
      if (app.tasks.has(id)) return;
      app.tasks.add(id);
      Promise.resolve().then(fn).finally(() => app.update());
    },
    update: () => app.update(),
    /** Esegue un'azione registrata, come se fosse stata scelta dall'interfaccia. */
    run: (name, el = document.body) => dispatch(name, el, null),
    navigate,
    back,
    selectSection,
    openMenu,
    openSheet,
    pushSheet,
    closeSheet,
    confirm,
    openFile,
    scrollToTop,
    pageScroller,
    openSearch,
    openDatePicker,
    afterRender: (fn) => app.afterRender.push(fn),
    /** Scorre un'area senza colorare la barra superiore (scorrimenti fatti dall'app). */
    scrollQuietly,
    revealTheme,
    toast: showToast,
  };
}

// MARK: - Menu, fogli, dialoghi

/**
 * Apre un menu a comparsa accanto a un elemento. Le voci: `{ label, icon, checked, disabled,
 * destructive, subtitle, run }`, `{ section: 'Titolo' }` oppure `{ divider: true }`.
 */
export function openMenu(anchor, items, { align = 'end' } = {}) {
  const rect = anchor instanceof Element ? anchor.getBoundingClientRect() : { left: anchor.x, right: anchor.x, top: anchor.y, bottom: anchor.y };
  app.menu = { rect, items, align, id: Date.now() };
  app.update();
}

/** Apre un foglio al posto di quello aperto. */
export function openSheet(sheet) {
  app.sheet = sheet;
  app.sheetStack = [];
  app.menu = null;
  app.update();
}

/** Apre un foglio sopra a quello aperto: chiudendolo si torna a quello di prima. */
export function pushSheet(sheet) {
  if (app.sheet) app.sheetStack.push(app.sheet);
  app.sheet = sheet;
  app.menu = null;
  app.update();
}

export function closeSheet() {
  const closing = app.sheet;
  app.sheet = app.sheetStack.pop() ?? null;
  closing?.onClose?.();
  app.update();
}

export function confirm({ title, message, confirmLabel = 'OK', destructive = false, cancelLabel = 'Annulla', onConfirm, onCancel, actions }) {
  app.dialog = { title, message, confirmLabel, destructive, cancelLabel, onConfirm, onCancel, actions };
  app.menu = null;
  app.update();
}

/** Selettore della data di Material 3: `onPick(giorno)` riceve il giorno scelto. */
export function openDatePicker(options) {
  app.datePicker = datePickerState(options);
  app.menu = null;
  app.update();
}

/** Anteprima di un file scaricato (come Quick Look). */
export function openFile(file) {
  app.viewer = viewerState(file);
  app.update();
}

let toastTimer = null;
export function showToast(message, iconName = 'checkCircle') {
  app.toast = { message, iconName, id: Date.now() };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { app.toast = null; app.update(); }, 3600);
  app.update();
}

// MARK: - Rendering

const root = document.getElementById('app');

/**
 * Elementi che entrano con un'animazione propria solo quando cambiano dentro un contenitore già
 * sullo schermo (vedi `settleNewSlides`), e i loro contenitori: giorni e schede che entrano di
 * lato (`axis-in` in `[data-axis]`), settimana e mese della barra del calendario (`slide-±1` in
 * `.cb-rows`), mesi del selettore della data (in `.dp-days`), Lista e Giorno dell'Orario
 * (`.view-swap` in `.page-body`).
 */
const SLIDE_CONTAINERS = '[data-axis], .cb-rows, .dp-days, .page-body';
const SLIDING_PAGES = '.axis-in, .slide-1, .slide--1, .view-swap';
/** Elementi che si animano quando cambia il loro stato: solo se c'erano già (la casella del compito). */
const STATE_POPS = '.check';
/** Pulsante per tornare al giorno predefinito ("Domani", "Oggi") nel giorno in grande. */
const DAY_JUMP = '.day-jump';
/** Parte ferma in alto (la settimana di Dashboard e Orario): sale con la pagina solo se è nuova. */
const PAGE_FIXED = '.page-fixed';

function render() {
  applyTheme();
  if (app.sessionID !== model.sessionID) {
    app.sessionID = model.sessionID;
    app.viewState.clear();
    app.tasks.clear();
    // Il popup degli account si chiude da solo quando cambia la sessione.
    if (app.sheet?.closesOnSessionChange) { app.sheet = null; app.sheetStack = []; }
  }
  let html;
  if (model.phase === 'launching') html = '<div class="launch"></div>';
  // L'introduzione copre tutto (sotto non serve disegnare accesso o app: la fine li mostra con il
  // cerchio dei colori); fogli e dialoghi le stanno sopra.
  else if (app.onboarding) html = renderOnboarding(makeContext());
  else if (model.phase === 'signedOut') html = renderSignedOut();
  else {
    leaveHiddenTimetable();
    html = renderSignedIn();
  }
  html += renderOverlays();
  const leaving = captureAxisPages();
  const known = new Set(root.querySelectorAll(`${SLIDE_CONTAINERS}, ${STATE_POPS}, ${DAY_JUMP}, ${PAGE_FIXED}, .page`));
  const jumpDays = new Set([...root.querySelectorAll(DAY_JUMP)].map((jump) => jump.closest('[data-axis]')));
  const scrolls = captureScrolls();
  const navTabs = captureNavTabs();
  const flips = captureFlips();
  morph(root, html);
  animateNavTabs(navTabs);
  animateAxisExits(leaving);
  settleNewSlides(known, jumpDays);
  swapReusedScrolls(scrolls);
  restoreScroll();
  drawCharts(root);
  fitDayTitles();
  fitLoginTitles();
  animateMorphShapes(root);
  positionMenu();
  const pending = app.afterRender.splice(0);
  for (const fn of pending) {
    try { fn(root); } catch (error) { console.error(error); }
  }
  updateBarState();
  fitKeyboard();
  playFlips(flips);
}

// MARK: Cerchio dei colori

/**
 * Cambio di colori con un cerchio che si allarga da `point`, uguale a `ThemeReveal` nell'app: con le
 * View Transitions il browser tiene una fotografia della pagina di prima, `changes` cambia colori
 * e contenuto sotto, e la pagina nuova compare in un cerchio che cresce fino all'angolo più
 * lontano (più 8 px), con la curva "emphasized" di Material 3 in 1,15 s. Il fronte dell'onda è un
 * anello del nuovo colore primario sul bordo tra prima (fuori) e dopo (dentro): cresce con il
 * cerchio, si assottiglia da 26 a 2 px e svanisce (opacità 0 → 0,5 → 0,3 → 0, come nell'app).
 * L'anello è un elemento con il suo `view-transition-name`, così sta sopra le due fotografie.
 * Intanto i tocchi si fermano sulla fotografia. Con le animazioni ridotte è una dissolvenza
 * senza anello; senza View Transitions cambia e basta.
 */
let revealing = false;
const REVEAL_DURATION = 1150;
const REVEAL_EASING = 'cubic-bezier(.42, 0, .18, 1)';

async function revealTheme(point, changes) {
  const html = document.documentElement;
  let applied = false;
  let ring = null;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches || html.dataset.motion === 'reduced';
  const apply = async () => {
    if (applied) return;
    applied = true;
    await changes();
    applyTheme();
    render();
    // L'anello fa parte della pagina nuova (nel colore nuovo), in un gruppo suo sopra le fotografie.
    if (revealing && !reduced) {
      ring = document.createElement('div');
      ring.className = 'reveal-ring';
      ring.setAttribute('aria-hidden', 'true');
      ring.append(document.createElement('i'));
      document.body.append(ring);
    }
  };
  if (revealing || typeof document.startViewTransition !== 'function') {
    await apply();
    return;
  }
  revealing = true;
  const x = point?.x ?? window.innerWidth / 2;
  const y = point?.y ?? window.innerHeight / 2;
  const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y)) + 8;
  html.classList.add('theme-reveal');
  html.classList.toggle('reduced-reveal', reduced);
  try {
    const transition = document.startViewTransition(apply);
    if (!reduced) {
      transition.ready.then(() => {
        const timing = { duration: REVEAL_DURATION, easing: REVEAL_EASING };
        html.animate(
          { clipPath: [`circle(0.5px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
          { ...timing, pseudoElement: '::view-transition-new(root)' },
        );
        const band = ring?.firstElementChild;
        if (!band) return;
        // Il tratto è centrato sul bordo del cerchio: metà sopra la pagina di prima, metà sopra la nuova.
        const frame = (r, width) => ({
          left: `${x - r - width / 2}px`, top: `${y - r - width / 2}px`,
          width: `${2 * r + width}px`, height: `${2 * r + width}px`, borderWidth: `${width}px`,
        });
        band.animate([frame(0.5, 26), frame(radius, 2)], { ...timing, fill: 'forwards' });
        band.animate([{ opacity: 0 }, { opacity: 0.5, offset: 0.12 }, { opacity: 0.3, offset: 0.6 }, { opacity: 0 }],
          { duration: REVEAL_DURATION, fill: 'forwards' });
        navigator.vibrate?.(6);
      }).catch(() => {});
    }
    await transition.finished;
  } catch {
    await apply();
  } finally {
    ring?.remove();
    html.classList.remove('theme-reveal', 'reduced-reveal');
    revealing = false;
  }
}

// MARK: Spostamenti con la molla

/**
 * Elementi che cambiano posto tra un disegno e l'altro (`data-flip="id"`), animati con la tecnica
 * FLIP: dopo il morph ognuno parte da dove era e arriva al suo posto con la molla, come le viste di
 * SwiftUI che cambiano disposizione. `data-flip-mode="scale"` anima anche la misura (la scritta
 * del logo che si rimpicciolisce), `move` solo la posizione; un elemento `move` che va a capo
 * prima o dopo (`wraps`) invece di scorrere sparisce e ricompare a movimento quasi finito, come
 * la dissolvenza in sequenza di Material 3. Con le animazioni ridotte cambiano e basta.
 */
function captureFlips() {
  const flips = new Map();
  for (const el of root.querySelectorAll('[data-flip]')) {
    flips.set(el.dataset.flip, { rect: el.getBoundingClientRect(), wraps: el.classList.contains('wraps') });
  }
  return flips;
}

function playFlips(before) {
  if (!before.size) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.motion === 'reduced') return;
  const style = getComputedStyle(document.documentElement);
  const timing = { duration: parseFloat(style.getPropertyValue('--spring-dur')) || 435, easing: style.getPropertyValue('--spring').trim() || 'ease-out' };
  for (const el of root.querySelectorAll('[data-flip]')) {
    const old = before.get(el.dataset.flip);
    if (!old || !old.rect.width) continue;
    const now = el.getBoundingClientRect();
    if (!now.width) continue;
    const dx = old.rect.left - now.left;
    const dy = old.rect.top - now.top;
    const scale = el.dataset.flipMode === 'scale' ? old.rect.width / now.width : 1;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 && Math.abs(scale - 1) < 0.01) continue;
    if (el.dataset.flipMode === 'move' && (old.wraps || el.classList.contains('wraps'))) {
      el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 230, delay: 220, easing: style.getPropertyValue('--effects').trim() || 'ease-out', fill: 'backwards' });
      continue;
    }
    el.animate([
      { transform: `translate(${dx}px, ${dy}px) scale(${scale})`, transformOrigin: '0 0' },
      { transform: 'none', transformOrigin: '0 0' },
    ], timing);
  }
}

/**
 * Il titolo dell'accesso che non sta su una riga va a capo (al massimo tre): sotto il logo
 * centrato, accanto al logo piccolo allineato a sinistra e centrato sul logo (`wraps`). Il morph
 * toglie la classe, quindi si rimisura a ogni disegno.
 */
function fitLoginTitles() {
  for (const title of root.querySelectorAll('.login-header .logo-subtitle')) {
    const line = parseFloat(getComputedStyle(title).lineHeight) || 22;
    title.classList.toggle('wraps', title.getBoundingClientRect().height > line * 1.5);
  }
}

// MARK: Transizione ad asse condiviso

/**
 * Pagine che cambiano con la transizione ad asse condiviso X di Material 3 (giorni, schede dei
 * Voti): un contenitore `[data-axis]` con un solo figlio con `data-key` e `data-axis-dir`
 * (1 avanti, −1 indietro). La pagina che entra si anima da sé (classe `axis-in`); quella che
 * esce, tolta dal morph, si ridisegna sopra per un istante mentre scivola e svanisce.
 */
function captureAxisPages() {
  return [...root.querySelectorAll('[data-axis]')].map((container) => {
    const node = container.firstElementChild;
    if (!node?.dataset.key) return null;
    const clip = (container.closest('[data-scroll]') ?? container).getBoundingClientRect();
    return { name: container.dataset.axis, node, rect: node.getBoundingClientRect(), clip };
  }).filter(Boolean);
}

/** Spostamento del dito al rilascio di uno scorrimento laterale (la pagina esce da lì). */
let swipeRelease = 0;

function animateAxisExits(leaving) {
  for (const { name, node, rect, clip } of leaving) {
    if (node.isConnected || !rect.width) continue;
    const container = root.querySelector(`[data-axis="${name}"]`);
    if (!container || container.firstElementChild?.dataset.key === node.dataset.key) continue;
    const dir = Number(container.dataset.axisDir) || 1;
    const top = Math.max(clip.top, 0);
    const layer = document.createElement('div');
    layer.className = 'axis-exit-layer';
    layer.style.cssText = `left:${clip.left}px;top:${top}px;width:${clip.width}px;height:${Math.max(0, clip.bottom - top)}px`;
    node.classList.remove('axis-in');
    node.classList.add('axis-exit');
    node.style.cssText = `left:${rect.left - clip.left}px;top:${rect.top - top}px;width:${rect.width}px;--from:${swipeRelease}px;--to:${-dir * 48 + swipeRelease}px`;
    layer.appendChild(node);
    document.body.appendChild(layer);
    // Rimessa nel documento, la pagina farebbe ripartire le animazioni dei suoi elementi (il
    // pulsante "Domani" rispuntava, le caselle dei compiti fatti saltavano): esce ferma.
    for (const animation of node.getAnimations({ subtree: true })) {
      if (animation.effect?.target !== node) animation.cancel();
    }
    setTimeout(() => layer.remove(), 400);
  }
  swipeRelease = 0;
}

/**
 * Il verso del cambio di giorno, settimana o scheda resta nello stato della vista (serve finché
 * la pagina nuova entra) e le classi `axis-in`/`slide-±1` vengono riscritte a ogni disegno. Una
 * pagina che entra di lato ha senso solo se cambia dentro un contenitore già sullo schermo: in un
 * contenitore appena creato (cambio di scheda, ritorno da un'altra pagina, prima apertura) la sua
 * animazione si annulla, così il contenuto compare con la pagina, dal basso, e non in diagonale
 * (prima, dopo un cambio di giorno, tornando sulla scheda la pagina saliva e scivolava di lato).
 * Allo stesso modo le caselle dei compiti fatti saltano solo quando le si tocca e il pulsante
 * "Domani"/"Oggi" spunta solo quando compare cambiando giorno, non se c'era già nel giorno prima
 * né in una pagina appena aperta (prima lo facevano a ogni cambio di scheda o di giorno); la parte
 * ferma in alto sale con la pagina solo quando la pagina è nuova.
 * Una CSSAnimation annullata non riparte finché la classe resta la stessa.
 */
function settleNewSlides(known, jumpDays) {
  const cancel = (node) => { for (const animation of node.getAnimations()) animation.cancel(); };
  for (const node of root.querySelectorAll(SLIDING_PAGES)) {
    if (!known.has(node.parentElement?.closest(SLIDE_CONTAINERS))) cancel(node);
  }
  for (const node of root.querySelectorAll(STATE_POPS)) {
    if (!known.has(node)) cancel(node);
  }
  for (const node of root.querySelectorAll(DAY_JUMP)) {
    if (known.has(node)) continue;
    const day = node.closest('[data-axis]');
    if (!known.has(day) || jumpDays.has(day)) cancel(node);
  }
  // La settimana sale dal basso insieme al contenuto quando si apre la pagina; chiudendo la
  // ricerca della Dashboard la pagina resta e la settimana, ridisegnata, non sale da sola.
  for (const node of root.querySelectorAll(PAGE_FIXED)) {
    if (!known.has(node) && known.has(node.closest('.page'))) cancel(node);
  }
}

/**
 * Il giorno in grande (Dashboard, Orario) che non ci sta si rimpicciolisce fino al 70%, come
 * `minimumScaleFactor(0.7)` nell'app, invece di finire subito con i puntini: accanto c'è il
 * pulsante del giorno predefinito. Il morph toglie la
 * dimensione scritta qui, quindi si rimisura a ogni disegno (prima che la pagina si veda).
 */
function fitDayTitles() {
  for (const title of root.querySelectorAll('.day-hero h2')) {
    title.style.removeProperty('font-size');
    const full = title.scrollWidth;
    const room = title.clientWidth;
    if (!room || full <= room) continue;
    const size = parseFloat(getComputedStyle(title).fontSize);
    title.style.fontSize = `${(Math.max(0.7, room / full) * size).toFixed(2)}px`;
  }
}

function renderSignedOut() {
  const ctx = makeContext();
  return `<div class="login-screen" data-key="login" data-scroll="login">${renderLogin(ctx, { adding: false })}</div>`;
}

function renderSignedIn() {
  const ctx = makeContext();
  const view = routes[ctx.route.name];
  let page;
  try {
    page = view.render(ctx);
  } catch (error) {
    console.error(error);
    page = { title: 'Errore', body: `<div class="empty-state"><h3>Qualcosa è andato storto</h3><p>${esc(error.message)}</p></div>` };
  }
  const content = app.wide ? renderDesktop(ctx, page) : renderMobile(ctx, page);
  return content + (Lock.isLocked ? renderLock() : '');
}

// MARK: Barre superiori

/**
 * Elementi delle barre: `{ icon, label, action }` (pulsante a icona), `{ text, action }`
 * (pulsante tonale), `{ text, prominent: true }` (pieno), `{ spacer: true }`, `{ html }`.
 */
function barItem(item) {
  if (item.spacer) return '<span class="bar-gap"></span>';
  if (item.html) return item.html;
  const attrs = data({ action: item.action, ...(item.params ?? {}) });
  const disabled = item.disabled ? ' disabled' : '';
  if (item.text) {
    return `<button class="btn xs ${item.prominent ? 'filled' : 'tonal'} bar-text ${item.cls ?? ''}"${attrs}${disabled} title="${esc(item.help ?? item.text)}">${item.icon ? icon(item.icon) : ''}<span>${esc(item.text)}</span></button>`;
  }
  return `<button class="icon-btn ${item.cls ?? ''}"${attrs}${disabled} aria-label="${esc(item.label)}" title="${esc(item.help ?? item.label)}">${icon(item.icon)}</button>`;
}

/** Campo della ricerca generale, nella barra in alto su schermi larghi (come Gmail e Drive). */
function globalSearchField() {
  const query = app.viewState.get('search')?.query ?? '';
  return `<label class="search-bar global-search" title="Cerca (Ctrl+F)">${icon('search')}<input type="search" value="${esc(query)}" placeholder="Cerca nel registro" data-input="global-search" data-focus="global-search-focus" data-blur="global-search-blur" data-keydown="global-search-key" autocomplete="off" enterkeyhint="search" aria-label="Cerca">${query ? `<button class="icon-btn small" data-action="global-search" data-clear="1" aria-label="Cancella">${icon('x')}</button>` : ''}</label>`;
}

/** Torna dalla ricerca generale all'ultima sezione aperta. */
function endSearch() {
  const search = app.viewState.get('search');
  if (search) search.query = '';
  if (app.nav.current === 'search') selectSection(app.nav.lastSection ?? 'dashboard');
}

/** Ricerca sui telefoni: la barra in cima alla Dashboard diventa il campo. */
export function openSearch() {
  if (app.nav.current !== 'dashboard' || (app.nav.stacks.dashboard?.length ?? 1) > 1) {
    app.nav.current = 'dashboard';
    app.nav.stacks.dashboard = ['dashboard'];
    syncHash();
  }
  app.searching = true;
  app.fabOpen = false;
  app.afterRender.push((r) => r.querySelector('.search-app-bar input')?.focus());
  app.update();
}

function closeSearch() {
  app.searching = false;
  const search = app.viewState.get('search');
  if (search) search.query = '';
  app.update();
}

function searchField(search) {
  return `<label class="search-bar page-search">${icon('search')}<input type="search" value="${esc(search.value)}" placeholder="${esc(search.placeholder)}" data-input="${search.input}" autocomplete="off" enterkeyhint="search">${search.value ? `<button class="icon-btn small" data-action="${search.input}" data-clear="1" aria-label="Cancella">${icon('x')}</button>` : ''}</label>`;
}

/** Avatar dell'account attivo (in un biscotto): apre gli account. */
function accountAvatar(action, size = 34) {
  return `<button class="account-avatar" data-action="${action}" aria-label="Account, ${esc(model.displayName)}" title="${esc(model.displayName)}">${avatar(model.initials, { size, shapeName: 'cookie9Sided' })}</button>`;
}

/**
 * Barra superiore con la barra di ricerca (come Gmail e Google Foto): una pillola sospesa di 56
 * px con l'icona, l'invito e, a destra, i pulsanti della pagina e l'avatar. Toccandola diventa
 * il campo (freccia per tornare indietro, X per cancellare) e i risultati prendono il posto
 * della pagina.
 */
function searchAppBar(page) {
  if (app.searching) {
    const query = app.viewState.get('search')?.query ?? '';
    return `<header class="search-app-bar"><div class="sab-pill active">
      <button class="icon-btn" data-action="search-close" aria-label="Chiudi la ricerca" title="Chiudi la ricerca">${icon('arrowBack')}</button>
      <input type="search" value="${esc(query)}" placeholder="Compiti, voti, altro…" data-input="search-input" data-keydown="search-key" autocomplete="off" enterkeyhint="search" aria-label="Cerca">
      ${query ? `<button class="icon-btn" data-action="search-input" data-clear="1" aria-label="Cancella" title="Cancella">${icon('x')}</button>` : ''}</div></header>`;
  }
  const actions = (page.actions ?? []).map(barItem).join('');
  return `<header class="search-app-bar"><div class="sab-pill">
    <button class="sab-open" data-action="search-open" aria-label="Cerca">${icon('search')}<span>${esc(page.searchBar.prompt ?? 'Cerca nel registro')}</span></button>
    <div class="sab-trail">${actions}${accountAvatar('account-switcher')}</div></div></header>`;
}

/** Menu del pulsante d'azione flottante: il FAB diventa un cerchio con la X e sopra salgono le voci. */
function fabMenu(menu) {
  const open = app.fabOpen;
  const items = open ? menu.items.map((item, index) => `<button class="fab-item" style="--i:${menu.items.length - 1 - index}" data-action="fab-run" data-run="${item.action}"${item.disabled ? ' disabled' : ''}>${icon(item.icon)}<span>${esc(item.title)}</span></button>`).join('') : '';
  return `<div class="fab-menu ${open ? 'open' : ''}" data-key="fab-menu">
    ${open ? '<div class="fab-scrim" data-action="fab-toggle"></div>' : ''}
    <div class="fab-stack">${items}
      <button class="fab-toggle" data-action="fab-toggle" aria-expanded="${open}" aria-label="${esc(open ? 'Chiudi il menu' : menu.label)}" title="${esc(open ? 'Chiudi il menu' : menu.label)}">${icon(open ? 'x' : menu.icon)}</button></div></div>`;
}

function pageExtras(page) {
  let html = page.overlay ?? '';
  if (page.toolbar) html += `<div class="toolbar-slot" data-key="toolbar">${page.toolbar}</div>`;
  else if (page.fabMenu) html += fabMenu(page.fabMenu);
  else if (page.fab) html += `<button class="fab page-fab" data-action="${page.fab.action}" aria-label="${esc(page.fab.label)}" title="${esc(page.fab.label)}"${page.fab.disabled ? ' disabled' : ''}>${icon(page.fab.icon)}</button>`;
  return html;
}

// MARK: Telefoni e tablet

function renderMobile(ctx, page) {
  const path = currentPath();
  const depth = ctx.depth;
  const searching = app.searching && ctx.route.name === 'dashboard';
  let bar;
  if (page.searchBar) {
    bar = searchAppBar(page);
  } else {
    const scrolled = app.scrolled.has(path);
    const leading = depth > 1
      ? `<button class="icon-btn" data-action="nav-back" aria-label="Indietro" title="Indietro">${icon('arrowBack')}</button>` : '';
    const actions = (page.actions ?? []).map(barItem).join('');
    // Le pagine principali delle schede hanno il titolo grande nella riga dei pulsanti.
    bar = `<header class="app-bar ${scrolled ? 'scrolled' : ''} ${depth === 1 ? 'large' : ''} ${leading ? 'has-leading' : ''}">
      ${leading}<div class="app-bar-title"><h1>${esc(page.title)}</h1>${page.subtitle ? `<p>${esc(page.subtitle)}</p>` : ''}</div>
      <div class="app-bar-actions">${actions}</div></header>`;
  }
  let content;
  if (searching) {
    // Vista di ricerca di Material 3: i risultati prendono il posto della pagina.
    const results = routes.search.render(ctx);
    content = `<div class="page-main"><div class="page-scroll" data-scroll="search" data-bar-ignore>
      <div class="page-body fade-through" data-key="search-body">${results.body}</div></div></div>`;
  } else {
    const search = page.search ? searchField(page.search) : '';
    const refreshing = app.refreshing.has(path);
    const body = page.split ? `<div class="stack gap-16">${page.split.side}${page.split.main}</div>` : (page.body ?? '');
    // Con una parte ferma in alto (la settimana) il contenuto non scorre sotto la barra.
    const ignore = page.fixed || page.searchBar ? ' data-bar-ignore' : '';
    content = `${page.fixed ? `<div class="page-fixed" data-key="fixed">${page.fixed}</div>` : ''}
      <div class="page-main">
        <div class="page-scroll" data-scroll="main" data-refreshable="${page.refresh ? '1' : ''}"${ignore}>
          <div class="ptr ${refreshing ? 'active' : ''}">${loadingIndicator({ contained: true })}</div>
          ${search}<div class="page-body ${page.bottomInset ? 'bottom-inset' : ''} ${page.fabMenu || page.fab || page.toolbar ? 'fab-inset' : ''}">${page.body != null || page.split ? body : ''}</div>
        </div>
        ${pageExtras(page)}
      </div>`;
  }
  const hidesNav = searching || page.hidesNav;
  const pageHTML = `<section class="page active mobile" data-key="page-${esc(path)}" data-path="${esc(path)}">${bar}${content}</section>`;
  return `<div class="shell mobile ${app.medium ? 'medium' : 'compact'} ${hidesNav ? 'nav-hidden' : ''} ${model.isChangingSession ? 'changing' : ''}">${pageHTML}${renderNavBar()}</div>`;
}

function renderNavBar() {
  const current = app.nav.current;
  const badge = model.unreadNoticesCount;
  if (!app.medium) return floatingNavBar(current, badge);
  const item = (key, label, badgeCount = 0) => {
    const s = sections[key];
    const selected = current === key;
    return `<button class="nav-item ${selected ? 'selected' : ''}" data-action="select-section" data-key-name="${key}" ${key === 'you' ? 'data-longpress="account-switcher"' : ''} aria-label="${label}" aria-current="${selected ? 'page' : 'false'}">
      <span class="nav-indicator">${icon(selected && s.iconSelected ? s.iconSelected : s.icon)}${badgeCount ? `<span class="badge">${badgeCount}</span>` : ''}</span><span class="nav-label">${label}</span></button>`;
  };
  // La ricerca sta nella barra in cima alla Dashboard, come nelle app Google. L'Orario si può
  // nascondere (Impostazioni › Orario).
  const timetable = model.preferences.showsTimetableTab ? item('timetable', 'Orario') : '';
  return `<nav class="nav-bar" aria-label="Schede">${item('dashboard', 'Dashboard')}${timetable}${item('grades', 'Voti')}${item('you', 'Tu', badge)}</nav>`;
}

/**
 * Telefoni (3.3, come nell'app): barra di navigazione flottante di Material 3 Expressive, una
 * pillola sospesa sul contenuto con i nomi delle schede. Quella aperta è una pillola piena nel
 * colore primario con l'icona, che scivola da una scheda all'altra con la molla (`animateNavTabs`).
 * Il badge di Tu sta accanto al nome e si sposta con la scheda.
 */
function floatingNavBar(current, badge) {
  const item = (key, label, badgeCount = 0) => {
    const s = sections[key];
    const selected = current === key;
    return `<button class="nav-tab ${selected ? 'selected' : ''}" data-key="tab-${key}" data-action="select-section" data-key-name="${key}" ${key === 'you' ? 'data-longpress="account-switcher"' : ''} aria-label="${label}${badgeCount ? `, ${badgeCount} da leggere` : ''}" aria-current="${selected ? 'page' : 'false'}">
      ${selected ? `<span class="nav-pill" data-key="pill" aria-hidden="true"></span><span class="nav-tab-icon" data-key="icon">${icon(s.iconSelected ?? s.icon)}</span>` : ''}<span class="nav-label" data-key="label">${label}</span>${badgeCount ? `<span class="badge" data-key="badge">${badgeCount}</span>` : ''}</button>`;
  };
  const timetable = model.preferences.showsTimetableTab ? item('timetable', 'Orario') : '';
  return `<nav class="nav-bar floating" aria-label="Schede">${item('dashboard', 'Dashboard')}${timetable}${item('grades', 'Voti')}${item('you', 'Tu', badge)}</nav>`;
}

/** Posizione delle schede della barra flottante prima di un disegno. */
function captureNavTabs() {
  const bar = root.querySelector('.nav-bar.floating');
  if (!bar) return null;
  const tabs = new Map([...bar.querySelectorAll('.nav-tab')].map((tab) => [tab.dataset.keyName, tab.getBoundingClientRect()]));
  return { selected: bar.querySelector('.nav-tab.selected')?.dataset.keyName ?? null, tabs };
}

/**
 * Cambiando scheda la pillola scivola dalla scheda di prima a quella nuova allargandosi, e le
 * altre schede scorrono al loro posto (FLIP con la molla, come `matchedGeometryEffect` nell'app).
 * Con le animazioni ridotte cambia e basta.
 */
function animateNavTabs(before) {
  const bar = root.querySelector('.nav-bar.floating');
  const selected = bar?.querySelector('.nav-tab.selected');
  if (!before || !selected || before.selected == null || before.selected === selected.dataset.keyName) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.motion === 'reduced') return;
  const style = getComputedStyle(document.documentElement);
  const timing = { duration: parseFloat(style.getPropertyValue('--spring-dur')) || 435, easing: style.getPropertyValue('--spring').trim() || 'ease-out' };
  for (const tab of bar.querySelectorAll('.nav-tab')) {
    const old = before.tabs.get(tab.dataset.keyName);
    if (!old) continue;
    const dx = old.left - tab.getBoundingClientRect().left;
    if (Math.abs(dx) > 0.5) tab.animate([{ transform: `translateX(${dx}px)` }, { transform: 'none' }], timing);
  }
  const from = before.tabs.get(before.selected);
  const itemBefore = before.tabs.get(selected.dataset.keyName);
  const pill = selected.querySelector('.nav-pill');
  if (!from || !itemBefore || !pill) return;
  pill.animate([
    { left: `${from.left - itemBefore.left}px`, width: `${from.width}px` },
    { left: '0px', width: `${selected.getBoundingClientRect().width}px` },
  ], timing);
}

// MARK: Schermi larghi

function renderDesktop(ctx, page) {
  const path = currentPath();
  const depth = ctx.depth;
  const scrolled = app.scrolled.has(path);
  const back = depth > 1 ? `<button class="icon-btn" data-action="nav-back" aria-label="Indietro" title="Indietro">${icon('arrowBack')}</button>` : '';
  const actions = (page.actions ?? []).map(barItem).join('');
  const toolbar = `<header class="app-bar desktop ${scrolled ? 'scrolled' : ''} ${depth === 1 ? 'large' : ''}">
    ${back}
    <div class="app-bar-title"><h1>${esc(page.title)}</h1>${page.subtitle ? `<p>${esc(page.subtitle)}</p>` : ''}</div>
    <div class="app-bar-actions">${actions}</div></header>`;

  let content;
  if (page.full) {
    content = page.full;
  } else if (page.split && app.splitWide) {
    content = `<div class="split" style="--side:${page.split.sideWidth ?? 340}px">
      <div class="split-side" data-scroll="side"><div class="column">${page.split.side}</div></div>
      <div class="split-main" data-scroll="main"><div class="column">${page.split.main}</div></div></div>`;
  } else {
    const body = page.split ? `${page.split.side}${page.split.main}` : page.body;
    content = `<div class="page-scroll" data-scroll="main"><div class="page-body ${page.narrow ? 'narrow' : ''} ${page.fabMenu || page.toolbar ? 'fab-inset' : ''}">${body}</div></div>`;
  }
  const refresh = `<button class="icon-btn" data-action="refresh-all" ${model.isRefreshing ? 'disabled' : ''} aria-label="Aggiorna" title="Aggiorna i dati da Classeviva (Alt+R)">${model.isRefreshing ? loadingIndicator({ size: 'small' }) : icon('refresh')}</button>`;
  const settings = `<button class="icon-btn" data-action="open-settings" aria-label="Impostazioni" title="Impostazioni">${icon('gear')}</button>`;
  return `<div class="shell desktop ${app.railIsCollapsed ? 'rail-collapsed' : ''} ${app.railOverlays ? 'rail-overlays' : ''} ${app.railOpen ? 'rail-open' : ''} ${model.isChangingSession ? 'changing' : ''}">
    <header class="top-bar">
      <div class="top-lead">
        <button class="icon-btn" data-action="toggle-rail" aria-label="${app.railIsCollapsed ? 'Espandi la barra di navigazione' : 'Riduci la barra di navigazione'}" title="${app.railIsCollapsed ? 'Espandi' : 'Riduci'}">${icon('menuOpen', { cls: app.railIsCollapsed ? 'flipped' : '' })}</button>
        ${logo('top-logo')}</div>
      <div class="top-search" data-key="global-search">${globalSearchField()}</div>
      <div class="top-actions">${refresh}${settings}${accountAvatar('account-menu', 36)}</div>
    </header>
    <div class="shell-body">
      ${renderRail()}
      <section class="page active desktop" data-key="page-${esc(path)}" data-path="${esc(path)}">${toolbar}<div class="page-content">${content}${pageExtras(page)}</div></section>
    </div>
  </div>`;
}

function renderRail() {
  const current = app.nav.current;
  const groups = sectionGroups.map((group, index) => {
    const keys = index ? group.sections : group.sections.filter((key) => visibleTabs().includes(key));
    const rows = keys.map((key) => {
      const s = sections[key];
      const badge = sectionBadge(model, key);
      const selected = current === key;
      const shortcut = sectionShortcut(key);
      return `<button class="rail-item ${selected ? 'selected' : ''}" data-action="select-section" data-key-name="${key}" title="${shortcut ? `${s.title} (Alt+${shortcut})` : s.title}" aria-current="${selected ? 'page' : 'false'}">
        <span class="rail-indicator">${icon(selected && s.iconSelected ? s.iconSelected : s.icon)}${badge ? `<span class="badge">${badge}</span>` : ''}</span><span class="rail-label">${esc(s.title)}</span>${badge ? `<span class="rail-count">${badge}</span>` : ''}</button>`;
    }).join('');
    return `<div class="rail-group">${group.title ? `<h2>${esc(group.title)}</h2>` : ''}${index ? '<hr>' : ''}${rows}</div>`;
  }).join('');
  return `<aside class="rail"><nav class="rail-scroll" data-scroll="rail" aria-label="Sezioni">${groups}</nav></aside><div class="rail-scrim" data-action="toggle-rail"></div>`;
}

// MARK: Sovrapposizioni

function renderOverlays() {
  let html = '';
  if (app.sheet) {
    const ctx = makeContext();
    const sheet = app.sheet.render(ctx);
    const closeLabel = app.sheetStack.length ? 'Indietro' : 'Chiudi';
    const leading = sheet.leading ?? `<button class="icon-btn" data-action="sheet-close" aria-label="${closeLabel}" title="${closeLabel}">${icon(app.sheetStack.length ? 'arrowBack' : 'x')}</button>`;
    html += `<div class="sheet-layer ${app.wide ? 'centered' : 'bottom'}" data-key="sheet-${esc(app.sheet.id)}">
      <div class="scrim" data-action="${sheet.locked ? 'noop' : 'sheet-close'}"></div>
      <div class="sheet ${sheet.size ?? ''}" role="dialog" aria-modal="true" aria-label="${esc(sheet.title ?? '')}">
        ${app.wide ? '' : '<span class="sheet-handle" aria-hidden="true"></span>'}
        <header class="sheet-bar"><div class="sheet-lead">${leading}</div><h2>${esc(sheet.title ?? '')}</h2><div class="sheet-trail">${sheet.trailing ?? ''}</div></header>
        <div class="sheet-body" data-scroll="sheet">${sheet.body}</div>
        ${sheet.footer ? `<footer class="sheet-footer">${sheet.footer}</footer>` : ''}
      </div></div>`;
  }
  if (app.viewer) html += renderViewer(app.viewer);
  if (app.datePicker) html += renderDatePicker(app.datePicker);
  if (app.dialog) {
    const d = app.dialog;
    // Dialoghi con più scelte (`actions`) oppure conferma/annulla.
    const buttons = d.actions
      ? d.actions.map((a, i) => `<button class="btn text ${a.destructive ? 'danger-text' : ''} ${a.cancel ? 'cancel' : ''}" data-action="dialog-choice" data-index="${i}">${esc(a.label)}</button>`).join('')
      : `${d.cancelLabel ? `<button class="btn text" data-action="dialog-cancel">${esc(d.cancelLabel)}</button>` : ''}
        <button class="btn text ${d.destructive ? 'danger-text' : ''} strong" data-action="dialog-confirm">${esc(d.confirmLabel)}</button>`;
    html += `<div class="dialog-layer" data-key="dialog"><div class="scrim" data-action="dialog-cancel"></div>
      <div class="dialog ${d.actions && d.actions.length > 2 ? 'stacked' : ''}" role="alertdialog" aria-modal="true"><h2>${esc(d.title)}</h2>${d.message ? `<p>${esc(d.message)}</p>` : ''}
      <div class="dialog-actions">${buttons}</div></div></div>`;
  }
  if (app.menu) {
    // La colonna delle icone c'è solo se serve a qualche voce (icona o spunta): nei menu di soli
    // testi (es. le materie proposte dall'editor) i titoli partono dal bordo, come nell'app.
    const hasLead = app.menu.items.some((item) => item.checked || item.icon);
    const items = app.menu.items.map((item, index) => {
      if (item.divider) return '<hr>';
      if (item.section) return `<h3>${esc(item.section)}</h3>`;
      return `<button class="menu-item ${item.destructive ? 'destructive' : ''} ${item.checked ? 'checked' : ''}" role="menuitem" data-action="menu-run" data-index="${index}"${item.disabled ? ' disabled' : ''}>
        ${hasLead ? `<span class="menu-lead">${item.checked ? icon('check') : (item.icon ? icon(item.icon) : '')}</span>` : ''}
        <span class="grow"><span>${esc(item.label)}</span>${item.subtitle ? `<small>${esc(item.subtitle)}</small>` : ''}</span>
        ${item.trailing ? `<span class="menu-trail">${esc(item.trailing)}</span>` : ''}</button>`;
    }).join('');
    html += `<div class="menu-layer" data-key="menu-${app.menu.id}"><div class="menu-scrim" data-action="menu-close"></div><div class="menu" role="menu">${items}</div></div>`;
  }
  if (app.toast) {
    html += `<div class="snackbar" data-key="toast-${app.toast.id}" role="status">${icon(app.toast.iconName)}<span>${esc(app.toast.message)}</span></div>`;
  }
  return html;
}

function positionMenu() {
  const menu = root.querySelector('.menu');
  if (!menu || !app.menu) return;
  const { rect, align } = app.menu;
  const width = menu.offsetWidth;
  const height = menu.offsetHeight;
  let left = align === 'start' ? rect.left : rect.right - width;
  left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
  let top = rect.bottom + 4;
  if (top + height > window.innerHeight - 8) top = Math.max(8, rect.top - height - 4);
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
  menu.style.transformOrigin = `${align === 'start' ? 'left' : 'right'} ${top < rect.top ? 'bottom' : 'top'}`;
  // Un menu lungo (es. gli orari dell'editor) si apre sulla voce scelta, non in cima.
  if (!app.menu.revealed) {
    app.menu.revealed = true;
    const checked = menu.querySelector('.menu-item.checked');
    if (checked && menu.scrollHeight > menu.clientHeight) {
      menu.scrollTop = checked.offsetTop - (menu.clientHeight - checked.offsetHeight) / 2;
    }
  }
}

function renderLock() {
  const method = Lock.method;
  const unlock = method === 'pin'
    ? `<form class="pin-form" data-submit="lock-pin"><input class="text-input" type="password" inputmode="numeric" autocomplete="off" placeholder="Codice" data-input="lock-pin-input" value="${esc(app.pinInput)}" aria-label="Codice di sblocco" autofocus>
       <button class="btn filled m" type="submit">${icon('lockOpen')}<span>Sblocca</span></button></form>`
    : `<button class="btn filled m" data-action="lock-unlock">${icon('key')}<span>Sblocca con la passkey</span></button>`;
  return `<div class="lock-screen" data-key="lock">
    <div class="lock-center"><span class="lock-art shaped">${shape('cookie12Sided')}${icon('lock')}</span><h2>BCW è bloccata</h2>${app.lockError ? `<p class="error">${esc(app.lockError)}</p>` : ''}</div>
    <div class="lock-actions">${unlock}</div></div>`;
}

function applyTheme() {
  const mode = model.preferences.get('appearance');
  const html = document.documentElement;
  if (mode === 'system') html.removeAttribute('data-theme');
  else if (html.getAttribute('data-theme') !== mode) html.setAttribute('data-theme', mode);
  Theme.applyLayout(model.preferences);
  Theme.applyColors(model.preferences).then((changed) => { if (changed) applyThemeColor(); });
  applyThemeColor();
}

function applyThemeColor() {
  const mode = model.preferences.get('appearance');
  const dark = mode === 'dark' || (mode === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  // In bianco e nero (introduzione) la barra del browser segue la superficie grigia.
  const color = document.documentElement.hasAttribute('data-mono') ? (dark ? '#0b0b0b' : '#fbfbfb') : Theme.surface(dark);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta && meta.content !== color) meta.content = color;
  Theme.updateFavicon();
}

// MARK: - Azioni

const shellActions = {
  'noop': () => {},
  'search-open': () => openSearch(),
  'search-close': () => closeSearch(),
  'search-key': (ctx, el, event) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      closeSearch();
    } else if (event.key === 'Enter') {
      el.blur();
    }
  },
  'fab-toggle': () => { app.fabOpen = !app.fabOpen; navigator.vibrate?.(4); },
  'fab-run': (ctx, el) => {
    app.fabOpen = false;
    dispatch(el.dataset.run, el, null);
  },
  'open-settings': () => {
    selectSection('you');
    if (currentPath() !== 'settings') navigate('settings');
  },
  'toggle-section': (ctx, el) => {
    ctx.prefs.toggleCollapsed(el.dataset.section);
    navigator.vibrate?.(4);
  },
  'select-section': (ctx, el) => selectSection(el.dataset.keyName),
  'nav-back': () => back(),
  'navigate': (ctx, el) => navigate(el.dataset.to),
  'toggle-rail': () => {
    if (app.railOverlays) {
      app.railOpen = !app.railOpen;
    } else {
      app.railCollapsed = !app.railCollapsed;
      try { localStorage.setItem(RAIL_KEY, app.railCollapsed ? '1' : '0'); } catch { /* ignorato */ }
    }
    app.update();
  },
  'refresh-all': () => model.refreshAll(),
  'sheet-close': () => closeSheet(),
  'dialog-cancel': () => {
    const d = app.dialog;
    app.dialog = null;
    app.update();
    d?.onCancel?.();
  },
  'dialog-confirm': () => {
    const d = app.dialog;
    app.dialog = null;
    app.update();
    d?.onConfirm?.();
  },
  'dialog-choice': (ctx, el) => {
    const action = app.dialog?.actions?.[Number(el.dataset.index)];
    app.dialog = null;
    app.update();
    action?.run?.();
  },
  'menu-close': () => { app.menu = null; app.update(); },
  'menu-run': (ctx, el) => {
    const item = app.menu?.items[Number(el.dataset.index)];
    app.menu = null;
    app.update();
    item?.run?.();
  },
  /** Menu di una scelta da elenco (`select` in components.js). */
  'open-select': (ctx, el) => {
    const options = JSON.parse(el.dataset.options || '[]');
    const target = el.dataset.target;
    const params = { ...el.dataset };
    openMenu(el, options.map(([value, label]) => ({
      label, checked: value === el.dataset.selected,
      run: () => dispatch(target, { value, dataset: params }, null),
    })), { align: 'end' });
  },
  'lock-unlock': async () => {
    app.lockError = null;
    try {
      if (!(await Lock.unlockWithPasskey())) app.lockError = 'Sblocco non riuscito.';
    } catch (error) {
      app.lockError = error.name === 'NotAllowedError' ? null : error.message;
    }
    app.update();
  },
  'account-menu': (ctx, el) => openMenu(el, accountMenuItems(ctx), { align: 'start' }),
  'global-search': (ctx, el) => {
    const search = ctx.state('search', { query: '' });
    if (el.dataset.clear) {
      endSearch();
      return;
    }
    search.query = el.value;
    if (search.query && app.nav.current !== 'search') selectSection('search');
  },
  'global-search-focus': () => {
    // Selezionando il campo si apre la pagina di ricerca.
    if (app.nav.current !== 'search') selectSection('search');
  },
  'global-search-blur': () => {
    // Uscendo dal campo vuoto si torna alla sezione di prima.
    if (!(app.viewState.get('search')?.query) && app.nav.current === 'search') {
      setTimeout(() => {
        if (!document.activeElement?.matches?.('.global-search input')) endSearch();
      }, 150);
    }
  },
  'global-search-key': (ctx, el, event) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      el.blur();
      endSearch();
    }
  },
  'lock-pin-input': (ctx, el) => { app.pinInput = el.value; },
  'lock-pin': async (ctx, form) => {
    const ok = await Lock.unlockWithPin(app.pinInput);
    app.pinInput = '';
    app.lockError = ok ? null : 'Codice errato.';
    // Il campo ha il fuoco, quindi il morph non ne cambia il valore: va svuotato qui, o il
    // codice sbagliato resterebbe scritto (e quello che si aggiunge finirebbe in coda).
    const input = form?.querySelector?.('input');
    if (!ok && input) input.value = '';
    app.update();
  },
};

/** Menu dell'account attivo in fondo alla barra laterale. */
function accountMenuItems(ctx) {
  const items = [{ section: model.isCloud ? `Account BCW · ${model.cloudUser?.username ?? ''}` : 'Account' }];
  for (const account of model.accounts) {
    const active = !model.isDemo && account.id === model.activeAccountID;
    items.push({ label: account.name, checked: active, disabled: active, run: () => model.switchAccount(account.id) });
  }
  if (model.isDemo) items.push({ label: 'Demo', checked: true, disabled: true });
  items.push({ label: model.isCloud ? 'Abbina un account…' : 'Aggiungi account…', icon: 'userPlus', run: () => commonActions['add-account'](ctx) });
  if (!model.isDemo) items.push({ label: 'Prova la demo', icon: 'sparkles', run: () => model.startDemo() });
  items.push({ divider: true });
  items.push({ label: 'Gestisci account', icon: 'manageAccounts', run: () => { selectSection('you'); if (currentPath() !== 'account') navigate('account'); } });
  items.push({ label: 'Impostazioni', icon: 'gear', run: () => shellActions['open-settings']() });
  items.push({ divider: true });
  let signOutLabel = 'Esci da questo account…';
  if (model.isDemo) signOutLabel = 'Esci dalla demo…';
  else if (model.isCloud) signOutLabel = 'Esci da BCW…';
  items.push({ label: signOutLabel, icon: 'logout', run: () => commonActions['sign-out'](ctx) });
  return items;
}

const allActions = { ...shellActions, ...viewerActions(app), ...datePickerActions(app), ...commonActions, ...loginActions, ...onboardingActions };
for (const view of Object.values(routes)) Object.assign(allActions, view.actions ?? {});

function dispatch(name, el, event) {
  const handler = allActions[name];
  if (!handler) {
    console.warn('Azione sconosciuta:', name);
    return;
  }
  const result = handler(makeContext(), el, event);
  if (result instanceof Promise) result.catch((error) => showToast(error.message, 'alertTriangle')).finally(() => app.update());
  app.update();
}

let suppressClick = false;

root.addEventListener('click', (event) => {
  if (suppressClick) {
    suppressClick = false;
    event.preventDefault();
    return;
  }
  const el = event.target.closest('[data-action]');
  if (!el || !root.contains(el) || el.disabled) return;
  if (el.tagName === 'A' && el.getAttribute('href')) return;
  event.preventDefault();
  dispatch(el.dataset.action, el, event);
});

// `data-keep-focus`: toccarlo non toglie il fuoco al campo attivo (la tastiera resta aperta).
// `data-blank-blur`: un tocco nello spazio vuoto chiude la tastiera.
// Il tocco conta come vuoto solo se comincia e finisce nel vuoto: se il campo toccato si sposta
// sotto il dito (la disposizione compatta dell'accesso), il rilascio non chiude la tastiera.
const blankTarget = (target) => target.closest('[data-blank-blur]') && !target.closest('input, textarea, label, button, a, select');
let blankPointerDown = false;

root.addEventListener('pointerdown', (event) => {
  if (event.target.closest('[data-keep-focus]') && document.activeElement?.matches('input, textarea')) event.preventDefault();
  blankPointerDown = Boolean(blankTarget(event.target));
});

root.addEventListener('pointerup', (event) => {
  if (blankPointerDown && blankTarget(event.target)) document.activeElement?.blur?.();
  blankPointerDown = false;
});

// MARK: Tastiera dei telefoni nell'accesso

// Safari su iPhone (e Chrome su Android) non rimpicciolisce la pagina quando si apre la tastiera:
// la fa scorrere sotto la tastiera per mostrare il campo attivo. Qui lo scorrimento lo decide
// l'app: la pagina prende l'altezza dell'area visibile e la segue se il browser la sposta
// comunque; i campi prendono il fuoco senza scorrimento e, se l'accesso non ci sta (la
// registrazione), scorre solo il suo contenuto, quanto basta per mostrare il campo e "Accedi".
const visualViewport = window.visualViewport;

function fitKeyboard() {
  const style = document.documentElement.style;
  if (!visualViewport || !root.querySelector('.login.compact')) {
    style.removeProperty('--keyboard-viewport');
    style.removeProperty('--keyboard-top');
    return;
  }
  if (window.scrollY || visualViewport.offsetTop) window.scrollTo(0, 0);
  style.setProperty('--keyboard-viewport', `${Math.round(visualViewport.height)}px`);
  style.setProperty('--keyboard-top', `${Math.round(visualViewport.pageTop)}px`);
}

/** Scorre l'accesso quanto basta per mostrare il campo attivo e, se c'è spazio, anche il pulsante. */
function revealLoginField(input) {
  const screen = input?.closest('.login-screen');
  if (!screen || !screen.querySelector('.login.compact')) return;
  const area = screen.getBoundingClientRect();
  const top = area.top + 12;
  const bottom = Math.min(area.bottom, visualViewport ? visualViewport.offsetTop + visualViewport.height : area.bottom) - 12;
  const field = input.closest('.login-field').getBoundingClientRect();
  const submit = screen.querySelector('.login-submit')?.getBoundingClientRect();
  const target = submit && submit.bottom - field.top <= bottom - top ? submit.bottom : field.bottom;
  let delta = Math.max(0, target - bottom);
  if (field.top - delta < top) delta = field.top - top;
  if (Math.abs(delta) >= 1) screen.scrollBy({ top: delta, behavior: 'smooth' });
}

visualViewport?.addEventListener('resize', () => {
  fitKeyboard();
  if (document.activeElement?.matches('.login-field input')) requestAnimationFrame(() => revealLoginField(document.activeElement));
});
visualViewport?.addEventListener('scroll', fitKeyboard);

root.addEventListener('focusin', (event) => {
  if (event.target.matches?.('.login-field input')) requestAnimationFrame(() => revealLoginField(event.target));
});

// Tocco su un campo dell'accesso: il fuoco lo dà l'app, senza lo scorrimento del browser. Al
// primo tocco la disposizione compatta si applica prima, così il campo è già in alto.
let loginFieldTouch = null;

root.addEventListener('touchstart', (event) => {
  const field = event.target.closest('.login:not(.adding):not(.wide) .login-field');
  const input = field?.querySelector('input');
  loginFieldTouch = input && event.touches.length === 1 && input !== document.activeElement
    ? { input, x: event.touches[0].clientX, y: event.touches[0].clientY, time: Date.now() }
    : null;
}, { passive: true });

root.addEventListener('touchend', (event) => {
  const touch = loginFieldTouch;
  loginFieldTouch = null;
  const end = event.changedTouches[0];
  if (!touch?.input.isConnected || !end) return;
  // Scorrimenti e pressioni lunghe restano al browser.
  if (Math.hypot(end.clientX - touch.x, end.clientY - touch.y) > 10 || Date.now() - touch.time > 500) return;
  event.preventDefault();
  if (!root.querySelector('.login.compact')) {
    dispatch('login-focus', touch.input);
    render();
  }
  touch.input.focus({ preventScroll: true });
});

root.addEventListener('input', (event) => {
  const el = event.target.closest('[data-input]');
  if (el) dispatch(el.dataset.input, el, event);
});

root.addEventListener('change', (event) => {
  const el = event.target.closest('[data-change]');
  if (el) dispatch(el.dataset.change, el, event);
});

root.addEventListener('focusin', (event) => {
  const el = event.target.closest?.('[data-focus]');
  if (el) dispatch(el.dataset.focus, el, event);
});

root.addEventListener('focusout', (event) => {
  const el = event.target.closest?.('[data-blur]');
  if (el) dispatch(el.dataset.blur, el, event);
});

root.addEventListener('keydown', (event) => {
  const el = event.target.closest?.('[data-keydown]');
  if (el) dispatch(el.dataset.keydown, el, event);
});

root.addEventListener('submit', (event) => {
  const form = event.target.closest('[data-submit]');
  if (!form) return;
  event.preventDefault();
  dispatch(form.dataset.submit, form, event);
});

root.addEventListener('dblclick', (event) => {
  const el = event.target.closest('[data-dblclick]');
  if (el) dispatch(el.dataset.dblclick, el, event);
});

// Menu contestuale (tasto destro o pressione prolungata) sulle righe e sulla scheda Tu.
root.addEventListener('contextmenu', (event) => {
  const longpress = event.target.closest('[data-longpress]');
  if (longpress) {
    event.preventDefault();
    dispatch(longpress.dataset.longpress, longpress, event);
    return;
  }
  const el = event.target.closest('[data-context]');
  if (!el) return;
  event.preventDefault();
  dispatch(`context-${el.dataset.context}`, el, event);
});

let pressTimer = null;
root.addEventListener('touchstart', (event) => {
  const el = event.target.closest('[data-context], [data-longpress]');
  if (!el) return;
  const touch = event.touches[0];
  pressTimer = setTimeout(() => {
    pressTimer = null;
    navigator.vibrate?.(10);
    // La scheda Tu tenuta premuta apre gli account senza selezionarsi.
    suppressClick = true;
    setTimeout(() => { suppressClick = false; }, 700);
    if (el.dataset.longpress) dispatch(el.dataset.longpress, el, { clientX: touch.clientX, clientY: touch.clientY, longPress: true });
    else dispatch(`context-${el.dataset.context}`, el, { clientX: touch.clientX, clientY: touch.clientY, longPress: true });
  }, 550);
}, { passive: true });
for (const type of ['touchend', 'touchmove', 'touchcancel']) {
  root.addEventListener(type, () => { clearTimeout(pressTimer); pressTimer = null; }, { passive: true });
}

// MARK: - Gesti: settimane/mesi e giorni con lo scorrimento laterale

let swipe = null;
root.addEventListener('touchstart', (event) => {
  const el = event.target.closest('[data-swipe], [data-day-swipe]');
  if (!el || event.touches.length > 1) return;
  swipe = { el, x: event.touches[0].clientX, y: event.touches[0].clientY, dx: 0, decided: null, start: performance.now() };
}, { passive: true });

root.addEventListener('touchmove', (event) => {
  if (!swipe) return;
  const touch = event.touches[0];
  const dx = touch.clientX - swipe.x;
  const dy = touch.clientY - swipe.y;
  if (swipe.decided == null && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) {
    swipe.decided = Math.abs(dx) > Math.abs(dy) * 1.2 ? 'h' : 'v';
  }
  swipe.dx = dx;
  // Il giorno segue il dito (solo il contenuto dei giorni, non le settimane del calendario).
  if (swipe.decided === 'h' && swipe.el.dataset.daySwipe) {
    swipe.el.style.transform = `translateX(${dx}px)`;
    swipe.el.style.transition = 'none';
  }
}, { passive: true });

root.addEventListener('touchend', (event) => {
  if (!swipe) return;
  const { el, dx, decided, start } = swipe;
  swipe = null;
  const velocity = dx / Math.max(1, performance.now() - start) * 1000;
  const width = el.clientWidth || window.innerWidth;
  const passes = decided === 'h' && (el.dataset.daySwipe ? Math.abs(dx + 0.15 * velocity) > width * 0.3 : Math.abs(dx) >= 50);
  if (el.dataset.daySwipe) {
    // Se il giorno cambia, la pagina vecchia esce da dove l'ha lasciata il dito (vedi
    // `animateAxisExits`) e il contenitore torna subito al suo posto; altrimenti ci torna con la molla.
    el.style.transition = passes ? 'none' : '';
    el.style.transform = '';
    if (passes) {
      void el.offsetWidth;
      el.style.transition = '';
      swipeRelease = dx;
    }
  }
  if (!passes) return;
  navigator.vibrate?.(6);
  dispatch(el.dataset.daySwipe || el.dataset.swipe, { dataset: { delta: dx < 0 ? '1' : '-1' } }, event);
}, { passive: true });

// Tocco interrotto dal sistema: il giorno torna al suo posto con la molla, senza cambiare
// (prima restava spostato dove l'aveva lasciato il dito fino al tocco successivo).
root.addEventListener('touchcancel', () => {
  if (!swipe) return;
  const { el } = swipe;
  swipe = null;
  if (!el.dataset.daySwipe) return;
  el.style.transition = '';
  el.style.transform = '';
}, { passive: true });

// MARK: - Scorrimento: barra superiore e "trascina per aggiornare"

root.addEventListener('scroll', (event) => {
  const el = event.target;
  if (!(el instanceof Element) || !el.matches('[data-scroll]')) return;
  const page = el.closest('.page');
  if (!page) return;
  // Uno scorrimento fatto dall'app (es. l'Orario che va alla prima ora) non cambia la barra.
  if (quietScrollers.delete(el)) return;
  updateBarState(page, { canTint: true });
}, true);

/** Scorrimenti fatti dall'app: non colorano la barra superiore. */
const quietScrollers = new WeakSet();

function scrollQuietly(el, top) {
  if (Math.abs(el.scrollTop - top) < 1) return;
  quietScrollers.add(el);
  el.scrollTop = top;
}

/**
 * La barra superiore prende il colore del contenitore quando il contenuto scorre sotto.
 * Dopo ogni disegno (`canTint` falso) si toglie soltanto, se la vista è cambiata e il
 * contenuto non è più scorso; le aree con `data-bar-ignore` (es. la griglia dell'Orario,
 * che ha la sua intestazione) non contano.
 */
function updateBarState(page = root.querySelector('.page.active'), { canTint = false } = {}) {
  if (!page) return;
  const path = currentPath();
  const threshold = page.classList.contains('mobile') && !page.classList.contains('has-inline') ? 40 : 2;
  const scrolled = [...page.querySelectorAll('[data-scroll]:not([data-bar-ignore])')].some((el) => el.scrollTop > threshold);
  if (scrolled === app.scrolled.has(path) || (scrolled && !canTint)) return;
  if (scrolled) app.scrolled.add(path); else app.scrolled.delete(path);
  page.querySelector('.app-bar')?.classList.toggle('scrolled', scrolled);
}

let pull = null;
root.addEventListener('touchstart', (event) => {
  const scroller = event.target.closest('.page-scroll[data-refreshable="1"]');
  if (!scroller || scroller.scrollTop > 0) return;
  pull = { scroller, startY: event.touches[0].clientY, distance: 0 };
}, { passive: true });

root.addEventListener('touchmove', (event) => {
  if (!pull) return;
  pull.distance = Math.max(0, event.touches[0].clientY - pull.startY);
  const indicator = pull.scroller.querySelector('.ptr');
  if (indicator) {
    indicator.style.height = `${Math.min(76, pull.distance * 0.5)}px`;
    indicator.style.opacity = String(Math.min(1, pull.distance / 120));
    indicator.classList.toggle('pulling', pull.distance > 0);
  }
}, { passive: true });

root.addEventListener('touchend', async () => {
  if (!pull) return;
  const { scroller, distance } = pull;
  pull = null;
  const indicator = scroller.querySelector('.ptr');
  if (indicator) { indicator.style.height = ''; indicator.style.opacity = ''; indicator.classList.remove('pulling'); }
  if (distance < 120) return;
  const path = currentPath();
  const view = routes[parsePath(path).name];
  const page = view.render(makeContext());
  if (!page.refresh) return;
  app.refreshing.add(path);
  app.update();
  try { await page.refresh(); } finally {
    app.refreshing.delete(path);
    app.update();
  }
}, { passive: true });

installViewerGestures(root, app);

// MARK: - Tastiera

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    if (app.menu) app.menu = null;
    else if (app.datePicker) app.datePicker = null;
    else if (app.dialog) app.dialog = null;
    else if (app.viewer) app.viewer = null;
    else if (app.sheet) closeSheet();
    else if (app.railOpen) app.railOpen = false;
    else if (app.fabOpen) app.fabOpen = false;
    else if (app.searching) closeSearch();
    app.update();
    return;
  }
  if (!app.dialog && !app.menu && viewerKey(event, app)) {
    app.update();
    return;
  }
  if (model.phase !== 'signedIn' || Lock.isLocked || app.sheet || app.dialog || app.datePicker || app.onboarding) return;
  const typing = event.target.closest?.('input, textarea, select');
  if ((event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.code === 'KeyF') {
    // Ctrl+F (⌘F): mette il cursore nel campo di ricerca.
    event.preventDefault();
    if (app.wide) root.querySelector('.global-search input')?.focus();
    else openSearch();
    return;
  }
  const route = parsePath(currentPath()).name;
  if (event.key === 'Enter' && !typing && route === 'timetable' && app.viewState.get('timetable')?.editing) {
    event.preventDefault();
    dispatch('tt-done', document.body, event);
    return;
  }
  if (!event.altKey || event.metaKey || event.ctrlKey) return;
  const digit = event.code.startsWith('Digit') ? event.code.slice(5) : null;
  if (digit) {
    const match = Object.keys(sections).find((key) => sectionShortcut(key) === digit);
    if (match) {
      event.preventDefault();
      selectSection(app.wide ? match : stackKeyFor(match));
      if (!app.wide && !tabs.includes(match)) navigate(match);
    }
    return;
  }
  if (event.code === 'KeyR') {
    event.preventDefault();
    model.refreshAll();
    return;
  }
  if (typing) return;
  // Alt+Maiusc+T: domani nella Dashboard; Alt+T: il giorno predefinito e Alt+N: nuovo evento nell'Orario.
  let shortcut = null;
  if (route === 'dashboard' && event.code === 'KeyT' && event.shiftKey) shortcut = 'day-tomorrow';
  if (route === 'timetable' && event.code === 'KeyT' && !event.shiftKey) shortcut = 'tt-jump';
  if (route === 'timetable' && event.code === 'KeyN' && !event.shiftKey) shortcut = 'tt-new';
  if (shortcut) {
    event.preventDefault();
    dispatch(shortcut, document.body, event);
  }
});

// MARK: - Avvio

let resizeFrame = null;
window.addEventListener('resize', () => {
  cancelAnimationFrame(resizeFrame);
  resizeFrame = requestAnimationFrame(() => {
    const wasWide = app.wide;
    app.width = window.innerWidth;
    if (wasWide !== app.wide) {
      // Cambiando disposizione, le schede del telefono e le sezioni dello schermo largo non coincidono.
      resetNavigation(currentPath());
      app.railOpen = false;
    }
    app.update();
    drawCharts(root);
  });
});

matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => app.update());

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    hiddenAt = Date.now();
    // Le modifiche in attesa per l'account BCW partono subito.
    if (model.isCloud) model.sync.flush();
    return;
  }
  // Tornando su BCW si prendono le modifiche fatte sugli altri dispositivi.
  if (model.isCloud) model.refreshCloud();
  if (model.preferences.get('useLock') && model.phase === 'signedIn' && hiddenAt && Date.now() - hiddenAt > 30_000) {
    Lock.lock();
    app.update();
  }
});
let hiddenAt = null;

async function start() {
  await Promise.all([Lock.detect(), Proxy.init(), BCWServer.init()]);
  const initial = location.hash ? parsePath(location.hash).path : null;
  let saved = null;
  try { saved = localStorage.getItem('bcw.section'); } catch { /* ignorato */ }
  // L'app riapre l'ultima sezione visitata (su schermi larghi) o parte dalla Dashboard.
  resetNavigation(initial ?? (app.wide && saved && sections[saved] ? saved : 'dashboard'));
  syncHash(true);
  model.bootstrap();
  // Prima apertura: l'introduzione, in bianco e nero finché non si sceglie un colore (il bianco e
  // nero l'ha già messo `js/theme-boot.js`, prima del primo disegno).
  if (isFirstRun()) app.onboarding = newOnboarding();
  else document.documentElement.removeAttribute('data-mono');
  if (model.preferences.get('useLock') && model.phase === 'signedIn') Lock.lock();
  Reminders.start();
  render();
  // La lezione in corso e la linea dell'ora nell'Orario seguono l'orologio.
  setInterval(() => {
    if (model.phase === 'signedIn' && document.visibilityState === 'visible' && !app.sheet) app.update();
  }, 30_000);
  if (Lock.isLocked && Lock.method === 'passkey') shellActions['lock-unlock']();
}

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => { /* l'app funziona anche senza */ });
}

start();

export { app, model, accountInitials, accountColorID, subjectColor };
