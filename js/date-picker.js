// Selettore della data di Material 3 (modale): in alto la data scelta in grande, sotto il mese
// con le frecce, la griglia dei giorni (cerchi da 40 px: pieno il giorno scelto, il bordo per
// oggi) e i pulsanti di testo. Toccando il mese si sceglie mese e anno da una griglia;
// scorrendo di lato si cambia mese. Lo aprono la settimana e il mese di Dashboard e Orario.

import { icon } from './icons.js';
import { addMonths, esc, fmt, isSameDay, isToday, startOfDay, startOfMonth } from './util.js';

const weekdaySymbols = ['L', 'M', 'M', 'G', 'V', 'S', 'D'];
const monthSymbols = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];

/** Stato iniziale: `onPick(data)` riceve il giorno scelto con OK; `min`/`max` lo limitano. */
export function datePickerState({ selection, onPick, min = null, max = null }) {
  const day = startOfDay(selection ?? new Date());
  return { selection: day, month: startOfMonth(day), choosingMonth: false, dir: 0, onPick, min, max, id: Date.now() };
}

/** Giorni del mese da lunedì a domenica; `null` per quelli dei mesi accanto. */
function rows(month) {
  const first = startOfMonth(month);
  const count = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const offset = (first.getDay() + 6) % 7;
  const cells = [];
  for (let i = 0; i < Math.ceil((offset + count) / 7) * 7; i++) {
    cells.push(i >= offset && i < offset + count ? new Date(first.getFullYear(), first.getMonth(), i - offset + 1) : null);
  }
  const result = [];
  for (let i = 0; i < cells.length; i += 7) result.push(cells.slice(i, i + 7));
  return result;
}

const outOfRange = (s, day) => (s.min && day < startOfDay(s.min)) || (s.max && day > startOfDay(s.max));

export function renderDatePicker(s) {
  const headline = fmt.weekdayShort(s.selection) + ' ' + fmt.shortDay(s.selection).replace('.', '');
  const monthRow = `<div class="dp-month-row">
    <button class="dp-month-btn" data-action="dp-toggle-month" aria-expanded="${s.choosingMonth}">
      <span>${esc(fmt.monthYear(s.month))}</span><span class="dp-caret ${s.choosingMonth ? 'up' : ''}">${icon('chevronDown')}</span></button>
    <span class="flex"></span>
    ${s.choosingMonth ? '' : `<button class="icon-btn" data-action="dp-shift" data-delta="-1" aria-label="Mese precedente" title="Mese precedente">${icon('chevronLeft')}</button>
    <button class="icon-btn" data-action="dp-shift" data-delta="1" aria-label="Mese successivo" title="Mese successivo">${icon('chevronRight')}</button>`}</div>`;
  let grid;
  if (s.choosingMonth) {
    const year = s.month.getFullYear();
    grid = `<div class="dp-months" data-key="dp-months">
      <div class="dp-year-row"><button class="icon-btn" data-action="dp-year" data-delta="-1" aria-label="Anno precedente">${icon('chevronLeft')}</button>
        <strong class="numeral">${year}</strong><button class="icon-btn" data-action="dp-year" data-delta="1" aria-label="Anno successivo">${icon('chevronRight')}</button></div>
      <div class="dp-month-grid">${monthSymbols.map((name, index) => `<button class="dp-month ${index === s.month.getMonth() ? 'selected' : ''}" data-action="dp-month" data-month="${index}">${name}</button>`).join('')}</div></div>`;
  } else {
    grid = `<div class="dp-days" data-swipe="dp-shift">
      <div class="dp-weekdays">${weekdaySymbols.map((w) => `<span>${w}</span>`).join('')}</div>
      <div class="dp-page slide-${s.dir}" data-key="dp-${s.month.getTime()}">${rows(s.month).map((row) => `<div class="dp-row">${row.map((day) => {
    if (!day) return '<span class="dp-cell"></span>';
    const selected = isSameDay(day, s.selection);
    const disabled = outOfRange(s, day);
    return `<span class="dp-cell"><button class="dp-day ${selected ? 'selected' : ''} ${isToday(day) ? 'today' : ''}" data-action="dp-day" data-time="${day.getTime()}" aria-label="${esc(fmt.longDay(day))}" aria-pressed="${selected}"${disabled ? ' disabled' : ''}>${day.getDate()}</button></span>`;
  }).join('')}</div>`).join('')}</div></div>`;
  }
  return `<div class="dialog-layer date-picker-layer" data-key="date-picker">
    <div class="scrim" data-action="dp-cancel"></div>
    <div class="dialog date-picker" role="dialog" aria-modal="true" aria-label="Scegli una data">
      <div class="dp-head"><span class="dp-label">Scegli una data</span><h2 class="dp-headline">${esc(headline)}</h2></div>
      <hr class="divider">
      ${monthRow}
      <div class="dp-body">${grid}</div>
      <div class="dp-actions"><button class="btn text" data-action="dp-today">Oggi</button><span class="flex"></span>
        <button class="btn text" data-action="dp-cancel">Annulla</button><button class="btn text" data-action="dp-ok">OK</button></div>
    </div></div>`;
}

export function datePickerActions(app) {
  const change = (month) => {
    const s = app.datePicker;
    const start = startOfMonth(month);
    s.dir = Math.sign(start - s.month);
    s.month = start;
  };
  return {
    'dp-day': (ctx, el) => { app.datePicker.selection = startOfDay(new Date(Number(el.dataset.time))); navigator.vibrate?.(4); },
    'dp-shift': (ctx, el) => change(addMonths(app.datePicker.month, Number(el.dataset.delta))),
    'dp-year': (ctx, el) => change(addMonths(app.datePicker.month, 12 * Number(el.dataset.delta))),
    'dp-toggle-month': () => { app.datePicker.choosingMonth = !app.datePicker.choosingMonth; },
    'dp-month': (ctx, el) => {
      const s = app.datePicker;
      change(new Date(s.month.getFullYear(), Number(el.dataset.month), 1));
      s.choosingMonth = false;
    },
    'dp-today': () => {
      const s = app.datePicker;
      s.selection = startOfDay(new Date());
      change(new Date());
      s.choosingMonth = false;
    },
    'dp-cancel': () => { app.datePicker = null; },
    'dp-ok': () => {
      const s = app.datePicker;
      app.datePicker = null;
      let day = s.selection;
      if (s.min && day < startOfDay(s.min)) day = startOfDay(s.min);
      if (s.max && day > startOfDay(s.max)) day = startOfDay(s.max);
      s.onPick?.(day);
    },
  };
}
