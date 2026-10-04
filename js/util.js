// Utilità condivise: date, stringhe, formattazione e identificatori stabili.

// MARK: - Date

const DAY = 86_400_000;

export function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function addMonths(date, months) {
  const d = new Date(date.getFullYear(), date.getMonth() + months, 1);
  return d;
}

export function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export const isToday = (d) => isSameDay(d, new Date());
export const isTomorrow = (d) => isSameDay(d, addDays(new Date(), 1));
export const isYesterday = (d) => isSameDay(d, addDays(new Date(), -1));
export const isWeekend = (d) => d.getDay() === 0 || d.getDay() === 6;

/** La settimana inizia di lunedì, come in Italia. */
export function startOfWeek(date) {
  const d = startOfDay(date);
  const offset = (d.getDay() + 6) % 7;
  return addDays(d, -offset);
}

export function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

/** Giorni di calendario tra due date (ignora l'ora legale). */
export function daysBetween(from, to) {
  const a = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const b = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((b - a) / DAY);
}

const pad = (n, len = 2) => String(n).padStart(len, '0');

/** Chiave del giorno: `yyyy-MM-dd`. */
export function dayKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Formato richiesto nei path delle API: `yyyyMMdd`. */
export function apiString(date) {
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
}

export function parseAPIDate(s) {
  const m = /^(\d{4})(\d{2})(\d{2})$/.exec(s || '');
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
}

/** Interpreta le date restituite da Classeviva (ISO 8601, solo giorno, ecc.). */
export function parseDate(value) {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s) return null;
  // Data e ora con fuso orario: la gestisce il motore JavaScript.
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/.test(s)) {
    const d = new Date(s);
    if (!isNaN(d)) return d;
  }
  // Data e ora locali, con `T` o con lo spazio.
  let m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/.exec(s);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  return null;
}

/** Inizio e fine dell'anno scolastico che contiene `date` (1 settembre – 31 agosto). */
export function schoolYear(date = new Date()) {
  const startYear = date.getMonth() >= 8 ? date.getFullYear() : date.getFullYear() - 1;
  return {
    start: new Date(startYear, 8, 1),
    end: new Date(startYear + 1, 7, 31),
    startYear,
  };
}

/** Data e ora in ISO 8601 con il fuso locale (come `ISO8601DateFormatter`). */
export function isoLocal(date) {
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  const abs = Math.abs(offset);
  return `${dayKey(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` +
    `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

// MARK: - Formattazione in italiano

const formatters = new Map();
function it(options, date) {
  const key = JSON.stringify(options);
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat('it-IT', options);
    formatters.set(key, f);
  }
  return f.format(date);
}

export const fmt = {
  /** "Domani", "Oggi", "Ieri" oppure "Lunedì 5 ottobre". */
  relativeDayName(d) {
    if (isToday(d)) return 'Oggi';
    if (isTomorrow(d)) return 'Domani';
    if (isYesterday(d)) return 'Ieri';
    return fmt.longDay(d);
  },
  /** Come `relativeDayName`, ma in forma breve: "Gio 1 ott". */
  relativeShortDayName(d) {
    if (isToday(d) || isTomorrow(d) || isYesterday(d)) return fmt.relativeDayName(d);
    return capFirst(it({ weekday: 'short', day: 'numeric', month: 'short' }, d).replace(/\./g, ''));
  },
  longDay: (d) => capFirst(it({ weekday: 'long', day: 'numeric', month: 'long' }, d)),
  shortDay: (d) => it({ day: 'numeric', month: 'short' }, d),
  shortDayWithYear: (d) => it({ day: 'numeric', month: 'short', year: 'numeric' }, d),
  weekdayShort: (d) => capFirst(it({ weekday: 'short' }, d)),
  weekdayNarrow: (d) => it({ weekday: 'narrow' }, d).toUpperCase(),
  monthYear: (d) => capFirst(it({ month: 'long', year: 'numeric' }, d)),
  monthShort: (d) => it({ month: 'short' }, d),
  time: (d) => it({ hour: '2-digit', minute: '2-digit' }, d),
  year: (d) => String(d.getFullYear()),
  day: (d) => String(d.getDate()),
};

const avgFormatter = new Intl.NumberFormat('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const shortFormatter = new Intl.NumberFormat('it-IT', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const euroFormatter = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });

export const GradeFormat = {
  average: (v) => (v == null || isNaN(v) ? '–' : avgFormatter.format(v)),
  short: (v) => (v == null || isNaN(v) ? '–' : shortFormatter.format(v)),
  euro: (v) => euroFormatter.format(v),
};

// MARK: - Stringhe

export function capFirst(s) {
  if (!s) return s || '';
  return s.charAt(0).toLocaleUpperCase('it-IT') + s.slice(1);
}

/** "MATEMATICA E FISICA" → "Matematica e fisica". */
export function sentenceCased(s) {
  return capFirst((s || '').toLocaleLowerCase('it-IT'));
}

/** "ROSSI MARIO" → "Rossi Mario". */
export function nameCased(s) {
  return (s || '').toLocaleLowerCase('it-IT').replace(/(^|[\s\-'’(])(\p{L})/gu, (_, sep, ch) => sep + ch.toLocaleUpperCase('it-IT'));
}

export function nilIfEmpty(s) {
  if (s == null) return null;
  const t = String(s).trim();
  return t ? t : null;
}

/** Ricerca senza distinzione tra maiuscole e minuscole. */
export function contains(haystack, needle) {
  if (!needle) return true;
  return (haystack || '').toLocaleLowerCase('it-IT').includes(needle.toLocaleLowerCase('it-IT'));
}

/** Escape per l'HTML: tutto il testo che arriva dal server passa da qui. */
export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function plural(n, one, many) {
  return n === 1 ? one : many.replace('#', n);
}

// MARK: - Identificatori

const MASK64 = (1n << 64n) - 1n;

/** Identificatore deterministico (djb2) per gli elementi senza un id dal server. */
export const StableID = {
  make(...parts) {
    let hash = 5381n;
    for (const byte of new TextEncoder().encode(parts.join('|'))) {
      hash = ((hash << 5n) + hash + BigInt(byte)) & MASK64;
    }
    return Number(hash & 0x7FFF_FFFF_FFFFn);
  },
};

/** Generatore pseudo-casuale con seme (SplitMix64), per dati demo stabili. */
export class SeededRandom {
  constructor(seed) {
    this.state = (BigInt(Math.floor(seed)) + 0x9E3779B97F4A7C15n) & MASK64;
  }

  nextUInt64() {
    this.state = (this.state + 0x9E3779B97F4A7C15n) & MASK64;
    let z = this.state;
    z = ((z ^ (z >> 30n)) * 0xBF58476D1CE4E5B9n) & MASK64;
    z = ((z ^ (z >> 27n)) * 0x94D049BB133111EBn) & MASK64;
    return z ^ (z >> 31n);
  }

  next(upTo) {
    if (upTo <= 0) return 0;
    return Number(this.nextUInt64() % BigInt(upTo));
  }
}

export function uuid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function groupBy(list, keyFn) {
  const map = new Map();
  for (const item of list) {
    const key = keyFn(item);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  }
  return map;
}

export function uniqueSorted(list) {
  return [...new Set(list)].sort((a, b) => a.localeCompare(b, 'it'));
}

export const byName = (a, b) => a.localeCompare(b, 'it');
