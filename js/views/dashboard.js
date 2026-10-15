// Dashboard: compiti, verifiche ed eventi del giorno scelto (di default domani), con la
// settimana o il mese, le presenze e, per i giorni passati, le lezioni in una sezione separata.
// Sui telefoni il calendario galleggia sopra i giorni e si riduce a una striscia scorrendo;
// scorrendo di lato si passa al giorno prima o dopo.

import {
  card, collapsible, chevron, agendaEventRow, absenceRow, lessonRow, loadingCard, statusBanner, eyebrow,
  sectionHeader, iconButton, divider, joinRows,
} from '../components.js';
import { icon } from '../icons.js';
import { shape } from '../shapes.js';
import {
  addDays, addMonths, daysBetween, esc, fmt, isSameDay, isToday, isTomorrow, isWeekend, startOfDay,
  startOfMonth, startOfWeek, groupBy, dayKey,
} from '../util.js';
import { DashboardMode } from '../prefs.js';

const weekdaySymbols = ['L', 'M', 'M', 'G', 'V', 'S', 'D'];

function dashState(ctx) {
  return ctx.state('dashboard', () => {
    const selected = addDays(startOfDay(new Date()), 1);
    return { selected, month: startOfMonth(selected), dir: 0, collapsedDays: new Set() };
  });
}

/**
 * Cambia il giorno scelto. Insieme può cambiare anche l'identità di "Nei prossimi giorni",
 * così la sezione vecchia esce e quella nuova entra con il giorno: su schermi stretti sempre,
 * su quelli larghi solo se la sezione è espansa e il suo contenuto cambia davvero.
 */
function select(ctx, day) {
  const s = dashState(ctx);
  const target = startOfDay(day);
  if (target.getTime() === s.selected.getTime()) return;
  navigator.vibrate?.(4);
  const replacesUpcoming = !ctx.wide ||
    (!ctx.prefs.isCollapsed('upcoming') && upcomingKey(ctx, s.selected) !== upcomingKey(ctx, target));
  if (replacesUpcoming) s.upcomingGeneration = (s.upcomingGeneration ?? 0) + 1;
  s.dir = Math.sign(target - s.selected);
  // La direzione dell'animazione cambia solo quando cambia la settimana o il mese.
  if (startOfWeek(target).getTime() !== startOfWeek(s.selected).getTime()) s.weekDir = s.dir;
  if (startOfMonth(target).getTime() !== s.month.getTime()) s.monthDir = Math.sign(startOfMonth(target) - s.month);
  s.selected = target;
  s.month = startOfMonth(target);
}

// MARK: - Titolo

let measureCanvas = null;
export function textWidth(text, font) {
  measureCanvas ??= document.createElement('canvas');
  const c = measureCanvas.getContext('2d');
  c.font = font;
  return c.measureText(text).width;
}

const fontFamily = () => getComputedStyle(document.documentElement).getPropertyValue('--font') || 'sans-serif';

/** "Giovedì 1 ottobre" oppure, se non entra (o se l'utente lo preferisce), "Gio 1 ott". */
function title(ctx, day) {
  const full = fmt.relativeDayName(day);
  const short = fmt.relativeShortDayName(day);
  switch (ctx.prefs.get('titleAbbreviation')) {
    case 'never': return full;
    case 'always': return short;
    default: {
      // Sugli schermi larghi il titolo non si abbrevia mai in automatico (come sul Mac).
      if (ctx.wide) return full;
      let reserved = 16 + 48 + 8;
      if (!isTomorrow(day)) reserved += textWidth('Domani', `600 14px ${fontFamily()}`) + 24 + 8;
      return textWidth(full, `500 22px ${fontFamily()}`) <= ctx.mainWidth - reserved ? full : short;
    }
  }
}

// MARK: - Pagina

export const dashboard = {
  title: 'Dashboard',

  render(ctx) {
    const s = dashState(ctx);
    const day = s.selected;
    const mode = ctx.prefs.dashboardMode;
    const model = ctx.model;
    const banner = model.lastError ? statusBanner(model.lastError, model.isOffline ? 'wifiOff' : 'alertTriangle') : '';
    const detail = `<div class="day-transition dir-${s.dir}" data-key="day-${dayKey(day)}">${dayDetail(ctx, day)}</div>`;
    const showUpcoming = ctx.prefs.showUpcomingDays;
    // Cambia identità (e quindi si anima) solo quando lo decide `select`.
    const upcoming = showUpcoming ? `<div class="day-transition dir-${s.dir}" data-key="up-${s.upcomingGeneration ?? 0}">${upcomingDays(ctx, day)}</div>` : '';
    const menu = { icon: DashboardMode[mode].icon, label: 'Vista e filtri', action: 'dashboard-menu' };
    const actions = [];
    if (!isTomorrow(day)) actions.push({ text: 'Domani', action: 'day-tomorrow', help: 'Vai a domani (Alt+Maiusc+T)' });
    actions.push(menu);

    if (ctx.wide) {
      // Come sul Mac: il giorno scelto è il titolo; a destra "Domani" e il menu della vista.
      const calendar = mode === 'calendar' ? monthCalendar(ctx, s) : weekStrip(ctx, s);
      return {
        title: title(ctx, day),
        actions,
        split: ctx.splitWide
          ? { sideWidth: 360, side: calendar + upcoming, main: banner + detail }
          : { side: calendar, main: banner + detail + upcoming },
        refresh: () => model.refreshAll(),
      };
    }

    const header = mode === 'calendar' ? monthCalendar(ctx, s, { floating: true }) : weekStrip(ctx, s, { floating: true });
    return {
      title: title(ctx, day),
      actions,
      floating: header.floating,
      body: `${banner ? `<div class="banner-slot">${banner}</div>` : ''}<div class="day-swipe" data-day-swipe="day-shift"><div class="stack gap-16">${detail}${mode === 'list' ? upcoming : ''}</div></div>`,
      refresh: () => model.refreshAll(),
    };
  },

  /** Nuovo tocco sulla scheda: in cima (con il calendario intero), poi a domani. */
  reselect(ctx) {
    const scroller = ctx.pageScroller();
    if (scroller && scroller.scrollTop > 2) {
      scroller.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    select(ctx, addDays(new Date(), 1));
  },

  actions: {
    'day-prev': (ctx) => select(ctx, addDays(dashState(ctx).selected, -1)),
    'day-next': (ctx) => select(ctx, addDays(dashState(ctx).selected, 1)),
    'day-shift': (ctx, el) => select(ctx, addDays(dashState(ctx).selected, Number(el.dataset.delta))),
    'day-today': (ctx) => select(ctx, new Date()),
    'day-tomorrow': (ctx) => select(ctx, addDays(new Date(), 1)),
    'day-select': (ctx, el) => select(ctx, new Date(Number(el.dataset.time))),
    'week-shift': (ctx, el) => select(ctx, addDays(dashState(ctx).selected, 7 * Number(el.dataset.delta))),
    'month-shift': (ctx, el) => {
      const s = dashState(ctx);
      s.month = addMonths(s.month, Number(el.dataset.delta));
      s.monthDir = Number(el.dataset.delta);
    },
    'dashboard-menu': (ctx, el) => {
      const prefs = ctx.prefs;
      const mode = prefs.dashboardMode;
      const items = [{ section: 'Vista' }];
      for (const [key, value] of Object.entries(DashboardMode)) {
        items.push({ label: value.title, icon: value.icon, checked: mode === key, run: () => {
          prefs.set('dashboardMode', key);
          ctx.pageScroller()?.scrollTo({ top: 0 });
        } });
      }
      items.push({ divider: true });
      items.push({ label: 'Vai a oggi', icon: 'sun', run: () => { select(ctx, new Date()); ctx.update(); } });
      items.push({ label: 'Nascondi compiti fatti', icon: 'checkCircle', checked: prefs.hideCompletedHomework,
        run: () => prefs.set('hideCompletedHomework', !prefs.hideCompletedHomework) });
      if (mode === 'list' || ctx.wide) {
        items.push({ label: 'Mostra i prossimi giorni', icon: 'timeline', checked: prefs.showUpcomingDays,
          run: () => prefs.set('showUpcomingDays', !prefs.showUpcomingDays) });
      }
      ctx.openMenu(el, items);
    },
    'toggle-section': (ctx, el) => ctx.prefs.toggleCollapsed(el.dataset.section),
    'upcoming-day-toggle': (ctx, el) => {
      const s = dashState(ctx);
      const time = Number(el.dataset.time);
      navigator.vibrate?.(4);
      if (s.collapsedDays.has(time)) s.collapsedDays.delete(time); else s.collapsedDays.add(time);
    },
  },
};

// MARK: - Settimana

function dots(ctx, day, selected) {
  const events = ctx.model.events(day);
  const result = [];
  if (events.some((e) => e.kind === 'homework')) result.push('var(--neutral)');
  if (events.some((e) => e.kind === 'test')) result.push(selected ? 'var(--on-primary)' : 'var(--primary)');
  if (events.some((e) => e.kind === 'event')) result.push('var(--fair)');
  if (ctx.model.absencesOn(day).length) result.push('var(--poor)');
  return result.map((c) => `<i style="background:${c}"></i>`).join('');
}

function dayNumberClass(ctx, day, selected) {
  const cls = [];
  if (selected) cls.push('selected');
  if (isToday(day)) cls.push('today');
  if (isWeekend(day) || ctx.model.calendarStatus(day)?.isHoliday) cls.push('muted');
  return cls.join(' ');
}

export const WEEK_FULL = 140;
export const STRIP = 56;

/**
 * Striscia della settimana. Con `floating` la card galleggia sopra il contenuto e si riduce
 * a una striscia di numeri scorrendo (l'avanzamento arriva da `--p`).
 */
export function weekStrip(ctx, s, { action = 'day-select', shiftAction = 'week-shift', floating = false, extra = '', dotsFor = dots } = {}) {
  const week = startOfWeek(s.selected);
  const cells = [0, 1, 2, 3, 4, 5, 6].map((offset) => {
    const day = addDays(week, offset);
    const selected = isSameDay(day, s.selected);
    return `<button class="day-cell ${dayNumberClass(ctx, day, selected)}" data-action="${action}" data-time="${day.getTime()}" aria-label="${esc(fmt.longDay(day))}" aria-pressed="${selected}">
      <span class="sel-bg"></span><span class="wd">${fmt.weekdayNarrow(day)}</span>
      <span class="num numeral">${day.getDate()}</span>
      <span class="dots">${dotsFor(ctx, day, selected)}</span></button>`;
  }).join('');
  const html = `<div class="cal-card week ${floating ? 'floating' : ''}" data-swipe="${shiftAction}">
    <div class="cal-head"><h3>${esc(fmt.monthYear(s.selected))}</h3><div class="cal-nav">
      ${iconButton('chevronLeft', { action: shiftAction, params: { delta: -1 }, label: 'Settimana precedente', cls: 'small' })}
      ${iconButton('chevronRight', { action: shiftAction, params: { delta: 1 }, label: 'Settimana successiva', cls: 'small' })}</div></div>
    <div class="week-strip"><div class="week-row slide-${s.weekDir ?? 0}" data-key="w-${dayKey(week)}">${cells}</div></div></div>`;
  if (floating) return { floating: { html: html + extra, full: WEEK_FULL, collapsed: STRIP, cls: 'week' } };
  return html;
}

// MARK: - Mese

/** Settimane del mese, da lunedì a domenica (con i giorni dei mesi accanto). */
function monthRows(month) {
  const first = startOfMonth(month);
  const rows = [];
  for (let week = startOfWeek(first); rows.length < 6; week = addDays(week, 7)) {
    if (rows.length && week.getMonth() !== month.getMonth()) break;
    rows.push([0, 1, 2, 3, 4, 5, 6].map((i) => addDays(week, i)));
  }
  return rows;
}

export function monthCalendar(ctx, s, { action = 'day-select', shiftAction = 'month-shift', legend = true, floating = false, extra = '', dotsFor = dots } = {}) {
  const month = s.month;
  const rows = monthRows(month);
  const selectedRow = Math.max(0, rows.findIndex((row) => row.some((d) => isSameDay(d, s.selected) && d.getMonth() === month.getMonth())));
  const html = `<div class="cal-card month ${floating ? 'floating' : ''}" style="--rows:${rows.length};--sel-row:${selectedRow}">
    <div class="cal-head"><h3>${esc(fmt.monthYear(month))}</h3><div class="cal-nav">
      ${iconButton('chevronLeft', { action: shiftAction, params: { delta: -1 }, label: 'Mese precedente', cls: 'small' })}
      ${iconButton('chevronRight', { action: shiftAction, params: { delta: 1 }, label: 'Mese successivo', cls: 'small' })}</div></div>
    <div class="weekday-row">${weekdaySymbols.map((w) => `<span>${w}</span>`).join('')}</div>
    <div class="month-grid" data-swipe="${shiftAction}"><div class="month-page slide-${Math.sign(s.monthDir ?? 0)}" data-key="m-${dayKey(month)}">
      ${rows.map((row, index) => `<div class="month-row ${index === selectedRow ? 'sel-row' : ''}">${row.map((day) => {
    const outside = day.getMonth() !== month.getMonth();
    const selected = !outside && isSameDay(day, s.selected);
    const holiday = !outside && ctx.model.calendarStatus(day)?.isHoliday;
    return `<button class="month-cell ${outside ? 'outside' : ''} ${dayNumberClass(ctx, day, selected)} ${holiday && !selected ? 'holiday' : ''}" data-action="${action}" data-time="${day.getTime()}" aria-label="${esc(fmt.longDay(day))}" aria-pressed="${selected}"${outside ? ' tabindex="-1"' : ''}>
        <span class="num numeral">${day.getDate()}</span><span class="dots">${outside ? '' : dotsFor(ctx, day, selected)}</span></button>`;
  }).join('')}</div>`).join('')}
    </div></div>
    ${legend ? `<div class="legend">${[['var(--neutral)', 'Compiti'], ['var(--primary)', 'Verifiche'], ['var(--fair)', 'Eventi'], ['var(--poor)', 'Assenze']]
    .map(([c, t]) => `<span><i style="background:${c}"></i>${t}</span>`).join('')}</div>` : ''}</div>`;
  if (floating) {
    const full = 12 + 44 + 20 + rows.length * 44 + (rows.length - 1) * 2 + 8 + (legend ? 24 : 0) + 12;
    return { floating: { html: html + extra, full, collapsed: STRIP, cls: 'month' } };
  }
  return html;
}

// MARK: - Giorno

function collapsibleCard(ctx, section, title, iconName, content, trailing = '') {
  const collapsed = ctx.prefs.isCollapsed(section);
  return card(`<button class="collapsible-header" data-action="toggle-section" data-section="${section}" aria-expanded="${!collapsed}">
      <span class="label">${icon(iconName)}${esc(title)}</span><span class="flex"></span>
      ${trailing ? `<span class="trailing">${esc(trailing)}</span>` : ''}${chevron(collapsed)}</button>
    ${collapsible(!collapsed, `<div class="rows">${content}</div>`, { spacing: 14 })}`, { cls: 'day-card' });
}

export function dayDetail(ctx, day) {
  const model = ctx.model;
  const prefs = ctx.prefs;
  const events = model.events(day).filter((e) => !(prefs.hideCompletedHomework && prefs.isCompleted(e)));
  const homework = events.filter((e) => e.kind === 'homework');
  const testsAndEvents = events.filter((e) => e.kind !== 'homework')
    .sort((a, b) => ((a.kind === 'test' ? 0 : 1) - (b.kind === 'test' ? 0 : 1)) || (a.begin - b.begin));
  const absences = model.absencesOn(day);
  const lessons = model.lessons(day);
  const isPastOrToday = startOfDay(day) <= startOfDay(new Date());
  const hasAgenda = homework.length || testsAndEvents.length || absences.length;
  const loaded = model.hasLoadedLessons(day);

  if (isPastOrToday) {
    // Anche dopo ogni aggiornamento completo, che azzera le lezioni già scaricate.
    const week = startOfWeek(day);
    ctx.task(`lessons-${dayKey(week)}-${model.lastUpdated?.getTime() ?? 0}`, () => model.ensureLessons(week, addDays(week, 6)));
  }

  const agendaRow = (e) => agendaEventRow(e, { done: prefs.isCompleted(e), expanded: ctx.app.viewState.get('expanded')?.has(`${e.id}`) });
  let agenda = '';
  if (testsAndEvents.length) {
    agenda += collapsibleCard(ctx, 'testsAndEvents', 'Verifiche ed eventi', 'test', joinRows(testsAndEvents, agendaRow));
  }
  if (homework.length) {
    const done = homework.filter((e) => prefs.isCompleted(e)).length;
    agenda += collapsibleCard(ctx, 'homework', 'Compiti', 'book', joinRows(homework, agendaRow), `${done}/${homework.length}`);
  }
  if (absences.length) {
    agenda += collapsibleCard(ctx, 'attendance', 'Presenze', 'userClock', joinRows(absences, (a) => absenceRow(a)));
  }

  let lessonsSection = '';
  if (lessons.length) {
    const hours = lessons.reduce((s, l) => s + Math.trunc(l.duration), 0);
    lessonsSection = collapsibleCard(ctx, 'lessons', 'Lezioni', 'bookText', joinRows(lessons, lessonRow), `${hours} ore`);
  } else if (!loaded && !isWeekend(day)) {
    lessonsSection = loadingCard('Carico le lezioni…');
  }

  const weekend = isWeekend(day);
  const empty = card(`<div class="empty-day"><span class="empty-day-art shaped">${shape(weekend ? 'sunny' : 'cookie9Sided')}${icon(weekend ? 'sun' : 'checkSeal')}</span>
    <div><h3>${weekend ? 'Goditi il weekend' : 'Niente in programma'}</h3>
    <p>Nessun compito, verifica o evento per questo giorno.</p></div></div>`, { cls: 'empty-card' });
  const noLessons = card(`<div class="no-lessons">${icon('bookText')}<span>Nessuna lezione registrata</span></div>`);

  const tests = events.filter((e) => e.kind === 'test').length;
  const parts = [];
  if (tests) parts.push(tests === 1 ? '1 verifica' : `${tests} verifiche`);
  if (homework.length) parts.push(homework.length === 1 ? '1 compito' : `${homework.length} compiti`);
  let status = parts.join(' · ');
  if (!status) {
    if (model.calendarStatus(day)?.isHoliday) status = 'Giorno di vacanza';
    else if (weekend) status = 'Fine settimana';
  }
  const header = `<div class="day-header"><h2>${esc(fmt.longDay(day))}</h2>${status ? `<p>${esc(status)}</p>` : ''}</div>`;

  // Su schermi larghi, se c'è spazio, le lezioni vanno in una colonna a parte.
  const columnWidth = ctx.splitWide ? ctx.mainWidth - 360 - 40 - 44 : ctx.mainWidth - 56;
  const splitsLessons = ctx.wide && isPastOrToday && columnWidth >= 580 && !(weekend && !lessons.length);
  if (splitsLessons) {
    return `<div class="stack gap-16">${header}<div class="two-columns">
      <div class="stack gap-12">${hasAgenda ? '' : empty}${agenda}</div>
      <div class="stack gap-12">${lessonsSection}${!lessons.length && loaded ? noLessons : ''}</div></div></div>`;
  }
  const showEmpty = !hasAgenda && (!lessons.length || !isPastOrToday);
  return `<div class="stack gap-12">${header}${showEmpty ? empty : ''}${agenda}${isPastOrToday ? lessonsSection : ''}</div>`;
}

// MARK: - Giorni successivi

/** Giorni con compiti o eventi nelle tre settimane dopo `after`. */
function upcomingList(ctx, after) {
  const prefs = ctx.prefs;
  const start = addDays(after, 1);
  const end = addDays(after, 21);
  const upcoming = ctx.model.agenda.filter((e) => e.begin >= start && e.begin < end)
    .filter((e) => !(prefs.hideCompletedHomework && prefs.isCompleted(e)));
  return [...groupBy(upcoming, (e) => e.day.getTime()).entries()].sort(([a], [b]) => a - b);
}

function upcomingKey(ctx, after) {
  return upcomingList(ctx, after).map(([time, events]) => `${time}:${events.map((e) => e.id).join(',')}`).join('|');
}

/**
 * "Nei prossimi giorni": una card comprimibile per giorno. Il titolo comprime il giorno;
 * toccando il resto della card (o una riga con il testo intero) si va a quel giorno.
 */
function upcomingDays(ctx, after) {
  const prefs = ctx.prefs;
  const s = dashState(ctx);
  const days = upcomingList(ctx, after);
  if (!days.length) return '';
  const collapsed = prefs.isCollapsed('upcoming');
  const expanded = ctx.app.viewState.get('expanded');
  const list = days.map(([time, events]) => {
    const day = new Date(time);
    const closed = s.collapsedDays.has(time);
    const sorted = [...events].sort((a, b) => (a.kind === 'test' ? 0 : 1) - (b.kind === 'test' ? 0 : 1));
    const count = events.length === 1 ? '1 elemento' : `${events.length} elementi`;
    return `<div class="card upcoming-card" data-action="day-select" data-time="${time}" data-key="upd-${time}" title="Vai a ${esc(fmt.relativeDayName(day))}">
      <button class="upcoming-head" data-action="upcoming-day-toggle" data-time="${time}" aria-expanded="${!closed}" aria-label="${closed ? 'Mostra gli elementi' : 'Nasconde gli elementi'}">
        ${eyebrow(fmt.relativeDayName(day), 'var(--primary)')}<span class="flex"></span>
        <span class="upcoming-count ${closed ? 'shown' : ''}">${count}</span>${chevron(closed)}</button>
      ${collapsible(!closed, `<div class="rows">${joinRows(sorted, (e) => agendaEventRow(e, {
    done: prefs.isCompleted(e), scope: 'up', expanded: expanded?.has(`up${e.id}`), plainTap: time,
  }))}</div>`, { spacing: 12 })}</div>`;
  }).join('');
  return `<div class="upcoming"><button class="section-toggle" data-action="toggle-section" data-section="upcoming" aria-expanded="${!collapsed}">
    ${sectionHeader('Nei prossimi giorni', { trailing: chevron(collapsed) })}</button>
    ${collapsible(!collapsed, `<div class="stack gap-12">${list}</div>`, { spacing: 12 })}</div>`;
}

export { daysBetween, divider, select as selectDashboardDay };
