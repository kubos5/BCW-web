// Dashboard: compiti, verifiche ed eventi del giorno scelto (di default domani), con la
// striscia della settimana o il calendario del mese, le presenze e, per i giorni passati,
// le lezioni in una sezione separata.

import {
  card, collapsible, chevron, agendaEventRow, absenceRow, lessonRow, loadingCard, statusBanner, eyebrow,
  sectionHeader, circleButton, divider, joinRows,
} from '../components.js';
import { icon } from '../icons.js';
import {
  addDays, addMonths, daysBetween, esc, fmt, isSameDay, isToday, isTomorrow, isWeekend, startOfDay,
  startOfMonth, startOfWeek, groupBy, dayKey,
} from '../util.js';
import { DashboardMode } from '../prefs.js';

const weekdaySymbols = ['L', 'M', 'M', 'G', 'V', 'S', 'D'];

function dashState(ctx) {
  return ctx.state('dashboard', () => {
    const selected = addDays(startOfDay(new Date()), 1);
    return { selected, month: startOfMonth(selected), dir: 0 };
  });
}

function select(ctx, day) {
  const s = dashState(ctx);
  const target = startOfDay(day);
  s.dir = Math.sign(target - s.selected);
  // La direzione dell'animazione cambia solo quando cambia la settimana o il mese.
  if (startOfWeek(target).getTime() !== startOfWeek(s.selected).getTime()) s.weekDir = s.dir;
  if (startOfMonth(target).getTime() !== s.month.getTime()) s.monthDir = Math.sign(startOfMonth(target) - s.month);
  s.selected = target;
  s.month = startOfMonth(target);
}

// MARK: - Titolo

let measureCanvas = null;
function textWidth(text, font) {
  measureCanvas ??= document.createElement('canvas');
  const c = measureCanvas.getContext('2d');
  c.font = font;
  return c.measureText(text).width;
}

/** "Giovedì 1 ottobre" oppure, se non entra (o se l'utente lo preferisce), "Gio 1 ott". */
function title(ctx, day) {
  const full = fmt.relativeDayName(day);
  const short = fmt.relativeShortDayName(day);
  switch (ctx.prefs.get('titleAbbreviation')) {
    case 'never': return full;
    case 'always': return short;
    default: {
      if (ctx.wide) return full;
      const family = getComputedStyle(document.documentElement).getPropertyValue('--serif') || 'serif';
      let reserved = 16 + 16 + 44 + 16;
      if (!isTomorrow(day)) reserved += textWidth('Domani', `400 17px ${family}`) + 32 + 12;
      return textWidth(full, `700 34px ${family}`) <= ctx.mainWidth - reserved ? full : short;
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
    const calendar = mode === 'calendar' ? monthCalendar(ctx, s) : weekStrip(ctx, s);
    const detail = `<div class="day-transition dir-${s.dir}" data-key="day-${dayKey(day)}">${dayDetail(ctx, day)}</div>`;
    const showUpcoming = ctx.prefs.showUpcomingDays;
    const upcoming = showUpcoming ? `<div class="day-transition dir-${s.dir}" data-key="up-${dayKey(day)}">${upcomingDays(ctx, day)}</div>` : '';
    const menu = { icon: DashboardMode[mode].icon, label: 'Opzioni della Dashboard', action: 'dashboard-menu' };
    const subtitle = fmt.relativeDayName(day) === fmt.longDay(day) ? null : fmt.longDay(day);

    if (ctx.wide) {
      return {
        title: fmt.relativeDayName(day),
        subtitle,
        navActions: [
          { icon: 'chevronLeft', label: 'Giorno precedente', help: 'Giorno precedente (Alt+←)', action: 'day-prev' },
          { icon: 'chevronRight', label: 'Giorno successivo', help: 'Giorno successivo (Alt+→)', action: 'day-next' },
          { text: 'Oggi', action: 'day-today', disabled: isToday(day), help: 'Vai a oggi (Alt+T)' },
          { text: 'Domani', action: 'day-tomorrow', disabled: isTomorrow(day), help: 'Vai a domani (Alt+Maiusc+T)' },
        ],
        actions: [menu],
        split: ctx.splitWide
          ? { sideWidth: 340, side: calendar + upcoming, main: banner + detail }
          : { side: calendar, main: banner + detail + upcoming },
        refresh: () => model.refreshAll(),
      };
    }

    const actions = [];
    if (!isTomorrow(day)) actions.push({ text: 'Domani', action: 'day-tomorrow' });
    actions.push(menu);
    return {
      title: title(ctx, day),
      actions,
      body: `<div class="stack gap-22">${banner}${calendar}${detail}${mode === 'list' ? upcoming : ''}</div>`,
      refresh: () => model.refreshAll(),
    };
  },

  actions: {
    'day-prev': (ctx) => select(ctx, addDays(dashState(ctx).selected, -1)),
    'day-next': (ctx) => select(ctx, addDays(dashState(ctx).selected, 1)),
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
        items.push({ label: value.title, icon: value.icon, checked: mode === key, run: () => prefs.set('dashboardMode', key) });
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
  },
};

// MARK: - Striscia settimanale

function dots(ctx, day, selected) {
  const events = ctx.model.events(day);
  const result = [];
  if (events.some((e) => e.kind === 'homework')) result.push('var(--neutral)');
  if (events.some((e) => e.kind === 'test')) result.push(selected ? '#fff' : 'var(--accent)');
  if (events.some((e) => e.kind === 'event')) result.push('var(--fair)');
  if (ctx.model.absencesOn(day).length) result.push('var(--poor)');
  return result.map((c) => `<i style="background:${c}"></i>`).join('');
}

function dayNumberClass(ctx, day, selected) {
  if (selected) return 'selected';
  if (isToday(day)) return 'today';
  if (isWeekend(day) || ctx.model.calendarStatus(day)?.isHoliday) return 'muted';
  return '';
}

function weekStrip(ctx, s) {
  const week = startOfWeek(s.selected);
  const cells = [0, 1, 2, 3, 4, 5, 6].map((offset) => {
    const day = addDays(week, offset);
    const selected = isSameDay(day, s.selected);
    return `<button class="day-cell ${dayNumberClass(ctx, day, selected)}" data-action="day-select" data-time="${day.getTime()}" aria-label="${esc(fmt.longDay(day))}" aria-pressed="${selected}">
      <span class="wd">${fmt.weekdayNarrow(day)}</span>
      <span class="num numeral">${day.getDate()}</span>
      <span class="dots">${dots(ctx, day, selected)}</span></button>`;
  }).join('');
  return card(`<div class="cal-head"><h3>${esc(fmt.monthYear(s.selected))}</h3><div class="cal-nav">
      ${circleButton('chevronLeft', { action: 'week-shift', params: { delta: -1 }, label: 'Settimana precedente', cls: 'small' })}
      ${circleButton('chevronRight', { action: 'week-shift', params: { delta: 1 }, label: 'Settimana successiva', cls: 'small' })}</div></div>
    <div class="week-strip" data-swipe="week-shift"><div class="week-row slide-${s.weekDir ?? 0}" data-key="w-${dayKey(week)}">${cells}</div></div>`,
  { padding: 0, cls: 'calendar-card' });
}

// MARK: - Calendario mensile

/** Settimane del mese, da lunedì a domenica (`null` = giorno di un altro mese). */
function monthRows(month) {
  const first = startOfMonth(month);
  const days = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const offset = (first.getDay() + 6) % 7;
  const cells = Array(offset).fill(null);
  for (let d = 1; d <= days; d++) cells.push(new Date(first.getFullYear(), first.getMonth(), d));
  while (cells.length % 7) cells.push(null);
  const rows = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
  return rows;
}

export function monthCalendar(ctx, s, { action = 'day-select', shiftAction = 'month-shift', legend = true } = {}) {
  const month = s.month;
  const rows = monthRows(month).map((row) => `<div class="month-row">${row.map((day) => {
    if (!day) return '<span class="month-cell empty"></span>';
    const selected = isSameDay(day, s.selected);
    const holiday = ctx.model.calendarStatus(day)?.isHoliday;
    return `<button class="month-cell ${dayNumberClass(ctx, day, selected)} ${holiday && !selected ? 'holiday' : ''}" data-action="${action}" data-time="${day.getTime()}" aria-label="${esc(fmt.longDay(day))}" aria-pressed="${selected}">
      <span class="num numeral">${day.getDate()}</span><span class="dots">${dots(ctx, day, selected)}</span></button>`;
  }).join('')}</div>`).join('');
  const legendHTML = legend ? `<div class="legend">${[['var(--neutral)', 'Compiti'], ['var(--accent)', 'Verifiche'], ['var(--fair)', 'Eventi'], ['var(--poor)', 'Assenze']]
    .map(([c, t]) => `<span><i style="background:${c}"></i>${t}</span>`).join('')}</div>` : '';
  return card(`<div class="cal-head"><h3>${esc(fmt.monthYear(month))}</h3><div class="cal-nav">
      ${circleButton('chevronLeft', { action: shiftAction, params: { delta: -1 }, label: 'Mese precedente', cls: 'small' })}
      ${circleButton('chevronRight', { action: shiftAction, params: { delta: 1 }, label: 'Mese successivo', cls: 'small' })}</div></div>
    <div class="weekday-row">${weekdaySymbols.map((w) => `<span>${w}</span>`).join('')}</div>
    <div class="month-grid" data-swipe="${shiftAction}"><div class="month-page slide-${Math.sign(s.monthDir ?? 0)}" data-key="m-${dayKey(month)}">${rows}</div></div>
    ${legendHTML}`, { padding: 0, cls: 'calendar-card' });
}

// MARK: - Giorno

function collapsibleCard(ctx, section, title, iconName, content, trailing = '') {
  const collapsed = ctx.prefs.isCollapsed(section);
  return card(`<button class="collapsible-header" data-action="toggle-section" data-section="${section}" aria-expanded="${!collapsed}">
      <span class="label">${icon(iconName)}${esc(title)}</span><span class="flex"></span>
      ${trailing ? `<span class="trailing numeral-mono">${esc(trailing)}</span>` : ''}${chevron(collapsed)}</button>
    ${collapsible(!collapsed, `<div class="rows">${content}</div>`, { spacing: 14 })}`);
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
    agenda += collapsibleCard(ctx, 'testsAndEvents', 'Verifiche ed eventi', 'clipboardPen', joinRows(testsAndEvents, agendaRow));
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

  const empty = card(`<div class="empty-day">${icon(isWeekend(day) ? 'sun' : 'checkSeal')}
    <h3>${isWeekend(day) ? 'Goditi il weekend' : 'Niente in programma'}</h3>
    <p>Nessun compito, verifica o evento per questo giorno.</p></div>`);
  const noLessons = card(`<div class="no-lessons">${icon('bookText')}<span>Nessuna lezione registrata</span></div>`);

  const tests = events.filter((e) => e.kind === 'test').length;
  const parts = [];
  if (tests) parts.push(tests === 1 ? '1 verifica' : `${tests} verifiche`);
  if (homework.length) parts.push(homework.length === 1 ? '1 compito' : `${homework.length} compiti`);
  let status = parts.join(' · ');
  if (!status) {
    if (model.calendarStatus(day)?.isHoliday) status = 'Giorno di vacanza';
    else if (isWeekend(day)) status = 'Fine settimana';
  }
  const header = `<div class="day-header"><h2>${esc(fmt.longDay(day))}</h2>${status ? `<p>${esc(status)}</p>` : ''}</div>`;

  // Su schermi larghi, se c'è spazio, le lezioni vanno in una colonna a parte.
  const columnWidth = ctx.splitWide ? ctx.mainWidth - 340 - 38 - 38 : ctx.mainWidth - 56;
  const splitsLessons = ctx.wide && isPastOrToday && columnWidth >= 580 && !(isWeekend(day) && !lessons.length);
  if (splitsLessons) {
    return `<div class="stack gap-18">${header}<div class="two-columns">
      <div class="stack gap-18">${hasAgenda ? '' : empty}${agenda}</div>
      <div class="stack gap-18">${lessonsSection}${!lessons.length && loaded ? noLessons : ''}</div></div></div>`;
  }
  const showEmpty = !hasAgenda && (!lessons.length || !isPastOrToday);
  return `<div class="stack gap-18">${header}${showEmpty ? empty : ''}${agenda}${isPastOrToday ? lessonsSection : ''}</div>`;
}

// MARK: - Giorni successivi

function upcomingDays(ctx, after) {
  const prefs = ctx.prefs;
  const start = addDays(after, 1);
  const end = addDays(after, 21);
  const upcoming = ctx.model.agenda.filter((e) => e.begin >= start && e.begin < end)
    .filter((e) => !(prefs.hideCompletedHomework && prefs.isCompleted(e)));
  if (!upcoming.length) return '';
  const days = [...groupBy(upcoming, (e) => e.day.getTime()).entries()].sort(([a], [b]) => a - b);
  const collapsed = prefs.isCollapsed('upcoming');
  const list = days.map(([time, events]) => {
    const day = new Date(time);
    const sorted = [...events].sort((a, b) => (a.kind === 'test' ? 0 : 1) - (b.kind === 'test' ? 0 : 1));
    return card(`<button class="upcoming-head" data-action="day-select" data-time="${time}">${eyebrow(fmt.relativeDayName(day), 'var(--accent)')}${icon('chevronRight')}</button>
      <div class="rows">${joinRows(sorted, (e) => agendaEventRow(e, { done: prefs.isCompleted(e), scope: 'up', expanded: ctx.app.viewState.get('expanded')?.has(`up${e.id}`) }))}</div>`,
    { attrs: ` data-key="upd-${time}"` });
  }).join('');
  return `<div class="upcoming"><button class="section-toggle" data-action="toggle-section" data-section="upcoming" aria-expanded="${!collapsed}">
    ${sectionHeader('Nei prossimi giorni', { trailing: chevron(collapsed) })}</button>
    ${collapsible(!collapsed, `<div class="stack gap-12">${list}</div>`, { spacing: 12 })}</div>`;
}

export { daysBetween, divider };
