// Orario: la settimana dell'utente in due viste (Lista e Giorno; sugli schermi larghi la vista
// Giorno mostra la settimana intera), con le verifiche di Classeviva sulle lezioni, la modalità
// Modifica orario (trascinare, allungare, doppio tocco per creare) con la barra degli strumenti
// flottante, il menu del pulsante +, la bozza generata dalle lezioni e i colori delle palette.

import {
  pill, emptyState, button, statusBanner, listGroup, segCell, statusChip, axisPage, dayHero, wavyProgress,
  floatingToolbar, toolbarButton, toolbarSeparator,
} from '../components.js';
import { calendarBar } from '../calendar-bar.js';
import { icon } from '../icons.js';
import { shape } from '../shapes.js';
import { data } from '../dom.js';
import {
  addDays, addMonths, dayKey, esc, fmt, isSameDay, isToday, isTomorrow, isYesterday, isWeekend, startOfDay, startOfMonth, startOfWeek, plural,
} from '../util.js';
import {
  Alignment, TimeOfDay, TimetableMode, Weekday, alignedPieces, dayContent, defaultTimetableDay, displayTitle, duration,
  entryColor, isBreak, roundHalfAway, timeRange, timetableLayout,
} from '../timetable.js';
import {
  detailSheet, editorSheet, generatorSheet, hiddenTestsSheet, seriesSheet, shiftSheet, deleteEntryDialog, timetableSheetActions,
} from './timetable-sheets.js';

// MARK: - Stato

export function ttState(ctx) {
  return ctx.state('timetable', () => ({
    selected: startOfDay(new Date()), editing: false, initialized: false,
    dir: 0, weekDir: 0, monthDir: 0, scrollToHour: true,
  }));
}

function select(ctx, day) {
  const s = ttState(ctx);
  const target = startOfDay(day);
  if (target.getTime() === s.selected.getTime()) return;
  navigator.vibrate?.(4);
  s.dir = Math.sign(target - s.selected);
  if (startOfWeek(target).getTime() !== startOfWeek(s.selected).getTime()) s.weekDir = s.dir;
  if (startOfMonth(target).getTime() !== startOfMonth(s.selected).getTime()) s.monthDir = s.dir;
  s.selected = target;
  s.scrollToHour = true;
}

/**
 * Il giorno predefinito dell'orario (`defaultTimetableDay`: oggi finché c'è un evento non ancora
 * finito, poi il primo giorno successivo con eventi). È il giorno di apertura e quello a cui
 * riportano il pulsante accanto al giorno in grande (o nella barra), Alt+T e un nuovo tocco sulla
 * scheda. Il giorno mostrato non cambia da solo quando finisce l'ultimo evento, il pulsante sì
 * (la pagina si ridisegna ogni 30 secondi).
 */
function defaultDay(ctx) {
  return defaultTimetableDay(ctx.model.timetable);
}

/** Nome del giorno predefinito sul pulsante che ci riporta: "Oggi", "Domani" o "Lunedì". */
function jumpTitle(day) {
  return isToday(day) || isTomorrow(day) ? fmt.relativeDayName(day) : fmt.weekdayLong(day);
}

/** Il pulsante del giorno predefinito, se il giorno scelto è un altro. */
function jumpButton(ctx, selected) {
  const target = defaultDay(ctx);
  if (isSameDay(selected, target)) return null;
  const title = jumpTitle(target);
  return { title, action: 'tt-jump', help: `Vai a ${title.toLowerCase()} (Alt+T)`, label: `Vai a ${title.toLowerCase()}` };
}

/** Vista effettiva: in modifica sempre Giorno; il mese c'è nella Dashboard. */
function effectiveMode(ctx) {
  if (ttState(ctx).editing) return 'day';
  return ctx.prefs.get('timetableMode') === 'day' ? 'day' : 'list';
}

const hourHeight = (ctx) => (ctx.wide ? 52 : 60);

// MARK: - Allineamento (anche dalle Impostazioni)

/** Cambia l'allineamento; passando all'automatico con eventi non allineati chiede conferma. */
export function requestAlignment(ctx, value) {
  const store = ctx.model.timetable;
  if (value === store.alignment) return;
  const unaligned = store.unalignedEntries;
  if (value !== 'automatic' || !unaligned.length) {
    store.setAlignment(value);
    return;
  }
  const n = unaligned.length;
  const split = unaligned.filter((e) => alignedPieces(e).length > 1).length;
  let text = n === 1 ? "Un evento non è allineato alle ore e alle mezz'ore." : `${n} eventi non sono allineati alle ore e alle mezz'ore.`;
  text += " Con l'allineamento automatico inizio e fine verranno spostati all'ora o alla mezz'ora più vicina";
  text += split > 0 ? " e gli eventi più lunghi di un'ora verranno divisi in eventi da un'ora (o mezz'ora) di seguito, mostrati uniti." : '.';
  text += ' Gli intervalli restano come sono.';
  ctx.confirm({ title: 'Allineare gli eventi?', message: text, confirmLabel: 'Allinea', onConfirm: () => store.setAlignment('automatic') });
}

// MARK: - Pagina

/**
 * Barra degli strumenti della modifica (vivace, al posto della barra di navigazione):
 * allineamento, spostamento degli orari, nuovo intervallo e "Fine". Come nell'app dalla 3.3, i
 * colori della giornata stanno nel menu dell'orario.
 */
function editToolbar(ctx) {
  const store = ctx.model.timetable;
  const align = Object.values(Alignment).map((a) => toolbarButton(a.icon, { action: 'tt-align-pick', params: { value: a.id }, label: a.title, selected: store.alignment === a.id })).join('');
  return floatingToolbar(`${align}${toolbarSeparator()}
    ${toolbarButton('schedule', { action: 'tt-shift', label: 'Sposta gli orari' })}
    ${toolbarButton('coffee', { action: 'tt-new-break', label: 'Nuovo intervallo' })}
    <button class="btn filled tb-done" data-action="tt-done" title="Esci dalla modifica (↩)">${icon('check')}<span>Fine</span></button>`, { vibrant: true, label: "Modifica dell'orario" });
}

/**
 * Barra degli strumenti dell'anteprima della bozza (vivace, modalità temporanea al posto della
 * barra di navigazione, come `TimetableDraftToolbar` nell'app): rigenera, scarta, applica.
 */
function draftToolbar() {
  return floatingToolbar(`${toolbarButton('tune', { action: 'tt-generate', label: 'Cambia le impostazioni e rigenera' })}
    ${toolbarButton('trash', { action: 'tt-draft-discard', label: "Scarta l'anteprima" })}${toolbarSeparator()}
    <button class="btn filled tb-done" data-action="tt-draft-apply" title="Applica l'orario generato">${icon('check')}<span>Applica</span></button>`, { vibrant: true, label: "Anteprima dell'orario" });
}

export const timetable = {
  title: 'Orario',

  render(ctx) {
    const model = ctx.model;
    const store = model.timetable;
    const s = ttState(ctx);
    if (!s.initialized) {
      s.initialized = true;
      // Oggi finché c'è un evento da finire, altrimenti il prossimo giorno con eventi.
      s.selected = defaultTimetableDay(store);
    }
    if (store.draft && s.editing) s.editing = false;
    const mode = effectiveMode(ctx);
    const day = s.selected;
    const isDraft = !!store.draft;

    const actions = [];
    // Il pulsante del giorno predefinito sta accanto al giorno in grande; nella modifica e nella
    // vista Giorno degli schermi larghi, che non hanno il giorno in grande, nella barra.
    const jump = s.editing || (ctx.wide && mode === 'day') ? jumpButton(ctx, day) : null;
    if (jump) actions.push({ text: jump.title, action: jump.action, help: jump.help });
    if (!s.editing) {
      // Passa all'altra vista: l'icona è quella della vista in cui si va.
      const dayLabel = ctx.wide ? 'Vista Settimana' : 'Vista Giorno';
      actions.push(mode === 'day'
        ? { icon: 'viewAgenda', label: 'Vista Lista', action: 'tt-mode', params: { value: 'list' } }
        : { icon: 'dayView', label: dayLabel, action: 'tt-mode', params: { value: 'day' } });
      actions.push({ icon: 'moreH', label: "Opzioni dell'orario", help: 'Verifiche e colori', action: 'tt-menu' });
    }
    const fabMenu = s.editing || isDraft ? null : {
      icon: 'plus', label: 'Aggiungi o modifica',
      items: [
        { title: 'Genera dalle lezioni', icon: 'wand', action: 'tt-generate' },
        { title: 'Modifica orario', icon: 'edit', action: 'tt-edit' },
        { title: 'Nuovo intervallo', icon: 'coffee', action: 'tt-new-break' },
        { title: 'Nuovo evento', icon: 'plus', action: 'tt-new' },
      ],
    };
    // Modifica e anteprima della bozza sono modalità temporanee: la loro barra degli strumenti
    // prende il posto della barra di navigazione.
    const toolbar = s.editing ? editToolbar(ctx) : (isDraft ? draftToolbar() : null);
    const title = s.editing ? 'Modifica orario' : 'Orario';
    const content = dayContent(model, day, { splitAtBreaks: mode !== 'day' });
    const capsule = mode === 'day' && content.unmatchedTests.length ? unmatchedCapsule(content.unmatchedTests) : '';
    const extras = draftHeader(ctx) + (s.editing ? editHint(ctx) : '') + capsule;
    const bar = calendarBar(ctx, { selected: day, action: 'tt-select', shiftAction: 'tt-week-shift', pickAction: 'tt-pick', dir: s.weekDir });

    if (ctx.wide) {
      return { title, actions, fabMenu, toolbar, hidesNav: s.editing || isDraft, ...wideLayout(ctx, mode, content, extras, bar) };
    }

    // Telefoni: in alto la settimana, ferma; sotto il giorno (Lista) o la sua giornata (Giorno).
    // Lista e Giorno si scambiano con la dissolvenza di Material 3 (`.view-swap`, come nell'app),
    // ognuna con il suo contenitore dei giorni: prima il cambio di vista scorreva di lato, nel
    // verso dell'ultimo cambio di giorno.
    let body;
    if (mode === 'day') {
      const grid = timeline(ctx, [day], day);
      body = s.editing ? grid : `<div class="day-swipe" data-day-swipe="tt-day-shift">${axisPage('tt-grid', s.dir, `ttg-${dayKey(day)}`, grid)}</div>`;
      scheduleHourScroll(ctx, [day]);
    } else {
      body = `<div class="day-swipe" data-day-swipe="tt-day-shift">${axisPage('tt-day', s.dir, `ttd-${dayKey(day)}`, dayList(ctx, content))}</div>`;
    }
    body = `<div class="view-swap" data-key="tt-view-${mode}">${body}</div>`;
    return {
      title,
      actions,
      fixed: `${bar}${extras ? `<div class="tt-extras">${extras}</div>` : ''}`,
      body,
      fabMenu,
      toolbar,
      hidesNav: s.editing || isDraft,
      refresh: () => model.refreshAll(),
    };
  },

  /**
   * Nuovo tocco sulla scheda: il primo porta in cima la Lista, il successivo (già in cima) al giorno
   * predefinito. Nella vista Giorno, che parte già scorsa alla prima ora, subito al giorno.
   */
  reselect(ctx) {
    select(ctx, defaultDay(ctx));
  },
  reselectSkipsTop: (ctx) => effectiveMode(ctx) === 'day',

  actions: {
    ...timetableSheetActions,
    'tt-select': (ctx, el) => select(ctx, new Date(Number(el.dataset.time))),
    'tt-jump': (ctx) => select(ctx, defaultDay(ctx)),
    'tt-pick': (ctx) => ctx.openDatePicker({ selection: ttState(ctx).selected, onPick: (day) => select(ctx, day) }),
    'tt-day-shift': (ctx, el) => {
      if (ttState(ctx).editing) return;
      select(ctx, addDays(ttState(ctx).selected, Number(el.dataset.delta)));
    },
    'tt-week-shift': (ctx, el) => select(ctx, addDays(ttState(ctx).selected, 7 * Number(el.dataset.delta))),
    'tt-month-shift': (ctx, el) => {
      const s = ttState(ctx);
      const target = addMonths(s.selected, Number(el.dataset.delta));
      const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
      select(ctx, new Date(target.getFullYear(), target.getMonth(), Math.min(s.selected.getDate(), last)));
    },
    'tt-mode': (ctx, el) => {
      const value = el.dataset.value ?? el.value;
      ctx.prefs.set('timetableMode', value);
      ttState(ctx).scrollToHour = true;
      // La Lista riparte dall'alto (la vista Giorno scorre da sola alla prima ora): prima restava
      // scorsa quanto la giornata, con il giorno in grande nascosto sotto la settimana.
      if (value === 'list' && ctx.route.name === 'timetable') {
        ctx.afterRender(() => {
          const scroller = ctx.pageScroller();
          if (scroller) ctx.scrollQuietly(scroller, 0);
        });
      }
    },
    'tt-new': (ctx) => {
      if (ctx.model.timetable.draft) return;
      ctx.openSheet(editorSheet(ctx, { weekday: Weekday.of(ttState(ctx).selected), kind: 'lesson' }));
    },
    'tt-new-break': (ctx) => ctx.openSheet(editorSheet(ctx, { weekday: Weekday.of(ttState(ctx).selected), kind: 'breakTime' })),
    'tt-done': (ctx) => { ttState(ctx).editing = false; },
    'tt-edit': (ctx) => {
      if (ctx.model.timetable.draft) return;
      const s = ttState(ctx);
      s.editing = true;
      s.scrollToHour = true;
    },
    'tt-generate': (ctx) => ctx.openSheet(generatorSheet(ctx)),
    'tt-shift': (ctx) => {
      if (ctx.model.timetable.draft || ctx.model.timetable.isEmpty) return;
      ctx.openSheet(shiftSheet(ctx, Weekday.of(ttState(ctx).selected)));
    },
    'tt-hidden-tests': (ctx) => ctx.openSheet(hiddenTestsSheet(ctx)),
    'tt-series': (ctx, el) => {
      const weekday = el?.dataset?.weekday ? Number(el.dataset.weekday) : Weekday.of(ttState(ctx).selected);
      ctx.openSheet(seriesSheet(ctx, weekday));
    },
    'tt-menu': (ctx, el) => {
      const store = ctx.model.timetable;
      const prefs = ctx.prefs;
      const isDraft = !!store.draft;
      ctx.openMenu(el, [
        // Cambia ciò che mostra la lista: sta con la scelta della vista.
        { label: 'Mostra le verifiche', icon: 'test', checked: prefs.timetableShowsTests, run: () => prefs.set('timetableShowsTests', !prefs.timetableShowsTests) },
        { label: 'Verifiche nascoste…', icon: 'eyeOff', run: () => ctx.run('tt-hidden-tests') },
        { divider: true },
        { label: 'Colora una giornata…', icon: 'palette', disabled: store.isEmpty || isDraft, run: () => ctx.run('tt-series') },
      ]);
    },
    'tt-open': (ctx, el) => {
      const store = ctx.model.timetable;
      const entry = store.entry(el.dataset.id);
      if (!entry) return;
      const s = ttState(ctx);
      if (s.editing && !store.draft) {
        ctx.openSheet(editorSheet(ctx, { entry }));
        return;
      }
      ctx.openSheet(detailSheet(ctx, entry.id, new Date(Number(el.dataset.time))));
    },
    'context-tt-entry': (ctx, el, event) => {
      const store = ctx.model.timetable;
      const entry = store.entry(el.dataset.id);
      if (!entry || store.isDraftEntry(entry.id) || store.draft) return;
      ctx.openMenu({ x: event?.clientX ?? 0, y: event?.clientY ?? 0 }, [
        { label: 'Modifica', icon: 'edit', run: () => ctx.openSheet(editorSheet(ctx, { entry })) },
        { label: 'Duplica', icon: 'duplicate', run: () => store.duplicate(entry) },
        { label: 'Colora la giornata…', icon: 'palette', run: () => ctx.openSheet(seriesSheet(ctx, entry.weekday)) },
        { divider: true },
        { label: 'Elimina', icon: 'trash', destructive: true, run: () => deleteEntryDialog(ctx, entry) },
      ], { align: 'start' });
    },
    'tt-test-hide': (ctx, el) => {
      const test = ctx.model.agenda.find((e) => String(e.id) === el.dataset.id);
      if (test) ctx.model.timetable.setTestHidden(el.dataset.hide === '1', test, el.dataset.unmatched === '1');
    },
    'tt-align-pick': (ctx, el) => requestAlignment(ctx, el.dataset.value),
    'tt-draft-apply': (ctx) => {
      const store = ctx.model.timetable;
      if (store.isEmpty) {
        store.applyDraft(true);
        return;
      }
      ctx.confirm({
        title: 'Hai già un orario',
        message: "Sostituendolo, eventi, note, file e verifiche segnate a mano dell'orario attuale verranno eliminati.",
        actions: [
          { label: "Sostituisci l'orario attuale", destructive: true, run: () => store.applyDraft(true) },
          { label: 'Aggiungi solo dove è libero', run: () => store.applyDraft(false) },
          { label: 'Annulla', cancel: true },
        ],
      });
    },
    'tt-draft-discard': (ctx) => ctx.model.timetable.discardDraft(),
    'tt-col-dbl': (ctx, el, event) => createAt(ctx, el, event),
  },
};

// MARK: - Schermi larghi

function wideLayout(ctx, mode, content, extras, bar) {
  const s = ttState(ctx);
  const day = s.selected;
  if (mode === 'day') {
    // La settimana intera, come un calendario Material sugli schermi larghi.
    const twoColumns = ctx.mainWidth >= 780;
    const days = twoColumns ? weekDays(ctx, day) : [day];
    const unmatched = content.unmatchedTests.length && !extras.includes('tt-unmatched') ? unmatchedBanner(content.unmatchedTests) : '';
    const timelineCard = `<div class="tt-timeline-card">${timeline(ctx, days, day)}</div>`;
    scheduleHourScroll(ctx, days);
    if (twoColumns) {
      const month = calendarBar(ctx, { selected: day, month: true, action: 'tt-select', shiftAction: 'tt-month-shift', pickAction: 'tt-pick', dir: s.monthDir });
      return {
        full: `<div class="tt-split">
          <div class="tt-side" data-scroll="side"><div class="column">${month}${weekOverview(ctx)}</div></div>
          <div class="tt-main"><div class="tt-main-head">${extras}${unmatched}</div>${timelineCard}</div></div>`,
      };
    }
    return { full: `<div class="tt-split single"><div class="tt-main"><div class="tt-main-head">${bar}${extras}${unmatched}</div>${timelineCard}</div></div>` };
  }
  return {
    split: {
      sideWidth: 380,
      side: bar + (ctx.splitWide ? weekOverview(ctx) : ''),
      main: `${extras ? `<div class="tt-extras">${extras}</div>` : ''}${axisPage('tt-day', s.dir, `ttd-${dayKey(day)}`, dayList(ctx, content))}`,
    },
  };
}

/** Lunedì–venerdì della settimana scelta, più sabato e domenica se scelti o con eventi. */
function weekDays(ctx, selected) {
  const store = ctx.model.timetable;
  const monday = startOfWeek(selected);
  const days = [];
  for (let i = 0; i < 7; i++) {
    const day = addDays(monday, i);
    if (i < 5 || isSameDay(day, selected) || store.entriesOn(day).length) days.push(day);
  }
  return days;
}

/** La settimana in una lista segmentata: per ogni giorno lezioni, orario e i colori. */
function weekOverview(ctx) {
  const store = ctx.model.timetable;
  const s = ttState(ctx);
  const monday = startOfWeek(s.selected);
  const showsTests = ctx.prefs.timetableShowsTests;
  const rows = [];
  for (let i = 0; i < 7; i++) {
    const day = addDays(monday, i);
    const entries = store.entriesOn(day);
    if (i >= 5 && !entries.length) continue;
    const content = dayContent(ctx.model, day);
    const lessons = entries.filter((e) => !isBreak(e)).length;
    const span = content.layout.span;
    const selected = isSameDay(day, s.selected);
    const bars = content.layout.clusters.flatMap((c) => c.blocks.map((p) => p.block)).slice(0, 8)
      .map((b) => `<i style="width:${6 * b.entries.length}px;background:${entryColor(b.entries[0], store)}"></i>`).join('');
    rows.push(`<button class="list-item tt-week-row ${selected ? 'selected' : ''} ${content.isDraft ? 'draft' : ''}" data-action="tt-select" data-time="${day.getTime()}">
      <span class="li-text"><strong>${esc(fmt.weekdayLongDay(day))}${showsTests && content.testCount ? ` <span class="tt-test-mark">${icon('test')}</span>` : ''}</strong>
      <small>${span ? `${plural(lessons, '1 lezione', '# lezioni')} · ${TimeOfDay.string(span.start)}–${TimeOfDay.string(span.end)}` : 'Nessuna lezione'}</small></span>
      <span class="tt-bars">${bars}</span></button>`);
  }
  return listGroup(rows, { header: 'Settimana' });
}

// MARK: - Lista della giornata

/** Chip del giorno: lezioni, orario, verifiche, vacanza. */
function dayChips(ctx, content) {
  const chips = [];
  const lessons = content.entries.filter((e) => !isBreak(e)).length;
  if (lessons) chips.push(statusChip(lessons === 1 ? '1 lezione' : `${lessons} lezioni`, 'bookText'));
  const span = content.layout.span;
  if (span) chips.push(statusChip(`${TimeOfDay.string(span.start)}–${TimeOfDay.string(span.end)}`, 'schedule', 'surface'));
  if (ctx.prefs.timetableShowsTests && content.testCount) chips.push(statusChip(content.testCount === 1 ? '1 verifica' : `${content.testCount} verifiche`, 'test', 'tertiary'));
  if (ctx.model.calendarStatus(content.day)?.isHoliday) chips.push(statusChip('Vacanza', 'beach', 'good'));
  return chips;
}

/**
 * In cima all'orario di oggi: la lezione in corso (quanto manca, con l'avanzamento ondulato) e
 * quella dopo, oppure la prossima lezione con il tempo che manca. Le ore uguali di seguito contano
 * come una lezione sola, come nell'app (3.3, anche nell'attività in diretta e nei widget): due ore
 * di Italiano sono "fino alle 12:00" con una barra sola, poi la materia dopo. Come nella Lista, un
 * intervallo sul passaggio tra due ore uguali le tiene separate. Toccandola si apre l'ora in corso
 * del gruppo, con le sue note e i suoi file. Sparisce finite le lezioni; si nasconde da
 * Impostazioni › Orario › Oggi (`timetableShowsNowCard`).
 */
function nowCard(content) {
  const minute = TimeOfDay.of(new Date());
  const lessons = timetableLayout(content.entries, { splitAtBreaks: true }).clusters
    .flatMap((c) => c.blocks.map((p) => p.block))
    .sort((a, b) => a.start - b.start);
  const current = lessons.findLast((b) => b.start <= minute && minute < b.end);
  const next = lessons.find((b) => b.start >= (current?.end ?? minute) && b.id !== current?.id && b.start > minute);
  const shown = current ?? next;
  if (!shown) return '';
  const title = displayTitle(shown.entries[0]);
  const detail = [current ? `Fino alle ${TimeOfDay.string(shown.end)} · ancora ${TimeOfDay.duration(shown.end - minute)}` : `Alle ${TimeOfDay.string(shown.start)}`];
  const room = shown.entries.find((e) => e.room)?.room;
  if (room) detail.push(room);
  const opened = shown.entries.findLast((e) => e.start <= minute) ?? shown.entries[0];
  const following = current && next ? `<span class="now-next">${icon('chevronRight')}<span>Poi ${esc(displayTitle(next.entries[0]))} alle ${TimeOfDay.string(next.start)}</span></span>` : '';
  return `<button class="now-card" data-action="tt-open"${data({ id: opened.id, time: content.day.getTime() })} data-key="now-${shown.id}">
    <span class="now-top"><span class="now-text"><small>${current ? 'ADESSO' : `TRA ${esc(TimeOfDay.duration(shown.start - minute).toUpperCase())}`}</small>
      <strong>${esc(title)}</strong><span>${esc(detail.join(' · '))}</span></span>
      <span class="now-art shaped">${shape(current ? 'cookie12Sided' : 'sunny')}${icon(current ? 'timetableFill' : 'schedule')}</span></span>
    ${current ? wavyProgress(minute - shown.start, shown.end - shown.start, { label: 'Avanzamento della lezione' }) : ''}
    ${following}</button>`;
}

export function dayList(ctx, content) {
  const store = ctx.model.timetable;
  const day = content.day;
  const showsTests = ctx.prefs.timetableShowsTests;
  const header = dayHero(day, { jump: jumpButton(ctx, day), chips: dayChips(ctx, content) });
  const now = isToday(day) && !content.isDraft && ctx.prefs.timetableShowsNowCard ? nowCard(content) : '';
  const unmatched = showsTests && content.unmatchedTests.length && !content.isDraft
    ? listGroup(content.unmatchedTests.map((t) => segCell(registerTestRow(store, t, { unmatched: true }))), { header: 'Verifiche senza lezione in orario', background: 'color-mix(in srgb, var(--fair-container) 45%, var(--surface-container))' })
    : '';

  if (!content.entries.length) {
    const weekend = isWeekend(day);
    const text = store.isEmpty
      ? "Aggiungi le materie a mano o crea una bozza dell'orario dalle lezioni registrate."
      : 'Aggiungi un evento per questo giorno della settimana.';
    const actions = content.isDraft ? '' : button('Aggiungi', { action: 'tt-new', iconName: 'plus', style: 'tonal' }) +
      (store.isEmpty ? button('Genera', { action: 'tt-generate', iconName: 'wand', style: 'filled' }) : '');
    return `<div class="stack gap-16">${header}${unmatched}<div class="card tt-empty">${emptyState(`Nessuna lezione ${Weekday.withArticle(Weekday.of(day))}`, weekend ? 'sun' : 'calendarPlus', text, actions)}</div></div>`;
  }

  // Le lezioni di seguito (senza pause tra loro) formano una lista segmentata.
  const rows = [];
  for (const item of content.layout.listItems) {
    const last = rows[rows.length - 1];
    if (item.type === 'cluster' && last?.type === 'run' && item.cluster.start <= last.clusters[last.clusters.length - 1].end) last.clusters.push(item.cluster);
    else if (item.type === 'cluster') rows.push({ type: 'run', clusters: [item.cluster] });
    else rows.push(item);
  }
  const items = rows.map((row) => {
    if (row.type === 'pause') return breakRow(ctx, row.entry, day, content.isDraft, content.layout.span);
    if (row.type === 'gap') return `<div class="tt-gap"><hr><span>Libero · ${esc(TimeOfDay.duration(row.end - row.start))}</span><hr></div>`;
    // In anteprima le righe sono pillole staccate, che applicando si uniscono in una lista.
    return `<div class="tt-run ${content.isDraft ? 'draft' : ''}">${row.clusters.map((cluster) => {
      if (cluster.columns === 1) return blockCard(ctx, cluster.blocks[0].block, content, { compact: false });
      const columns = [];
      for (let c = 0; c < cluster.columns; c++) {
        columns.push(`<div class="tt-column">${cluster.blocks.filter((p) => p.column === c).map((p) => blockCard(ctx, p.block, content, { compact: true })).join('')}</div>`);
      }
      // Eventi contemporanei: uno accanto all'altro.
      return `<div class="tt-columns" style="--cols:${cluster.columns}">${columns.join('')}</div>`;
    }).join('')}</div>`;
  }).join('');
  return `<div class="stack gap-16">${header}${now}${unmatched}<div class="tt-list">${items}</div></div>`;
}

function badgesLine(badge) {
  const parts = [];
  if (badge.hasNote) parts.push(`<span>${icon('note', { cls: 'small' })}Nota</span>`);
  if (badge.attachmentCount) parts.push(`<span>${icon('paperclip', { cls: 'small' })}${badge.attachmentCount}</span>`);
  return parts.length ? `<div class="tt-badges">${parts.join('')}</div>` : '';
}

/**
 * Uno o più eventi uguali accostati: un blocco unico, diviso in righe. Come nell'app dalla 3.3, le
 * ore di un gruppo non hanno un separatore (prima una linea tratteggiata): la barretta della tinta
 * arriva al bordo tra un'ora e l'altra (`join-up`/`join-down`), così le ore formano una barra a
 * segmenti con 4 px di stacco, e ogni ora ha il suo orario a sinistra. In anteprima il blocco è una
 * pillola più piena nella tinta, con un'onda al posto della barretta e l'onda di luce (`draftSheen`).
 */
function blockCard(ctx, block, content, { compact }) {
  const store = ctx.model.timetable;
  const showsTests = ctx.prefs.timetableShowsTests;
  const day = content.day;
  const minute = isToday(day) && !content.isDraft ? TimeOfDay.of(new Date()) : null;
  const count = block.entries.length;
  const rows = block.entries.map((entry, index) => {
    const badge = content.badges.get(entry.id) ?? {};
    const isTest = showsTests && badge.isTest;
    const tint = entryColor(entry, store);
    const ongoing = minute != null && minute >= entry.start && minute < entry.end;
    const details = [entry.teacher, entry.room].filter(Boolean);
    if (!compact && duration(entry) !== 60) details.push(TimeOfDay.duration(duration(entry)));
    const attrs = `data-action="tt-open"${data({ id: entry.id, time: day.getTime() })}${content.isDraft ? '' : ` data-context="tt-entry"`}`;
    const joins = `${index ? 'follow join-up' : ''} ${index < count - 1 ? 'join-down' : ''}`;
    if (compact) {
      return `<button class="tt-entry compact ${joins}" style="--tint:${tint}" ${attrs}>
        <span class="tt-bar"></span><span class="tt-entry-body">
        <span class="tt-time">${timeRange(entry)}</span>
        <strong class="tt-title">${esc(displayTitle(entry))}</strong>
        ${isTest ? pill('Verifica', { cls: 'small bold' }) : ''}
        ${entry.teacher || entry.room ? `<span class="tt-details">${esc([entry.teacher, entry.room].filter(Boolean).join(' · '))}</span>` : ''}
        ${badgesLine(badge)}</span></button>`;
    }
    return `<button class="tt-entry ${joins}" style="--tint:${tint}" ${attrs}>
      <span class="tt-times"><strong class="numeral-mono">${TimeOfDay.string(entry.start)}</strong><small class="numeral-mono">${TimeOfDay.string(entry.end)}</small></span>
      <span class="tt-bar"></span>
      <span class="tt-entry-body"><span class="tt-title-row"><strong class="tt-title">${esc(displayTitle(entry))}</strong>${ongoing ? pill('In corso', { color: tint, filled: true, cls: 'bold' }) : ''}${isTest ? pill('Verifica', { cls: 'bold' }) : ''}</span>
      ${details.length ? `<span class="tt-details">${esc(details.join(' · '))}</span>` : ''}
      ${badgesLine(badge)}</span></button>`;
  }).join('');
  const draft = content.isDraft ? draftSheen(block.start) : '';
  return `<div class="tt-block ${content.isDraft ? 'draft' : ''}" style="--tint:${entryColor(block.entries[0], store)}${content.isDraft ? `;${draftDelay(block.start, content.layout.span)}` : ''}" data-key="blk-${block.id}">${rows}${draft}</div>`;
}

// MARK: - Anteprima della bozza

/**
 * Come nell'app (3.3, al posto del bordo tratteggiato): gli eventi dell'anteprima sono pillole
 * nella loro tinta, con un'onda di luce che scende lungo la giornata. La fase dipende dall'ora di
 * inizio (nell'app dalla posizione sullo schermo), così tutti gli eventi insieme sembrano una sola
 * onda: 3,4 s per passaggio, un evento un'ora più in basso la vede arrivare circa 0,14 s dopo.
 */
const SHEEN_PERIOD = 3.4;

function draftSheen(start) {
  const delay = (start / 420) % SHEEN_PERIOD - SHEEN_PERIOD;
  return `<span class="draft-sheen" style="animation-delay:${delay.toFixed(3)}s" aria-hidden="true"></span>`;
}

/** Comparsa a scaglioni lungo la giornata, come `draftBlock` nell'app (35 ms per ora). */
function draftDelay(start, span) {
  const index = Math.max(0, Math.round((start - (span?.start ?? start)) / 60));
  return `--draft-delay:${Math.min(index, 12) * 35}ms`;
}

/** Intervallo nella lista: una pillola con l'orario tra due linee ondulate, nello sfondo. */
function breakRow(ctx, entry, day, isDraft, span) {
  const tint = entryColor(entry, ctx.model.timetable);
  return `<button class="tt-break ${isDraft ? 'draft' : ''}" style="--tint:${tint}${isDraft ? `;${draftDelay(entry.start, span)}` : ''}" data-action="tt-open"${data({ id: entry.id, time: day.getTime() })}${isDraft ? '' : ' data-context="tt-entry"'} data-key="brk-${entry.id}">
    <span class="wavy-line"></span><span class="tt-break-label">${icon('coffeeFill', { cls: 'small' })}${esc(displayTitle(entry))} · ${timeRange(entry)}</span><span class="wavy-line"></span></button>`;
}

/** Verifica di Classeviva su una lezione (o senza lezione in orario), con Mostra/Nascondi. */
export function registerTestRow(store, test, { unmatched = false, hidden = false } = {}) {
  const reason = hidden ? store.hiddenReason(test, unmatched) : null;
  return `<div class="tt-test-row ${hidden ? 'hidden' : ''}">
    <span class="tt-test-icon">${icon('test')}</span>
    <div class="grow"><strong>${esc(test.title)}</strong>
      <p class="tt-test-notes">${esc(test.notes || 'Verifica')}</p>
      ${test.authorName ? `<p class="row-caption">Segnata da ${esc(test.authorName)} su Classeviva</p>` : ''}
      ${reason ? `<p class="row-caption">${esc(reason.description)}</p>` : ''}</div>
    <button class="btn text xs" data-action="tt-test-hide" data-id="${test.id}" data-hide="${hidden ? '0' : '1'}" data-unmatched="${unmatched ? '1' : '0'}"
      title="${hidden ? "Mostra di nuovo la verifica nell'orario" : "Nasconde la verifica dall'orario (resta su Classeviva)"}">${hidden ? 'Mostra' : 'Nascondi'}</button></div>`;
}

// MARK: - Barre: bozza, modifica, verifiche senza lezione

/**
 * Sopra l'anteprima (`TimetableDraftHeader` nell'app): da dove viene l'orario, con una forma che
 * ruota lentamente, nel contenitore terziario. Applica, Scarta e Rigenera stanno nella barra
 * degli strumenti in basso (`draftToolbar`). Con ore fuori dalle mezz'ore lo dice: applicando
 * l'orario passa all'allineamento libero.
 */
function draftHeader(ctx) {
  const store = ctx.model.timetable;
  const draft = store.draft;
  if (!draft) return '';
  const lessons = draft.entries.filter((e) => !isBreak(e)).length;
  return `<div class="tt-draft-header" data-key="tt-draft-header">
    <span class="tt-draft-art shaped">${shape('sunny')}${icon('wand')}</span>
    <div class="grow"><strong>Anteprima dell'orario</strong>
      <p>${plural(lessons, '1 lezione ricavata', '# lezioni ricavate')} da ${plural(draft.analyzedDays, '1 giorno', '# giorni')} di registro (${esc(fmt.shortDay(draft.from))} – ${esc(fmt.shortDay(draft.to))})</p>
      ${store.draftNeedsFreeAlignment ? "<p class=\"tt-draft-free\">Orari esatti: applicando, l'orario passa all'allineamento libero.</p>" : ''}</div></div>`;
}

/** Istruzioni della modifica (nel contenitore terziario): l'allineamento si sceglie nella barra degli strumenti. */
function editHint(ctx) {
  const alignment = ctx.model.timetable.alignment;
  const gestures = ctx.wide
    ? "Trascina per spostare (anche in un altro giorno), trascina il bordo in basso per la durata, doppio clic su un'ora vuota per aggiungere."
    : "Tieni premuto e trascina per spostare, trascina il bordo in basso per la durata, tocca due volte un'ora vuota per aggiungere.";
  const hint = alignment === 'automatic' ? "Scatti di mezz'ora, eventi da 30 minuti o un'ora." : "Scatti di 5 minuti; orari esatti dall'evento.";
  return `<div class="tt-edit-bar">${icon(Alignment[alignment].icon)}<div><strong>${esc(Alignment[alignment].title)}</strong><p>${esc(`${gestures} ${hint}`)}</p></div></div>`;
}

function unmatchedText(tests) {
  return tests.length === 1 ? `1 verifica senza lezione in orario: ${tests[0].title}` : `${tests.length} verifiche senza lezione in orario`;
}

function unmatchedCapsule(tests) {
  return `<div class="tt-unmatched-capsule">${icon('alertTriangle', { cls: 'small' })}<span>${esc(unmatchedText(tests))}</span></div>`;
}

function unmatchedBanner(tests) {
  return statusBanner(unmatchedText(tests), 'alertTriangle');
}

// MARK: - Giornata a ore (vista Giorno / Settimana)

/** Dopo il disegno la giornata scorre a mezz'ora prima della prima lezione (senza colorare la barra). */
function scheduleHourScroll(ctx, days) {
  const s = ttState(ctx);
  if (!s.scrollToHour) return;
  s.scrollToHour = false;
  const starts = days.map((d) => dayContent(ctx.model, d, { splitAtBreaks: false }).layout.span?.start).filter((v) => v != null);
  const hour = starts.length ? Math.max(0, Math.floor((Math.min(...starts) - 30) / 60)) : 7;
  const hh = hourHeight(ctx);
  ctx.afterRender((root) => {
    const scroller = ctx.wide ? root.querySelector('.page.active .timeline-scroll') : root.querySelector('.page.active .page-scroll');
    const grid = scroller?.querySelector('.tt-grid');
    if (!grid) return;
    const offset = grid.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
    ctx.scrollQuietly(scroller, Math.max(0, offset + hour * hh - 8));
  });
}

function timeline(ctx, days, selected) {
  const store = ctx.model.timetable;
  const s = ttState(ctx);
  const hh = hourHeight(ctx);
  const canEdit = s.editing && !store.draft;
  const multiple = days.length > 1;
  const header = multiple ? `<div class="tt-days-head"><span class="tt-gutter"></span>${days.map((day) => {
    const isSel = isSameDay(day, selected);
    return `<button class="tt-day-head ${isSel ? 'selected' : ''} ${isToday(day) ? 'today' : ''}" data-action="tt-select" data-time="${day.getTime()}">
      <span>${esc(fmt.weekdayShort(day))}</span><span class="tt-day-num numeral">${day.getDate()}</span></button>`;
  }).join('')}</div>` : '';
  const now = new Date();
  const showsNow = days.some((d) => isToday(d));
  const nowMinutes = TimeOfDay.of(now);
  const hours = [];
  for (let h = 0; h < 24; h++) {
    // L'ora coperta dall'etichetta di adesso (alta 18 px) si toglie: prima ne spuntava mezza sotto.
    const covered = showsNow && Math.abs((nowMinutes / 60) * hh - h * hh) < 17;
    hours.push(`<div class="tt-hour" style="top:${h * hh}px">${covered ? '' : `<span class="numeral-mono">${String(h).padStart(2, '0')}:00</span>`}</div>`);
  }
  const columns = days.map((day, dayIndex) => dayColumn(ctx, day, dayIndex, days.length, { canEdit, multiple, selected, hh })).join('');
  const nowLine = showsNow ? `<div class="tt-now" style="top:${(nowMinutes / 60) * hh}px"><span class="tt-now-label numeral-mono">${TimeOfDay.string(nowMinutes)}</span></div>` : '';
  const grid = `<div class="tt-grid ${canEdit ? 'editing' : ''}" style="--hh:${hh}px;height:${24 * hh}px" data-days="${days.length}">
    ${hours.join('')}<div class="tt-cols">${columns}</div>${nowLine}</div>`;
  const inner = `${header}${grid}`;
  if (ctx.wide) return `<div class="tt-timeline">${header}<div class="timeline-scroll" data-scroll="timeline" data-bar-ignore>${grid}</div></div>`;
  return `<div class="tt-timeline mobile ${canEdit ? 'editing' : ''}">${inner}</div>`;
}

function dayColumn(ctx, day, dayIndex, count, { canEdit, multiple, selected, hh }) {
  const store = ctx.model.timetable;
  const content = dayContent(ctx.model, day, { splitAtBreaks: false });
  const isSel = isSameDay(day, selected);
  const segments = [];
  for (const cluster of content.layout.clusters) {
    for (const placed of cluster.blocks) {
      placed.block.entries.forEach((entry, index) => {
        segments.push(segment(ctx, entry, content, {
          blockStart: placed.block.start,
          left: `calc(${(placed.column / cluster.columns) * 100}% + 2px)`,
          width: `calc(${100 / cluster.columns}% - 4px)`,
          roundsTop: index === 0, roundsBottom: index === placed.block.entries.length - 1,
          dayIndex, canEdit, hh,
        }));
      });
    }
  }
  for (const entry of content.layout.breaks) {
    segments.push(segment(ctx, entry, content, { left: '8px', width: 'calc(100% - 12px)', roundsTop: true, roundsBottom: true, dayIndex, canEdit, hh }));
  }
  let empty = '';
  if (!content.entries.length && count === 1) {
    const hint = canEdit
      ? (ctx.wide ? "Fai doppio clic su un'ora per aggiungere un evento." : "Tocca due volte un'ora per aggiungere un evento.")
      : 'Aggiungi eventi con + o da Modifica orario.';
    empty = `<div class="tt-col-empty" style="top:${8 * hh}px"><strong>Nessuna lezione ${Weekday.withArticle(Weekday.of(day))}</strong><span>${esc(hint)}</span></div>`;
  }
  void store;
  return `<div class="tt-col ${multiple && isSel ? 'selected' : ''} ${content.isDraft ? 'draft' : ''}" data-day-index="${dayIndex}" data-time="${day.getTime()}"${canEdit ? ' data-dblclick="tt-col-dbl"' : ''}>${segments.join('')}${empty}</div>`;
}

function segment(ctx, entry, content, { left, width, roundsTop, roundsBottom, dayIndex, canEdit, hh, blockStart = entry.start }) {
  const store = ctx.model.timetable;
  const badge = content.badges.get(entry.id) ?? {};
  const tint = entryColor(entry, store);
  const top = (entry.start / 60) * hh;
  // 2 px di spazio sotto ogni blocco, anche tra le ore di un gruppo.
  const height = Math.max(isBreak(entry) ? 10 : 16, (duration(entry) / 60) * hh - 2);
  const title = displayTitle(entry);
  let label;
  const icons = `${badge.isTest ? `<span class="tt-seg-test">${icon('test', { cls: 'small' })}</span>` : ''}`;
  if (height >= 34) {
    label = `<span class="tt-seg-title ${height >= 70 ? 'two' : ''}"><span class="tt-seg-name">${esc(title)}</span>${icons}</span>
      <span class="tt-seg-time numeral-mono">${timeRange(entry)}${entry.room ? ` · ${esc(entry.room)}` : ''}</span>
      ${badge.isTest && height >= 52 ? '<span class="tt-seg-pill">Verifica</span>' : ''}`;
  } else {
    label = `<span class="tt-seg-line"><span class="tt-seg-title"><span class="tt-seg-name">${esc(title)}</span></span><span class="tt-seg-time numeral-mono">${timeRange(entry)}</span>${icons}</span>`;
  }
  const cls = ['tt-seg', isBreak(entry) ? 'break' : 'lesson', roundsTop ? 'rt' : 'follow', roundsBottom ? 'rb' : '', content.isDraft ? 'draft' : ''].join(' ');
  const attrs = data({ id: entry.id, time: content.day.getTime(), dayIndex });
  // In anteprima: comparsa a scaglioni (un'ora dopo l'altra, come nell'app), onda di luce e onda
  // sul bordo al posto del colore pieno.
  const draft = content.isDraft ? `;--draft-delay:${(Math.floor(blockStart / 60) % 12) * 35}ms` : '';
  const decor = content.isDraft && !isBreak(entry) ? `${draftSheen(entry.start)}<span class="tt-seg-wave" aria-hidden="true"></span>` : '';
  // In modifica niente menu tenendo premuto (come nell'app): col dito si apriva sopra il
  // trascinamento appena cominciato, che restava attivo senza vedersi.
  return `<button class="${cls}" style="--tint:${tint};top:${top}px;height:${height}px;left:${left};width:${width}${draft}" data-action="tt-open"${attrs}${content.isDraft || canEdit ? '' : ' data-context="tt-entry"'}${canEdit ? ' data-seg="1"' : ''} aria-label="${esc(`${title}, ${timeRange(entry)}`)}" data-key="seg-${entry.id}">
    ${decor}${label}${canEdit ? '<span class="tt-resize" data-resize="1"><i></i></span>' : ''}</button>`;
}

/** Doppio tocco/clic su un'ora vuota in modifica: nuovo evento a quell'ora. */
function createAt(ctx, el, event) {
  const store = ctx.model.timetable;
  if (!ttState(ctx).editing || store.draft) return;
  if (event?.target?.closest?.('.tt-seg')) return;
  const col = el.closest?.('.tt-col') ?? el;
  const rect = col.getBoundingClientRect();
  const y = (event?.clientY ?? rect.top) - rect.top;
  const hh = hourHeight(ctx);
  let minute = TimeOfDay.snapped(Math.trunc((y / hh) * 60) - 15, 30);
  minute = Math.min(Math.max(0, minute), 23 * 60 + 30);
  const day = new Date(Number(col.dataset.time));
  ctx.openSheet(editorSheet(ctx, { weekday: Weekday.of(day), start: minute, kind: 'lesson' }));
}

// MARK: - Trascinamento in modifica

/**
 * Gesti della modalità di modifica: spostare (anche in un altro giorno nella settimana) e
 * allungare dal bordo in basso. Con il mouse il trascinamento parte subito; con il dito
 * dopo una pressione prolungata, così lo scorrimento della pagina resta libero.
 */
const drag = { active: null };

function previewFor(entry, alignment, moveY, resizeY, moveX, info) {
  const step = isBreak(entry) ? 5 : Alignment[alignment].dragStep;
  const isAutomatic = !isBreak(entry) && alignment === 'automatic';
  let start = entry.start;
  let end = entry.end;
  const moveMinutes = (moveY / info.hh) * 60;
  if (Math.abs(moveMinutes) >= step / 2) {
    start = TimeOfDay.snapped(entry.start + roundHalfAway(moveMinutes), step);
    start = Math.min(Math.max(0, start), 1440 - duration(entry));
    end = start + duration(entry);
  }
  const resizeMinutes = (resizeY / info.hh) * 60;
  if (Math.abs(resizeMinutes) >= step / 2) {
    let length = duration(entry) + roundHalfAway(resizeMinutes);
    length = isAutomatic ? (length < 45 ? 30 : 60) : Math.max(5, TimeOfDay.snapped(length, 5));
    end = Math.min(1440, start + length);
  }
  let dayShift = 0;
  if (info.days > 1 && info.dayWidth > 0) {
    dayShift = roundHalfAway(moveX / info.dayWidth);
    dayShift = Math.min(Math.max(dayShift, -info.dayIndex), info.days - 1 - info.dayIndex);
  }
  return { start, end, dayShift };
}

function beginDrag(seg, x, y, resize) {
  const app = window.bcw;
  const store = app.model.timetable;
  const entry = store.entry(seg.dataset.id);
  if (!entry) return null;
  const grid = seg.closest('.tt-grid');
  const col = seg.closest('.tt-col');
  const days = Number(grid.dataset.days);
  const hh = parseFloat(getComputedStyle(grid).getPropertyValue('--hh')) || 52;
  seg.classList.add('dragging');
  const capsule = document.createElement('span');
  capsule.className = 'tt-drag-capsule';
  seg.appendChild(capsule);
  return {
    seg, entry, x, y, resize, capsule, moved: false, lastStart: entry.start,
    info: { hh, days, dayIndex: Number(seg.dataset.dayIndex), dayWidth: col.getBoundingClientRect().width },
    preview: { start: entry.start, end: entry.end, dayShift: 0 },
  };
}

function updateDrag(state, x, y) {
  const dx = x - state.x;
  const dy = y - state.y;
  if (Math.abs(dx) >= 4 || Math.abs(dy) >= 4) state.moved = true;
  const app = window.bcw;
  const alignment = app.model.timetable.alignment;
  const p = state.resize
    ? previewFor(state.entry, alignment, 0, dy, 0, state.info)
    : previewFor(state.entry, alignment, dy, 0, dx, state.info);
  state.preview = p;
  const hh = state.info.hh;
  state.seg.style.top = `${(p.start / 60) * hh}px`;
  state.seg.style.height = `${Math.max(16, ((p.end - p.start) / 60) * hh)}px`;
  state.seg.style.transform = p.dayShift ? `translateX(${p.dayShift * state.info.dayWidth}px) scale(1.02)` : 'scale(1.02)';
  const dayName = p.dayShift ? ` · ${Weekday.shortName(((state.entry.weekday - 1 + p.dayShift + 7) % 7) + 1).toLocaleLowerCase('it-IT')}` : '';
  state.capsule.textContent = `${TimeOfDay.string(p.start)}–${TimeOfDay.string(p.end)}${dayName}`;
  if (p.start !== state.lastStart) {
    state.lastStart = p.start;
    navigator.vibrate?.(3);
  }
}

function endDrag(state, commit) {
  const app = window.bcw;
  const store = app.model.timetable;
  state.capsule.remove();
  state.seg.classList.remove('dragging');
  state.seg.style.transform = '';
  if (!commit) {
    app.update();
    return;
  }
  const { start, end, dayShift } = state.preview;
  const weekday = ((state.entry.weekday - 1 + dayShift + 7) % 7) + 1;
  store.move(state.entry.id, weekday, start, end);
  app.update();
}

let touchTimer = null;
// Dopo un trascinamento il clic che segue subito (con il mouse c'è sempre, col dito di solito
// no) non apre l'editor. Vale per poco: prima restava in attesa e, col dito, mangiava il tocco
// successivo su un altro evento, che così non si apriva.
let suppressClicksUntil = 0;
const suppressClickAfter = (moved) => { suppressClicksUntil = moved ? performance.now() + 400 : 0; };

document.addEventListener('pointerdown', (event) => {
  if (event.pointerType === 'touch' || event.button !== 0) return;
  const seg = event.target.closest?.('.tt-seg[data-seg]');
  if (!seg) return;
  drag.pending = { seg, x: event.clientX, y: event.clientY, resize: !!event.target.closest('[data-resize]') };
});

document.addEventListener('pointermove', (event) => {
  if (event.pointerType === 'touch') return;
  if (drag.pending && !drag.active) {
    const { seg, x, y, resize } = drag.pending;
    if (Math.hypot(event.clientX - x, event.clientY - y) >= (resize ? 1 : 3)) {
      drag.active = beginDrag(seg, x, y, resize);
      drag.pending = null;
    }
  }
  if (drag.active) {
    event.preventDefault();
    updateDrag(drag.active, event.clientX, event.clientY);
  }
});

document.addEventListener('pointerup', () => {
  drag.pending = null;
  if (!drag.active) return;
  const state = drag.active;
  drag.active = null;
  suppressClickAfter(state.moved);
  endDrag(state, state.moved);
});

document.addEventListener('touchstart', (event) => {
  const seg = event.target.closest?.('.tt-seg[data-seg]');
  if (!seg || event.touches.length > 1) return;
  const touch = event.touches[0];
  const resize = !!event.target.closest('[data-resize]');
  const start = { x: touch.clientX, y: touch.clientY };
  drag.touchStart = start;
  clearTimeout(touchTimer);
  touchTimer = setTimeout(() => {
    drag.active = beginDrag(seg, start.x, start.y, resize);
    navigator.vibrate?.(10);
  }, resize ? 100 : 200);
}, { passive: true });

document.addEventListener('touchmove', (event) => {
  const touch = event.touches[0];
  if (!drag.active) {
    if (drag.touchStart && Math.hypot(touch.clientX - drag.touchStart.x, touch.clientY - drag.touchStart.y) > 12) {
      clearTimeout(touchTimer);
      drag.touchStart = null;
    }
    return;
  }
  event.preventDefault();
  updateDrag(drag.active, touch.clientX, touch.clientY);
}, { passive: false });

document.addEventListener('touchend', () => {
  clearTimeout(touchTimer);
  drag.touchStart = null;
  if (!drag.active) return;
  const state = drag.active;
  drag.active = null;
  // Lasciando senza essersi spostati si apre l'editor dell'evento.
  suppressClickAfter(state.moved);
  endDrag(state, state.moved);
});

// Tocco interrotto dal sistema: l'evento torna dov'era. Prima il trascinamento restava attivo
// (o partiva comunque allo scadere della pressione prolungata) e il tocco successivo, anche solo
// per scorrere, spostava l'evento e lo salvava dove finiva il dito.
document.addEventListener('touchcancel', () => {
  clearTimeout(touchTimer);
  drag.touchStart = null;
  if (!drag.active) return;
  const state = drag.active;
  drag.active = null;
  endDrag(state, false);
});

document.addEventListener('click', (event) => {
  if (performance.now() > suppressClicksUntil) return;
  suppressClicksUntil = 0;
  if (event.target.closest?.('.tt-seg')) {
    event.preventDefault();
    event.stopPropagation();
  }
}, true);

// Doppio tocco su un'ora vuota (sul telefono non c'è il doppio clic).
let lastTap = null;
document.addEventListener('touchend', (event) => {
  const col = event.target.closest?.('.tt-col[data-dblclick]');
  if (!col || event.target.closest('.tt-seg')) {
    lastTap = null;
    return;
  }
  const touch = event.changedTouches[0];
  const now = Date.now();
  if (lastTap && now - lastTap.time < 320 && Math.hypot(touch.clientX - lastTap.x, touch.clientY - lastTap.y) < 30) {
    lastTap = null;
    event.preventDefault();
    col.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, clientX: touch.clientX, clientY: touch.clientY }));
    return;
  }
  lastTap = { time: now, x: touch.clientX, y: touch.clientY };
});

export { select as selectTimetableDay, isTomorrow, isYesterday, TimetableMode };
