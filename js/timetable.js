// Orario settimanale: modello, salvataggio per account, gruppi di eventi, verifiche di
// Classeviva (anche nascoste), colori e palette, bozza generata dalle lezioni e backup.
//
// Il documento dell'orario è lo stesso JSON dell'app iOS/macOS (backup compatibili):
// orari in minuti dalla mezzanotte, giorni 1 = lunedì … 7 = domenica, UUID maiuscoli,
// date ISO 8601 senza millisecondi. Il JSON sta in `localStorage`, i file allegati in IndexedDB.

import { BlobStore } from './api.js';
import { addDays, dayKey, fmt, schoolYear, startOfDay, startOfWeek, StableID } from './util.js';

// MARK: - Basi

export const Weekday = {
  names: ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica'],
  short: ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'],
  name: (w) => Weekday.names[w - 1] ?? '',
  shortName: (w) => Weekday.short[w - 1] ?? '',
  lower: (w) => (Weekday.names[w - 1] ?? '').toLocaleLowerCase('it-IT'),
  /** Con l'articolo: "il lunedì", ma "la domenica". */
  withArticle: (w) => `${w === 7 ? 'la' : 'il'} ${Weekday.lower(w)}`,
  /** 1 = lunedì … 7 = domenica. */
  of: (date) => ((date.getDay() + 6) % 7) + 1,
  /** Giorno della settimana `w` nella settimana di `date`. */
  dateIn: (date, w) => addDays(startOfWeek(date), w - 1),
};

/** Arrotondamento come in Swift (`.rounded()`): metà lontano da zero. */
export const roundHalfAway = (x) => Math.sign(x) * Math.round(Math.abs(x));

export const TimeOfDay = {
  string(m) {
    const v = Math.min(1440, Math.max(0, Math.trunc(m)));
    return `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`;
  },
  duration(m) {
    if (m === 60) return '1 ora';
    if (m % 60 === 0) return `${m / 60} ore`;
    if (m < 60) return `${m} min`;
    return `${Math.floor(m / 60)} h ${m % 60} min`;
  },
  snapped: (m, step) => roundHalfAway(m / step) * step,
  /** Minuti dalla mezzanotte di una data. */
  of: (date) => date.getHours() * 60 + date.getMinutes(),
  /** "08:30" → 510. */
  parse(text) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(text ?? '');
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
  },
};

/** Testo senza spazi ai lati, senza maiuscole e senza accenti: per confrontare i nomi. */
export function normalized(s) {
  return String(s ?? '').trim().normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('it-IT');
}

export const newID = () => (globalThis.crypto?.randomUUID ? crypto.randomUUID()
  : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  })).toUpperCase();

const isObject = (v) => v != null && typeof v === 'object' && !Array.isArray(v);
const intOr = (v, fallback) => (typeof v === 'number' && Number.isFinite(v) ? Math.trunc(v) : fallback);
const strOr = (v, fallback = '') => (typeof v === 'string' ? v : fallback);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const isoDate = (d) => d.toISOString().replace(/\.\d{3}Z$/, 'Z');

function parseISO(value) {
  if (typeof value !== 'string') return null;
  const d = new Date(value);
  return isNaN(d) ? null : d;
}

export const Alignment = {
  automatic: { id: 'automatic', title: 'Allineamento automatico', shortTitle: 'Automatico', icon: 'alignAuto', dragStep: 30 },
  free: { id: 'free', title: 'Allineamento libero', shortTitle: 'Libero', icon: 'alignFree', dragStep: 5 },
};

export const EntryKind = {
  lesson: { id: 'lesson', title: 'Lezione', icon: 'book' },
  breakTime: { id: 'breakTime', title: 'Intervallo', icon: 'coffee' },
};

export const TimetableMode = {
  list: { id: 'list', title: 'Lista', icon: 'list' },
  calendar: { id: 'calendar', title: 'Calendario', icon: 'calendar' },
  day: { id: 'day', title: 'Giorno', icon: 'dayView' },
};

// MARK: - Eventi

export const isBreak = (e) => e.kind === 'breakTime';
export const duration = (e) => e.end - e.start;
export const matchKey = (e) => normalized(e.title);

export function displayTitle(e) {
  const t = (e.title ?? '').trim();
  return t || (isBreak(e) ? 'Intervallo' : 'Senza titolo');
}

export const timeRange = (e) => `${TimeOfDay.string(e.start)}–${TimeOfDay.string(e.end)}`;

export function isAutoAligned(e) {
  return isBreak(e) || (e.start % 30 === 0 && (duration(e) === 30 || duration(e) === 60));
}

/** Ordine degli eventi di una giornata: inizio, fine, nome. */
export function order(a, b) {
  if (a.start !== b.start) return a.start - b.start;
  if (a.end !== b.end) return a.end - b.end;
  const ta = displayTitle(a);
  const tb = displayTitle(b);
  return ta < tb ? -1 : ta > tb ? 1 : 0;
}

export function makeEntry(fields = {}) {
  const start = fields.start ?? 480;
  return {
    id: fields.id ?? newID(),
    weekday: fields.weekday ?? 1,
    start,
    end: fields.end ?? Math.min(1440, start + 60),
    kind: fields.kind ?? 'lesson',
    title: fields.title ?? '',
    subjectId: fields.subjectId ?? null,
    teacher: fields.teacher ?? '',
    room: fields.room ?? '',
    color: fields.color ?? null,
    note: fields.note ?? '',
    attachments: fields.attachments ?? [],
    isWeeklyTest: fields.isWeeklyTest ?? false,
  };
}

export const cloneEntry = (e) => ({ ...e, color: e.color ? { ...e.color } : null, attachments: [...e.attachments] });

/**
 * L'evento allineato alle ore e alle mezz'ore: inizio e fine vanno alla mezz'ora più vicina e
 * gli eventi più lunghi di un'ora diventano una serie di eventi da un'ora (o mezz'ora). Solo il
 * primo pezzo tiene id, nota, allegati e verifica settimanale.
 */
export function alignedPieces(e) {
  if (isAutoAligned(e)) return [e];
  const start = Math.min(Math.max(0, TimeOfDay.snapped(e.start, 30)), 1440 - 30);
  const end = Math.min(1440, Math.max(start + 30, TimeOfDay.snapped(e.end, 30)));
  const pieces = [];
  let cursor = start;
  while (cursor < end) {
    const length = end - cursor >= 60 ? 60 : 30;
    const piece = cloneEntry(e);
    if (pieces.length) {
      piece.id = newID();
      piece.note = '';
      piece.attachments = [];
      piece.isWeeklyTest = false;
    }
    piece.start = cursor;
    piece.end = cursor + length;
    pieces.push(piece);
    cursor += length;
  }
  return pieces;
}

// MARK: - Colori e palette

export const PASTEL_ID = 'builtin.pastel';
const hexes = (s) => s.split(' ').map((h) => parseInt(h, 16));

export const builtInPalettes = [
  { id: PASTEL_ID, name: 'Pastello (Lezioni)', isGradient: false, colors: hexes('B5523B 3F7D73 5B5FA8 A0782A 8A4F7D 4F7FA6 6E8B3D B0563F 7A6A58 2F7A8C 9A4A5A 5E7F52') },
  { id: 'builtin.ocean', name: 'Oceano', isGradient: true, colors: hexes('A6D8F2 5FA8DC 2F6FB5 1B3F7A') },
  { id: 'builtin.sunset', name: 'Tramonto', isGradient: true, colors: hexes('F4D35E F59E3B E8613C C0392B') },
  { id: 'builtin.lagoon', name: 'Laguna', isGradient: true, colors: hexes('8BCF7E 3FA796 2E86AB 2B5C9E') },
  { id: 'builtin.lavender', name: 'Lavanda', isGradient: true, colors: hexes('F4A6C6 C98BD9 9A7BD6 6A5ACD') },
  { id: 'builtin.forest', name: 'Bosco', isGradient: true, colors: hexes('C5E1A5 8BC34A 4E9A45 2E6B34') },
  { id: 'builtin.earth', name: 'Terra', isGradient: true, colors: hexes('E9D8A6 D4A373 B07D4F 7F5539') },
  { id: 'builtin.rainbow', name: 'Arcobaleno', isGradient: true, colors: hexes('E57373 F0A35E E8C95A 81C784 64B5F6 9575CD') },
  { id: 'builtin.slate', name: 'Ardesia', isGradient: true, colors: hexes('C2CAD3 8794A3 5C6B7A 3B4754') },
];

export const isBuiltInPalette = (p) => p.id.startsWith('builtin.');

export function interpolate(stops, t) {
  const position = Math.min(Math.max(t, 0), 1) * (stops.length - 1);
  const lower = Math.min(Math.trunc(position), stops.length - 2);
  const fraction = position - lower;
  let result = 0;
  for (const shift of [16, 8, 0]) {
    const a = (stops[lower] >> shift) & 0xFF;
    const b = (stops[lower + 1] >> shift) & 0xFF;
    result |= roundHalfAway(a * (1 - fraction) + b * fraction) << shift;
  }
  return result;
}

/** Colore dell'elemento `index` di una serie di `count` eventi. */
export function paletteColor(palette, index, count) {
  const colors = palette.colors;
  if (!colors.length) return 0x8FA3B8;
  if (!palette.isGradient || colors.length < 2 || count < 2) return colors[((index % colors.length) + colors.length) % colors.length];
  return interpolate(colors, Math.min(Math.max(index, 0), count - 1) / (count - 1));
}

/** Campioni da mostrare per una palette. */
export function paletteSamples(palette, count = 6) {
  if (!palette.isGradient || palette.colors.length < 2) return palette.colors;
  return Array.from({ length: count }, (_, i) => paletteColor(palette, i, count));
}

export const hexString = (hex) => `#${(hex & 0xFFFFFF).toString(16).padStart(6, '0').toUpperCase()}`;
export const parseHex = (s) => parseInt(String(s).replace('#', ''), 16) & 0xFFFFFF;

function lightened(hex, amount) {
  let result = 0;
  for (const shift of [16, 8, 0]) {
    const v = (hex >> shift) & 0xFF;
    result |= roundHalfAway(v + (255 - v) * amount) << shift;
  }
  return result;
}

/** Un colore scelto dall'utente: com'è nel tema chiaro, schiarito nel tema scuro. */
export const dynamicHex = (hex) => `light-dark(${hexString(hex)}, ${hexString(lightened(hex, 0.3))})`;

export const subjectTint = (id) => `var(--subject-${Math.abs(Number(id) || 0) % 12})`;

export function defaultColor(entry) {
  if (isBreak(entry)) return 'var(--break)';
  return subjectTint(entry.subjectId ?? StableID.make(matchKey(entry)));
}

/** Colore CSS di un evento. */
export function entryColor(entry, store) {
  const c = entry.color;
  if (!c) return defaultColor(entry);
  switch (c.type) {
    case 'pastel': return subjectTint(c.index);
    case 'custom': return dynamicHex(c.hex);
    case 'series': {
      const palette = store.palette(c.paletteID);
      if (!palette) return defaultColor(entry);
      if (palette.id === PASTEL_ID) return subjectTint(c.index);
      return dynamicHex(paletteColor(palette, c.index, c.count));
    }
    default: return defaultColor(entry);
  }
}

export function colorDescription(color, store) {
  if (!color) return 'Automatico';
  if (color.type === 'pastel') return 'Suggerito';
  if (color.type === 'custom') return 'Personalizzato';
  return store.palette(color.paletteID)?.name ?? 'Palette';
}

const sameColor = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * Posizioni nella serie di una palette: gli eventi uguali accostati (stesso nome, uno subito
 * dopo l'altro) prendono lo stesso colore.
 */
export function seriesPositions(entries) {
  const index = [];
  let count = 0;
  const open = new Map();
  for (const entry of entries) {
    const key = matchKey(entry);
    const previous = open.get(key);
    if (previous && previous.end === entry.start && key) {
      index.push(previous.index);
      open.set(key, { end: entry.end, index: previous.index });
    } else {
      index.push(count);
      open.set(key, { end: entry.end, index: count });
      count += 1;
    }
  }
  return { index, count };
}

// MARK: - Decodifica e codifica

function decodeColor(v) {
  if (!isObject(v)) return null;
  if (isObject(v.pastel) && Number.isInteger(v.pastel._0)) return { type: 'pastel', index: clamp(v.pastel._0, 0, 11) };
  if (isObject(v.custom) && Number.isInteger(v.custom._0)) return { type: 'custom', hex: v.custom._0 & 0xFFFFFF };
  if (isObject(v.series) && typeof v.series.paletteID === 'string' && Number.isInteger(v.series.index) && Number.isInteger(v.series.count)) {
    return { type: 'series', paletteID: v.series.paletteID, index: v.series.index, count: v.series.count };
  }
  return null;
}

function encodeColor(c) {
  if (!c) return undefined;
  if (c.type === 'pastel') return { pastel: { _0: c.index } };
  if (c.type === 'custom') return { custom: { _0: c.hex } };
  return { series: { count: c.count, index: c.index, paletteID: c.paletteID } };
}

class FormatError extends Error {}

function decodeAttachment(v, strict) {
  const ok = isObject(v) && typeof v.id === 'string' && typeof v.name === 'string' && typeof v.storedName === 'string' &&
    typeof v.size === 'number' && parseISO(v.addedAt);
  if (!ok) {
    if (strict) throw new FormatError();
    return null;
  }
  return { id: v.id, name: v.name, storedName: v.storedName, size: Math.trunc(v.size), addedAt: parseISO(v.addedAt) };
}

function decodeAttachments(v, strict) {
  if (v == null) return [];
  if (!Array.isArray(v)) {
    if (strict) throw new FormatError();
    return [];
  }
  return v.map((a) => decodeAttachment(a, strict)).filter(Boolean);
}

function decodeEntry(v, strict) {
  if (!isObject(v)) {
    if (strict) throw new FormatError();
    return null;
  }
  const start = clamp(intOr(v.start, 480), 0, 1439);
  return {
    id: typeof v.id === 'string' && v.id ? v.id.toUpperCase() : newID(),
    weekday: clamp(intOr(v.weekday, 1), 1, 7),
    start,
    end: clamp(intOr(v.end, start + 60), start + 1, 1440),
    kind: v.kind === 'breakTime' ? 'breakTime' : 'lesson',
    title: strOr(v.title),
    subjectId: Number.isInteger(v.subjectId) ? v.subjectId : null,
    teacher: strOr(v.teacher),
    room: strOr(v.room),
    color: decodeColor(v.color),
    note: strOr(v.note),
    attachments: decodeAttachments(v.attachments, strict),
    isWeeklyTest: v.isWeeklyTest === true,
  };
}

function decodeOccurrence(v, strict) {
  if (!isObject(v)) {
    if (strict) throw new FormatError();
    return null;
  }
  return {
    note: strOr(v.note),
    attachments: decodeAttachments(v.attachments, strict),
    isTest: typeof v.isTest === 'boolean' ? v.isTest : null,
  };
}

export function emptyRules() {
  return { teachers: [], subjects: [], weekdays: [], periods: [], keywords: [], unmatched: false };
}

function decodeRules(v) {
  const rules = emptyRules();
  if (!isObject(v)) return rules;
  const strings = (a) => (Array.isArray(a) ? a.filter((x) => typeof x === 'string') : []);
  rules.teachers = strings(v.teachers);
  rules.subjects = strings(v.subjects);
  rules.weekdays = Array.isArray(v.weekdays) ? v.weekdays.filter((x) => Number.isInteger(x) && x >= 1 && x <= 7) : [];
  rules.keywords = strings(v.keywords);
  rules.unmatched = v.unmatched === true;
  if (Array.isArray(v.periods)) {
    rules.periods = v.periods.map((p) => {
      const start = parseISO(p?.start);
      const end = parseISO(p?.end);
      return start && end ? { id: strOr(p.id, newID()), start: startOfDay(start), end: startOfDay(end) } : null;
    }).filter(Boolean);
  }
  return rules;
}

export function rulesCount(r) {
  return r.teachers.length + r.subjects.length + r.weekdays.length + r.periods.length + r.keywords.length + (r.unmatched ? 1 : 0);
}

export const defaultGeneration = () => ({ firstHourStart: 480, hourLength: 60, weeks: 6, breaks: [] });

function decodeGeneration(v) {
  const g = defaultGeneration();
  if (!isObject(v)) return g;
  try {
    g.firstHourStart = intOr(v.firstHourStart, 480);
    g.hourLength = Math.max(10, intOr(v.hourLength, 60));
    g.weeks = intOr(v.weeks, 6);
    g.breaks = (Array.isArray(v.breaks) ? v.breaks : []).map((b) => {
      if (!isObject(b) || typeof b.id !== 'string' || !Number.isInteger(b.start) || !Number.isInteger(b.duration)) throw new FormatError();
      return { id: b.id, start: b.start, duration: b.duration };
    });
  } catch {
    return defaultGeneration();
  }
  return g;
}

export function emptyTimetable() {
  return {
    entries: [], occurrences: {}, hiddenTests: [], shownTests: [], testRules: emptyRules(),
    alignment: 'automatic', customColors: [], customPalettes: [], generation: defaultGeneration(),
  };
}

/**
 * Legge un orario. Con `strict` (importazione di un backup) un elemento non valido fa
 * rifiutare tutto il documento; altrimenti viene solo saltato.
 */
export function decodeTimetable(v, strict = false) {
  if (!isObject(v)) throw new FormatError();
  const t = emptyTimetable();
  const list = (a) => {
    if (a == null) return [];
    if (!Array.isArray(a)) {
      if (strict) throw new FormatError();
      return [];
    }
    return a;
  };
  t.entries = list(v.entries).map((e) => decodeEntry(e, strict)).filter(Boolean);
  if (v.occurrences != null) {
    if (!isObject(v.occurrences)) {
      if (strict) throw new FormatError();
    } else {
      for (const [key, info] of Object.entries(v.occurrences)) {
        const o = decodeOccurrence(info, strict);
        if (o && !occurrenceIsEmpty(o)) t.occurrences[key] = o;
      }
    }
  }
  t.hiddenTests = list(v.hiddenTests).filter((x) => {
    if (Number.isInteger(x)) return true;
    if (strict) throw new FormatError();
    return false;
  });
  t.shownTests = Array.isArray(v.shownTests) ? v.shownTests.filter(Number.isInteger) : [];
  t.testRules = decodeRules(v.testRules);
  t.alignment = v.alignment === 'free' ? 'free' : 'automatic';
  t.customColors = list(v.customColors).filter((x) => {
    if (Number.isInteger(x)) return true;
    if (strict) throw new FormatError();
    return false;
  }).map((x) => x & 0xFFFFFF);
  t.customPalettes = list(v.customPalettes).map((p) => {
    if (!isObject(p)) {
      if (strict) throw new FormatError();
      return null;
    }
    return {
      id: strOr(p.id, newID()),
      name: strOr(p.name, 'Palette'),
      colors: Array.isArray(p.colors) ? p.colors.filter(Number.isInteger).map((x) => x & 0xFFFFFF) : [],
      isGradient: p.isGradient !== false,
    };
  }).filter(Boolean);
  t.generation = decodeGeneration(v.generation);
  return t;
}

/** Oggetto con le chiavi in ordine e senza valori nulli, come il `JSONEncoder` dell'app. */
function sorted(value) {
  if (Array.isArray(value)) return value.map(sorted);
  if (value instanceof Date) return isoDate(value);
  if (!isObject(value)) return value;
  const result = {};
  for (const key of Object.keys(value).sort()) {
    const v = value[key];
    if (v === undefined || v === null) continue;
    result[key] = sorted(v);
  }
  return result;
}

function encodeEntry(e) {
  return {
    attachments: e.attachments, color: encodeColor(e.color), end: e.end, id: e.id, isWeeklyTest: e.isWeeklyTest,
    kind: e.kind, note: e.note, room: e.room, start: e.start, subjectId: e.subjectId ?? undefined, teacher: e.teacher,
    title: e.title, weekday: e.weekday,
  };
}

export function encodeTimetable(t) {
  return sorted({
    alignment: t.alignment,
    customColors: t.customColors,
    customPalettes: t.customPalettes,
    entries: t.entries.map(encodeEntry),
    generation: t.generation,
    hiddenTests: [...t.hiddenTests].sort((a, b) => a - b),
    occurrences: Object.fromEntries(Object.entries(t.occurrences).map(([k, o]) => [k, { attachments: o.attachments, isTest: o.isTest ?? undefined, note: o.note }])),
    shownTests: [...t.shownTests].sort((a, b) => a - b),
    testRules: { ...t.testRules, periods: t.testRules.periods.map((p) => ({ end: p.end, id: p.id, start: p.start })) },
  });
}

export const occurrenceIsEmpty = (o) => !o.note && !o.attachments.length && o.isTest == null;
export const occurrenceKey = (id, day) => `${id}@${dayKey(day)}`;

export function referencedFiles(t) {
  const names = new Set();
  for (const e of t.entries) for (const a of e.attachments) names.add(a.storedName);
  for (const o of Object.values(t.occurrences)) for (const a of o.attachments) names.add(a.storedName);
  return names;
}

// MARK: - Gruppi e colonne

/**
 * Disposizione degli eventi di una giornata. Gli eventi uguali di seguito formano un blocco;
 * i blocchi che si sovrappongono formano un gruppo ("cluster") con colonne affiancate.
 * Con `splitAtBreaks` (viste Lista e Calendario) un intervallo sul passaggio tra due eventi
 * uguali li separa, così la sua riga può stare in mezzo.
 */
export function timetableLayout(entries, { splitAtBreaks = false } = {}) {
  const lessons = entries.filter((e) => !isBreak(e)).sort(order);
  const breaks = entries.filter(isBreak).sort(order);
  const breakFalls = (junction) => splitAtBreaks && breaks.some((b) => b.start <= junction && junction <= b.end);
  const blocks = [];
  for (const entry of lessons) {
    const key = matchKey(entry);
    let index = -1;
    for (let i = blocks.length - 1; i >= 0; i--) {
      if (blocks[i].end === entry.start && matchKey(blocks[i].entries[0]) === key) { index = i; break; }
    }
    if (index >= 0 && key && !breakFalls(entry.start)) {
      blocks[index].entries.push(entry);
      blocks[index].end = entry.end;
    } else {
      blocks.push({ id: entry.id, entries: [entry], start: entry.start, end: entry.end });
    }
  }
  blocks.sort((a, b) => (a.start - b.start) || (b.end - a.end));

  const clusters = [];
  let current = [];
  let currentEnd = -Infinity;
  const close = () => {
    if (!current.length) return;
    const columnEnds = [];
    const placed = [];
    for (const block of current) {
      const column = columnEnds.findIndex((end) => end <= block.start);
      if (column >= 0) {
        columnEnds[column] = block.end;
        placed.push({ block, column });
      } else {
        columnEnds.push(block.end);
        placed.push({ block, column: columnEnds.length - 1 });
      }
    }
    clusters.push({
      id: current[0].id, blocks: placed, columns: columnEnds.length,
      start: Math.min(...current.map((b) => b.start)), end: Math.max(...current.map((b) => b.end)),
    });
    current = [];
  };
  for (const block of blocks) {
    if (current.length && block.start >= currentEnd) close();
    current.push(block);
    currentEnd = current.length === 1 ? block.end : Math.max(currentEnd, block.end);
  }
  close();

  // Righe della lista: gruppi, intervalli e tempo libero di almeno mezz'ora.
  const listItems = [];
  const pending = [...breaks];
  let lastEnd = null;
  for (const cluster of clusters) {
    while (pending.length && pending[0].start <= cluster.start) listItems.push({ type: 'pause', entry: pending.shift() });
    if (lastEnd != null && cluster.start - lastEnd >= 30) listItems.push({ type: 'gap', start: lastEnd, end: cluster.start });
    listItems.push({ type: 'cluster', cluster });
    lastEnd = Math.max(lastEnd ?? cluster.end, cluster.end);
  }
  for (const entry of pending) listItems.push({ type: 'pause', entry });

  const starts = [...clusters.map((c) => c.start), ...breaks.map((b) => b.start)];
  const ends = [...clusters.map((c) => c.end), ...breaks.map((b) => b.end)];
  const span = starts.length ? { start: Math.min(...starts), end: Math.max(...ends) } : null;
  return { clusters, breaks, listItems, span, blocks };
}

// MARK: - Verifiche di Classeviva

/** La materia dell'evento dell'orario corrisponde a quella della verifica (mai il docente). */
export function subjectMatches(entry, event) {
  if (entry.subjectId != null && event.subjectId != null) return entry.subjectId === event.subjectId;
  const entryName = matchKey(entry);
  const eventName = normalized(event.subjectName ?? '');
  if (!entryName || !eventName) return false;
  if (entryName === eventName) return true;
  return (entryName.length >= 4 && eventName.includes(entryName)) || (eventName.length >= 4 && entryName.includes(eventName));
}

/** Associa le verifiche alla lezione di quell'ora o, altrimenti, alla prima della giornata. */
export function matchTests(tests, entries) {
  const lessons = entries.filter((e) => !isBreak(e)).sort(order);
  const matched = new Map();
  const unmatched = [];
  for (const test of tests) {
    const candidates = lessons.filter((e) => subjectMatches(e, test));
    if (!candidates.length) {
      unmatched.push(test);
      continue;
    }
    const minute = TimeOfDay.of(test.begin);
    const timed = !test.isFullDay && minute > 0 ? candidates.find((e) => e.start <= minute && minute < e.end) : null;
    const target = (timed ?? candidates[0]).id;
    if (!matched.has(target)) matched.set(target, []);
    matched.get(target).push(test);
  }
  return { matched, unmatched };
}

// MARK: - Generatore

export function generationRange(settings, today = new Date()) {
  const schoolStart = schoolYear(today).start;
  const to = startOfDay(today);
  const from = settings.weeks === 0 ? schoolStart : new Date(Math.max(schoolStart, addDays(to, -7 * settings.weeks)));
  return { from: startOfDay(from), to };
}

/**
 * Ricava una bozza dell'orario dalle lezioni registrate: per ogni giorno della settimana e ora
 * tiene le materie che si ripetono (le settimane recenti contano di più).
 */
export function generateEntries(lessons, settings, today = new Date()) {
  const threshold = 0.34;
  const parallelThreshold = 0.6;
  const halfLifeWeeks = 4;
  const keyOf = (l) => (l.subjectId != null ? `id:${l.subjectId}` : `name:${normalized(l.subjectName)}`);
  const byDay = new Map();
  for (const lesson of lessons) {
    if (!(lesson.hour > 0)) continue;
    const k = dayKey(lesson.day ?? startOfDay(lesson.date));
    if (!byDay.has(k)) byDay.set(k, { day: lesson.day ?? startOfDay(lesson.date), lessons: [] });
    byDay.get(k).lessons.push(lesson);
  }
  const observed = new Map();
  const scores = new Map();
  const names = new Map();
  const teachers = new Map();
  const keyInfo = new Map();
  const bump = (map, key, value, amount = 1) => {
    if (!map.has(key)) map.set(key, new Map());
    const inner = map.get(key);
    inner.set(value, (inner.get(value) ?? 0) + amount);
  };
  const todayStart = startOfDay(today);
  for (const { day, lessons: dayLessons } of byDay.values()) {
    const weekday = Weekday.of(day);
    const weeksAgo = Math.max(0, todayStart - day) / (7 * 86_400_000);
    const weight = 0.5 ** (weeksAgo / halfLifeWeeks);
    observed.set(weekday, (observed.get(weekday) ?? 0) + weight);
    const counted = new Set();
    for (const lesson of dayLessons) {
      const key = keyOf(lesson);
      keyInfo.set(key, lesson.subjectId ?? null);
      bump(names, key, lesson.subjectName);
      if (lesson.authorName) bump(teachers, key, lesson.authorName);
      const length = Math.max(1, roundHalfAway(lesson.duration));
      for (let hour = lesson.hour; hour < lesson.hour + length; hour++) {
        const mark = `${hour}|${key}`;
        if (counted.has(mark)) continue;
        counted.add(mark);
        if (!scores.has(weekday)) scores.set(weekday, new Map());
        bump(scores.get(weekday), hour, key, weight);
      }
    }
  }
  const mostCommon = (counts) => {
    if (!counts) return '';
    let best = '';
    let bestCount = -1;
    for (const [value, count] of counts) {
      if (count > bestCount || (count === bestCount && value < best)) {
        best = value;
        bestCount = count;
      }
    }
    return best;
  };
  const entries = [];
  for (const [weekday, hours] of scores) {
    const total = observed.get(weekday) ?? 0;
    if (!(total > 0)) continue;
    for (const [hour, candidates] of hours) {
      const ranked = [...candidates.entries()].sort((a, b) => (a[1] !== b[1] ? b[1] - a[1]
        : (mostCommon(names.get(a[0])) < mostCommon(names.get(b[0])) ? -1 : mostCommon(names.get(a[0])) > mostCommon(names.get(b[0])) ? 1 : 0)));
      const best = ranked[0];
      if (!best || best[1] < threshold * total) continue;
      const chosen = [best[0], ...ranked.slice(1).filter(([, v]) => v >= parallelThreshold * total).map(([k]) => k)];
      const start = settings.firstHourStart + (hour - 1) * settings.hourLength;
      const end = start + settings.hourLength;
      if (start < 0 || end > 1440) continue;
      for (const key of chosen) {
        entries.push(makeEntry({
          weekday, start, end, kind: 'lesson', title: mostCommon(names.get(key)),
          subjectId: keyInfo.get(key) ?? null, teacher: mostCommon(teachers.get(key)),
        }));
      }
    }
  }
  for (const weekday of [...new Set(entries.map((e) => e.weekday))].sort((a, b) => a - b)) {
    const dayEntries = entries.filter((e) => e.weekday === weekday);
    for (const rule of settings.breaks) {
      if (!(rule.duration > 0)) continue;
      const end = Math.min(1440, rule.start + rule.duration);
      if (!dayEntries.some((e) => e.start < end && rule.start < e.end)) continue;
      entries.push(makeEntry({ weekday, start: rule.start, end, kind: 'breakTime', title: 'Intervallo' }));
    }
  }
  entries.sort((a, b) => (a.weekday - b.weekday) || (a.start - b.start) || (a.title < b.title ? -1 : a.title > b.title ? 1 : 0));
  return { entries, analyzedDays: byDay.size };
}

// MARK: - Backup

export const BACKUP_FORMAT = 'com.bcw.timetable-backup';
export const BACKUP_VERSION = 1;

export const BackupError = {
  notABackup: "Il file scelto non è un backup dell'orario di BCW.",
  newerVersion: "Il backup è stato creato da una versione più recente di BCW. Aggiorna l'app per importarlo.",
  noSession: "Accedi a un account per importare l'orario.",
};

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function base64ToBlob(text, type = 'application/octet-stream') {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type });
}

/** Un nome di file semplice: niente cartelle e niente nomi nascosti. */
const isPlainFileName = (name) => !!name && !/[/\\]/.test(name) && !name.startsWith('.');

/** Valida un backup senza applicarlo. Lancia un `Error` con il messaggio da mostrare. */
export function readBackup(text) {
  let json;
  try { json = JSON.parse(text); } catch { throw new Error(BackupError.notABackup); }
  if (!isObject(json) || json.format !== BACKUP_FORMAT) throw new Error(BackupError.notABackup);
  if ((Number.isInteger(json.version) ? json.version : 0) > BACKUP_VERSION) throw new Error(BackupError.newerVersion);
  try {
    if (typeof json.appVersion !== 'string' || !parseISO(json.exportedAt) || !Array.isArray(json.files) ||
      !isObject(json.timetable) || !Number.isInteger(json.version)) throw new FormatError();
    const files = json.files.map((f) => {
      if (!isObject(f) || typeof f.data !== 'string' || typeof f.storedName !== 'string') throw new FormatError();
      return { data: f.data, storedName: f.storedName };
    });
    return { appVersion: json.appVersion, exportedAt: parseISO(json.exportedAt), files, timetable: decodeTimetable(json.timetable, true) };
  } catch {
    throw new Error(BackupError.notABackup);
  }
}

// MARK: - Archivio dell'orario

const safeName = (owner) => (String(owner ?? '').replace(/[^A-Za-z0-9_-]/g, '_') || 'default');
const storageKey = (owner) => `bcw.timetable.${safeName(owner)}`;
const fileSpace = (owner) => `ttfile-${safeName(owner)}`;

const fileTypes = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', heic: 'image/heic', webp: 'image/webp',
  pdf: 'application/pdf', txt: 'text/plain', mp3: 'audio/mpeg', m4a: 'audio/mp4', mp4: 'video/mp4', mov: 'video/quicktime',
};

export function fileExtension(name) {
  const base = String(name ?? '').split('/').pop();
  const dot = base.lastIndexOf('.');
  return dot > 0 && dot < base.length - 1 ? base.slice(dot + 1) : '';
}

export class TimetableStore {
  constructor(onChange) {
    this.onChange = onChange;
    this.owner = null;
    this.timetable = emptyTimetable();
    this.draft = null;
    this.saveError = null;
    this.byWeekday = new Map();
  }

  // MARK: Salvataggio

  /** Carica l'orario di un account (`null` = nessuna sessione). */
  load(owner) {
    this.owner = owner ?? null;
    this.draft = null;
    this.saveError = null;
    let timetable = emptyTimetable();
    if (this.owner != null) {
      try {
        const text = localStorage.getItem(storageKey(this.owner));
        if (text) timetable = decodeTimetable(JSON.parse(text));
      } catch { /* orario vuoto */ }
    }
    this.timetable = timetable;
    this.reindex();
    this.removeUnreferencedFiles();
    this.onChange?.();
  }

  /** Cancella del tutto l'orario di un proprietario (es. quello della demo). */
  static removeData(owner) {
    try { localStorage.removeItem(storageKey(owner)); } catch { /* ignorato */ }
    BlobStore.removeAll(fileSpace(owner));
  }

  /** Il JSON salvato dell'orario di un proprietario (`null` se non c'è). */
  static storedText(owner) {
    try { return localStorage.getItem(storageKey(owner)); } catch { return null; }
  }

  /** Chiave di un file allegato in `BlobStore`. */
  static fileKey(owner, storedName) { return `${fileSpace(owner)}/${storedName}`; }

  /**
   * Copia orario e file da un proprietario a un altro che non ha ancora un orario (es. un
   * account del browser abbinato a un account BCW, che sul server ha un altro id).
   */
  static async copyData(from, to) {
    const text = TimetableStore.storedText(from);
    if (!text || TimetableStore.storedText(to)) return;
    for (const key of await BlobStore.keys(fileSpace(from))) {
      const blob = await BlobStore.get(key);
      if (blob) await BlobStore.put(`${fileSpace(to)}/${key.slice(fileSpace(from).length + 1)}`, blob);
    }
    try { localStorage.setItem(storageKey(to), text); } catch { /* archiviazione piena */ }
  }

  save() {
    if (this.owner == null) return;
    try {
      localStorage.setItem(storageKey(this.owner), JSON.stringify(encodeTimetable(this.timetable)));
      this.saveError = null;
    } catch (error) {
      this.saveError = error.message;
      return;
    }
    this.onSaved?.(this.owner);
  }

  /**
   * Sostituisce l'orario di un proprietario con quello arrivato dal server (senza avvisare
   * `onSaved`). Restituisce il JSON salvato.
   */
  applyRemote(owner, data) {
    let timetable;
    try {
      timetable = decodeTimetable(data);
    } catch {
      return TimetableStore.storedText(owner);
    }
    const text = JSON.stringify(encodeTimetable(timetable));
    try { localStorage.setItem(storageKey(owner), text); } catch { /* archiviazione piena */ }
    if (owner === this.owner) {
      this.timetable = timetable;
      this.reindex();
      this.removeUnreferencedFiles();
      this.onChange?.();
    }
    return text;
  }

  reindex() {
    this.byWeekday = new Map();
    for (const e of this.timetable.entries) {
      if (!this.byWeekday.has(e.weekday)) this.byWeekday.set(e.weekday, []);
      this.byWeekday.get(e.weekday).push(e);
    }
    for (const list of this.byWeekday.values()) list.sort(order);
  }

  mutate(change) {
    change(this.timetable);
    this.reindex();
    this.save();
    this.onChange?.();
  }

  async removeUnreferencedFiles() {
    if (this.owner == null) return;
    const space = fileSpace(this.owner);
    const referenced = referencedFiles(this.timetable);
    for (const key of await BlobStore.keys(space)) {
      if (!referenced.has(key.slice(space.length + 1))) await BlobStore.remove(key);
    }
  }

  // MARK: Lettura

  get isEmpty() { return this.timetable.entries.length === 0; }
  get alignment() { return this.timetable.alignment; }

  entries(weekday, includingDraft = true) {
    if (includingDraft && this.draft) return this.draft.entries.filter((e) => e.weekday === weekday).sort(order);
    return this.byWeekday.get(weekday) ?? [];
  }

  entriesOn(day, includingDraft = true) { return this.entries(Weekday.of(day), includingDraft); }

  entry(id) {
    return this.timetable.entries.find((e) => e.id === id) ?? this.draft?.entries.find((e) => e.id === id) ?? null;
  }

  isDraftEntry(id) {
    return !!this.draft?.entries.some((e) => e.id === id) && !this.timetable.entries.some((e) => e.id === id);
  }

  occurrence(id, day) {
    return this.timetable.occurrences[occurrenceKey(id, day)] ?? { note: '', attachments: [], isTest: null };
  }

  isManualTest(entry, day) {
    if (!day) return entry.isWeeklyTest;
    return this.occurrence(entry.id, day).isTest ?? entry.isWeeklyTest;
  }

  sameNameEntries(entry) {
    const key = matchKey(entry);
    if (!key) return [];
    return this.timetable.entries.filter((e) => e.id !== entry.id && e.kind === entry.kind && matchKey(e) === key);
  }

  get knownTitles() {
    const seen = new Set();
    const titles = [];
    for (const e of this.timetable.entries) {
      if (isBreak(e)) continue;
      const title = displayTitle(e);
      const key = normalized(title);
      if (seen.has(key)) continue;
      seen.add(key);
      titles.push(title);
    }
    return titles.sort();
  }

  get unalignedEntries() { return this.timetable.entries.filter((e) => !isAutoAligned(e)); }

  palette(id) {
    return builtInPalettes.find((p) => p.id === id) ?? this.timetable.customPalettes.find((p) => p.id === id) ?? null;
  }

  get allPalettes() { return [...builtInPalettes, ...this.timetable.customPalettes]; }

  // MARK: Modifiche

  add(entries) { this.mutate((t) => { t.entries.push(...entries); }); }

  /** Salva un evento; con `original` copia i campi cambiati negli eventi con lo stesso nome. */
  saveEntry(entry, original = null) {
    this.mutate((t) => {
      if (original) {
        const key = matchKey(original);
        for (const other of t.entries) {
          if (other.id === entry.id || other.kind !== original.kind || matchKey(other) !== key) continue;
          if (original.title !== entry.title) other.title = entry.title;
          if (original.subjectId !== entry.subjectId) other.subjectId = entry.subjectId;
          if (original.teacher !== entry.teacher) other.teacher = entry.teacher;
          if (original.room !== entry.room) other.room = entry.room;
          if (original.note !== entry.note) other.note = entry.note;
          if (!sameColor(original.color, entry.color) && entry.color?.type !== 'series') other.color = entry.color ? { ...entry.color } : null;
        }
      }
      const index = t.entries.findIndex((e) => e.id === entry.id);
      if (index >= 0) t.entries[index] = entry;
      else t.entries.push(entry);
    });
  }

  delete(ids) {
    const set = new Set(ids);
    this.mutate((t) => {
      t.entries = t.entries.filter((e) => !set.has(e.id));
      for (const key of Object.keys(t.occurrences)) {
        if ([...set].some((id) => key.startsWith(id))) delete t.occurrences[key];
      }
    });
    this.removeUnreferencedFiles();
  }

  move(id, weekday, start, end) {
    const entry = this.timetable.entries.find((e) => e.id === id);
    if (!entry) return;
    const w = weekday ?? entry.weekday;
    if (entry.start === start && entry.end === end && entry.weekday === w) return;
    this.mutate(() => {
      entry.start = start;
      entry.end = end;
      entry.weekday = w;
    });
  }

  /** Copia di un evento subito dopo l'originale. */
  duplicate(entry) {
    const copy = cloneEntry(entry);
    copy.id = newID();
    const length = duration(entry);
    copy.start = Math.min(entry.end, 1440 - length);
    copy.end = copy.start + length;
    if (copy.color?.type === 'series') copy.color = null;
    this.add([copy]);
    return copy;
  }

  deleteAll() {
    this.mutate((t) => {
      t.entries = [];
      t.occurrences = {};
      t.hiddenTests = [];
      t.shownTests = [];
    });
    this.removeUnreferencedFiles();
  }

  // MARK: Note, file e verifiche (per un giorno, ogni settimana o tutti gli eventi uguali)

  targets(entry, scope) {
    return scope === 'allSameName' ? [entry.id, ...this.sameNameEntries(entry).map((e) => e.id)] : [entry.id];
  }

  updateOccurrence(t, id, day, change) {
    const key = occurrenceKey(id, day);
    const info = t.occurrences[key] ?? { note: '', attachments: [], isTest: null };
    change(info);
    if (occurrenceIsEmpty(info)) delete t.occurrences[key];
    else t.occurrences[key] = info;
  }

  /** `scope`: `{ day }` per un solo giorno, `'everyWeek'` o `'allSameName'`. */
  setNote(note, entry, scope) {
    const ids = scope?.day ? null : new Set(this.targets(entry, scope));
    this.mutate((t) => {
      if (scope?.day) this.updateOccurrence(t, entry.id, scope.day, (o) => { o.note = note; });
      else for (const e of t.entries) if (ids.has(e.id)) e.note = note;
    });
  }

  setTest(isTest, entry, scope) {
    if (scope?.day) {
      const weekly = this.entry(entry.id)?.isWeeklyTest ?? false;
      this.mutate((t) => this.updateOccurrence(t, entry.id, scope.day, (o) => { o.isTest = isTest === weekly ? null : isTest; }));
      return;
    }
    const ids = this.targets(entry, scope);
    this.mutate((t) => {
      for (const e of t.entries) if (ids.includes(e.id)) e.isWeeklyTest = isTest;
      for (const [key, o] of Object.entries(t.occurrences)) {
        if (ids.some((id) => key.startsWith(id)) && o.isTest === isTest) {
          o.isTest = null;
          if (occurrenceIsEmpty(o)) delete t.occurrences[key];
        }
      }
    });
  }

  async attach(file, entry, scope, name = file.name) {
    if (this.owner == null) throw new Error('Nessun account attivo.');
    const id = newID();
    const ext = fileExtension(name);
    const storedName = ext ? `${id}.${ext}` : id;
    const ok = await BlobStore.put(`${fileSpace(this.owner)}/${storedName}`, file);
    if (ok == null) throw new Error('Il file non può essere salvato in questo browser.');
    const attachment = { id, name, storedName, size: file.size, addedAt: new Date(Math.floor(Date.now() / 1000) * 1000) };
    const ids = scope?.day ? null : new Set(this.targets(entry, scope));
    this.mutate((t) => {
      if (scope?.day) this.updateOccurrence(t, entry.id, scope.day, (o) => { o.attachments = [...o.attachments, attachment]; });
      else for (const e of t.entries) if (ids.has(e.id)) e.attachments = [...e.attachments, attachment];
    });
    return attachment;
  }

  removeAttachment(attachment, entry, scope) {
    const ids = scope?.day ? null : new Set(this.targets(entry, scope));
    this.mutate((t) => {
      if (scope?.day) this.updateOccurrence(t, entry.id, scope.day, (o) => { o.attachments = o.attachments.filter((a) => a.id !== attachment.id); });
      else for (const e of t.entries) if (ids.has(e.id)) e.attachments = e.attachments.filter((a) => a.id !== attachment.id);
    });
    this.removeUnreferencedFiles();
  }

  /** Il file di un allegato, pronto per l'anteprima (come Quick Look). */
  async openAttachment(attachment) {
    let blob = this.owner != null ? await BlobStore.get(`${fileSpace(this.owner)}/${attachment.storedName}`) : null;
    // Con un account BCW il file può essere solo sul server (aggiunto da un altro dispositivo).
    if (!blob && this.owner != null && this.remoteFile) {
      try { blob = await this.remoteFile(this.owner, attachment.storedName); } catch { /* non disponibile */ }
    }
    if (!blob) throw new Error(`Il file «${attachment.name}» non è più disponibile.`);
    const type = blob.type || fileTypes[fileExtension(attachment.name).toLowerCase()] || 'application/octet-stream';
    const typed = blob.type ? blob : new Blob([blob], { type });
    return { blob: typed, name: attachment.name, type, url: URL.createObjectURL(typed) };
  }

  // MARK: Allineamento

  setAlignment(alignment) {
    this.mutate((t) => {
      t.alignment = alignment;
      if (alignment === 'automatic') t.entries = t.entries.flatMap(alignedPieces);
    });
  }

  // MARK: Verifiche nascoste

  ruleReason(test, unmatched) {
    const rules = this.timetable.testRules;
    if (!rulesCount(rules)) return null;
    if (test.authorName && rules.teachers.includes(test.authorName)) return `Docente: ${test.authorName}`;
    if (test.subjectName && rules.subjects.includes(normalized(test.subjectName))) return `Materia: ${test.subjectName}`;
    const w = Weekday.of(test.begin);
    if (rules.weekdays.includes(w)) return `Giorno: ${Weekday.lower(w)}`;
    const day = startOfDay(test.begin);
    const period = rules.periods.find((p) => startOfDay(p.start) <= day && day <= startOfDay(p.end));
    if (period) return `Periodo: ${fmt.shortDay(period.start)}–${fmt.shortDay(period.end)}`;
    const text = normalized(test.notes);
    const word = rules.keywords.find((k) => k && text.includes(normalized(k)));
    if (word) return `Contiene «${word}»`;
    if (unmatched && rules.unmatched) return 'Senza lezione in orario';
    return null;
  }

  /** `null` se la verifica è visibile; altrimenti `{ manual }` o `{ rule }`. */
  hiddenReason(test, unmatched) {
    const t = this.timetable;
    if (t.shownTests.includes(test.id)) return null;
    if (t.hiddenTests.includes(test.id)) return { manual: true, description: 'Nascosta a mano' };
    const rule = this.ruleReason(test, unmatched);
    return rule ? { rule, description: `Nascosta dalla regola «${rule}»` } : null;
  }

  setTestHidden(hidden, test, unmatched = false) {
    const ruled = this.ruleReason(test, unmatched) != null;
    this.mutate((t) => {
      if (hidden) {
        t.shownTests = t.shownTests.filter((id) => id !== test.id);
        if (!ruled && !t.hiddenTests.includes(test.id)) t.hiddenTests.push(test.id);
      } else {
        t.hiddenTests = t.hiddenTests.filter((id) => id !== test.id);
        if (ruled && !t.shownTests.includes(test.id)) t.shownTests.push(test.id);
      }
    });
  }

  resetTestOverride(id) { this.mutate((t) => { t.shownTests = t.shownTests.filter((x) => x !== id); }); }

  setTestRules(rules) { this.mutate((t) => { t.testRules = rules; }); }

  // MARK: Colori e palette

  saveCustomColor(hex) { this.mutate((t) => { if (!t.customColors.includes(hex)) t.customColors.push(hex); }); }
  deleteCustomColor(hex) { this.mutate((t) => { t.customColors = t.customColors.filter((c) => c !== hex); }); }

  savePalette(palette) {
    this.mutate((t) => {
      const index = t.customPalettes.findIndex((p) => p.id === palette.id);
      if (index >= 0) t.customPalettes[index] = palette;
      else t.customPalettes.push(palette);
    });
  }

  deletePalette(id) {
    this.mutate((t) => {
      t.customPalettes = t.customPalettes.filter((p) => p.id !== id);
      for (const e of t.entries) if (e.color?.type === 'series' && e.color.paletteID === id) e.color = null;
    });
  }

  /** Colora una serie di eventi con una palette (`null` = colore automatico). */
  applyPalette(paletteID, ids) {
    const set = new Set(ids);
    this.mutate((t) => {
      const selected = t.entries.filter((e) => set.has(e.id)).sort(order);
      const positions = seriesPositions(selected);
      selected.forEach((e, offset) => {
        e.color = paletteID == null ? null : { type: 'series', paletteID, index: positions.index[offset], count: positions.count };
      });
    });
  }

  // MARK: Bozza generata

  setDraft(draft) {
    this.draft = draft;
    this.onChange?.();
  }

  discardDraft() { this.setDraft(null); }

  applyDraft(replacing) {
    const draft = this.draft;
    if (!draft) return;
    this.mutate((t) => {
      if (replacing) {
        t.entries = draft.entries;
        t.occurrences = {};
      } else {
        const additions = draft.entries.filter((n) => !t.entries.some((o) => o.weekday === n.weekday &&
          isBreak(o) === isBreak(n) && o.start < n.end && n.start < o.end));
        t.entries.push(...additions);
      }
      t.generation = draft.settings;
    });
    this.draft = null;
    this.removeUnreferencedFiles();
    this.onChange?.();
  }

  // MARK: Backup

  async makeBackup(appVersion) {
    const files = [];
    if (this.owner != null) {
      for (const name of [...referencedFiles(this.timetable)].sort()) {
        const blob = await BlobStore.get(`${fileSpace(this.owner)}/${name}`);
        if (blob) files.push({ data: await blobToBase64(blob), storedName: name });
      }
    }
    return JSON.stringify(sorted({
      appVersion, exportedAt: isoDate(new Date()), files, format: BACKUP_FORMAT,
      timetable: encodeTimetable(this.timetable), version: BACKUP_VERSION,
    }), null, 2);
  }

  async restore(backup) {
    if (this.owner == null) throw new Error(BackupError.noSession);
    const space = fileSpace(this.owner);
    for (const file of backup.files) {
      if (!isPlainFileName(file.storedName)) continue;
      const type = fileTypes[fileExtension(file.storedName).toLowerCase()];
      const ok = await BlobStore.put(`${space}/${file.storedName}`, base64ToBlob(file.data, type));
      if (ok == null) throw new Error('Impossibile salvare i file del backup in questo browser.');
    }
    this.draft = null;
    this.timetable = backup.timetable;
    this.reindex();
    this.save();
    await this.removeUnreferencedFiles();
    this.onChange?.();
  }
}

// MARK: - Giorno predefinito

/**
 * Giorno che l'Orario mostra quando lo sceglie da solo (all'apertura). Stessa regola dell'app iOS
 * e dei widget: oggi, se c'è ancora un evento non finito (fine dopo adesso); altrimenti (eventi di
 * oggi tutti finiti, o nessuno) il primo dei 7 giorni successivi con eventi; se non ce n'è
 * nessuno, oggi. Contano solo gli eventi dell'orario salvato, non gli intervalli, la bozza o le
 * verifiche di Classeviva.
 */
export function defaultTimetableDay(store, now = new Date()) {
  const today = startOfDay(now);
  const events = (day) => store.entries(Weekday.of(day), false).filter((e) => !isBreak(e));
  const minute = TimeOfDay.of(now);
  if (events(today).some((e) => e.end > minute)) return today;
  for (let i = 1; i <= 7; i++) {
    const day = addDays(today, i);
    if (events(day).length) return day;
  }
  return today;
}

// MARK: - Contenuto di una giornata

/**
 * Tutto ciò che serve per mostrare un giorno: eventi (della bozza, se c'è), disposizione,
 * verifiche di Classeviva associate alle lezioni e segni di note, file e verifiche.
 */
export function dayContent(model, day, { splitAtBreaks = true } = {}) {
  const store = model.timetable;
  const entries = store.entriesOn(day);
  const layout = timetableLayout(entries, { splitAtBreaks });
  const isDraft = !!store.draft;
  const tests = model.events(day).filter((e) => e.kind === 'test');
  const { matched, unmatched } = matchTests(tests, entries);
  const registerTests = new Map();
  const hiddenTests = new Map();
  for (const [id, list] of matched) {
    const visible = list.filter((t) => !store.hiddenReason(t, false));
    const hidden = list.filter((t) => store.hiddenReason(t, false));
    if (visible.length) registerTests.set(id, visible);
    if (hidden.length) hiddenTests.set(id, hidden);
  }
  const unmatchedTests = unmatched.filter((t) => !store.hiddenReason(t, true));
  const badges = new Map();
  for (const entry of entries) {
    const info = isDraft ? { note: '', attachments: [], isTest: null } : store.occurrence(entry.id, day);
    const manual = !isDraft && store.isManualTest(entry, day);
    badges.set(entry.id, {
      isTest: manual || registerTests.has(entry.id),
      isRegisterTest: registerTests.has(entry.id),
      hasNote: !!(entry.note || info.note),
      attachmentCount: entry.attachments.length + info.attachments.length,
    });
  }
  const testCount = [...badges.values()].filter((b) => b.isTest).length + unmatchedTests.length;
  return { day, entries, layout, isDraft, registerTests, hiddenTests, unmatchedTests, badges, testCount };
}
