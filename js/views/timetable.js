// Orario: la settimana dell'utente in tre viste (Lista, Calendario, Giorno), con le verifiche
// di Classeviva sulle lezioni, la modalità Modifica orario (trascinare, allungare, doppio
// tocco per creare), la bozza generata dalle lezioni e i colori delle palette.

import {
  card, chevron, eyebrow, pill, emptyState, button, iconButton, segmented, wavyLine, statusBanner,
} from '../components.js';
import { icon } from '../icons.js';
import { data } from '../dom.js';
import {
  addDays, addMonths, dayKey, esc, fmt, isSameDay, isToday, isTomorrow, isYesterday, isWeekend, startOfDay, startOfMonth, startOfWeek,
} from '../util.js';
import {
  Alignment, TimeOfDay, TimetableMode, Weekday, alignedPieces, dayContent, displayTitle, duration, entryColor, isBreak,
  roundHalfAway, timeRange,
} from '../timetable.js';
import { weekStrip, monthCalendar, WEEK_FULL, STRIP } from './dashboard.js';
import {
  detailSheet, editorSheet, generatorSheet, hiddenTestsSheet, seriesSheet, deleteEntryDialog, timetableSheetActions,
} from './timetable-sheets.js';

// MARK: - Stato

export function ttState(ctx) {
  return ctx.state('timetable', () => ({
    selected: startOfDay(new Date()), month: startOfMonth(new Date()), editing: false, initialized: false,
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
  if (startOfMonth(target).getTime() !== s.month.getTime()) s.monthDir = Math.sign(startOfMonth(target) - s.month);
  s.selected = target;
  s.month = startOfMonth(target);
  s.scrollToHour = true;
}

/** Vista effettiva: in modifica sempre Giorno; sui telefoni niente Calendario. */
function effectiveMode(ctx) {
  const s = ttState(ctx);
  if (s.editing) return 'day';
  const mode = ctx.prefs.get('timetableMode');
  if (!ctx.wide && mode === 'calendar') return 'list';
  return TimetableMode[mode] ? mode : 'list';
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

export const timetable = {
  title: 'Orario',

  render(ctx) {
    const model = ctx.model;
    const store = model.timetable;
    const s = ttState(ctx);
    if (!s.initialized) {
      s.initialized = true;
      // Nel fine settimana senza lezioni si parte dal lunedì dopo.
      const today = startOfDay(new Date());
      if (isWeekend(today) && !store.entriesOn(today).length && !store.isEmpty) {
        s.selected = addDays(startOfWeek(today), 7);
        s.month = startOfMonth(s.selected);
      }
    }
    if (store.draft && s.editing) s.editing = false;
    const mode = effectiveMode(ctx);
    const day = s.selected;
    const isDraft = !!store.draft;

    const actions = [];
    if (!isToday(day)) actions.push({ text: 'Oggi', action: 'tt-today', help: 'Vai a oggi (Alt+T)' });
    if (ctx.wide && !s.editing) {
      actions.push({ html: `<div class="bar-segmented" title="Vista: lista, calendario o settimana">${segmented([
        ['list', 'Lista', 'list'], ['calendar', 'Calendario', 'calendar'], ['day', 'Settimana', 'dayView'],
      ], ctx.prefs.get('timetableMode'), 'tt-mode', { compact: true, icons: true })}</div>` });
    }
    if (ctx.wide) actions.push({ icon: 'plus', label: 'Nuovo evento', help: 'Nuovo evento (Alt+N)', action: 'tt-new', disabled: isDraft });
    if (s.editing) actions.push({ text: 'Fine', prominent: true, icon: 'check', action: 'tt-done', help: "Esci dalla modifica dell'orario (↩)" });
    else actions.push({ icon: 'moreH', label: "Opzioni dell'orario", help: 'Modifica, colori e generazione', action: 'tt-menu' });

    const title = s.editing ? (ctx.wide ? 'Modifica orario' : 'Modifica') : 'Orario';
    const content = dayContent(model, day, { splitAtBreaks: mode !== 'day' });
    const extras = draftBanner(ctx) + (s.editing ? editBar(ctx) : '');

    if (ctx.wide) {
      return { title, subtitle: fmt.longDay(day), actions, ...wideLayout(ctx, mode, content, extras) };
    }

    // Telefoni: settimana galleggiante sopra il giorno (Lista) o la sua giornata (Giorno).
    const header = weekStrip(ctx, s, { action: 'tt-select', shiftAction: 'tt-week-shift', floating: true });
    let body;
    if (mode === 'day') {
      const capsule = content.unmatchedTests.length ? unmatchedCapsule(content.unmatchedTests) : '';
      body = `<div class="tt-extras sticky">${extras}${capsule}</div>${timeline(ctx, [day], day)}`;
      scheduleHourScroll(ctx, [day], header.floating);
    } else {
      body = `${extras ? `<div class="tt-extras">${extras}</div>` : ''}<div class="day-swipe" data-day-swipe="tt-day-shift"><div class="day-transition dir-${s.dir}" data-key="ttd-${dayKey(day)}">${dayList(ctx, content)}</div></div>`;
    }
    return {
      title,
      actions,
      floating: header.floating,
      body,
      fab: s.editing || isDraft ? null : { icon: 'plus', label: 'Nuovo evento', action: 'tt-new' },
      refresh: () => model.refreshAll(),
    };
  },

  /** Nuovo tocco sulla scheda: oggi, con la settimana intera. */
  reselect(ctx) {
    select(ctx, new Date());
    ctx.expandCalendar();
  },

  actions: {
    ...timetableSheetActions,
    'tt-select': (ctx, el) => select(ctx, new Date(Number(el.dataset.time))),
    'tt-today': (ctx) => select(ctx, new Date()),
    'tt-day-shift': (ctx, el) => {
      if (ttState(ctx).editing) return;
      select(ctx, addDays(ttState(ctx).selected, Number(el.dataset.delta)));
    },
    'tt-week-shift': (ctx, el) => select(ctx, addDays(ttState(ctx).selected, 7 * Number(el.dataset.delta))),
    'tt-month-shift': (ctx, el) => {
      const s = ttState(ctx);
      s.month = addMonths(s.month, Number(el.dataset.delta));
      s.monthDir = Number(el.dataset.delta);
    },
    'tt-mode': (ctx, el) => {
      ctx.prefs.set('timetableMode', el.dataset.value ?? el.value);
      ttState(ctx).scrollToHour = true;
    },
    'tt-new': (ctx) => {
      if (ctx.model.timetable.draft) return;
      ctx.openSheet(editorSheet(ctx, { weekday: Weekday.of(ttState(ctx).selected), kind: 'lesson' }));
    },
    'tt-new-break': (ctx) => ctx.openSheet(editorSheet(ctx, { weekday: Weekday.of(ttState(ctx).selected), kind: 'breakTime' })),
    'tt-done': (ctx) => { ttState(ctx).editing = false; },
    'tt-edit': (ctx) => {
      const s = ttState(ctx);
      s.editing = true;
      s.scrollToHour = true;
    },
    'tt-generate': (ctx) => ctx.openSheet(generatorSheet(ctx)),
    'tt-hidden-tests': (ctx) => ctx.openSheet(hiddenTestsSheet(ctx)),
    'tt-series': (ctx, el) => {
      const weekday = el?.dataset?.weekday ? Number(el.dataset.weekday) : Weekday.of(ttState(ctx).selected);
      ctx.openSheet(seriesSheet(ctx, weekday));
    },
    'tt-menu': (ctx, el) => {
      const store = ctx.model.timetable;
      const prefs = ctx.prefs;
      const isDraft = !!store.draft;
      const items = [
        { label: 'Modifica orario', icon: 'alignFree', disabled: isDraft, run: () => ctx.run('tt-edit') },
        { divider: true },
      ];
      if (!ctx.wide) {
        items.push({ section: 'Vista' });
        for (const mode of ['list', 'day']) {
          items.push({ label: TimetableMode[mode].title, icon: TimetableMode[mode].icon, checked: effectiveMode(ctx) === mode,
            run: () => { prefs.set('timetableMode', mode); ttState(ctx).scrollToHour = true; ctx.pageScroller()?.scrollTo({ top: 0 }); } });
        }
      }
      items.push({ label: 'Mostra le verifiche', icon: 'test', checked: prefs.timetableShowsTests, run: () => prefs.set('timetableShowsTests', !prefs.timetableShowsTests) });
      items.push({ label: 'Verifiche nascoste…', icon: 'eyeOff', run: () => ctx.run('tt-hidden-tests') });
      items.push({ divider: true });
      items.push({ label: 'Nuovo intervallo', icon: 'coffee', disabled: isDraft, run: () => ctx.run('tt-new-break') });
      items.push({ label: 'Colora una giornata…', icon: 'palette', disabled: store.isEmpty || isDraft, run: () => ctx.run('tt-series') });
      items.push({ divider: true });
      items.push({ label: 'Genera dalle lezioni registrate…', icon: 'wand', run: () => ctx.run('tt-generate') });
      ctx.openMenu(el, items);
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

function wideLayout(ctx, mode, content, extras) {
  const s = ttState(ctx);
  const day = s.selected;
  if (mode === 'day') {
    const twoColumns = ctx.mainWidth >= 780;
    const days = twoColumns ? weekDays(ctx, day) : [day];
    const unmatched = content.unmatchedTests.length ? unmatchedBanner(content.unmatchedTests) : '';
    const timelineCard = `<div class="card tt-timeline-card">${timeline(ctx, days, day)}</div>`;
    scheduleHourScroll(ctx, days, null);
    if (twoColumns) {
      return {
        full: `<div class="tt-split">
          <div class="tt-side" data-scroll="side"><div class="column">${monthCalendar(ctx, s, { action: 'tt-select', shiftAction: 'tt-month-shift' })}${weekOverview(ctx)}</div></div>
          <div class="tt-main"><div class="tt-main-head">${extras}${unmatched}</div>${timelineCard}</div></div>`,
      };
    }
    return {
      full: `<div class="tt-split single"><div class="tt-main"><div class="tt-main-head">${weekStrip(ctx, s, { action: 'tt-select', shiftAction: 'tt-week-shift' })}${extras}${unmatched}</div>${timelineCard}</div></div>`,
    };
  }
  const side = (mode === 'calendar'
    ? monthCalendar(ctx, s, { action: 'tt-select', shiftAction: 'tt-month-shift' })
    : weekStrip(ctx, s, { action: 'tt-select', shiftAction: 'tt-week-shift' })) + (ctx.splitWide ? weekOverview(ctx) : '');
  return {
    split: {
      sideWidth: 360,
      side,
      main: `${extras}<div class="day-transition dir-${s.dir}" data-key="ttd-${dayKey(day)}">${dayList(ctx, content)}</div>`,
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
    rows.push(`<button class="tt-week-row ${selected ? 'selected' : ''} ${content.isDraft ? 'draft' : ''}" data-action="tt-select" data-time="${day.getTime()}">
      <span class="grow"><strong>${esc(fmt.weekdayLongDay(day))}${showsTests && content.testCount ? ` <span class="tt-test-mark">${icon('test')}</span>` : ''}</strong>
      <small>${span ? `${lessons} lezioni · ${TimeOfDay.string(span.start)}–${TimeOfDay.string(span.end)}` : 'Nessuna lezione'}</small></span>
      <span class="tt-bars">${bars}</span></button>`);
  }
  return `<div class="stack gap-8">${eyebrow('Settimana')}<div class="card tt-week" style="--pad:0px">${rows.join('<hr class="divider">')}</div></div>`;
}

// MARK: - Lista della giornata

function lessonsCount(n) { return n === 1 ? '1 lezione' : `${n} lezioni`; }

export function dayList(ctx, content) {
  const store = ctx.model.timetable;
  const model = ctx.model;
  const day = content.day;
  const showsTests = ctx.prefs.timetableShowsTests;
  const lessons = content.entries.filter((e) => !isBreak(e)).length;
  const parts = [];
  if (lessons) parts.push(lessonsCount(lessons));
  if (content.layout.span) parts.push(`${TimeOfDay.string(content.layout.span.start)}–${TimeOfDay.string(content.layout.span.end)}`);
  if (showsTests && content.testCount) parts.push(content.testCount === 1 ? '1 verifica' : `${content.testCount} verifiche`);
  if (model.calendarStatus(day)?.isHoliday) parts.push('Giorno di vacanza');
  const header = `<div class="day-header"><h2>${esc(fmt.longDay(day))}</h2>${parts.length ? `<p>${esc(parts.join(' · '))}</p>` : ''}</div>`;

  let unmatched = '';
  if (showsTests && content.unmatchedTests.length) {
    unmatched = card(`<div class="stack gap-12"><span class="label-line secondary">${icon('alertTriangle')}Verifiche senza lezione in orario</span>
      ${content.unmatchedTests.map((t) => registerTestRow(store, t, { unmatched: true })).join('<hr class="divider">')}</div>`);
  }

  if (!content.entries.length) {
    const weekend = isWeekend(day);
    const text = store.isEmpty
      ? "Aggiungi le materie a mano o crea una bozza dell'orario dalle lezioni registrate."
      : 'Aggiungi un evento per questo giorno della settimana.';
    const actions = content.isDraft ? '' : button('Aggiungi', { action: 'tt-new', iconName: 'plus', style: 'tonal' }) +
      (store.isEmpty ? button('Genera', { action: 'tt-generate', iconName: 'wand', style: 'filled' }) : '');
    return `<div class="stack gap-12">${header}${unmatched}${card(emptyState(`Nessuna lezione il ${Weekday.lower(Weekday.of(day))}`, weekend ? 'sun' : 'calendarPlus', text, actions), { cls: 'tt-empty' })}</div>`;
  }

  const items = content.layout.listItems.map((item) => {
    if (item.type === 'pause') return breakRow(ctx, item.entry, day, content.isDraft);
    if (item.type === 'gap') {
      return `<div class="tt-gap"><hr><span>Libero · ${esc(TimeOfDay.duration(item.end - item.start))}</span><hr></div>`;
    }
    const cluster = item.cluster;
    if (cluster.columns === 1) return blockCard(ctx, cluster.blocks[0].block, content, { compact: false });
    const columns = [];
    for (let c = 0; c < cluster.columns; c++) {
      columns.push(`<div class="tt-column">${cluster.blocks.filter((p) => p.column === c).map((p) => blockCard(ctx, p.block, content, { compact: true })).join('')}</div>`);
    }
    return `<div class="tt-columns" style="--cols:${cluster.columns}">${columns.join('')}</div>`;
  }).join('');
  return `<div class="stack gap-12">${header}${unmatched}<div class="tt-list">${items}</div></div>`;
}

function badgesLine(badge) {
  const parts = [];
  if (badge.hasNote) parts.push(`<span>${icon('note', { cls: 'small' })}Nota</span>`);
  if (badge.attachmentCount) parts.push(`<span>${icon('paperclip', { cls: 'small' })}${badge.attachmentCount}</span>`);
  return parts.length ? `<div class="tt-badges">${parts.join('')}</div>` : '';
}

function blockCard(ctx, block, content, { compact }) {
  const store = ctx.model.timetable;
  const showsTests = ctx.prefs.timetableShowsTests;
  const day = content.day;
  const rows = block.entries.map((entry, index) => {
    const badge = content.badges.get(entry.id) ?? {};
    const isTest = showsTests && badge.isTest;
    const tint = entryColor(entry, store);
    const details = [entry.teacher, entry.room].filter(Boolean);
    if (!compact && duration(entry) !== 60) details.push(TimeOfDay.duration(duration(entry)));
    const attrs = `data-action="tt-open"${data({ id: entry.id, time: day.getTime() })}${content.isDraft ? '' : ` data-context="tt-entry"`}`;
    if (compact) {
      return `<button class="tt-entry compact ${index ? 'follow' : ''}" style="--tint:${tint}" ${attrs}>
        <span class="tt-bar"></span><span class="tt-entry-body">
        <span class="tt-time">${timeRange(entry)}</span>
        <strong class="tt-title">${esc(displayTitle(entry))}</strong>
        ${isTest ? pill('Verifica', { cls: 'small bold' }) : ''}
        ${entry.teacher || entry.room ? `<span class="tt-details">${esc([entry.teacher, entry.room].filter(Boolean).join(' · '))}</span>` : ''}
        ${badgesLine(badge)}</span></button>`;
    }
    return `<button class="tt-entry ${index ? 'follow' : ''}" style="--tint:${tint}" ${attrs}>
      <span class="tt-times"><strong class="numeral-mono">${TimeOfDay.string(entry.start)}</strong><small class="numeral-mono">${TimeOfDay.string(entry.end)}</small></span>
      <span class="tt-bar"></span>
      <span class="tt-entry-body"><span class="tt-title-row"><strong class="tt-title">${esc(displayTitle(entry))}</strong>${isTest ? pill('Verifica', { cls: 'bold' }) : ''}</span>
      ${details.length ? `<span class="tt-details">${esc(details.join(' · '))}</span>` : ''}
      ${badgesLine(badge)}</span></button>`;
  }).join('');
  return `<div class="tt-block ${content.isDraft ? 'draft' : ''}" style="--tint:${entryColor(block.entries[0], store)}" data-key="blk-${block.id}">${rows}</div>`;
}

function breakRow(ctx, entry, day, isDraft) {
  const tint = entryColor(entry, ctx.model.timetable);
  return `<button class="tt-break ${isDraft ? 'draft' : ''}" style="--tint:${tint}" data-action="tt-open"${data({ id: entry.id, time: day.getTime() })}${isDraft ? '' : ' data-context="tt-entry"'} data-key="brk-${entry.id}">
    ${wavyLine()}<span class="tt-break-label">${icon('coffeeFill', { cls: 'small' })}${esc(displayTitle(entry))} · ${timeRange(entry)}</span>${wavyLine()}</button>`;
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

function draftBanner(ctx) {
  const draft = ctx.model.timetable.draft;
  if (!draft) return '';
  const lessons = draft.entries.filter((e) => !isBreak(e)).length;
  return `<div class="tt-draft-banner">
    <div class="row gap-12 align-start"><span class="tt-draft-icon">${icon('wand')}</span>
      <div class="grow"><strong>Anteprima dell'orario generato</strong>
      <p>${lessons} lezioni ricavate da ${draft.analyzedDays} giorni di registro (${esc(fmt.shortDay(draft.from))} – ${esc(fmt.shortDay(draft.to))}). Controllale prima di applicarle.</p></div></div>
    <div class="row gap-8">${button('Applica', { action: 'tt-draft-apply', iconName: 'check', style: 'filled', cls: 'xs' })}
      ${button('Scarta', { action: 'tt-draft-discard', iconName: 'x', style: 'tonal', cls: 'xs' })}<span class="flex"></span>
      ${iconButton('tune', { action: 'tt-generate', label: 'Cambia le impostazioni e rigenera', cls: 'small tonal' })}</div></div>`;
}

function editBar(ctx) {
  const store = ctx.model.timetable;
  const alignment = store.alignment;
  const gestures = ctx.wide
    ? "Trascina per spostare (anche in un altro giorno), trascina il bordo in basso per la durata, doppio clic su un'ora vuota per aggiungere."
    : "Tieni premuto e trascina per spostare, trascina il bordo in basso per la durata, tocca due volte un'ora vuota per aggiungere.";
  const hint = alignment === 'automatic' ? "Scatti di mezz'ora, eventi da 30 minuti o un'ora." : "Scatti di 5 minuti; orari esatti dall'evento.";
  return `<div class="tt-edit-bar">
    <div class="row gap-12 wrap"><span class="label-line">${icon(Alignment[alignment].icon)}Allineamento</span><span class="flex"></span>
      <div class="tt-align-picker">${segmented(Object.values(Alignment).map((a) => [a.id, a.shortTitle]), alignment, 'tt-align-pick', { compact: true })}</div></div>
    <p>${esc(`${gestures} ${hint} Intervalli sempre liberi.`)}</p></div>`;
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

function scheduleHourScroll(ctx, days, floating) {
  const s = ttState(ctx);
  if (!s.scrollToHour) return;
  s.scrollToHour = false;
  const store = ctx.model.timetable;
  const starts = days.map((d) => dayContent(ctx.model, d, { splitAtBreaks: false }).layout.span?.start).filter((v) => v != null);
  const hour = starts.length ? Math.max(0, Math.floor((Math.min(...starts) - 30) / 60)) : 7;
  const hh = hourHeight(ctx);
  void store;
  ctx.afterRender((root) => {
    const scroller = ctx.wide ? root.querySelector('.page.active .timeline-scroll') : root.querySelector('.page.active .page-scroll');
    if (!scroller) return;
    const grid = scroller.querySelector('.tt-grid');
    if (!grid) return;
    const offset = grid.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
    const range = floating ? floating.full - floating.collapsed : 0;
    ctx.scrollQuietly(scroller, Math.max(range, offset + hour * hh - (floating ? floating.collapsed + 12 : 8)));
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
  const hours = [];
  for (let h = 0; h < 24; h++) {
    hours.push(`<div class="tt-hour" style="top:${h * hh}px"><span class="numeral-mono">${String(h).padStart(2, '0')}:00</span></div>`);
  }
  const now = new Date();
  const showsNow = days.some((d) => isToday(d));
  const nowMinutes = TimeOfDay.of(now);
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
    empty = `<div class="tt-col-empty" style="top:${8 * hh}px"><strong>Nessuna lezione il ${Weekday.lower(Weekday.of(day))}</strong><span>${esc(hint)}</span></div>`;
  }
  void store;
  return `<div class="tt-col ${multiple && isSel ? 'selected' : ''} ${content.isDraft ? 'draft' : ''}" data-day-index="${dayIndex}" data-time="${day.getTime()}"${canEdit ? ' data-dblclick="tt-col-dbl"' : ''}>${segments.join('')}${empty}</div>`;
}

function segment(ctx, entry, content, { left, width, roundsTop, roundsBottom, dayIndex, canEdit, hh }) {
  const store = ctx.model.timetable;
  const badge = content.badges.get(entry.id) ?? {};
  const tint = entryColor(entry, store);
  const top = (entry.start / 60) * hh;
  const height = Math.max(isBreak(entry) ? 10 : 16, (duration(entry) / 60) * hh - (roundsBottom ? 1.5 : 0));
  const title = displayTitle(entry);
  let label;
  const icons = `${badge.isTest ? `<span class="tt-seg-test">${icon('test', { cls: 'small' })}</span>` : ''}`;
  if (height >= 34) {
    label = `<span class="tt-seg-title ${height >= 70 ? 'two' : ''}">${esc(title)}${icons}</span>
      <span class="tt-seg-time numeral-mono">${timeRange(entry)}${entry.room ? ` · ${esc(entry.room)}` : ''}</span>
      ${badge.isTest && height >= 52 ? '<span class="tt-seg-pill">Verifica</span>' : ''}`;
  } else {
    label = `<span class="tt-seg-line"><span class="tt-seg-title">${esc(title)}</span><span class="tt-seg-time numeral-mono">${timeRange(entry)}</span>${icons}</span>`;
  }
  const cls = ['tt-seg', isBreak(entry) ? 'break' : 'lesson', roundsTop ? 'rt' : 'follow', roundsBottom ? 'rb' : '', content.isDraft ? 'draft' : ''].join(' ');
  const attrs = data({ id: entry.id, time: content.day.getTime(), dayIndex });
  return `<button class="${cls}" style="--tint:${tint};top:${top}px;height:${height}px;left:${left};width:${width}" data-action="tt-open"${attrs}${content.isDraft ? '' : ' data-context="tt-entry"'}${canEdit ? ' data-seg="1"' : ''} aria-label="${esc(`${title}, ${timeRange(entry)}`)}" data-key="seg-${entry.id}">
    ${label}${canEdit ? '<span class="tt-resize" data-resize="1"><i></i></span>' : ''}</button>`;
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
let suppressNextClick = false;

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
  suppressNextClick = state.moved;
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
  suppressNextClick = state.moved;
  endDrag(state, state.moved);
});

document.addEventListener('click', (event) => {
  if (!suppressNextClick) return;
  suppressNextClick = false;
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

export { select as selectTimetableDay, isTomorrow, isYesterday, WEEK_FULL, STRIP, chevron };
