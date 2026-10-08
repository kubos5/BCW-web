// Shell dell'app: navigazione (schede in stile iOS su schermi stretti, barra laterale in
// stile macOS su schermi larghi), barre degli strumenti, menu, fogli, dialoghi e scorciatoie.

import { AppModel, accountColorID, accountInitials } from './store.js';
import { morph, data } from './dom.js';
import { icon } from './icons.js';
import { drawCharts } from './charts.js';
import { Lock } from './lock.js';
import { Reminders } from './reminders.js';
import { Proxy } from './api.js';
import { esc } from './util.js';
import { avatar, spinner, subjectColor } from './components.js';
import { routes, sections, sectionGroups, commonActions, sectionBadge } from './views/index.js';
import { renderLogin, loginActions } from './views/login.js';

// MARK: - Stato

const model = new AppModel(() => app.update());

const app = {
  model,
  /** Stato locale delle viste (filtri, sezioni aperte…), azzerato a ogni cambio di sessione. */
  viewState: new Map(),
  tasks: new Set(),
  sessionID: null,
  sheet: null,
  dialog: null,
  menu: null,
  viewer: null,
  toast: null,
  width: window.innerWidth,
  nav: { stacks: {}, current: null },
  scroll: new Map(),
  scrolled: new Set(),
  refreshing: new Set(),
  sidebarOpen: false,
  scheduled: false,
  lockError: null,
  pinInput: '',

  get wide() { return this.width >= 900; },
  /** Larghezza dell'area principale (senza la barra laterale). */
  get mainWidth() { return this.wide ? this.width - 260 : this.width; },
  /** Colonne affiancate solo se c'è spazio (come `SplitColumns` su macOS). */
  get splitWide() { return this.wide && this.mainWidth >= 780; },

  update() {
    if (this.scheduled) return;
    this.scheduled = true;
    requestAnimationFrame(() => {
      this.scheduled = false;
      render();
    });
  },
};

window.bcw = app;

// MARK: - Navigazione

const tabs = ['dashboard', 'grades', 'you', 'search'];

function parsePath(path) {
  const parts = path.replace(/^#?\/?/, '').split('/').filter(Boolean);
  const name = parts[0] && routes[parts[0]] ? parts[0] : 'dashboard';
  return { name, param: parts[1] ?? null, path: [name, parts[1]].filter(Boolean).join('/') };
}

/** Scheda (iOS) o sezione (barra laterale) a cui appartiene un percorso. */
function stackKeyFor(path) {
  const { name } = parsePath(path);
  if (app.wide) {
    if (name === 'settings' || name === 'account') return 'you';
    return name;
  }
  if (name === 'dashboard' || name === 'search') return name;
  if (name === 'grades') return 'grades';
  return 'you';
}

function rootOf(key) { return key; }

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

function restoreScroll() {
  const page = document.querySelector('.page.active');
  if (!page || restoredPages.has(page)) return;
  restoredPages.add(page);
  for (const el of page.querySelectorAll('[data-scroll]')) {
    el.scrollTop = app.scroll.get(`${currentPath()}|${el.dataset.scroll}`) ?? 0;
  }
}

export function navigate(path) {
  saveScroll();
  const key = app.nav.current;
  const stack = app.nav.stacks[key] ?? [rootOf(key)];
  stack.push(path);
  app.nav.stacks[key] = stack;
  app.menu = null;
  syncHash();
  app.update();
}

export function selectSection(key) {
  saveScroll();
  app.menu = null;
  app.sidebarOpen = false;
  if (app.wide && key !== 'search') {
    // Come su Mac: scegliere una sezione chiude la ricerca generale.
    const search = app.viewState.get('search');
    if (search) search.query = '';
    app.nav.lastSection = key;
  }
  if (app.nav.current === key) {
    // Toccando di nuovo la scheda attiva si torna alla sua pagina principale.
    app.nav.stacks[key] = [rootOf(key)];
  }
  app.nav.current = key;
  app.nav.stacks[key] ??= [rootOf(key)];
  try { localStorage.setItem('bcw.section', key); } catch { /* ignorato */ }
  syncHash();
  app.update();
}

export function back() {
  const stack = app.nav.stacks[app.nav.current];
  if (!stack || stack.length < 2) return;
  saveScroll();
  stack.pop();
  syncHash(true);
  app.update();
}

function resetNavigation(path) {
  const key = stackKeyFor(path);
  const root = rootOf(key);
  app.nav.current = key;
  app.nav.stacks = { [key]: path === root ? [root] : [root, path] };
}

window.addEventListener('popstate', () => {
  const path = parsePath(location.hash).path;
  const stack = app.nav.stacks[app.nav.current];
  const index = stack?.lastIndexOf(path) ?? -1;
  if (index >= 0) stack.length = index + 1;
  else resetNavigation(path);
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
    splitWide: app.splitWide,
    mainWidth: app.mainWidth,
    route,
    depth: app.nav.stacks[app.nav.current]?.length ?? 1,
    /** Stato locale di una vista, creato alla prima richiesta. */
    state(key, init) {
      if (!app.viewState.has(key)) app.viewState.set(key, typeof init === 'function' ? init() : { ...init });
      return app.viewState.get(key);
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
    closeSheet,
    confirm,
    openFile,
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
  app.menu = { rect, items, align };
  app.update();
}

export function openSheet(sheet) {
  app.sheet = sheet;
  app.menu = null;
  app.update();
}

export function closeSheet() {
  app.sheet = null;
  app.update();
}

export function confirm({ title, message, confirmLabel = 'OK', destructive = false, cancelLabel = 'Annulla', onConfirm }) {
  app.dialog = { title, message, confirmLabel, destructive, cancelLabel, onConfirm };
  app.menu = null;
  app.update();
}

/** Anteprima di un file scaricato (come Quick Look). */
export function openFile(file) {
  app.viewer = file;
  app.update();
}

let toastTimer = null;
export function showToast(message, iconName = 'checkCircle') {
  app.toast = { message, iconName, id: Date.now() };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { app.toast = null; app.update(); }, 3200);
  app.update();
}

// MARK: - Rendering

const root = document.getElementById('app');

function render() {
  applyTheme();
  if (app.sessionID !== model.sessionID) {
    app.sessionID = model.sessionID;
    app.viewState.clear();
    app.tasks.clear();
  }
  let html;
  if (model.phase === 'launching') html = '<div class="launch"></div>';
  else if (model.phase === 'signedOut') html = renderSignedOut();
  else html = renderSignedIn();
  html += renderOverlays();
  morph(root, html);
  restoreScroll();
  drawCharts(root);
  positionMenu();
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
    page = { title: 'Errore', body: `<div class="empty-state">${icon('alertTriangle')}<h3>Qualcosa è andato storto</h3><p>${esc(error.message)}</p></div>` };
  }
  const content = app.wide ? renderDesktop(ctx, page) : renderMobile(ctx, page);
  return content + (Lock.isLocked ? renderLock() : '');
}

// MARK: Barra degli strumenti

function toolbarButton(item, { mobile }) {
  if (item.spacer) return '<span class="toolbar-gap"></span>';
  const attrs = data({ action: item.action, ...(item.params ?? {}) });
  const disabled = item.disabled ? ' disabled' : '';
  if (item.text) {
    return `<button class="btn btn-glass toolbar-text"${attrs}${disabled} title="${esc(item.help ?? item.text)}">${esc(item.text)}</button>`;
  }
  if (item.html) return item.html;
  const cls = `${mobile ? 'btn-circle glass' : 'tool-btn'} ${item.cls ?? ''}`;
  return `<button class="${cls}"${attrs}${disabled} aria-label="${esc(item.label)}" title="${esc(item.help ?? item.label)}">${icon(item.icon)}</button>`;
}

/** Campo della ricerca generale, sempre visibile nella barra su schermi larghi (come su Mac). */
function globalSearchField() {
  const query = app.viewState.get('search')?.query ?? '';
  return `<label class="search-field global-search" title="Cerca (⌘F / Ctrl+F)">${icon('search')}<input type="search" value="${esc(query)}" placeholder="Compiti, voti, comunicazioni…" data-input="global-search" data-focus="global-search-focus" data-blur="global-search-blur" data-keydown="global-search-key" autocomplete="off" enterkeyhint="search" aria-label="Cerca">${query ? `<button class="search-clear" data-action="global-search" data-clear="1" aria-label="Cancella">${icon('xCircle')}</button>` : ''}</label>`;
}

/** Torna dalla ricerca generale all'ultima sezione aperta. */
function endSearch() {
  const search = app.viewState.get('search');
  if (search) search.query = '';
  if (app.nav.current === 'search') selectSection(app.nav.lastSection ?? 'dashboard');
}

function searchField(search) {
  return `<label class="search-field">${icon('search')}<input type="search" value="${esc(search.value)}" placeholder="${esc(search.placeholder)}" data-input="${search.input}" autocomplete="off" enterkeyhint="search">${search.value ? `<button class="search-clear" data-action="${search.input}" data-clear="1" aria-label="Cancella">${icon('xCircle')}</button>` : ''}</label>`;
}

function parentTitle() {
  const stack = app.nav.stacks[app.nav.current];
  if (!stack || stack.length < 2) return '';
  const parent = parsePath(stack[stack.length - 2]);
  return routes[parent.name]?.title ?? '';
}

// MARK: Layout iOS

function renderMobile(ctx, page) {
  const path = currentPath();
  const depth = ctx.depth;
  const scrolled = app.scrolled.has(path);
  const inline = !!page.inline;
  const leading = depth > 1
    ? `<button class="back-btn glass" data-action="nav-back" aria-label="Indietro">${icon('chevronLeft')}<span>${esc(parentTitle())}</span></button>` : '';
  const actions = (page.actions ?? []).map((a) => toolbarButton(a, { mobile: true })).join('');
  const bar = `<header class="nav-bar ${scrolled || inline ? 'scrolled' : ''} ${inline ? 'inline' : ''}">
    <div class="nav-leading">${leading}</div>
    <div class="nav-title">${esc(page.title)}</div>
    <div class="nav-actions">${actions}</div></header>`;
  const large = inline ? '' : `<h1 class="large-title">${esc(page.title)}</h1>`;
  const search = page.search ? searchField(page.search) : '';
  const refreshing = app.refreshing.has(path);
  let body;
  if (page.split) body = `<div class="stack">${page.split.side}${page.split.main}</div>`;
  else body = page.body ?? '';
  const pageHTML = `<section class="page active mobile ${inline ? 'has-inline' : ''}" data-key="page-${esc(path)}" data-path="${esc(path)}">
    ${bar}
    <div class="page-scroll" data-scroll="main" data-refreshable="${page.refresh ? '1' : ''}">
      <div class="ptr ${refreshing ? 'active' : ''}">${spinner()}</div>
      ${large}${search}
      <div class="page-body ${page.bottomInset ? 'bottom-inset' : ''}">${body}</div>
    </div></section>`;
  return `<div class="shell mobile">${pageHTML}${renderTabBar()}</div>`;
}

function renderTabBar() {
  const current = app.nav.current;
  const badge = model.unreadNoticesCount;
  const tab = (key, label, iconName, badgeCount = 0) => `<button class="tab ${current === key ? 'selected' : ''}" data-action="select-section" data-key-name="${key}" aria-label="${label}">
    <span class="tab-icon">${icon(iconName)}${badgeCount ? `<span class="tab-badge">${badgeCount}</span>` : ''}</span><span class="tab-label">${label}</span></button>`;
  return `<nav class="tab-bar" aria-label="Schede">
    <div class="tab-group glass">${tab('dashboard', 'Dashboard', 'timeline')}${tab('grades', 'Voti', 'chart')}${tab('you', 'Tu', 'userCircle', badge)}</div>
    <button class="tab-search glass ${current === 'search' ? 'selected' : ''}" data-action="select-section" data-key-name="search" aria-label="Cerca">${icon('search')}</button>
  </nav>`;
}

// MARK: Layout macOS

function renderDesktop(ctx, page) {
  const path = currentPath();
  const depth = ctx.depth;
  const back = depth > 1 ? `<button class="tool-btn" data-action="nav-back" aria-label="Indietro" title="Indietro">${icon('chevronLeft')}</button>` : '';
  const nav = (page.navActions ?? []).map((a) => toolbarButton(a, { mobile: false })).join('');
  const navStyle = page.navWidth ? ` style="width:${page.navWidth}px"` : '';
  const actions = (page.actions ?? []).map((a) => toolbarButton(a, { mobile: false })).join('');
  const refresh = `<button class="tool-btn" data-action="refresh-all" ${model.isRefreshing ? 'disabled' : ''} aria-label="Aggiorna" title="Aggiorna i dati da Classeviva (Alt+R)">${model.isRefreshing ? spinner() : icon('refresh')}</button>`;
  const toolbar = `<header class="toolbar">
    <button class="tool-btn sidebar-toggle" data-action="toggle-sidebar" aria-label="Barra laterale">${icon('sidebar')}</button>
    ${back}
    ${page.hideTitle ? '' : `<div class="toolbar-title"><h1>${esc(page.title)}</h1>${page.subtitle ? `<p>${esc(page.subtitle)}</p>` : ''}</div>`}
    <div class="toolbar-nav ${page.navWidth ? 'aligned' : ''}"${navStyle}>${nav}</div>
    <span class="flex"></span>
    <div class="toolbar-actions">${actions}${refresh}</div></header>`;

  let content;
  if (page.full) {
    content = page.full;
  } else if (page.split && app.splitWide) {
    content = `<div class="split" style="--side:${page.split.sideWidth ?? 340}px">
      <div class="split-side" data-scroll="side"><div class="column">${page.split.side}</div></div>
      <div class="split-main" data-scroll="main"><div class="column">${page.split.main}</div></div></div>`;
  } else {
    const body = page.split ? `${page.split.side}${page.split.main}` : page.body;
    content = `<div class="page-scroll" data-scroll="main"><div class="page-body ${page.narrow ? 'narrow' : ''}">${body}</div></div>`;
  }
  return `<div class="shell desktop ${app.sidebarOpen ? 'sidebar-open' : ''}">
    ${renderSidebar()}
    <section class="page active desktop" data-key="page-${esc(path)}" data-path="${esc(path)}">${toolbar}<div class="page-content">${content}</div></section>
    <div class="global-search-slot" data-key="global-search">${globalSearchField()}</div>
  </div>`;
}

function renderSidebar() {
  const current = app.nav.current;
  const groups = sectionGroups.map((group) => {
    const rows = group.sections.map((key) => {
      const s = sections[key];
      const badge = sectionBadge(model, key);
      return `<button class="side-row ${current === key ? 'selected' : ''}" data-action="select-section" data-key-name="${key}" style="--tint:${s.tint}" title="${s.shortcut ? `${s.title} (Alt+${s.shortcut})` : s.title}">
        ${icon(s.icon)}<span>${esc(s.title)}</span>${badge ? `<span class="side-badge">${badge}</span>` : ''}</button>`;
    }).join('');
    return `<div class="side-group">${group.title ? `<h2>${esc(group.title)}</h2>` : ''}${rows}</div>`;
  }).join('');
  const subtitle = model.isDemo ? 'Modalità demo'
    : (model.classDescription ? model.classDescription.charAt(0) + model.classDescription.slice(1).toLowerCase() : (model.card?.schoolDescription ?? 'Classeviva'));
  return `<aside class="sidebar">
    <div class="sidebar-brand"><span class="brand">BCW</span><span class="brand-line"></span></div>
    <nav class="sidebar-scroll" data-scroll="sidebar">${groups}</nav>
    <button class="account-menu glass" data-action="account-menu" title="Cambia account">
      ${avatar(model.initials, { size: 32 })}
      <span class="grow"><strong>${esc(model.displayName)}</strong><small>${esc(subtitle)}</small></span>
      ${icon('chevronUpDown')}</button>
  </aside><div class="sidebar-scrim" data-action="toggle-sidebar"></div>`;
}

// MARK: Sovrapposizioni

function renderOverlays() {
  let html = '';
  if (app.sheet) {
    const ctx = makeContext();
    const sheet = app.sheet.render(ctx);
    const leading = sheet.leading ?? `<button class="btn btn-glass" data-action="sheet-close">Annulla</button>`;
    html += `<div class="sheet-layer" data-key="sheet-${esc(app.sheet.id)}">
      <div class="scrim" data-action="sheet-close"></div>
      <div class="sheet ${sheet.size ?? ''}" role="dialog" aria-modal="true" aria-label="${esc(sheet.title ?? '')}">
        <header class="sheet-bar"><div>${leading}</div><h2>${esc(sheet.title ?? '')}</h2><div>${sheet.trailing ?? ''}</div></header>
        <div class="sheet-body" data-scroll="sheet">${sheet.body}</div>
      </div></div>`;
  }
  if (app.viewer) {
    const f = app.viewer;
    const preview = f.type.startsWith('image/')
      ? `<img src="${f.url}" alt="${esc(f.name)}">`
      : (f.type.includes('pdf') || f.type.startsWith('text/'))
        ? `<iframe src="${f.url}" title="${esc(f.name)}"></iframe>`
        : `<div class="empty-state">${icon('file')}<h3>${esc(f.name)}</h3><p>L'anteprima non è disponibile per questo tipo di file.</p></div>`;
    html += `<div class="sheet-layer viewer-layer" data-key="viewer">
      <div class="scrim" data-action="viewer-close"></div>
      <div class="sheet viewer large" role="dialog" aria-modal="true" aria-label="${esc(f.name)}">
        <header class="sheet-bar"><div><button class="btn btn-glass" data-action="viewer-close">Fine</button></div><h2>${esc(f.name)}</h2>
        <div><a class="btn btn-glass" href="${f.url}" download="${esc(f.name)}">${icon('download')}<span>Scarica</span></a></div></header>
        <div class="viewer-body">${preview}</div></div></div>`;
  }
  if (app.dialog) {
    const d = app.dialog;
    html += `<div class="dialog-layer" data-key="dialog"><div class="scrim" data-action="dialog-cancel"></div>
      <div class="dialog" role="alertdialog" aria-modal="true"><h2>${esc(d.title)}</h2>${d.message ? `<p>${esc(d.message)}</p>` : ''}
      <div class="dialog-actions"><button class="btn btn-glass" data-action="dialog-cancel">${esc(d.cancelLabel)}</button>
      <button class="btn ${d.destructive ? 'btn-destructive' : 'btn-prominent'}" data-action="dialog-confirm">${esc(d.confirmLabel)}</button></div></div></div>`;
  }
  if (app.menu) {
    const items = app.menu.items.map((item, index) => {
      if (item.divider) return '<hr>';
      if (item.section) return `<h3>${esc(item.section)}</h3>`;
      return `<button class="menu-item ${item.destructive ? 'destructive' : ''}" data-action="menu-run" data-index="${index}"${item.disabled ? ' disabled' : ''}>
        <span class="menu-check">${item.checked ? icon('check') : ''}</span>
        <span class="grow"><span>${esc(item.label)}</span>${item.subtitle ? `<small>${esc(item.subtitle)}</small>` : ''}</span>
        ${item.icon ? icon(item.icon) : ''}</button>`;
    }).join('');
    html += `<div class="menu-layer" data-key="menu"><div class="menu-scrim" data-action="menu-close"></div><div class="menu glass" role="menu">${items}</div></div>`;
  }
  if (app.toast) {
    html += `<div class="toast glass" data-key="toast-${app.toast.id}" role="status">${icon(app.toast.iconName)}<span>${esc(app.toast.message)}</span></div>`;
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
  let top = rect.bottom + 6;
  if (top + height > window.innerHeight - 8) top = Math.max(8, rect.top - height - 6);
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
}

function renderLock() {
  const method = Lock.method;
  const unlock = method === 'pin'
    ? `<form class="pin-form" data-submit="lock-pin"><input type="password" inputmode="numeric" autocomplete="off" placeholder="Codice" data-input="lock-pin-input" value="${esc(app.pinInput)}" aria-label="Codice di sblocco" autofocus>
       <button class="btn btn-prominent large" type="submit">${icon('lockOpen')}<span>Sblocca</span></button></form>`
    : `<button class="btn btn-prominent large" data-action="lock-unlock">${icon('faceId')}<span>Sblocca con ${esc(Lock.name)}</span></button>`;
  return `<div class="lock-screen" data-key="lock">
    <div class="lock-center">${icon('lock')}<h2>BCW è bloccata</h2>${app.lockError ? `<p class="error">${esc(app.lockError)}</p>` : ''}</div>
    <div class="lock-actions">${unlock}</div></div>`;
}

function applyTheme() {
  const mode = model.preferences.get('appearance');
  const html = document.documentElement;
  if (mode === 'system') html.removeAttribute('data-theme');
  else if (html.getAttribute('data-theme') !== mode) html.setAttribute('data-theme', mode);
  const dark = mode === 'dark' || (mode === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  const color = dark ? '#1E1D1C' : '#F7F2E8';
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta && meta.content !== color) meta.content = color;
}

// MARK: - Azioni

const shellActions = {
  'select-section': (ctx, el) => selectSection(el.dataset.keyName),
  'nav-back': () => back(),
  'navigate': (ctx, el) => navigate(el.dataset.to),
  'toggle-sidebar': () => { app.sidebarOpen = !app.sidebarOpen; app.update(); },
  'refresh-all': () => model.refreshAll(),
  'sheet-close': () => closeSheet(),
  'viewer-close': () => { app.viewer = null; app.update(); },
  'dialog-cancel': () => { app.dialog = null; app.update(); },
  'dialog-confirm': () => {
    const d = app.dialog;
    app.dialog = null;
    app.update();
    d?.onConfirm?.();
  },
  'menu-close': () => { app.menu = null; app.update(); },
  'menu-run': (ctx, el) => {
    const item = app.menu?.items[Number(el.dataset.index)];
    app.menu = null;
    app.update();
    item?.run?.();
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
  'lock-pin': async () => {
    const ok = await Lock.unlockWithPin(app.pinInput);
    app.pinInput = '';
    app.lockError = ok ? null : 'Codice errato.';
    app.update();
  },
};

/** Menu dell'account attivo in fondo alla barra laterale. */
function accountMenuItems(ctx) {
  const items = [{ section: 'Account' }];
  for (const account of model.accounts) {
    const active = !model.isDemo && account.id === model.activeAccountID;
    items.push({ label: account.name, checked: active, disabled: active, run: () => model.switchAccount(account.id) });
  }
  if (model.isDemo) items.push({ label: 'Demo', checked: true, disabled: true });
  items.push({ label: 'Aggiungi account…', icon: 'userPlus', run: () => commonActions['add-account'](ctx) });
  items.push({ divider: true });
  items.push({ label: 'Il tuo profilo', icon: 'userCircle', run: () => selectSection('you') });
  items.push({ label: 'Impostazioni…', icon: 'gear', run: () => { selectSection('you'); navigate('settings'); } });
  items.push({ divider: true });
  items.push({ label: model.isDemo ? 'Esci dalla demo…' : 'Esci da questo account…', icon: 'logout', run: () => commonActions['sign-out'](ctx) });
  return items;
}

const allActions = { ...shellActions, ...commonActions, ...loginActions };
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

root.addEventListener('click', (event) => {
  const el = event.target.closest('[data-action]');
  if (!el || !root.contains(el) || el.disabled) return;
  if (el.tagName === 'A' && el.getAttribute('href')) return;
  event.preventDefault();
  dispatch(el.dataset.action, el, event);
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

// Menu contestuale (tasto destro o pressione prolungata) sulle righe dell'agenda.
root.addEventListener('contextmenu', (event) => {
  const el = event.target.closest('[data-context]');
  if (!el) return;
  event.preventDefault();
  dispatch(`context-${el.dataset.context}`, el, event);
});

let pressTimer = null;
root.addEventListener('touchstart', (event) => {
  const el = event.target.closest('[data-context]');
  if (!el) return;
  const touch = event.touches[0];
  pressTimer = setTimeout(() => {
    pressTimer = null;
    navigator.vibrate?.(10);
    dispatch(`context-${el.dataset.context}`, el, { clientX: touch.clientX, clientY: touch.clientY, longPress: true });
  }, 550);
}, { passive: true });
for (const type of ['touchend', 'touchmove', 'touchcancel']) {
  root.addEventListener(type, () => { clearTimeout(pressTimer); pressTimer = null; }, { passive: true });
}

// Scorrimento orizzontale tra settimane e mesi (come le pagine di `ScrollView` su iOS).
let swipe = null;
root.addEventListener('touchstart', (event) => {
  const el = event.target.closest('[data-swipe]');
  if (!el) return;
  swipe = { el, x: event.touches[0].clientX, y: event.touches[0].clientY };
}, { passive: true });

root.addEventListener('touchend', (event) => {
  if (!swipe) return;
  const { el, x, y } = swipe;
  swipe = null;
  const touch = event.changedTouches[0];
  const dx = touch.clientX - x;
  const dy = touch.clientY - y;
  if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
  dispatch(el.dataset.swipe, { dataset: { delta: dx < 0 ? '1' : '-1' } }, event);
}, { passive: true });

// MARK: - Scorrimento: titolo compatto e "trascina per aggiornare"

root.addEventListener('scroll', (event) => {
  const el = event.target;
  if (!(el instanceof Element) || !el.matches('.page.mobile .page-scroll')) return;
  const path = currentPath();
  const scrolled = el.scrollTop > 38;
  if (scrolled !== app.scrolled.has(path)) {
    if (scrolled) app.scrolled.add(path); else app.scrolled.delete(path);
    el.closest('.page')?.querySelector('.nav-bar')?.classList.toggle('scrolled', scrolled);
  }
}, true);

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
    indicator.style.height = `${Math.min(70, pull.distance * 0.5)}px`;
    indicator.style.opacity = String(Math.min(1, pull.distance / 120));
  }
}, { passive: true });

root.addEventListener('touchend', async () => {
  if (!pull) return;
  const { scroller, distance } = pull;
  pull = null;
  const indicator = scroller.querySelector('.ptr');
  if (indicator) { indicator.style.height = ''; indicator.style.opacity = ''; }
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

// MARK: - Tastiera

const shortcutSections = Object.entries(sections).filter(([, s]) => s.shortcut);

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    if (app.menu) app.menu = null;
    else if (app.dialog) app.dialog = null;
    else if (app.viewer) app.viewer = null;
    else if (app.sheet) app.sheet = null;
    else if (app.sidebarOpen) app.sidebarOpen = false;
    app.update();
    return;
  }
  if (model.phase !== 'signedIn' || Lock.isLocked || app.sheet || app.dialog) return;
  const typing = event.target.closest?.('input, textarea, select');
  if ((event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.code === 'KeyF') {
    // Come il comando Cerca del Mac (⌘F): mette il cursore nel campo di ricerca.
    event.preventDefault();
    if (app.wide) {
      root.querySelector('.global-search input')?.focus();
    } else {
      selectSection('search');
      requestAnimationFrame(() => root.querySelector('.search-field input')?.focus());
    }
    return;
  }
  if (!event.altKey || event.metaKey || event.ctrlKey) return;
  const digit = event.code.startsWith('Digit') ? event.code.slice(5) : null;
  if (digit) {
    const match = shortcutSections.find(([, s]) => s.shortcut === digit);
    if (match) {
      event.preventDefault();
      selectSection(app.wide ? match[0] : stackKeyFor(match[0]));
      if (!app.wide && !tabs.includes(match[0])) navigate(match[0]);
    }
    return;
  }
  if (event.code === 'KeyR') {
    event.preventDefault();
    model.refreshAll();
    return;
  }
  if (typing) return;
  const shortcut = { ArrowLeft: 'day-prev', ArrowRight: 'day-next', KeyT: event.shiftKey ? 'day-tomorrow' : 'day-today' }[event.code];
  if (shortcut && parsePath(currentPath()).name === 'dashboard') {
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
      // Cambiando disposizione, le schede di iOS e le sezioni del Mac non coincidono.
      resetNavigation(currentPath());
      if (!app.wide) app.sidebarOpen = false;
    }
    app.update();
    drawCharts(root);
  });
});

matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => app.update());

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    hiddenAt = Date.now();
  } else if (model.preferences.get('useLock') && model.phase === 'signedIn' && hiddenAt && Date.now() - hiddenAt > 30_000) {
    Lock.lock();
    app.update();
  }
});
let hiddenAt = null;

async function start() {
  await Promise.all([Lock.detect(), Proxy.init()]);
  const initial = location.hash ? parsePath(location.hash).path : null;
  let saved = null;
  try { saved = localStorage.getItem('bcw.section'); } catch { /* ignorato */ }
  // L'app riapre l'ultima sezione visitata (su Mac) o parte dalla Dashboard.
  resetNavigation(initial ?? (app.wide && saved && sections[saved] ? saved : 'dashboard'));
  syncHash(true);
  model.bootstrap();
  if (model.preferences.get('useLock') && model.phase === 'signedIn') Lock.lock();
  Reminders.start();
  render();
  if (Lock.isLocked && Lock.method === 'passkey') shellActions['lock-unlock']();
}

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => { /* l'app funziona anche senza */ });
}

start();

export { app, model, accountInitials, accountColorID, subjectColor };
