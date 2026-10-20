// Dashboard: compiti, verifiche ed eventi del giorno scelto (di default domani), con la
// settimana o il mese, le presenze e, per i giorni passati, le lezioni in una sezione separata.
// In alto la barra di ricerca (sui telefoni) e la settimana come gruppo di pulsanti; sotto il
// giorno in grande con i chip di stato e le sezioni segmentate. Scorrendo di lato si passa al
// giorno prima o dopo, con la transizione ad asse condiviso.

import {
  agendaEventRow, absenceRow, lessonRow, loadingCard, statusBanner, sectionHeader, collapsible, chevron,
  segmentedSection, segCell, statusChip, dateBadge, axisPage, dayHero,
} from '../components.js';
import { calendarBar } from '../calendar-bar.js';
import { icon } from '../icons.js';
import { shape } from '../shapes.js';
import {
  addDays, addMonths, esc, fmt, isToday, isTomorrow, isWeekend, startOfDay, startOfMonth, startOfWeek, groupBy, dayKey,
} from '../util.js';
import { DashboardMode } from '../prefs.js';
import { AbsenceKind } from '../models.js';

function dashState(ctx) {
  return ctx.state('dashboard', () => {
    const selected = addDays(startOfDay(new Date()), 1);
    return { selected, dir: 0, weekDir: 0, monthDir: 0, collapsedDays: new Set() };
  });
}

/** Cambia il giorno scelto, nel verso giusto per la transizione. */
function select(ctx, day) {
  const s = dashState(ctx);
  const target = startOfDay(day);
  if (target.getTime() === s.selected.getTime()) return;
  navigator.vibrate?.(4);
  s.dir = Math.sign(target - s.selected);
  // La settimana (o il mese) scorre solo quando cambia.
  if (startOfWeek(target).getTime() !== startOfWeek(s.selected).getTime()) s.weekDir = s.dir;
  if (startOfMonth(target).getTime() !== startOfMonth(s.selected).getTime()) s.monthDir = s.dir;
  s.selected = target;
  s.collapsedDays.clear();
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
    const month = mode === 'calendar';
    const bar = calendarBar(ctx, {
      selected: day, month, action: 'day-select', shiftAction: month ? 'month-shift' : 'week-shift', pickAction: 'day-pick',
      dir: month ? s.monthDir : s.weekDir,
    });
    const jump = isTomorrow(day) ? null : { title: 'Domani', action: 'day-tomorrow', help: 'Vai a domani (Alt+Maiusc+T)' };
    const detail = dayDetail(ctx, day, { jump });
    // "Nei prossimi giorni" come la vista Programma di Google Calendar (solo nella vista Lista
    // sui telefoni; sugli schermi larghi c'è spazio accanto al giorno anche con il mese).
    const showsUpcoming = ctx.prefs.showUpcomingDays && (mode === 'list' || ctx.wide);
    const upcoming = showsUpcoming ? upcomingDays(ctx, day) : '';
    const actions = [{ icon: DashboardMode[mode].icon, label: 'Vista e filtri', action: 'dashboard-menu' }];

    if (ctx.wide) {
      return {
        title: 'Dashboard',
        actions,
        split: ctx.splitWide
          ? { sideWidth: 380, side: bar + upcoming, main: banner + axisPage('dashboard-day', s.dir, `day-${dayKey(day)}`, detail) }
          : { side: bar, main: banner + axisPage('dashboard-day', s.dir, `day-${dayKey(day)}`, detail + upcoming) },
        refresh: () => model.refreshAll(),
      };
    }
    return {
      title: 'Dashboard',
      searchBar: { prompt: 'Cerca nel registro' },
      actions,
      fixed: bar,
      body: `${banner ? `<div class="banner-slot">${banner}</div>` : ''}<div class="day-swipe" data-day-swipe="day-shift">${axisPage('dashboard-day', s.dir, `day-${dayKey(day)}`, `<div class="stack gap-20">${detail}${upcoming}</div>`)}</div>`,
      refresh: () => model.refreshAll(),
    };
  },

  /** Nuovo tocco sulla scheda: in cima, poi a domani. */
  reselect(ctx) {
    const scroller = ctx.pageScroller();
    if (scroller && scroller.scrollTop > 2) {
      scroller.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    select(ctx, addDays(new Date(), 1));
  },

  actions: {
    'day-shift': (ctx, el) => select(ctx, addDays(dashState(ctx).selected, Number(el.dataset.delta))),
    'day-today': (ctx) => select(ctx, new Date()),
    'day-tomorrow': (ctx) => select(ctx, addDays(new Date(), 1)),
    'day-select': (ctx, el) => select(ctx, new Date(Number(el.dataset.time))),
    'day-pick': (ctx) => ctx.openDatePicker({ selection: dashState(ctx).selected, onPick: (day) => select(ctx, day) }),
    'week-shift': (ctx, el) => select(ctx, addDays(dashState(ctx).selected, 7 * Number(el.dataset.delta))),
    'month-shift': (ctx, el) => {
      const s = dashState(ctx);
      const target = addMonths(s.selected, Number(el.dataset.delta));
      // Stesso numero del giorno, se il mese ce l'ha.
      const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
      select(ctx, new Date(target.getFullYear(), target.getMonth(), Math.min(s.selected.getDate(), last)));
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
    'upcoming-day-toggle': (ctx, el) => {
      const s = dashState(ctx);
      const time = Number(el.dataset.time);
      navigator.vibrate?.(4);
      if (s.collapsedDays.has(time)) s.collapsedDays.delete(time); else s.collapsedDays.add(time);
    },
  },
};

// MARK: - Giorno

/** Chip di stato del giorno: verifiche, compiti, assenze, vacanza o fine settimana, ore di lezione. */
function statusChips(ctx, day, { tests, homework, completed, absences, lessons, isPastOrToday }) {
  const chips = [];
  if (tests) chips.push(statusChip(tests === 1 ? '1 verifica' : `${tests} verifiche`, 'test', 'tertiary'));
  if (homework) {
    const done = completed === homework;
    chips.push(statusChip(done ? 'Compiti fatti' : (homework === 1 ? '1 compito' : `${homework} compiti`), done ? 'checkCircle' : 'book'));
  }
  const kinds = [...new Set(absences.map((a) => a.kind))];
  for (const kind of kinds.sort()) chips.push(statusChip(AbsenceKind[kind]?.title ?? 'Assenza', 'userClock', 'poor'));
  if (!chips.length) {
    if (ctx.model.calendarStatus(day)?.isHoliday) chips.push(statusChip('Vacanza', 'beach', 'good'));
    else if (isWeekend(day)) chips.push(statusChip('Fine settimana', 'sun', 'good'));
  }
  if (isPastOrToday && lessons.length) {
    const hours = lessons.reduce((sum, l) => sum + Math.trunc(l.duration), 0);
    chips.push(statusChip(hours === 1 ? '1 ora di lezione' : `${hours} ore di lezione`, 'bookText', 'surface'));
  }
  return chips;
}

/**
 * Tutto ciò che riguarda un giorno: in cima il giorno in grande con i chip di stato, sotto
 * verifiche ed eventi, compiti, presenze e (per i giorni passati) le lezioni svolte, ognuno in
 * una sezione segmentata.
 */
export function dayDetail(ctx, day, { jump = null } = {}) {
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
  const completed = homework.filter((e) => prefs.isCompleted(e)).length;

  if (isPastOrToday) {
    // Anche dopo ogni aggiornamento completo, che azzera le lezioni già scaricate.
    const week = startOfWeek(day);
    ctx.task(`lessons-${dayKey(week)}-${model.lastUpdated?.getTime() ?? 0}`, () => model.ensureLessons(week, addDays(week, 6)));
  }

  const expanded = ctx.app.viewState.get('expanded');
  const agendaCell = (e) => segCell(agendaEventRow(e, { done: prefs.isCompleted(e), expanded: expanded?.has(`${e.id}`) }));
  const parts = [];
  if (testsAndEvents.length) {
    parts.push(segmentedSection(ctx, { section: 'testsAndEvents', title: 'Verifiche ed eventi', iconName: 'test', color: 'var(--tertiary)',
      trailing: String(testsAndEvents.length), cells: testsAndEvents.map(agendaCell) }));
  }
  if (homework.length) {
    parts.push(segmentedSection(ctx, { section: 'homework', title: 'Compiti', iconName: 'book',
      trailing: `${completed}/${homework.length}`, progress: completed / homework.length, cells: homework.map(agendaCell) }));
  }
  if (absences.length) {
    parts.push(segmentedSection(ctx, { section: 'attendance', title: 'Presenze', iconName: 'userClock', color: 'var(--poor)',
      cells: absences.map((a) => segCell(absenceRow(a))) }));
  }
  if (isPastOrToday) {
    if (lessons.length) {
      const hours = lessons.reduce((sum, l) => sum + Math.trunc(l.duration), 0);
      parts.push(segmentedSection(ctx, { section: 'lessons', title: 'Lezioni', iconName: 'bookText', color: 'var(--secondary)',
        trailing: `${hours} ore`, cells: lessons.map((l) => segCell(lessonRow(l))) }));
    } else if (!model.hasLoadedLessons(day) && !isWeekend(day)) {
      parts.push(loadingCard('Carico le lezioni…'));
    }
  }

  const weekend = isWeekend(day);
  const empty = `<div class="empty-day"><span class="empty-day-art shaped">${shape(weekend ? 'sunny' : 'cookie9Sided')}${icon(weekend ? 'sun' : 'checkSeal')}</span>
    <h3>${weekend ? 'Goditi il weekend' : 'Niente in programma'}</h3><p>Nessun compito, verifica o evento per questo giorno.</p></div>`;
  const showEmpty = !hasAgenda && (!lessons.length || !isPastOrToday);
  const chips = statusChips(ctx, day, { tests: events.filter((e) => e.kind === 'test').length, homework: homework.length, completed, absences, lessons, isPastOrToday });
  return `<div class="stack gap-20">${dayHero(day, { jump, chips })}${showEmpty ? empty : ''}${parts.join('')}</div>`;
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

function summary(events) {
  const tests = events.filter((e) => e.kind === 'test').length;
  const homework = events.filter((e) => e.kind === 'homework').length;
  const other = events.length - tests - homework;
  const parts = [];
  if (tests) parts.push(tests === 1 ? '1 verifica' : `${tests} verifiche`);
  if (homework) parts.push(homework === 1 ? '1 compito' : `${homework} compiti`);
  if (other) parts.push(other === 1 ? '1 evento' : `${other} eventi`);
  return parts.join(' · ');
}

/**
 * "Nei prossimi giorni", come la vista Programma di Google Calendar: a sinistra la data in un
 * riquadro (solo toccando quello si va al giorno), a destra il nome del giorno, che comprime gli
 * elementi, e gli elementi in una lista segmentata, con le loro azioni (la casella del compito,
 * il testo tagliato che si apre, il menu tenendo premuto) come nel giorno scelto.
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
    const cells = sorted.map((e) => segCell(agendaEventRow(e, {
      done: prefs.isCompleted(e), scope: 'up', expanded: expanded?.has(`up${e.id}`),
    })));
    return `<div class="upcoming-day" data-key="upd-${time}">
      <button class="date-badge-btn" data-action="day-select" data-time="${time}" aria-label="Vai a ${esc(fmt.relativeDayName(day))}" title="Vai a ${esc(fmt.relativeDayName(day))}">${dateBadge(day, { highlighted: events.some((e) => e.kind === 'test'), today: isToday(day) })}</button>
      <div class="upcoming-body">
        <button class="upcoming-head" data-action="upcoming-day-toggle" data-time="${time}" aria-expanded="${!closed}">
          <span class="grow"><strong>${esc(fmt.relativeDayName(day))}</strong><small>${esc(summary(events))}</small></span>${chevron(closed)}</button>
        ${collapsible(!closed, `<div class="list-group">${cells.join('')}</div>`)}</div></div>`;
  }).join('');
  return `<div class="upcoming"><button class="section-toggle" data-action="toggle-section" data-section="upcoming" aria-expanded="${!collapsed}">
    ${sectionHeader('Nei prossimi giorni', { trailing: chevron(collapsed) })}</button>
    ${collapsible(!collapsed, `<div class="stack gap-16">${list}</div>`, { spacing: 12 })}</div>`;
}

export { select as selectDashboardDay };
