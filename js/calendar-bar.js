// Settimana o mese di Dashboard e Orario come gruppo di pulsanti di M3 Expressive. Nella
// settimana c'è un pulsante per giorno (iniziali e numero): quello scelto è pieno nel colore
// primario, tutto arrotondato e più largo degli altri, che si stringono. Nel mese (vista
// Calendario della Dashboard) gli stessi pulsanti, più bassi, in una griglia. Sopra: il periodo
// (apre il selettore della data) e le frecce; scorrendo di lato si cambia settimana (o mese).

import { icon } from './icons.js';
import { addDays, dayKey, esc, fmt, isSameDay, isToday, isWeekend, startOfMonth, startOfWeek } from './util.js';

const weekdaySymbols = ['L', 'M', 'M', 'G', 'V', 'S', 'D'];

/** Pallini sotto il numero: verifiche, compiti, eventi e assenze. */
export function agendaDots(ctx, day, selected) {
  const events = ctx.model.events(day);
  const dots = [];
  if (events.some((e) => e.kind === 'test')) dots.push(selected ? 'var(--on-primary)' : 'var(--tertiary)');
  if (events.some((e) => e.kind === 'homework')) dots.push(selected ? 'color-mix(in srgb, var(--on-primary) 70%, transparent)' : 'var(--neutral)');
  if (events.some((e) => e.kind === 'event')) dots.push(selected ? 'color-mix(in srgb, var(--on-primary) 70%, transparent)' : 'var(--fair)');
  if (ctx.model.absencesOn(day).length) dots.push(selected ? 'color-mix(in srgb, var(--on-primary) 70%, transparent)' : 'var(--poor)');
  return dots;
}

/** "12 – 18 ottobre", oppure "28 set – 4 ott" a cavallo di due mesi. */
export function weekRangeTitle(week) {
  const end = addDays(week, 6);
  if (week.getMonth() === end.getMonth()) return `${week.getDate()} – ${fmt.dayMonth(end)}`;
  return `${fmt.shortDay(week)} – ${fmt.shortDay(end)}`.replaceAll('.', '');
}

/** Settimane (lunedì) che contengono i giorni del mese. */
export function monthWeeks(month) {
  const first = startOfMonth(month);
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0);
  const weeks = [];
  for (let week = startOfWeek(first); week <= last; week = addDays(week, 7)) weeks.push(week);
  return weeks;
}

function dayButton(ctx, day, { selected, compact, outside, action, dots }) {
  const holiday = ctx.model.calendarStatus(day)?.isHoliday;
  const cls = ['cb-day'];
  if (selected) cls.push('selected');
  if (isToday(day)) cls.push('today');
  if ((isWeekend(day) || holiday) && !selected) cls.push('quiet');
  if (outside) cls.push('outside');
  const marks = dots(ctx, day, selected).map((c) => `<i style="background:${c}"></i>`).join('');
  return `<button class="${cls.join(' ')}" data-action="${action}" data-time="${day.getTime()}" aria-label="${esc(fmt.longDay(day))}" aria-pressed="${selected}">
    ${compact ? '' : `<span class="cb-wd">${esc(fmt.weekdayShort(day))}</span>`}<span class="cb-num numeral">${day.getDate()}</span><span class="cb-dots">${marks}</span></button>`;
}

/**
 * Barra del calendario. `action` sceglie un giorno (`data-time`), `shiftAction` cambia
 * settimana o mese (`data-delta`), `pickAction` apre il selettore della data.
 */
export function calendarBar(ctx, { selected, month = false, action, shiftAction, pickAction, dots = agendaDots, dir = 0, cls = '' }) {
  const unit = month ? 'Mese' : 'Settimana';
  const title = month ? fmt.monthYear(selected) : weekRangeTitle(startOfWeek(selected));
  const head = `<div class="cb-head">
    <button class="cb-title" data-action="${pickAction}" title="Scegli una data"><span>${esc(title)}</span>${icon('chevronDown', { cls: 'small' })}</button>
    <span class="flex"></span>
    <button class="icon-btn" data-action="${shiftAction}" data-delta="-1" aria-label="${unit} precedente" title="${unit} precedente">${icon('chevronLeft')}</button>
    <button class="icon-btn" data-action="${shiftAction}" data-delta="1" aria-label="${unit} successiv${month ? 'o' : 'a'}" title="${unit} successiv${month ? 'o' : 'a'}">${icon('chevronRight')}</button></div>`;
  let body;
  if (month) {
    const first = startOfMonth(selected);
    const rows = monthWeeks(first).map((week) => `<div class="cb-row">${[0, 1, 2, 3, 4, 5, 6].map((i) => {
      const day = addDays(week, i);
      return dayButton(ctx, day, { selected: isSameDay(day, selected), compact: true, outside: day.getMonth() !== first.getMonth(), action, dots });
    }).join('')}</div>`).join('');
    body = `<div class="cb-weekdays">${weekdaySymbols.map((w) => `<span>${w}</span>`).join('')}</div>
      <div class="cb-rows" data-swipe="${shiftAction}"><div class="cb-page slide-${dir}" data-key="cbm-${dayKey(first)}">${rows}</div></div>`;
  } else {
    const week = startOfWeek(selected);
    const days = [0, 1, 2, 3, 4, 5, 6].map((i) => {
      const day = addDays(week, i);
      return dayButton(ctx, day, { selected: isSameDay(day, selected), compact: false, outside: false, action, dots });
    }).join('');
    body = `<div class="cb-rows" data-swipe="${shiftAction}"><div class="cb-page slide-${dir}" data-key="cbw-${dayKey(week)}"><div class="cb-row week">${days}</div></div></div>`;
  }
  return `<div class="calendar-bar ${month ? 'month' : 'week'} ${cls}">${head}${body}</div>`;
}
