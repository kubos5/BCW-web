// Fogli dell'Orario: dettaglio di un evento (note, file e verifiche per un giorno o per ogni
// settimana), editor, colori e palette, "Colora una giornata", generatore della bozza dalle
// lezioni registrate e verifiche nascoste con le regole per nasconderle in automatico.

import {
  emptyState, select, segmented, stepper, toggle, pill, listGroup, listItem, button, iconButton, loadingIndicator,
} from '../components.js';
import { icon } from '../icons.js';
import { data } from '../dom.js';
import { esc, fmt, isToday, isTomorrow, startOfDay, addDays } from '../util.js';
import {
  PASTEL_ID, TimeOfDay, Weekday, alignedPieces, builtInPalettes, cloneEntry, colorDescription, defaultColor,
  displayTitle, duration, dynamicHex, entryColor, generateEntries, generationRange, hexString, isAutoAligned, isBreak,
  isBuiltInPalette, makeEntry, matchKey, newID, normalized, order, paletteColor, paletteSamples, parseHex, rulesCount,
  emptyRules, seriesPositions, subjectTint, timeRange, matchTests, fileExtension,
} from '../timetable.js';
import { registerTestRow } from './timetable.js';

let sheetCounter = 0;
const nextID = (name) => `${name}-${++sheetCounter}`;

/** Stato di un foglio, cancellato alla chiusura. */
function sheetState(ctx, id, init) {
  return ctx.state(`sheet:${id}`, init);
}

function forget(ctx, id) { ctx.app.viewState.delete(`sheet:${id}`); }

const section = (rows, options) => listGroup(rows, options);
const field = (label, control) => `<label class="field"><span class="field-label">${esc(label)}</span>${control}</label>`;
const formRow = (label, control, { iconName } = {}) => `<div class="list-item form-row">${iconName ? `<span class="form-icon">${icon(iconName)}</span>` : ''}<span class="li-text"><strong>${esc(label)}</strong></span>${control}</div>`;
const toggleRow = (label, checked, action, { iconName, params = {} } = {}) =>
  `<label class="list-item form-row toggle-row">${iconName ? `<span class="form-icon">${icon(iconName)}</span>` : ''}<span class="li-text"><strong>${esc(label)}</strong></span>${toggle(checked, action, { label }).replace(`data-change="${action}"`, `data-change="${action}"${data(params)}`)}</label>`;
const timeInput = (value, action, params = {}) => `<input class="text-input time" type="time" step="300" value="${TimeOfDay.string(Math.min(value, 1439))}" data-change="${action}"${data(params)}>`;

function swatch(color, { selected = false, action, params = {}, label = '', context = '', size = 36 } = {}) {
  return `<button class="swatch ${selected ? 'selected' : ''}" style="--swatch:${color};--size:${size}px" data-action="${action}"${data(params)}${context}
    aria-label="${esc(label)}" title="${esc(label)}">${selected ? icon('check') : ''}</button>`;
}

function paletteStrip(palette, count = 12) {
  if (palette.id === PASTEL_ID) return `<span class="palette-strip gapped">${palette.colors.map((_, i) => `<i style="background:${subjectTint(i)}"></i>`).join('')}</span>`;
  if (palette.isGradient && palette.colors.length > 1) {
    return `<span class="palette-strip">${paletteSamples(palette, count).map((c) => `<i style="background:${dynamicHex(c)}"></i>`).join('')}</span>`;
  }
  return `<span class="palette-strip gapped">${palette.colors.map((c) => `<i style="background:${dynamicHex(c)}"></i>`).join('')}</span>`;
}

function formatBytes(n) {
  if (n < 1000) return `${n} byte`;
  if (n < 1_000_000) return `${Math.round(n / 1000)} KB`;
  return `${(n / 1_000_000).toFixed(1).replace('.', ',')} MB`;
}

function attachmentIcon(name) {
  const ext = fileExtension(name).toLowerCase();
  if (['jpg', 'jpeg', 'png', 'gif', 'heic', 'webp'].includes(ext)) return 'image';
  if (ext === 'pdf') return 'fileText';
  if (['mp3', 'm4a', 'wav', 'mp4', 'mov'].includes(ext)) return 'film';
  if (['ppt', 'pptx', 'key', 'odp'].includes(ext)) return 'presentation';
  if (['xls', 'xlsx', 'numbers', 'csv', 'ods'].includes(ext)) return 'table';
  if (['txt', 'rtf', 'doc', 'docx', 'pages', 'md'].includes(ext)) return 'fileText';
  return 'file';
}

// MARK: - Eliminazione

export function deleteEntryDialog(ctx, entry, after) {
  const store = ctx.model.timetable;
  const others = store.sameNameEntries(entry);
  const title = displayTitle(entry);
  const actions = [{ label: 'Elimina solo questo', destructive: true, run: () => { store.delete([entry.id]); after?.(); } }];
  if (others.length) {
    actions.push({ label: `Elimina tutti gli eventi «${title}» (${others.length + 1})`, destructive: true, run: () => { store.delete([entry.id, ...others.map((e) => e.id)]); after?.(); } });
  }
  actions.push({ label: 'Annulla', cancel: true });
  ctx.confirm({ title: `Eliminare «${title}»?`, actions });
}

// MARK: - Dettaglio dell'evento

export function detailSheet(ctx, entryID, day) {
  const id = nextID('tt-detail');
  const store = ctx.model.timetable;
  const entry = store.entry(entryID);
  sheetState(ctx, id, () => ({ entryID, day: startOfDay(day), original: entry ? cloneEntry(entry) : null }));
  return {
    id,
    onClose: () => forget(ctx, id),
    render: (c) => renderDetail(c, id),
  };
}

function renderDetail(ctx, id) {
  const s = sheetState(ctx, id, {});
  const store = ctx.model.timetable;
  const entry = store.entry(s.entryID);
  if (!entry) return { title: 'Evento', size: 'large', body: emptyState('Evento eliminato', 'calendarMinus') };
  const day = s.day;
  const isDraft = store.isDraftEntry(entry.id);
  const others = isDraft ? [] : store.sameNameEntries(entry);
  const title = displayTitle(entry);
  const tint = entryColor(entry, store);
  const weekdayLower = Weekday.lower(entry.weekday);
  const people = [entry.teacher, entry.room ? `Aula ${entry.room}` : ''].filter(Boolean);
  const header = `<div class="tt-detail-head" style="--tint:${tint}"><span class="tt-bar"></span><div class="grow">
    <h2>${esc(title)}</h2>
    <p>${esc(fmt.longDay(day))} · ${timeRange(entry)}</p>
    <p class="secondary">Ogni ${esc(weekdayLower)} · ${esc(TimeOfDay.duration(duration(entry)))}${isBreak(entry) ? ' · Intervallo' : ''}</p>
    ${people.length ? `<p class="secondary">${esc(people.join(' · '))}</p>` : ''}
    ${others.length ? `<p class="row-caption">${others.length === 1 ? `C'è un altro evento «${esc(title)}» nell'orario.` : `Ci sono altri ${others.length} eventi «${esc(title)}» nell'orario.`}</p>` : ''}</div></div>`;

  const trailing = `${isDraft ? '' : `<button class="icon-btn" data-action="tt-detail-edit" data-sheet="${id}" aria-label="Modifica" title="Modifica">${icon('edit')}</button>`}
    <button class="btn filled xs" data-action="tt-detail-finish" data-sheet="${id}">${icon('check')}<span>Fine</span></button>`;
  const leading = `<button class="icon-btn" data-action="tt-detail-finish" data-sheet="${id}" aria-label="Chiudi" title="Chiudi">${icon('x')}</button>`;

  if (isDraft) {
    return {
      title, size: 'large', leading, trailing,
      body: `<div class="sheet-pad stack gap-16">${header}<div class="tt-draft-note">${icon('wand')}<p>Questo evento fa parte della bozza generata dalle lezioni registrate. Applica la bozza per modificarlo o aggiungere note e file.</p></div></div>`,
    };
  }

  const occurrence = store.occurrence(entry.id, day);
  let tests = '';
  if (!isBreak(entry)) {
    const all = ctx.model.events(day).filter((e) => e.kind === 'test');
    const { matched } = matchTests(all, store.entriesOn(day));
    const mine = matched.get(entry.id) ?? [];
    const visible = mine.filter((t) => !store.hiddenReason(t, false));
    const hidden = mine.filter((t) => store.hiddenReason(t, false));
    const dayLabel = isToday(day) ? 'Verifica oggi' : isTomorrow(day) ? 'Verifica domani' : `Verifica il ${fmt.dayMonth(day)}`;
    const footer = [];
    if (visible.length) footer.push("Le verifiche segnate dai docenti su Classeviva compaiono da sole. Se sono sbagliate puoi nasconderle dall'orario.");
    else if (hidden.length) footer.push("Le verifiche di Classeviva di questo giorno sono nascoste (le trovi anche in Verifiche nascoste, nel menu dell'orario).");
    else footer.push('Le verifiche segnate dai docenti su Classeviva compaiono da sole; qui puoi segnarne altre a mano.');
    if (entry.isWeeklyTest && occurrence.isTest === false) footer.push('Solo per questo giorno hai tolto la verifica settimanale.');
    tests = section([
      ...visible.map((t) => `<div class="list-item">${registerTestRow(store, t)}</div>`),
      ...hidden.map((t) => `<div class="list-item">${registerTestRow(store, t, { hidden: true })}</div>`),
      toggleRow(dayLabel, store.isManualTest(entry, day), 'tt-detail-test', { iconName: 'test', params: { sheet: id, scope: 'day' } }),
      toggleRow(`Verifica ogni ${weekdayLower}`, entry.isWeeklyTest, 'tt-detail-test', { iconName: 'repeat', params: { sheet: id, scope: 'week' } }),
    ], { header: 'Verifiche', footer: footer.join(' ') });
  }

  const attachments = (list, scope) => list.map((a) => `<div class="list-item tt-attachment" data-context="tt-attachment"${data({ sheet: id, att: a.id, scope })}>
    <button class="tt-attachment-open" data-action="tt-att-open"${data({ sheet: id, att: a.id, scope })}><span class="form-icon">${icon(attachmentIcon(a.name))}</span>
    <span class="li-text"><strong>${esc(a.name)}</strong><small>${esc(formatBytes(a.size))}</small></span></button>
    ${iconButton('download', { action: 'tt-att-open', params: { sheet: id, att: a.id, scope }, label: 'Apri' })}
    ${iconButton('trash', { action: 'tt-att-remove', params: { sheet: id, att: a.id, scope }, label: 'Rimuovi', cls: 'danger' })}</div>`).join('');
  const attachButton = (scope) => `<button class="list-item form-button" data-action="tt-att-menu"${data({ sheet: id, scope })}><span class="form-icon">${icon('paperclip')}</span><span class="li-text"><strong>Allega un file</strong></span></button>`;
  const fileInputs = (scope) => `<input type="file" multiple hidden id="${id}-${scope}-file" data-change="tt-att-files"${data({ sheet: id, scope })}>
    <input type="file" multiple accept="image/*" hidden id="${id}-${scope}-photo" data-change="tt-att-files"${data({ sheet: id, scope, photo: 1 })}>`;

  const daySection = section([
    `<div class="list-item note-item"><textarea class="text-input" rows="2" placeholder="Nota solo per questo giorno" data-input="tt-detail-note"${data({ sheet: id, scope: 'day' })}>${esc(occurrence.note)}</textarea></div>`,
    attachments(occurrence.attachments, 'day'),
    attachButton('day'),
  ], { header: fmt.longDay(day) }) + fileInputs('day');
  const weekSection = section([
    `<div class="list-item note-item"><textarea class="text-input" rows="2" placeholder="Nota per ogni settimana" data-input="tt-detail-note"${data({ sheet: id, scope: 'week' })}>${esc(entry.note)}</textarea></div>`,
    attachments(entry.attachments, 'week'),
    attachButton('week'),
  ], {
    header: `Ogni ${weekdayLower}`,
    footer: others.length ? `Premendo Fine potrai applicare nota, file e verifica di ogni settimana anche agli altri eventi «${title}».` : null,
  }) + fileInputs('week');

  return { title, size: 'large', leading, trailing, locked: true, body: `<div class="sheet-pad stack gap-16">${header}${tests}${daySection}${weekSection}</div>` };
}

function detailContext(ctx, el) {
  const s = sheetState(ctx, el.dataset.sheet, {});
  const store = ctx.model.timetable;
  const entry = store.entry(s.entryID);
  return { s, store, entry, scope: el.dataset.scope === 'day' ? { day: s.day } : 'everyWeek' };
}

function finishDetail(ctx, id) {
  const s = sheetState(ctx, id, {});
  const store = ctx.model.timetable;
  const entry = store.entry(s.entryID);
  const close = () => ctx.closeSheet();
  if (!entry || !s.original || store.isDraftEntry(entry.id)) {
    close();
    return;
  }
  const original = s.original;
  const ids = (list) => list.map((a) => a.id).join('|');
  const changed = original.note !== entry.note || original.isWeeklyTest !== entry.isWeeklyTest || ids(original.attachments) !== ids(entry.attachments);
  const others = store.sameNameEntries(entry);
  if (!changed || !others.length) {
    close();
    return;
  }
  const title = displayTitle(entry);
  ctx.confirm({
    title: `Applicare le modifiche anche agli altri eventi «${title}»?`,
    message: 'Nota, file e verifica di ogni settimana verranno aggiornati in tutti gli eventi con lo stesso nome. Le modifiche dei singoli giorni restano solo a questo evento.',
    actions: [
      { label: `Applica a tutti (${others.length + 1})`, run: () => {
        if (original.note !== entry.note) store.setNote(entry.note, entry, 'allSameName');
        if (original.isWeeklyTest !== entry.isWeeklyTest) store.setTest(entry.isWeeklyTest, entry, 'allSameName');
        const before = new Set(original.attachments.map((a) => a.id));
        const now = new Set(entry.attachments.map((a) => a.id));
        const added = entry.attachments.filter((a) => !before.has(a.id));
        const removed = new Set(original.attachments.filter((a) => !now.has(a.id)).map((a) => a.id));
        for (const other of store.sameNameEntries(entry)) {
          const updated = cloneEntry(other);
          updated.attachments = updated.attachments.filter((a) => !removed.has(a.id));
          for (const a of added) if (!updated.attachments.some((x) => x.id === a.id)) updated.attachments.push(a);
          if (ids(updated.attachments) !== ids(other.attachments)) store.saveEntry(updated);
        }
        close();
      } },
      { label: 'Solo a questo evento', run: close },
      { label: 'Annulla', cancel: true },
    ],
  });
}

function photoName(file) {
  const now = new Date();
  const time = `${String(now.getHours()).padStart(2, '0')}.${String(now.getMinutes()).padStart(2, '0')}.${String(now.getSeconds()).padStart(2, '0')}`;
  const ext = fileExtension(file.name) || (file.type.split('/')[1] ?? 'jpg').replace('jpeg', 'jpg');
  return `Foto ${fmt.shortDayWithYear(now)} ${time}.${ext}`;
}

// MARK: - Editor

/** `request`: `{ entry }` per modificare, altrimenti `{ weekday, start, kind }` per un evento nuovo. */
export function editorSheet(ctx, request) {
  const id = nextID('tt-editor');
  const store = ctx.model.timetable;
  sheetState(ctx, id, () => {
    let draft;
    let isNew = true;
    if (request.entry) {
      draft = cloneEntry(request.entry);
      isNew = false;
    } else {
      const kind = request.kind ?? 'lesson';
      const start = request.start ?? 480;
      draft = makeEntry({ weekday: request.weekday ?? 1, start, end: Math.min(1440, start + (kind === 'breakTime' ? 10 : 60)), kind, title: kind === 'breakTime' ? 'Intervallo' : '' });
    }
    const state = { draft, isNew, original: request.entry ? cloneEntry(request.entry) : null, weekdays: new Set([draft.weekday]) };
    if (usesAutomatic(store, draft) && !isAutoAligned(draft)) align(draft);
    return state;
  });
  return { id, onClose: () => forget(ctx, id), render: (c) => renderEditor(c, id) };
}

const usesAutomatic = (store, draft) => store.alignment === 'automatic' && !isBreak(draft);

function align(draft) {
  const length = duration(draft) < 45 ? 30 : 60;
  let start = TimeOfDay.snapped(draft.start, 30);
  start = Math.min(Math.max(0, start), 1440 - length);
  draft.start = start;
  draft.end = start + length;
}

/** Materie di Classeviva e nomi già usati nell'orario, da proporre come titolo. */
function suggestions(ctx) {
  const store = ctx.model.timetable;
  const seen = new Set();
  const list = [];
  for (const subject of [...ctx.model.subjects].sort((a, b) => a.order - b.order)) {
    const name = subject.name?.trim();
    if (!name || seen.has(normalized(name))) continue;
    seen.add(normalized(name));
    list.push({ name, subjectId: subject.id, teacher: subject.teachers?.[0] ?? null });
  }
  for (const title of store.knownTitles) {
    if (seen.has(normalized(title))) continue;
    seen.add(normalized(title));
    list.push({ name: title, subjectId: null, teacher: null });
  }
  return list;
}

function isValid(s) {
  const d = s.draft;
  return d.end > d.start && s.weekdays.size > 0 && (isBreak(d) || d.title.trim() !== '');
}

function renderEditor(ctx, id) {
  const s = sheetState(ctx, id, {});
  const store = ctx.model.timetable;
  const d = s.draft;
  const automatic = usesAutomatic(store, d);
  const title = s.isNew ? (isBreak(d) ? 'Nuovo intervallo' : 'Nuovo evento') : 'Modifica evento';
  const trailing = `<button class="btn filled xs" data-action="tt-ed-save" data-sheet="${id}"${isValid(s) ? '' : ' disabled'}>${icon('check')}<span>Salva</span></button>`;

  const hasSuggestions = !isBreak(d) && suggestions(ctx).length;
  const kind = segmented([['lesson', 'Lezione'], ['breakTime', 'Intervallo']], d.kind, 'tt-ed-kind').replaceAll('data-action="tt-ed-kind"', `data-action="tt-ed-kind" data-sheet="${id}"`);
  const titleField = `<div class="row gap-8"><input class="text-input grow" type="text" value="${esc(d.title)}" placeholder="${isBreak(d) ? 'Nome (es. Intervallo)' : 'Materia o evento'}" data-input="tt-ed-field" data-sheet="${id}" data-field="title" autocomplete="off">
    ${hasSuggestions ? `<button class="icon-btn tonal" data-action="tt-ed-suggest" data-sheet="${id}" aria-label="Scegli una materia" title="Scegli una materia">${icon('list')}</button>` : ''}</div>`;

  const when = [];
  if (s.isNew) {
    when.push(`<div class="field"><span class="field-label">Giorni</span><div class="weekday-chips">${Weekday.short.map((name, i) => {
      const w = i + 1;
      const on = s.weekdays.has(w);
      return `<button class="weekday-chip ${on ? 'selected' : ''}" data-action="tt-ed-weekday" data-sheet="${id}" data-weekday="${w}" aria-pressed="${on}">${name}</button>`;
    }).join('')}</div></div>`);
  } else {
    when.push(field('Giorno', select(Weekday.names.map((n, i) => [i + 1, n]), d.weekday, 'tt-ed-day', { label: 'Giorno', params: { sheet: id } })));
  }
  if (automatic) {
    const options = [];
    for (let m = 0; m < 1440; m += 30) options.push([m, TimeOfDay.string(m)]);
    when.push(`<div class="field-row">${field('Inizio', select(options, d.start, 'tt-ed-start-auto', { label: 'Inizio', params: { sheet: id } }))}
      ${field('Fine', `<span class="field-value numeral-mono">${TimeOfDay.string(d.end)}</span>`)}</div>`);
    when.push(field('Durata', segmented([[30, '30 minuti'], [60, '1 ora']], duration(d), 'tt-ed-duration').replaceAll('data-action="tt-ed-duration"', `data-action="tt-ed-duration" data-sheet="${id}"`)));
  } else {
    when.push(`<div class="field-row">${field('Inizio', timeInput(d.start, 'tt-ed-start', { sheet: id }))}${field('Fine', timeInput(d.end, 'tt-ed-end', { sheet: id }))}
      ${field('Durata', `<span class="field-value numeral-mono">${d.end > d.start ? esc(TimeOfDay.duration(duration(d))) : '—'}</span>`)}</div>`);
  }
  let whenFooter;
  if (d.end <= d.start) whenFooter = "L'evento deve finire dopo l'inizio.";
  else if (isBreak(d)) whenFooter = 'Gli intervalli si posizionano sempre liberamente e compaiono sopra le lezioni, senza cambiarne la durata.';
  else if (automatic) whenFooter = "Allineamento automatico: gli eventi iniziano all'ora o alla mezz'ora e durano 30 minuti o un'ora. Per orari liberi passa all'allineamento libero in Modifica orario.";
  else whenFooter = 'Allineamento libero: inizio e fine possono essere qualsiasi orario.';

  const details = [];
  if (!isBreak(d)) {
    details.push(`<div class="field-row">${field('Docente', `<input class="text-input" type="text" value="${esc(d.teacher)}" data-input="tt-ed-field" data-sheet="${id}" data-field="teacher" autocomplete="off">`)}
      ${field('Aula', `<input class="text-input" type="text" value="${esc(d.room)}" data-input="tt-ed-field" data-sheet="${id}" data-field="room" autocomplete="off">`)}</div>`);
  }
  // In una lista (da sola), per gli angoli: prima la riga era un rettangolo tra campi arrotondati.
  details.push(listGroup([`<button class="list-item color-row" data-action="tt-ed-color" data-sheet="${id}"><span class="form-icon">${icon('palette')}</span><span class="li-text"><strong>Colore</strong></span>
    <span class="trailing">${esc(colorDescription(d.color, store))}</span><span class="swatch-dot" style="background:${entryColor(d, store)}"></span>${icon('chevronRight', { cls: 'trailing-icon' })}</button>`]));
  details.push(field('Nota per ogni settimana', `<textarea class="text-input" rows="2" data-input="tt-ed-field" data-sheet="${id}" data-field="note">${esc(d.note)}</textarea>`));

  const body = `<div class="sheet-pad stack gap-20 editor">
    <div class="stack gap-12">${kind}${titleField}</div>
    <div class="stack gap-12"><h3 class="list-header">Quando</h3>${when.join('')}<p class="list-footer">${esc(whenFooter)}</p></div>
    <div class="stack gap-12"><h3 class="list-header">Dettagli</h3>${details.join('')}</div>
    ${s.isNew ? '' : `<button class="btn tonal danger-text wide" data-action="tt-ed-delete" data-sheet="${id}">${icon('trash')}<span>Elimina evento</span></button>`}
  </div>`;
  return { title, size: 'large', trailing, body };
}

function saveEditor(ctx, id) {
  const s = sheetState(ctx, id, {});
  const store = ctx.model.timetable;
  const d = s.draft;
  d.title = d.title.trim();
  const commit = (propagate) => {
    if (s.isNew) {
      const weekdays = [...s.weekdays].sort((a, b) => a - b);
      store.add(weekdays.map((w, i) => ({ ...cloneEntry(d), id: i === 0 ? d.id : newID(), weekday: w })));
    } else {
      store.saveEntry(cloneEntry(d), propagate ? s.original : null);
    }
    ctx.closeSheet();
  };
  if (!s.isNew && s.original) {
    const others = store.sameNameEntries(s.original);
    const o = s.original;
    const differs = o.title !== d.title || o.subjectId !== d.subjectId || o.teacher !== d.teacher || o.room !== d.room || o.note !== d.note ||
      (JSON.stringify(o.color) !== JSON.stringify(d.color) && d.color?.type !== 'series');
    if (others.length && differs) {
      ctx.confirm({
        title: `Applicare le modifiche anche agli altri eventi «${displayTitle(o)}»?`,
        message: 'Nome, materia, docente, aula, colore e nota verranno aggiornati in tutti gli eventi con lo stesso nome. Orari, giorni e colori delle palette applicate a una giornata restano invariati.',
        actions: [
          { label: `Applica a tutti (${others.length + 1})`, run: () => commit(true) },
          { label: 'Solo a questo evento', run: () => commit(false) },
          { label: 'Annulla', cancel: true },
        ],
      });
      return;
    }
  }
  commit(false);
}

// MARK: - Colore di un evento

function colorPickerSheet(ctx, editorID) {
  const id = nextID('tt-color');
  return { id, render: (c) => renderColorPicker(c, id, editorID), onClose: () => forget(ctx, id) };
}

function renderColorPicker(ctx, id, editorID) {
  const s = sheetState(ctx, id, () => ({ custom: '#4F7FA6' }));
  const editor = sheetState(ctx, editorID, {});
  const store = ctx.model.timetable;
  const d = editor.draft;
  const c = d.color;
  const params = { sheet: editorID };
  const automatic = `<button class="list-item ${c ? '' : 'selected'}" data-action="tt-color-pick"${data({ ...params, type: 'auto' })}>
    <span class="swatch-dot big" style="background:${defaultColor(d)}"></span><span class="li-text"><strong>Automatico</strong><small>${isBreak(d) ? 'Il colore degli intervalli' : 'Il colore della materia nella sezione Lezioni'}</small></span>${c ? '' : icon('check')}</button>`;
  const seriesNote = c?.type === 'series'
    ? `<p class="list-footer">${icon('palette', { cls: 'small' })} Colorato con la palette «${esc(store.palette(c.paletteID)?.name ?? '')}» insieme alla sua giornata. Scegliendo un altro colore l'evento esce dalla serie.</p>` : '';
  const suggested = Array.from({ length: 12 }, (_, i) => swatch(subjectTint(i), {
    selected: c?.type === 'pastel' && c.index === i, action: 'tt-color-pick', params: { ...params, type: 'pastel', index: i }, label: `Colore suggerito ${i + 1}`,
  })).join('');
  const saved = store.timetable.customColors.map((hex) => swatch(dynamicHex(hex), {
    selected: c?.type === 'custom' && c.hex === hex, action: 'tt-color-pick', params: { ...params, type: 'custom', hex },
    label: `Colore personalizzato ${hexString(hex).slice(1)}`, context: ` data-context="tt-color"${data({ hex })}`,
  })).join('');
  const palettes = store.allPalettes.map((p) => {
    const samples = p.id === PASTEL_ID ? p.colors.map((_, i) => ({ color: subjectTint(i), value: { type: 'pastel', index: i } }))
      : paletteSamples(p, 6).map((hex) => ({ color: dynamicHex(hex), value: { type: 'custom', hex } }));
    return `<div class="palette-block"><div class="row-between"><strong>${esc(p.name)}</strong>${isBuiltInPalette(p) ? '' : `<button class="btn text xs" data-action="tt-palette-edit" data-palette="${esc(p.id)}">Modifica</button>`}</div>
      <div class="swatches small">${samples.map((x) => swatch(x.color, { size: 30, selected: JSON.stringify(c) === JSON.stringify(x.value), action: 'tt-color-pick',
    params: { ...params, type: x.value.type, index: x.value.index, hex: x.value.hex }, label: p.name })).join('')}</div></div>`;
  }).join('');
  const hint = ctx.wide ? 'Fai clic con il tasto destro' : 'Tieni premuto';
  const body = `<div class="sheet-pad stack gap-20">
    <div class="stack gap-8">${listGroup([automatic])}${seriesNote}</div>
    <div class="stack gap-8"><h3 class="list-header">Suggeriti</h3><div class="swatches">${suggested}</div></div>
    <div class="stack gap-8"><h3 class="list-header">Personalizzati</h3>${saved ? `<div class="swatches">${saved}</div>` : ''}
      <div class="row gap-12 wrap"><input type="color" class="color-input" value="${esc(s.custom)}" data-input="tt-color-custom" data-sheet="${id}" aria-label="Scegli un colore">
        ${button('Usa questo colore', { action: 'tt-color-use', params: { sheet: id, editor: editorID }, style: 'tonal', cls: 'xs' })}
        ${button('Salva colore', { action: 'tt-color-save', params: { sheet: id, editor: editorID }, iconName: 'add', style: 'text', cls: 'xs' })}</div>
      <p class="list-footer">I colori salvati restano disponibili per tutti gli eventi. ${hint} su un colore per eliminarlo.</p></div>
    <div class="stack gap-12"><h3 class="list-header">Dalle palette</h3>${palettes}
      ${button('Nuova palette', { action: 'tt-palette-new', iconName: 'plus', style: 'tonal', cls: 'xs' })}
      <p class="list-footer">Tocca un colore per usarlo. Per colorare un'intera giornata con una sfumatura usa "Colora una giornata" nel menu dell'orario.</p></div></div>`;
  return { title: 'Colore', size: 'large', body };
}

// MARK: - Palette

function paletteEditorSheet(ctx, palette) {
  const id = nextID('tt-palette');
  const store = ctx.model.timetable;
  sheetState(ctx, id, () => ({
    palette: palette ? { ...palette, colors: [...palette.colors] } : { id: newID(), name: '', colors: [0xA6D8F2, 0x2F6FB5], isGradient: true },
    isNew: !palette || !store.timetable.customPalettes.some((p) => p.id === palette.id),
  }));
  return { id, render: (c) => renderPaletteEditor(c, id), onClose: () => forget(ctx, id) };
}

function renderPaletteEditor(ctx, id) {
  const s = sheetState(ctx, id, {});
  const p = s.palette;
  const rows = p.colors.map((hex, i) => `<div class="list-item form-row"><input type="color" class="color-input" value="${hexString(hex)}" data-input="tt-pal-color"${data({ sheet: id, index: i })} aria-label="Colore ${i + 1}">
    <span class="li-text"><strong>Colore ${i + 1}</strong><small class="numeral-mono">${hexString(hex)}</small></span>
    ${i > 0 ? iconButton('chevronUp', { action: 'tt-pal-up', params: { sheet: id, index: i }, label: 'Sposta su', cls: 'small' }) : ''}
    ${p.colors.length > 2 ? iconButton('minusCircle', { action: 'tt-pal-remove', params: { sheet: id, index: i }, label: `Rimuovi colore ${i + 1}`, cls: 'small danger' }) : ''}</div>`);
  if (p.colors.length < 12) rows.push(`<button class="list-item form-button" data-action="tt-pal-add" data-sheet="${id}"><span class="form-icon">${icon('plus')}</span><span class="li-text"><strong>Aggiungi colore</strong></span></button>`);
  const body = `<div class="sheet-pad stack gap-20">
    ${listGroup([
    `<div class="list-item"><input class="text-input" type="text" value="${esc(p.name)}" placeholder="Nome della palette" data-input="tt-pal-name" data-sheet="${id}"></div>`,
    toggleRow('Sfumatura', p.isGradient, 'tt-pal-gradient', { params: { sheet: id } }),
    `<div class="list-item">${paletteStrip(p)}</div>`,
  ], { footer: p.isGradient ? 'Con la sfumatura, applicando la palette a una serie di eventi i colori intermedi vengono calcolati in base al numero di eventi.' : 'Senza sfumatura gli eventi di una serie prendono i colori uno dopo l\'altro.' })}
    ${listGroup(rows, { header: 'Colori' })}
    ${s.isNew ? '' : `<button class="btn tonal danger-text wide" data-action="tt-pal-delete" data-sheet="${id}">${icon('trash')}<span>Elimina palette</span></button>`}</div>`;
  const trailing = `<button class="btn filled xs" data-action="tt-pal-save" data-sheet="${id}"${p.colors.length < 2 ? ' disabled' : ''}>${icon('check')}<span>Salva</span></button>`;
  return { title: s.isNew ? 'Nuova palette' : 'Modifica palette', size: 'large', trailing, body };
}

// MARK: - Colora una giornata

export function seriesSheet(ctx, weekday) {
  const id = nextID('tt-series');
  const store = ctx.model.timetable;
  sheetState(ctx, id, () => {
    const lessons = store.entries(weekday, false).filter((e) => !isBreak(e));
    const existing = lessons.find((e) => e.color?.type === 'series')?.color.paletteID;
    return { weekday, paletteID: existing && store.palette(existing) ? existing : 'builtin.lagoon', chosen: new Set(lessons.map((e) => e.id)), anchor: null };
  });
  return { id, render: (c) => renderSeries(c, id), onClose: () => forget(ctx, id) };
}

function renderSeries(ctx, id) {
  const s = sheetState(ctx, id, {});
  const store = ctx.model.timetable;
  const lessons = store.entries(s.weekday, false).filter((e) => !isBreak(e)).sort(order);
  const palette = store.palette(s.paletteID) ?? builtInPalettes[1];
  const chosen = lessons.filter((e) => s.chosen.has(e.id));
  const positions = seriesPositions(chosen);
  const preview = new Map(chosen.map((e, i) => [e.id, palette.id === PASTEL_ID ? subjectTint(positions.index[i]) : dynamicHex(paletteColor(palette, positions.index[i], positions.count))]));
  const cards = store.allPalettes.map((p) => `<button class="palette-card ${p.id === s.paletteID ? 'selected' : ''}" data-action="tt-series-palette"${data({ sheet: id, palette: p.id })}${isBuiltInPalette(p) ? '' : ` data-context="tt-palette"${data({ palette: p.id })}`}>
    ${paletteStrip(p)}<span>${esc(p.name)}</span></button>`).join('');
  const rows = lessons.map((e) => {
    const on = s.chosen.has(e.id);
    return `<button class="list-item series-row ${on ? 'selected' : ''}" data-action="tt-series-toggle"${data({ sheet: id, entry: e.id })}>
      <span class="series-check">${icon(on ? 'checkCircleFill' : 'circle')}</span><span class="series-bar" style="background:${on ? preview.get(e.id) : entryColor(e, store)}"></span>
      <span class="li-text"><strong>${esc(displayTitle(e))}</strong><small class="numeral-mono">${timeRange(e)}</small></span></button>`;
  });
  // La palette scelta resta in vista (all'apertura e quando cambia), come nell'app: sui telefoni
  // quella proposta all'inizio (Laguna) stava fuori dallo schermo.
  if (s.shownPalette !== s.paletteID) {
    const smooth = s.shownPalette != null;
    s.shownPalette = s.paletteID;
    ctx.afterRender((root) => {
      const card = root.querySelector('.palette-cards .palette-card.selected');
      const row = card?.parentElement;
      if (!row) return;
      const left = card.getBoundingClientRect().left - row.getBoundingClientRect().left + row.scrollLeft;
      row.scrollTo({ left: Math.max(0, left - (row.clientWidth - card.offsetWidth) / 2), behavior: smooth ? 'smooth' : 'auto' });
    });
  }
  const hint = ctx.wide ? 'Fai clic sugli eventi per sceglierli (con ⇧ prendi tutti quelli di seguito).' : 'Tocca gli eventi per sceglierli: una serie di seguito o tutta la giornata.';
  const body = `<div class="sheet-pad stack gap-20">
    ${listGroup([formRow('Giorno', select(Weekday.names.map((n, i) => [i + 1, n]), s.weekday, 'tt-series-day', { label: 'Giorno', params: { sheet: id } }))])}
    <div class="stack gap-8"><h3 class="list-header">Palette</h3><div class="palette-cards">${cards}
      <button class="palette-card new" data-action="tt-palette-new" data-colors="8BCF7E,2B5C9E">${icon('plus')}<span>Nuova</span></button></div></div>
    <div class="stack gap-8"><div class="row-between series-events-head"><h3 class="list-header">Eventi</h3><div class="row gap-4">
      ${button('Tutti', { action: 'tt-series-all', params: { sheet: id }, style: 'text', cls: 'xs' })}${button('Nessuno', { action: 'tt-series-none', params: { sheet: id }, style: 'text', cls: 'xs' })}</div></div>
      ${lessons.length ? listGroup(rows) : `<p class="secondary">Nessuna lezione ${esc(Weekday.withArticle(s.weekday))}.</p>`}
      <p class="list-footer">${esc(`${hint} Gli eventi uguali accostati prendono lo stesso colore. La palette vale solo per ${Weekday.withArticle(s.weekday)}: gli eventi con lo stesso nome negli altri giorni restano come sono.`)}</p></div></div>`;
  const trailing = `<button class="btn filled xs" data-action="tt-series-apply" data-sheet="${id}"${chosen.length ? '' : ' disabled'}>${icon('check')}<span>Applica</span></button>`;
  const footer = `<button class="btn text danger-text" data-action="tt-series-clear" data-sheet="${id}"${chosen.length ? '' : ' disabled'} title="Riporta gli eventi scelti al colore automatico">Togli i colori</button>`;
  return { title: 'Colora una giornata', size: 'large', trailing, body, footer };
}

// MARK: - Generatore

export function generatorSheet(ctx) {
  const id = nextID('tt-generator');
  const store = ctx.model.timetable;
  sheetState(ctx, id, () => {
    const base = store.draft?.settings ?? store.timetable.generation;
    return { settings: { ...base, breaks: base.breaks.map((b) => ({ ...b })) }, generating: false };
  });
  return { id, render: (c) => renderGenerator(c, id), onClose: () => forget(ctx, id) };
}

function renderGenerator(ctx, id) {
  const s = sheetState(ctx, id, {});
  const store = ctx.model.timetable;
  const g = s.settings;
  const alignedSettings = g.firstHourStart % 30 === 0 && (g.hourLength === 30 || g.hourLength === 60);
  const hoursFooter = store.alignment === 'automatic' && !alignedSettings
    ? "L'orario usa l'allineamento automatico: con questi orari le lezioni verranno spostate all'ora o alla mezz'ora più vicina. Per tenere gli orari esatti passa all'allineamento libero in Modifica orario."
    : "Classeviva registra solo in quale ora della giornata si svolge una lezione: l'orario si ricava da qui.";
  // Come nell'app: in alto il nome con il pulsante per toglierlo, sotto inizio e durata.
  const breaks = g.breaks.map((b, i) => `<div class="list-item gen-break">
    <div class="gen-break-head"><span class="form-icon">${icon('coffee')}</span><span class="li-text"><strong>Intervallo ${i + 1}</strong></span>
      ${iconButton('minusCircle', { action: 'tt-gen-break-remove', params: { sheet: id, index: i }, label: "Rimuovi l'intervallo", cls: 'small danger' })}</div>
    <div class="gen-break-controls">${timeInput(b.start, 'tt-gen-break-start', { sheet: id, index: i })}<span class="flex"></span>
      ${stepper(b.duration, { action: `tt-gen-break-dur" data-sheet="${id}" data-index="${i}`, min: 5, max: 60, step: 5, format: (v) => `${v} min` })}</div></div>`);
  breaks.push(`<button class="list-item form-button" data-action="tt-gen-break-add" data-sheet="${id}"><span class="form-icon">${icon('coffee')}</span><span class="li-text"><strong>Aggiungi intervallo</strong></span></button>`);
  if (g.breaks.length) breaks.push(`<button class="list-item form-button danger" data-action="tt-gen-break-clear" data-sheet="${id}"><span class="form-icon">${icon('trash')}</span><span class="li-text"><strong>Rimuovi gli intervalli</strong></span></button>`);
  const body = `<div class="sheet-pad stack gap-20">
    ${listGroup([
    formRow("Inizio della prima ora", timeInput(g.firstHourStart, 'tt-gen-first', { sheet: id })),
    formRow("Durata di un'ora", stepper(g.hourLength, { action: `tt-gen-length" data-sheet="${id}`, min: 30, max: 120, step: 5, format: (v) => `${v} min` })),
    formRow('Lezioni da esaminare', select([[2, 'Ultime 2 settimane'], [4, 'Ultime 4 settimane'], [6, 'Ultime 6 settimane'], [10, 'Ultime 10 settimane'], [0, "Tutto l'anno"]], g.weeks, 'tt-gen-weeks', { label: 'Lezioni da esaminare', params: { sheet: id } })),
  ], { header: 'Ore di lezione', footer: hoursFooter })}
    ${listGroup(breaks, { header: 'Intervalli', footer: 'Facoltativi: compaiono sopra le lezioni nei giorni in cui c\'è scuola a quell\'ora, senza cambiarne la durata. Per toglierne uno usa il pulsante rosso accanto.' })}
    <div class="stack gap-8"><button class="btn filled m wide" data-action="tt-gen-run" data-sheet="${id}"${s.generating ? ' disabled' : ''}>${s.generating ? loadingIndicator({ size: 'small' }) : icon('wand')}<span>Crea l'anteprima</span></button>
      <p class="list-footer">BCW guarda in quale ora della giornata si è svolta ogni materia, settimana per settimana, e tiene quelle che si ripetono (le settimane recenti contano di più, supplenze e recuperi isolati vengono ignorati). Vedrai l'orario in anteprima, con i bordi tratteggiati, prima di applicarlo.</p></div></div>`;
  return { title: "Genera l'orario", size: 'large', body };
}

async function runGenerator(ctx, id) {
  const s = sheetState(ctx, id, {});
  const store = ctx.model.timetable;
  const settings = s.settings;
  s.generating = true;
  ctx.update();
  const { from, to } = generationRange(settings);
  let lessons;
  try {
    lessons = await ctx.model.fetchLessons(from, to);
  } catch (error) {
    s.generating = false;
    ctx.confirm({ title: "Impossibile creare l'orario", message: `Non riesco a scaricare le lezioni: ${error.message}`, confirmLabel: 'OK', cancelLabel: null });
    return;
  }
  const result = generateEntries(lessons, settings);
  let entries = result.entries;
  if (store.alignment === 'automatic') entries = entries.flatMap(alignedPieces);
  s.generating = false;
  if (!entries.length) {
    ctx.confirm({
      title: "Impossibile creare l'orario",
      message: lessons.length
        ? 'Le lezioni registrate sono troppo poche o troppo irregolari per ricavare un orario. Prova a esaminare un periodo più lungo.'
        : 'Non ci sono lezioni registrate nel periodo scelto. Riprova più avanti o esamina un periodo più lungo.',
      confirmLabel: 'OK', cancelLabel: null,
    });
    return;
  }
  store.setDraft({ entries, settings: { ...settings, breaks: settings.breaks.map((b) => ({ ...b })) }, analyzedDays: result.analyzedDays, from, to });
  ctx.closeSheet();
}

// MARK: - Verifiche nascoste

function hiddenItems(ctx) {
  const store = ctx.model.timetable;
  return ctx.model.agenda.filter((e) => e.kind === 'test').sort((a, b) => a.begin - b.begin).map((test) => {
    const { unmatched } = matchTests([test], store.entriesOn(test.begin));
    const isUnmatched = unmatched.length > 0;
    return { test, unmatched: isUnmatched, reason: store.hiddenReason(test, isUnmatched) };
  });
}

export function hiddenTestsSheet(ctx) {
  const id = nextID('tt-hidden');
  return { id, render: (c) => renderHidden(c, id), onClose: () => forget(ctx, id) };
}

function hiddenRow(store, item, overridden = false) {
  const { test, reason } = item;
  let line;
  if (overridden) line = `${icon('eye', { cls: 'small' })}Mostrata a mano · regola «${esc(store.ruleReason(test, item.unmatched))}»`;
  else if (reason?.manual) line = `${icon('hand', { cls: 'small' })}Nascosta a mano`;
  else line = `${icon('filter', { cls: 'small' })}Nascosta dalla regola «${esc(reason?.rule ?? '')}»`;
  const action = overridden
    ? `<button class="btn text xs" data-action="tt-hidden-reset" data-id="${test.id}" title="Torna a nascondere la verifica come dice la regola">Nascondi</button>`
    : `<button class="btn text xs" data-action="tt-test-hide" data-id="${test.id}" data-hide="0" data-unmatched="${item.unmatched ? '1' : '0'}" title="Mostra di nuovo la verifica nell'orario">Mostra</button>`;
  return `<div class="list-item tt-hidden-row"><span class="tt-test-icon">${icon('test')}</span><div class="grow">
    <span class="caption em" style="color:var(--primary)">${esc(fmt.longDay(test.begin))}</span>
    <strong>${esc(test.title)}</strong>${test.notes ? `<p class="tt-test-notes clamp-3">${esc(test.notes)}</p>` : ''}
    ${test.authorName ? `<p class="row-caption">${esc(test.authorName)}</p>` : ''}<p class="row-caption reason">${line}</p></div>${action}</div>`;
}

function renderHidden(ctx, id) {
  const s = sheetState(ctx, id, () => ({ showsPast: false }));
  const store = ctx.model.timetable;
  const items = hiddenItems(ctx);
  const today = startOfDay(new Date());
  const hidden = items.filter((i) => i.reason);
  const upcoming = hidden.filter((i) => i.test.begin >= today);
  const past = hidden.filter((i) => i.test.begin < today).reverse();
  const overridden = items.filter((i) => !i.reason && store.timetable.shownTests.includes(i.test.id) && store.ruleReason(i.test, i.unmatched));
  const count = rulesCount(store.timetable.testRules);
  const rulesRow = listItem({ title: 'Nascondi in automatico', action: 'tt-rules-open', leading: `<span class="form-icon">${icon('filter')}</span>`,
    trailing: `<span class="trailing">${count === 0 ? 'Nessuna' : count === 1 ? '1 regola' : `${count} regole`}</span>${icon('chevronRight', { cls: 'trailing-icon' })}` });
  let body = listGroup([rulesRow], { footer: 'Le regole nascondono da sole le verifiche segnate dai docenti su Classeviva, ad esempio quelle di un docente, di un giorno della settimana o di un periodo. Puoi sempre mostrarne una a mano.' });
  // Come nell'app, anche senza verifiche la sezione è una lista (con una riga che lo dice).
  body += listGroup(upcoming.length ? upcoming.map((i) => hiddenRow(store, i))
    : ['<div class="list-item"><span class="li-text"><strong class="secondary">Nessuna verifica nascosta nei prossimi giorni.</strong></span></div>'], { header: 'Prossime' });
  if (past.length) {
    body += `<div class="stack gap-8"><h3 class="list-header">Passate</h3>${s.showsPast ? listGroup(past.map((i) => hiddenRow(store, i))) : ''}
      ${button(s.showsPast ? 'Nascondi le verifiche passate' : `Mostra le verifiche passate (${past.length})`, { action: 'tt-hidden-past', params: { sheet: id }, style: 'text', cls: 'xs' })}</div>`;
  }
  if (overridden.length) {
    body += listGroup(overridden.map((i) => hiddenRow(store, i, true)), { header: 'Mostrate nonostante le regole', footer: 'Le hai mostrate a mano. "Nascondi" le restituisce alle regole.' });
  }
  return { title: 'Verifiche nascoste', size: 'large', body: `<div class="sheet-pad stack gap-20">${body}</div>` };
}

function rulesSheet(ctx) {
  const id = nextID('tt-rules');
  return { id, render: (c) => renderRules(c, id), onClose: () => forget(ctx, id) };
}

function renderRules(ctx, id) {
  const s = sheetState(ctx, id, () => {
    const today = startOfDay(new Date());
    return { from: today, to: addDays(today, 6), word: '' };
  });
  const store = ctx.model.timetable;
  const rules = store.timetable.testRules;
  const items = hiddenItems(ctx);
  const byRule = items.filter((i) => i.reason?.rule).length;
  const status = byRule === 0 ? 'Le regole non nascondono nessuna verifica.' : byRule === 1 ? 'Le regole nascondono 1 verifica.' : `Le regole nascondono ${byRule} verifiche.`;
  const tests = ctx.model.agenda.filter((e) => e.kind === 'test');
  const teachers = [...new Set([...tests.map((t) => t.authorName).filter(Boolean), ...rules.teachers])].sort((a, b) => a.localeCompare(b, 'it'));
  const subjects = new Map();
  for (const t of tests) if (t.subjectName) subjects.set(normalized(t.subjectName), t.subjectName);
  for (const key of rules.subjects) if (!subjects.has(key)) subjects.set(key, key.charAt(0).toLocaleUpperCase('it-IT') + key.slice(1));
  const subjectList = [...subjects.entries()].sort((a, b) => a[1].localeCompare(b[1], 'it'));
  // Come nell'app: la data in una pillola che apre il selettore di Material 3.
  const dateRow = (label, which, date) => `<div class="list-item"><span class="form-icon">${icon('calendarDay')}</span><span class="li-text"><strong>${label}</strong></span>
    <button class="date-field period-date" data-action="tt-rule-pick" data-sheet="${id}" data-which="${which}" aria-label="${label}: ${esc(fmt.longDay(date))}">${icon('calendarMonth', { cls: 'small' })}<span>${esc(fmt.longDay(date))}</span></button></div>`;

  let body = listGroup([`<div class="list-item"><span class="form-icon">${icon('eyeOff')}</span><span class="li-text"><strong>${esc(status)}</strong></span></div>`],
    { footer: 'Una verifica è nascosta se soddisfa almeno una regola. Le trovi tutte in Verifiche nascoste, da dove puoi mostrarle di nuovo.' });
  body += listGroup(Weekday.names.map((name, i) => toggleRow(name, rules.weekdays.includes(i + 1), 'tt-rule-weekday', { params: { weekday: i + 1 } })), { header: 'Giorni della settimana' });
  body += listGroup(teachers.length
    ? teachers.map((t) => toggleRow(t, rules.teachers.includes(t), 'tt-rule-teacher', { params: { value: t } }))
    : ['<div class="list-item"><span class="li-text"><strong class="secondary">Nessun docente ha ancora segnato verifiche.</strong></span></div>'],
  { header: 'Docenti', footer: 'Nasconde le verifiche segnate da questi docenti.' });
  if (subjectList.length) body += listGroup(subjectList.map(([key, name]) => toggleRow(name, rules.subjects.includes(key), 'tt-rule-subject', { params: { value: key } })), { header: 'Materie' });
  body += listGroup([
    ...rules.periods.map((p) => `<div class="list-item"><span class="form-icon">${icon('calendar')}</span><span class="li-text"><strong>${esc(fmt.shortDayWithYear(p.start))} – ${esc(fmt.shortDayWithYear(p.end))}</strong></span>
      ${iconButton('minusCircle', { action: 'tt-rule-period-remove', params: { id: p.id }, label: 'Rimuovi il periodo', cls: 'small danger' })}</div>`),
    dateRow('Dal', 'from', s.from),
    dateRow('Al', 'to', s.to),
    `<button class="list-item form-button" data-action="tt-rule-period-add" data-sheet="${id}"><span class="form-icon">${icon('plus')}</span><span class="li-text"><strong>Aggiungi il periodo</strong></span></button>`,
  ], { header: 'Periodi', footer: 'Nasconde le verifiche di questi periodi (estremi compresi), ad esempio durante una gita o uno scambio.' });
  body += listGroup([
    ...rules.keywords.map((w, i) => `<div class="list-item"><span class="form-icon">${icon('textSearch')}</span><span class="li-text"><strong>${esc(w)}</strong></span>
      ${iconButton('minusCircle', { action: 'tt-rule-word-remove', params: { index: i }, label: 'Rimuovi la parola', cls: 'small danger' })}</div>`),
    `<form class="list-item word-add" data-submit="tt-rule-word-add" data-sheet="${id}"><input class="text-input grow" type="text" placeholder="Parola o frase" value="${esc(s.word)}" data-input="tt-rule-word" data-sheet="${id}">
      <button class="btn tonal xs" type="submit"${s.word.trim() ? '' : ' disabled'}>Aggiungi</button></form>`,
  ], { header: 'Parole', footer: 'Nasconde le verifiche il cui testo contiene una di queste parole (ad esempio "recupero").' });
  body += listGroup([toggleRow('Verifiche senza lezione in orario', rules.unmatched, 'tt-rule-unmatched')], { footer: 'Nasconde le verifiche di materie che quel giorno non sono nel tuo orario.' });
  if (rulesCount(rules)) body += `<button class="btn tonal danger-text wide" data-action="tt-rules-clear">${icon('trash')}<span>Elimina tutte le regole</span></button>`;
  return { title: 'Nascondi in automatico', size: 'large', body: `<div class="sheet-pad stack gap-20">${body}</div>` };
}

function updateRules(ctx, change) {
  const store = ctx.model.timetable;
  const rules = structuredClone(store.timetable.testRules);
  change(rules);
  store.setTestRules(rules);
}

// MARK: - Azioni

export const timetableSheetActions = {
  // Dettaglio
  'tt-detail-finish': (ctx, el) => finishDetail(ctx, el.dataset.sheet),
  'tt-detail-edit': (ctx, el) => {
    const s = sheetState(ctx, el.dataset.sheet, {});
    const entry = ctx.model.timetable.entry(s.entryID);
    if (!entry) return;
    ctx.closeSheet();
    setTimeout(() => ctx.openSheet(editorSheet(ctx, { entry })), 120);
  },
  'tt-detail-note': (ctx, el) => {
    const { store, entry, scope } = detailContext(ctx, el);
    if (entry) store.setNote(el.value, entry, scope);
  },
  'tt-detail-test': (ctx, el) => {
    const { store, entry, scope } = detailContext(ctx, el);
    if (entry) store.setTest(el.checked, entry, scope);
  },
  'tt-att-menu': (ctx, el) => {
    const base = `${el.dataset.sheet}-${el.dataset.scope}`;
    ctx.openMenu(el, [
      { label: 'Scegli un file…', icon: 'file', run: () => document.getElementById(`${base}-file`)?.click() },
      { label: 'Scegli una foto…', icon: 'image', run: () => document.getElementById(`${base}-photo`)?.click() },
    ], { align: 'start' });
  },
  'tt-att-files': async (ctx, el) => {
    const { store, entry, scope } = detailContext(ctx, el);
    const files = [...(el.files ?? [])];
    el.value = '';
    if (!entry) return;
    for (const file of files) {
      try {
        await store.attach(file, entry, scope, el.dataset.photo ? photoName(file) : file.name);
      } catch (error) {
        ctx.confirm({ title: 'Errore', message: `Impossibile allegare «${file.name}»: ${error.message}`, confirmLabel: 'OK', cancelLabel: null });
        return;
      }
    }
  },
  'tt-att-open': async (ctx, el) => {
    const { s, store, entry } = detailContext(ctx, el);
    if (!entry) return;
    const list = el.dataset.scope === 'day' ? store.occurrence(entry.id, s.day).attachments : entry.attachments;
    const attachment = list.find((a) => a.id === el.dataset.att);
    if (attachment) ctx.openFile(await store.openAttachment(attachment));
  },
  'tt-att-remove': (ctx, el) => {
    const { s, store, entry, scope } = detailContext(ctx, el);
    if (!entry) return;
    const list = el.dataset.scope === 'day' ? store.occurrence(entry.id, s.day).attachments : entry.attachments;
    const attachment = list.find((a) => a.id === el.dataset.att);
    if (attachment) store.removeAttachment(attachment, entry, scope);
  },
  'context-tt-attachment': (ctx, el, event) => {
    ctx.openMenu({ x: event?.clientX ?? 0, y: event?.clientY ?? 0 }, [
      { label: 'Rimuovi', icon: 'trash', destructive: true, run: () => timetableSheetActions['tt-att-remove'](ctx, el) },
    ], { align: 'start' });
  },

  // Editor
  'tt-ed-field': (ctx, el) => {
    const s = sheetState(ctx, el.dataset.sheet, {});
    s.draft[el.dataset.field] = el.value;
  },
  'tt-ed-kind': (ctx, el) => {
    const s = sheetState(ctx, el.dataset.sheet, {});
    const d = s.draft;
    const kind = el.dataset.value;
    if (kind === d.kind) return;
    d.kind = kind;
    if (kind === 'breakTime') {
      if (!d.title) d.title = 'Intervallo';
      if (duration(d) > 30) d.end = d.start + 10;
    } else {
      if (d.title === 'Intervallo') d.title = '';
      if (usesAutomatic(ctx.model.timetable, d) && !isAutoAligned(d)) align(d);
    }
  },
  'tt-ed-suggest': (ctx, el) => {
    const s = sheetState(ctx, el.dataset.sheet, {});
    const store = ctx.model.timetable;
    ctx.openMenu(el, suggestions(ctx).map((sug) => ({
      label: sug.name, subtitle: sug.teacher ?? undefined,
      run: () => {
        const d = s.draft;
        d.title = sug.name;
        const key = normalized(sug.name);
        const existing = store.timetable.entries.find((e) => e.id !== d.id && matchKey(e) === key);
        if (existing) {
          d.subjectId = existing.subjectId ?? sug.subjectId;
          if (!d.teacher) d.teacher = existing.teacher;
          if (!d.room) d.room = existing.room;
          if (!d.color && existing.color && existing.color.type !== 'series') d.color = { ...existing.color };
        } else {
          d.subjectId = sug.subjectId;
          if (!d.teacher && sug.teacher) d.teacher = sug.teacher;
        }
        ctx.update();
      },
    })));
  },
  'tt-ed-weekday': (ctx, el) => {
    const s = sheetState(ctx, el.dataset.sheet, {});
    const w = Number(el.dataset.weekday);
    if (s.weekdays.has(w)) s.weekdays.delete(w); else s.weekdays.add(w);
    if (s.weekdays.size) s.draft.weekday = Math.min(...s.weekdays);
  },
  'tt-ed-day': (ctx, el) => {
    const s = sheetState(ctx, el.dataset.sheet, {});
    s.draft.weekday = Number(el.value);
    s.weekdays = new Set([s.draft.weekday]);
  },
  'tt-ed-start-auto': (ctx, el) => {
    const d = sheetState(ctx, el.dataset.sheet, {}).draft;
    const length = duration(d);
    d.start = Math.min(Number(el.value), 1440 - length);
    d.end = d.start + length;
  },
  'tt-ed-duration': (ctx, el) => {
    const d = sheetState(ctx, el.dataset.sheet, {}).draft;
    const length = Number(el.dataset.value);
    d.start = Math.min(d.start, 1440 - length);
    d.end = d.start + length;
  },
  'tt-ed-start': (ctx, el) => {
    const d = sheetState(ctx, el.dataset.sheet, {}).draft;
    const value = TimeOfDay.parse(el.value);
    if (value == null) return;
    const length = Math.max(1, duration(d));
    d.start = value;
    d.end = Math.min(1440, value + length);
  },
  'tt-ed-end': (ctx, el) => {
    const d = sheetState(ctx, el.dataset.sheet, {}).draft;
    const value = TimeOfDay.parse(el.value);
    if (value == null) return;
    d.end = value === 0 ? 1440 : value;
  },
  'tt-ed-color': (ctx, el) => ctx.pushSheet(colorPickerSheet(ctx, el.dataset.sheet)),
  'tt-ed-save': (ctx, el) => saveEditor(ctx, el.dataset.sheet),
  'tt-ed-delete': (ctx, el) => {
    const s = sheetState(ctx, el.dataset.sheet, {});
    const entry = ctx.model.timetable.entry(s.draft.id);
    if (entry) deleteEntryDialog(ctx, { ...entry, title: s.draft.title || entry.title }, () => ctx.closeSheet());
  },

  // Colori
  'tt-color-pick': (ctx, el) => {
    const d = sheetState(ctx, el.dataset.sheet, {}).draft;
    if (!d) return;
    switch (el.dataset.type) {
      case 'auto': d.color = null; break;
      case 'pastel': d.color = { type: 'pastel', index: Number(el.dataset.index) }; break;
      default: d.color = { type: 'custom', hex: Number(el.dataset.hex) };
    }
  },
  'tt-color-custom': (ctx, el) => { sheetState(ctx, el.dataset.sheet, {}).custom = el.value; },
  'tt-color-use': (ctx, el) => {
    const hex = parseHex(sheetState(ctx, el.dataset.sheet, {}).custom);
    sheetState(ctx, el.dataset.editor, {}).draft.color = { type: 'custom', hex };
  },
  'tt-color-save': (ctx, el) => {
    const hex = parseHex(sheetState(ctx, el.dataset.sheet, {}).custom);
    ctx.model.timetable.saveCustomColor(hex);
    sheetState(ctx, el.dataset.editor, {}).draft.color = { type: 'custom', hex };
  },
  'context-tt-color': (ctx, el, event) => {
    const hex = Number(el.dataset.hex);
    ctx.openMenu({ x: event?.clientX ?? 0, y: event?.clientY ?? 0 }, [
      { label: 'Elimina colore', icon: 'trash', destructive: true, run: () => ctx.model.timetable.deleteCustomColor(hex) },
    ], { align: 'start' });
  },
  'tt-palette-edit': (ctx, el) => ctx.pushSheet(paletteEditorSheet(ctx, ctx.model.timetable.palette(el.dataset.palette))),
  'context-tt-palette': (ctx, el, event) => {
    const palette = ctx.model.timetable.palette(el.dataset.palette);
    ctx.openMenu({ x: event?.clientX ?? 0, y: event?.clientY ?? 0 }, [
      { label: 'Modifica', icon: 'edit', run: () => ctx.pushSheet(paletteEditorSheet(ctx, palette)) },
    ], { align: 'start' });
  },
  'tt-palette-new': (ctx, el) => {
    const colors = el.dataset?.colors ? el.dataset.colors.split(',').map((c) => parseInt(c, 16)) : [0xA6D8F2, 0x2F6FB5];
    ctx.pushSheet(paletteEditorSheet(ctx, { id: newID(), name: '', colors, isGradient: true }));
  },
  'tt-pal-name': (ctx, el) => { sheetState(ctx, el.dataset.sheet, {}).palette.name = el.value; },
  'tt-pal-gradient': (ctx, el) => { sheetState(ctx, el.dataset.sheet, {}).palette.isGradient = el.checked; },
  'tt-pal-color': (ctx, el) => { sheetState(ctx, el.dataset.sheet, {}).palette.colors[Number(el.dataset.index)] = parseHex(el.value); },
  'tt-pal-up': (ctx, el) => {
    const colors = sheetState(ctx, el.dataset.sheet, {}).palette.colors;
    const i = Number(el.dataset.index);
    [colors[i - 1], colors[i]] = [colors[i], colors[i - 1]];
  },
  'tt-pal-remove': (ctx, el) => { sheetState(ctx, el.dataset.sheet, {}).palette.colors.splice(Number(el.dataset.index), 1); },
  'tt-pal-add': (ctx, el) => {
    const colors = sheetState(ctx, el.dataset.sheet, {}).palette.colors;
    colors.push(colors.at(-1) ?? 0x8FA3B8);
  },
  'tt-pal-save': (ctx, el) => {
    const s = sheetState(ctx, el.dataset.sheet, {});
    const palette = { ...s.palette, name: s.palette.name.trim() || 'La mia palette' };
    ctx.model.timetable.savePalette(palette);
    ctx.closeSheet();
  },
  'tt-pal-delete': (ctx, el) => {
    const s = sheetState(ctx, el.dataset.sheet, {});
    ctx.confirm({
      title: `Eliminare la palette «${s.palette.name}»?`, message: 'Gli eventi colorati con questa palette torneranno al colore automatico.',
      confirmLabel: 'Elimina', destructive: true,
      onConfirm: () => { ctx.model.timetable.deletePalette(s.palette.id); ctx.closeSheet(); },
    });
  },

  // Colora una giornata
  'tt-series-day': (ctx, el) => {
    const s = sheetState(ctx, el.dataset.sheet, {});
    s.weekday = Number(el.value);
    s.chosen = new Set();
    s.anchor = null;
  },
  'tt-series-palette': (ctx, el) => { sheetState(ctx, el.dataset.sheet, {}).paletteID = el.dataset.palette; },
  'tt-series-toggle': (ctx, el, event) => {
    const s = sheetState(ctx, el.dataset.sheet, {});
    const id = el.dataset.entry;
    if (event?.shiftKey && s.anchor) {
      const lessons = ctx.model.timetable.entries(s.weekday, false).filter((e) => !isBreak(e)).sort(order);
      const a = lessons.findIndex((e) => e.id === s.anchor);
      const b = lessons.findIndex((e) => e.id === id);
      if (a >= 0 && b >= 0) {
        for (let i = Math.min(a, b); i <= Math.max(a, b); i++) s.chosen.add(lessons[i].id);
        return;
      }
    }
    if (s.chosen.has(id)) s.chosen.delete(id);
    else { s.chosen.add(id); s.anchor = id; }
  },
  'tt-series-all': (ctx, el) => {
    const s = sheetState(ctx, el.dataset.sheet, {});
    s.chosen = new Set(ctx.model.timetable.entries(s.weekday, false).filter((e) => !isBreak(e)).map((e) => e.id));
  },
  'tt-series-none': (ctx, el) => {
    const s = sheetState(ctx, el.dataset.sheet, {});
    s.chosen = new Set();
    s.anchor = null;
  },
  'tt-series-apply': (ctx, el) => {
    const s = sheetState(ctx, el.dataset.sheet, {});
    const store = ctx.model.timetable;
    const paletteID = store.palette(s.paletteID) ? s.paletteID : builtInPalettes[1].id;
    store.applyPalette(paletteID, [...s.chosen]);
    ctx.closeSheet();
  },
  'tt-series-clear': (ctx, el) => {
    const s = sheetState(ctx, el.dataset.sheet, {});
    ctx.model.timetable.applyPalette(null, [...s.chosen]);
    ctx.closeSheet();
  },

  // Generatore
  'tt-gen-first': (ctx, el) => {
    const v = TimeOfDay.parse(el.value);
    if (v != null) sheetState(ctx, el.dataset.sheet, {}).settings.firstHourStart = v;
  },
  'tt-gen-length': (ctx, el) => {
    const g = sheetState(ctx, el.dataset.sheet, {}).settings;
    g.hourLength = Math.min(120, Math.max(30, g.hourLength + Number(el.dataset.delta)));
  },
  'tt-gen-weeks': (ctx, el) => { sheetState(ctx, el.dataset.sheet, {}).settings.weeks = Number(el.value); },
  'tt-gen-break-start': (ctx, el) => {
    const v = TimeOfDay.parse(el.value);
    if (v != null) sheetState(ctx, el.dataset.sheet, {}).settings.breaks[Number(el.dataset.index)].start = v;
  },
  'tt-gen-break-dur': (ctx, el) => {
    const b = sheetState(ctx, el.dataset.sheet, {}).settings.breaks[Number(el.dataset.index)];
    b.duration = Math.min(60, Math.max(5, b.duration + Number(el.dataset.delta)));
  },
  'tt-gen-break-remove': (ctx, el) => { sheetState(ctx, el.dataset.sheet, {}).settings.breaks.splice(Number(el.dataset.index), 1); },
  'tt-gen-break-add': (ctx, el) => {
    const g = sheetState(ctx, el.dataset.sheet, {}).settings;
    const last = g.breaks.at(-1);
    g.breaks.push({ id: newID(), start: Math.min(last ? last.start + 120 : g.firstHourStart + g.hourLength * 3 - 10, 23 * 60), duration: 10 });
  },
  'tt-gen-break-clear': (ctx, el) => { sheetState(ctx, el.dataset.sheet, {}).settings.breaks = []; },
  'tt-gen-run': (ctx, el) => runGenerator(ctx, el.dataset.sheet),

  // Verifiche nascoste e regole
  'tt-hidden-past': (ctx, el) => { const s = sheetState(ctx, el.dataset.sheet, {}); s.showsPast = !s.showsPast; },
  'tt-hidden-reset': (ctx, el) => ctx.model.timetable.resetTestOverride(Number(el.dataset.id)),
  'tt-rules-open': (ctx) => ctx.pushSheet(rulesSheet(ctx)),
  'tt-rule-weekday': (ctx, el) => updateRules(ctx, (r) => {
    const w = Number(el.dataset.weekday);
    r.weekdays = el.checked ? [...new Set([...r.weekdays, w])] : r.weekdays.filter((x) => x !== w);
  }),
  'tt-rule-teacher': (ctx, el) => updateRules(ctx, (r) => {
    const v = el.dataset.value;
    r.teachers = el.checked ? [...new Set([...r.teachers, v])] : r.teachers.filter((x) => x !== v);
  }),
  'tt-rule-subject': (ctx, el) => updateRules(ctx, (r) => {
    const v = el.dataset.value;
    r.subjects = el.checked ? [...new Set([...r.subjects, v])] : r.subjects.filter((x) => x !== v);
  }),
  'tt-rule-pick': (ctx, el) => {
    const s = sheetState(ctx, el.dataset.sheet, {});
    const from = el.dataset.which === 'from';
    ctx.openDatePicker({
      selection: from ? s.from : s.to,
      min: from ? null : s.from,
      onPick: (day) => {
        if (!from) {
          s.to = day;
          return;
        }
        s.from = day;
        if (s.to < s.from) s.to = s.from;
      },
    });
  },
  'tt-rule-period-add': (ctx, el) => {
    const s = sheetState(ctx, el.dataset.sheet, {});
    updateRules(ctx, (r) => { r.periods.push({ id: newID(), start: startOfDay(s.from), end: startOfDay(s.to < s.from ? s.from : s.to) }); });
  },
  'tt-rule-period-remove': (ctx, el) => updateRules(ctx, (r) => { r.periods = r.periods.filter((p) => p.id !== el.dataset.id); }),
  'tt-rule-word': (ctx, el) => { sheetState(ctx, el.dataset.sheet, {}).word = el.value; },
  'tt-rule-word-add': (ctx, el) => {
    const s = sheetState(ctx, el.dataset.sheet, {});
    const word = s.word.trim();
    if (!word) return;
    updateRules(ctx, (r) => { if (!r.keywords.includes(word)) r.keywords.push(word); });
    s.word = '';
    // Il campo ha ancora il fuoco (Invio) e il morph non ne cambia il valore: va svuotato qui,
    // o la parola aggiunta resterebbe scritta, con "Aggiungi" attivo.
    const input = el.querySelector?.('input');
    if (input) input.value = '';
  },
  'tt-rule-word-remove': (ctx, el) => updateRules(ctx, (r) => { r.keywords.splice(Number(el.dataset.index), 1); }),
  'tt-rule-unmatched': (ctx, el) => updateRules(ctx, (r) => { r.unmatched = el.checked; }),
  'tt-rules-clear': (ctx) => ctx.model.timetable.setTestRules(emptyRules()),
};

export { pill };
