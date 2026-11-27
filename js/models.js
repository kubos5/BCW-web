// Modelli decodificati in modo tollerante.
//
// Le API di Classeviva non sono documentate ufficialmente e i tipi dei campi
// cambiano di tanto in tanto (numeri come stringhe, booleani come 0/1, ecc.):
// un campo inatteso non deve far fallire l'intera risposta.

import { parseDate, dayKey, startOfDay, addDays, sentenceCased, nameCased, nilIfEmpty, StableID, fmt } from './util.js';

// MARK: - Decodifica tollerante

export function str(o, key) {
  const v = o?.[key];
  if (v == null) return null;
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return null;
}

export function int(o, key) {
  const v = o?.[key];
  if (typeof v === 'number' && isFinite(v)) return Math.trunc(v);
  if (typeof v === 'string' && /^\s*-?\d+\s*$/.test(v)) return parseInt(v, 10);
  return null;
}

export function dbl(o, key) {
  const v = o?.[key];
  if (typeof v === 'number' && isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v.replace(',', '.'));
    return v.trim() && isFinite(n) ? n : null;
  }
  return null;
}

export function bool(o, key) {
  const v = o?.[key];
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'string') return ['true', '1', 's', 'si', 'sì', 'y', 'yes'].includes(v.toLowerCase());
  return false;
}

/** Array che scarta gli elementi non decodificabili invece di fallire. */
export function arr(o, key, parse) {
  const v = o?.[key];
  if (!Array.isArray(v)) return [];
  const result = [];
  for (const item of v) {
    if (item == null || typeof item !== 'object') continue;
    try {
      const parsed = parse ? parse(item) : item;
      if (parsed != null) result.push(parsed);
    } catch {
      // Elemento scartato.
    }
  }
  return result;
}

function obj(o, key) {
  const v = o?.[key];
  return v && typeof v === 'object' && !Array.isArray(v) ? v : null;
}

const distantPast = new Date(0);

// MARK: - Accesso e profilo

export function parseLoginChoice(c) {
  return { ident: str(c, 'ident') ?? '', name: str(c, 'name') ?? '', school: str(c, 'school') ?? '' };
}

export function parseLoginResponse(c) {
  return {
    ident: str(c, 'ident'),
    firstName: str(c, 'firstName'),
    lastName: str(c, 'lastName'),
    token: str(c, 'token'),
    expire: parseDate(str(c, 'expire')),
    choices: arr(c, 'choices', parseLoginChoice),
  };
}

export function parseCard(c) {
  const card = {
    ident: str(c, 'ident') ?? '',
    usrType: str(c, 'usrType') ?? 'S',
    firstName: str(c, 'firstName') ?? '',
    lastName: str(c, 'lastName') ?? '',
    birthDate: parseDate(str(c, 'birthDate')),
    fiscalCode: str(c, 'fiscalCode'),
    schoolCode: str(c, 'schCode'),
    schoolName: str(c, 'schName'),
    schoolDedication: str(c, 'schDedication'),
    schoolCity: str(c, 'schCity'),
    schoolProvince: str(c, 'schProv'),
    miurSchoolCode: str(c, 'miurSchoolCode'),
  };
  card.fullName = nameCased(`${card.firstName} ${card.lastName}`);
  card.initials = ((card.firstName[0] || '') + (card.lastName[0] || '')).toUpperCase();
  const parts = [card.schoolName, card.schoolDedication].map(nilIfEmpty).filter(Boolean);
  card.schoolDescription = parts.length ? nameCased(parts.join(' ')) : null;
  card.userTypeDescription = { G: 'Genitore', S: 'Studente' }[card.usrType] ?? 'Utente';
  return card;
}

export function parseCardResponse(c) {
  const single = obj(c, 'card');
  if (single) return { card: parseCard(single) };
  const list = arr(c, 'cards', parseCard);
  return { card: list[0] ?? null };
}

// MARK: - Materie, periodi, calendario

export function parseSubject(c) {
  return {
    id: int(c, 'id') ?? 0,
    name: sentenceCased(str(c, 'description') ?? ''),
    order: int(c, 'order') ?? 0,
    teachers: arr(c, 'teachers', (t) => nameCased(str(t, 'teacherName') ?? '')),
  };
}

export const parseSubjectsResponse = (c) => ({ subjects: arr(c, 'subjects', parseSubject) });

export function parsePeriod(c) {
  const position = int(c, 'periodPos') ?? 0;
  return {
    id: position,
    code: str(c, 'periodCode') ?? '',
    position,
    name: sentenceCased(str(c, 'periodDesc') ?? 'Periodo'),
    label: str(c, 'periodLabel'),
    isFinal: bool(c, 'isFinal'),
    start: parseDate(str(c, 'dateStart')),
    end: parseDate(str(c, 'dateEnd')),
  };
}

export const parsePeriodsResponse = (c) => ({ periods: arr(c, 'periods', parsePeriod) });

export function syntheticPeriod(position, name) {
  return parsePeriod({ periodPos: position, periodDesc: name });
}

export function parseCalendarDay(c) {
  const status = str(c, 'dayStatus') ?? 'US';
  return {
    date: parseDate(str(c, 'dayDate')) ?? distantPast,
    status,
    isSchoolDay: status === 'SD',
    isHoliday: status === 'HD' || status === 'NW',
  };
}

export const parseCalendarResponse = (c) => ({ days: arr(c, 'calendar', parseCalendarDay) });

// MARK: - Voti

export function parseGrade(c) {
  const g = {
    subjectId: int(c, 'subjectId') ?? 0,
    subjectName: sentenceCased(str(c, 'subjectDesc') ?? 'Materia'),
    code: str(c, 'evtCode') ?? '',
    date: parseDate(str(c, 'evtDate')) ?? distantPast,
    value: dbl(c, 'decimalValue'),
    displayValue: str(c, 'displayValue') ?? '–',
    notes: nilIfEmpty(str(c, 'notesForFamily')),
    color: str(c, 'color') ?? '',
    canceled: bool(c, 'canceled'),
    underlined: bool(c, 'underlined'),
    periodPosition: int(c, 'periodPos') ?? 0,
    periodName: sentenceCased(str(c, 'periodDesc') ?? ''),
    componentName: nilIfEmpty(str(c, 'componentDesc')),
    weight: dbl(c, 'weightFactor'),
    noAverage: bool(c, 'noAverage'),
    teacherName: nilIfEmpty(str(c, 'teacherName')),
    skillDescription: nilIfEmpty(str(c, 'skillDesc')),
  };
  if (g.componentName) g.componentName = sentenceCased(g.componentName);
  if (g.teacherName) g.teacherName = nameCased(g.teacherName);
  g.id = int(c, 'evtId') ?? StableID.make(g.subjectName, g.displayValue, dayKey(g.date));
  // Un voto concorre alla media se ha un valore numerico e non è annullato,
  // "blu" (non fa media) o una prova con punteggio (GRT1, es. "35/50").
  g.countsTowardAverage = g.value != null && !g.canceled && !g.noAverage && g.color !== 'blue' && g.code !== 'GRT1';
  g.kind = g.componentName ?? ({ GRV0: 'Scritto', GRV1: 'Orale', GRV2: 'Pratico', GRT1: 'Prova' }[g.code] ?? 'Voto');
  return g;
}

export const parseGradesResponse = (c) => ({ grades: arr(c, 'grades', parseGrade) });

// MARK: - Agenda, lezioni, assenze

export const AgendaKind = {
  homework: { id: 'homework', title: 'Compiti', icon: 'book' },
  test: { id: 'test', title: 'Verifiche', icon: 'clipboardPen' },
  event: { id: 'event', title: 'Eventi', icon: 'calendar' },
};

const testWords = ['verifica', 'compito in classe', 'interrogazion', 'test ', 'prova scritta',
  'prova orale', 'simulazione', 'esame', 'compito di', 'verifiche'];
const homeworkWords = ['per casa', 'esercizi', 'studiare', 'pag.', 'pagina', 'leggere', 'ripassare'];

export function parseAgendaEvent(c) {
  const e = {
    code: str(c, 'evtCode') ?? 'AGNT',
    begin: parseDate(str(c, 'evtDatetimeBegin')) ?? distantPast,
    isFullDay: bool(c, 'isFullDay'),
    notes: (str(c, 'notes') ?? '').trim(),
    authorName: nameCased(str(c, 'authorName') ?? ''),
    classDescription: nilIfEmpty(str(c, 'classDesc')),
    subjectId: int(c, 'subjectId'),
    subjectName: nilIfEmpty(str(c, 'subjectDesc')),
    homeworkId: int(c, 'homeworkId'),
    attachments: 0,
  };
  e.end = parseDate(str(c, 'evtDatetimeEnd')) ?? e.begin;
  if (e.subjectName) e.subjectName = sentenceCased(e.subjectName);
  e.id = int(c, 'evtId') ?? StableID.make(e.code, e.notes, dayKey(e.begin));
  // Classeviva distingue i compiti (AGHW, e NEWDC quelli del modulo Compiti) dagli altri eventi
  // (AGNT/AGCR); le verifiche non hanno un codice dedicato, quindi le riconosciamo dal testo.
  const text = e.notes.toLowerCase();
  if (e.code === 'AGHW' || e.code === HOMEWORK_MODULE_CODE) e.kind = 'homework';
  else if (testWords.some((w) => text.includes(w))) e.kind = 'test';
  else if (e.code === 'AGNT' && e.subjectName != null && homeworkWords.some((w) => text.includes(w))) e.kind = 'homework';
  else e.kind = 'event';
  e.day = startOfDay(e.begin);
  e.title = e.subjectName ?? (e.authorName || 'Evento');
  if (e.isFullDay) e.timeDescription = 'Tutto il giorno';
  else if (e.begin.getTime() === e.end.getTime()) e.timeDescription = fmt.time(e.begin);
  else e.timeDescription = `${fmt.time(e.begin)} – ${fmt.time(e.end)}`;
  return e;
}

export const parseAgendaResponse = (c) => ({ events: arr(c, 'agenda', parseAgendaEvent) });

// MARK: - Compiti del modulo Compiti

/**
 * Compiti del modulo Compiti di Classeviva (4.0, come `Homework` nell'app; issue 16 su GitHub):
 * i docenti possono assegnare i compiti come compiti veri e propri (codice NEWDC) invece che come
 * annotazioni dell'agenda. Non sono in `agenda/all` e arrivano da `homeworks/index` (formato da
 * https://github.com/open-viva/endpoints#compiti). In BCW diventano eventi dell'agenda di tipo
 * compito nel giorno di consegna (`homeworkEvent`), così compaiono ovunque ci siano i compiti.
 */
export const HOMEWORK_MODULE_CODE = 'NEWDC';
export const HOMEWORK_PATH = 'homeworks/index';

/**
 * Id in BCW di un compito del modulo Compiti: il suo id con il segno meno, perché gli id dei
 * compiti e quelli degli eventi dell'agenda sono numerati a parte e potrebbero coincidere (i compiti
 * fatti, sincronizzati con l'account BCW, sono un elenco di id).
 */
export const homeworkEventID = (id) => -Math.abs(id);

/** "14:30" o "14:30:00" → minuti dalla mezzanotte. */
function minutesOf(text) {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(text ?? '').trim());
  if (!m) return null;
  const hours = Number(m[1]);
  const minutes = Number(m[2]);
  return hours < 24 && minutes < 60 ? hours * 60 + minutes : null;
}

export function parseHomework(c) {
  const day = parseDate(str(c, 'expiryDate'));
  if (!day) throw new Error('Compito senza data di consegna');
  const text = (str(c, 'homeworkDesc') ?? '').trim();
  const time = minutesOf(str(c, 'expiryTime'));
  const due = startOfDay(day);
  if (time != null) due.setHours(Math.floor(time / 60), time % 60);
  const subjectName = nilIfEmpty(str(c, 'subjectDesc'));
  const count = (key) => (Array.isArray(c?.[key]) ? c[key].length : 0);
  return {
    id: int(c, 'evtId') ?? StableID.make('NEWDC', text, dayKey(day)),
    text,
    teacherName: nameCased(str(c, 'teacherName') ?? ''),
    subjectId: int(c, 'subjectId'),
    subjectName: subjectName ? sentenceCased(subjectName) : null,
    assignedOn: parseDate(str(c, 'assignmentDate')),
    due,
    hasDueTime: time != null,
    // Segnato come fatto su Classeviva (`homeworkMarkedDone`) o chiuso (`homeworkDone`).
    isDone: bool(c, 'homeworkMarkedDone') || bool(c, 'homeworkDone'),
    // File e link del docente: BCW non li apre, sono sul sito di Classeviva.
    attachments: count('teacherFiles') + count('teacherLinks'),
  };
}

export function parseHomeworksResponse(c) {
  const items = arr(c, 'items', parseHomework);
  return { items: items.length ? items : arr(c, 'homeworks', parseHomework) };
}

/**
 * Una risposta di `homeworks/index`: un oggetto con l'elenco dei compiti, anche vuoto. Distingue i
 * compiti da una risposta qualsiasi (una pagina di errore, un JSON d'altro tipo).
 */
export function isHomeworksResponse(json) {
  return !!json && typeof json === 'object' && (Array.isArray(json.items) || Array.isArray(json.homeworks));
}

/** Un compito del modulo Compiti come evento dell'agenda, nel giorno di consegna. */
export function homeworkEvent(h) {
  const e = {
    id: homeworkEventID(h.id),
    code: HOMEWORK_MODULE_CODE,
    begin: h.due,
    end: h.due,
    isFullDay: !h.hasDueTime,
    notes: h.text,
    authorName: h.teacherName,
    classDescription: null,
    subjectId: h.subjectId,
    subjectName: h.subjectName,
    homeworkId: h.id,
    attachments: h.attachments,
    kind: 'homework',
    day: startOfDay(h.due),
  };
  e.title = e.subjectName ?? (e.authorName || 'Compito');
  e.timeDescription = e.isFullDay ? 'Tutto il giorno' : fmt.time(e.begin);
  return e;
}

/**
 * Eventi di `agenda/all` più i compiti del modulo Compiti, in ordine. Un compito che l'agenda ha già
 * (un evento AGHW con il suo `homeworkId`) non viene ripetuto.
 */
export function mergeAgenda(events, homework) {
  if (!homework.length) return [...events].sort((a, b) => a.begin - b.begin);
  const linked = new Set(events.filter((e) => e.code !== HOMEWORK_MODULE_CODE && e.homeworkId != null).map((e) => e.homeworkId));
  const extra = homework.filter((e) => !linked.has(e.homeworkId ?? 0));
  return [...events, ...extra].sort((a, b) => a.begin - b.begin);
}

export function parseLesson(c) {
  const l = {
    date: parseDate(str(c, 'evtDate')) ?? distantPast,
    code: str(c, 'evtCode') ?? '',
    hour: int(c, 'evtHPos') ?? 0,
    duration: dbl(c, 'evtDuration') ?? 1,
    classDescription: nilIfEmpty(str(c, 'classDesc')),
    authorName: nameCased(str(c, 'authorName') ?? ''),
    subjectId: int(c, 'subjectId'),
    subjectName: sentenceCased(str(c, 'subjectDesc') ?? 'Lezione'),
    type: sentenceCased(str(c, 'lessonType') ?? ''),
    topic: (str(c, 'lessonArg') ?? '').trim(),
  };
  l.id = int(c, 'evtId') ?? StableID.make(l.subjectName, String(l.hour), dayKey(l.date));
  l.day = startOfDay(l.date);
  const d = Math.round(l.duration);
  l.hoursDescription = d <= 1 ? `${l.hour}ª ora` : `${l.hour}ª–${l.hour + d - 1}ª ora`;
  return l;
}

export const parseLessonsResponse = (c) => ({ lessons: arr(c, 'lessons', parseLesson) });

export const AbsenceKind = {
  absence: { id: 'absence', title: 'Assenza', plural: 'Assenze', icon: 'userX', letter: 'A' },
  late: { id: 'late', title: 'Ritardo', plural: 'Ritardi', icon: 'clockAlert', letter: 'R' },
  shortLate: { id: 'shortLate', title: 'Ritardo breve', plural: 'Ritardi brevi', icon: 'clock', letter: 'Rb' },
  earlyExit: { id: 'earlyExit', title: 'Uscita anticipata', plural: 'Uscite', icon: 'doorOpen', letter: 'U' },
};

export function parseAbsence(c) {
  const a = {
    code: str(c, 'evtCode') ?? 'ABA0',
    date: parseDate(str(c, 'evtDate')) ?? distantPast,
    hour: int(c, 'evtHPos'),
    value: int(c, 'evtValue'),
    isJustified: bool(c, 'isJustified'),
    justificationReason: nilIfEmpty(str(c, 'justifReasonDesc')),
  };
  a.id = int(c, 'evtId') ?? StableID.make(a.code, dayKey(a.date));
  a.kind = { ABR0: 'late', ABR1: 'shortLate', ABU0: 'earlyExit' }[a.code] ?? 'absence';
  a.day = startOfDay(a.date);
  switch (a.kind) {
    case 'absence': a.detail = 'Giornata intera'; break;
    case 'late': case 'shortLate': a.detail = a.hour != null ? `Entrata alla ${a.hour}ª ora` : 'Entrata in ritardo'; break;
    default: a.detail = a.hour != null ? `Uscita alla ${a.hour}ª ora` : 'Uscita anticipata';
  }
  return a;
}

export const parseAbsencesResponse = (c) => ({ events: arr(c, 'events', parseAbsence) });

// MARK: - Bacheca

export function parseNotice(c) {
  const n = {
    pubId: int(c, 'pubId') ?? 0,
    publishedAt: parseDate(str(c, 'pubDT')),
    isRead: bool(c, 'readStatus'),
    eventCode: str(c, 'evtCode') ?? 'CF',
    contentId: int(c, 'cntId') ?? 0,
    validFrom: parseDate(str(c, 'cntValidFrom')),
    validTo: parseDate(str(c, 'cntValidTo')),
    isValid: bool(c, 'cntValidInRange'),
    status: str(c, 'cntStatus') ?? '',
    title: (str(c, 'cntTitle') ?? 'Comunicazione').trim(),
    category: nilIfEmpty(str(c, 'cntCategory') ?? 'Altro') ?? 'Altro',
    hasChanged: bool(c, 'cntHasChanged'),
    hasAttachments: bool(c, 'cntHasAttach'),
    needsJoin: bool(c, 'needJoin'),
    needsReply: bool(c, 'needReply'),
    needsFile: bool(c, 'needFile'),
    needsSign: bool(c, 'needSign'),
    attachments: arr(c, 'attachments', (a) => ({ fileName: str(a, 'fileName') ?? 'Allegato', number: int(a, 'attachNum') ?? 1 })),
  };
  n.id = n.pubId;
  n.requiresAction = n.needsJoin || n.needsSign || n.needsReply;
  n.isDeleted = n.status === 'deleted';
  return n;
}

export const parseNoticeboardResponse = (c) => ({ items: arr(c, 'items', parseNotice) });

/** Risposta di `noticeboard/read`: testo completo e stato di adesione/firma. */
export function parseNoticeDetail(c) {
  const item = obj(c, 'item');
  const reply = obj(c, 'reply');
  return {
    title: str(item, 'title'),
    text: str(item, 'text'),
    joined: reply ? bool(reply, 'replJoin') : false,
    signed: reply ? bool(reply, 'replSign') : false,
    replyText: nilIfEmpty(str(reply, 'replText')),
  };
}

// MARK: - Note disciplinari

export const NoteCategory = {
  NTTE: { id: 'NTTE', title: 'Annotazioni', singular: 'Annotazione', icon: 'stickyNote' },
  NTCL: { id: 'NTCL', title: 'Note disciplinari', singular: 'Nota disciplinare', icon: 'messageAlert' },
  NTWN: { id: 'NTWN', title: 'Richiami', singular: 'Richiamo', icon: 'hand' },
  NTST: { id: 'NTST', title: 'Sanzioni', singular: 'Sanzione disciplinare', icon: 'octagonAlert' },
};

function parseNoteDTO(c) {
  const text = str(c, 'evtText') ?? '';
  const date = parseDate(str(c, 'evtDate')) ?? distantPast;
  return {
    id: int(c, 'evtId') ?? StableID.make(text, dayKey(date)),
    text,
    date,
    authorName: nameCased(str(c, 'authorName') ?? ''),
    isRead: bool(c, 'readStatus'),
    code: str(c, 'evtCode'),
  };
}

/** `notes/all` restituisce un oggetto con una lista per categoria. */
export function parseNotesResponse(c) {
  const result = [];
  if (Array.isArray(c)) {
    for (const item of c) {
      if (!item || typeof item !== 'object') continue;
      const dto = parseNoteDTO(item);
      result.push({ ...dto, category: NoteCategory[dto.code] ? dto.code : 'NTTE' });
    }
  } else if (c && typeof c === 'object') {
    for (const category of Object.keys(NoteCategory)) {
      for (const dto of arr(c, category, parseNoteDTO)) result.push({ ...dto, category });
    }
  }
  return { notes: result.sort((a, b) => b.date - a.date) };
}

export function parseNoteReadResponse(c) {
  return { text: str(obj(c, 'event'), 'evtText') };
}

// MARK: - Materiale didattico

const fileIcons = {
  pdf: 'fileText', jpg: 'image', jpeg: 'image', png: 'image', heic: 'image', gif: 'image',
  ppt: 'presentation', pptx: 'presentation', key: 'presentation',
  xls: 'table', xlsx: 'table', csv: 'table', numbers: 'table',
  mp3: 'audio', m4a: 'audio', wav: 'audio', mp4: 'film', mov: 'film', zip: 'archive', rar: 'archive',
};

export function parseDidacticContent(c) {
  const d = {
    id: int(c, 'contentId') ?? 0,
    name: (str(c, 'contentName') ?? 'Contenuto').trim(),
    objectType: str(c, 'objectType') ?? 'file',
    sharedAt: parseDate(str(c, 'shareDT')),
  };
  const type = d.objectType.toLowerCase();
  d.kind = type === 'link' ? 'link' : type === 'text' ? 'text' : 'file';
  if (d.kind === 'link') d.icon = 'link';
  else if (d.kind === 'text') d.icon = 'alignLeft';
  else {
    const ext = d.name.includes('.') ? d.name.split('.').pop().toLowerCase() : '';
    d.icon = fileIcons[ext] ?? 'file';
  }
  return d;
}

export function parseDidacticFolder(c) {
  const raw = (str(c, 'folderName') ?? '').trim();
  return {
    id: int(c, 'folderId') ?? 0,
    name: !raw || raw === 'Uncategorized' ? 'Senza cartella' : raw,
    lastShare: parseDate(str(c, 'lastShareDT')),
    contents: arr(c, 'contents', parseDidacticContent),
  };
}

export function parseDidacticTeacher(c) {
  const first = str(c, 'teacherFirstName') ?? '';
  const last = str(c, 'teacherLastName') ?? '';
  const full = str(c, 'teacherName') ?? `${first} ${last}`;
  const folders = arr(c, 'folders', parseDidacticFolder);
  const shares = folders.map((f) => f.lastShare).filter(Boolean);
  return {
    id: str(c, 'teacherId') ?? String(StableID.make(full)),
    name: nameCased(full.trim()),
    folders,
    lastShare: shares.length ? new Date(Math.max(...shares)) : null,
  };
}

export function parseDidacticsResponse(c) {
  // Il campo si chiama davvero "didacticts" nell'API.
  const primary = arr(c, 'didacticts', parseDidacticTeacher);
  return { teachers: primary.length ? primary : arr(c, 'didactics', parseDidacticTeacher) };
}

// MARK: - Scrutini e documenti

export function parseDocumentsResponse(c) {
  return {
    documents: arr(c, 'documents', (d) => {
      const hash = str(d, 'hash') ?? '';
      return { id: hash, documentHash: hash, title: str(d, 'desc') ?? 'Documento' };
    }),
    schoolReports: arr(c, 'schoolReports', (r) => {
      const title = str(r, 'desc') ?? 'Pagella';
      const viewLink = nilIfEmpty(str(r, 'viewLink'));
      return { id: title + (viewLink ?? ''), title, viewLink, confirmLink: nilIfEmpty(str(r, 'confirmLink')) };
    }),
  };
}

export function parseDocumentCheck(c) {
  const doc = obj(c, 'document');
  return { available: doc ? bool(doc, 'available') : false };
}

// MARK: - Libri di testo

export function parseSchoolbook(c) {
  const b = {
    isbn: str(c, 'isbnCode') ?? '',
    title: sentenceCased(str(c, 'title') ?? 'Libro'),
    subtitle: nilIfEmpty(str(c, 'subheading')) ?? nilIfEmpty(str(c, 'subtitle')),
    volume: nilIfEmpty(str(c, 'volume')),
    author: nilIfEmpty(str(c, 'author')),
    publisher: nilIfEmpty(str(c, 'publisher')),
    subject: sentenceCased(str(c, 'subjectDesc') ?? 'Altro'),
    price: dbl(c, 'price'),
    toBuy: bool(c, 'toBuy'),
    alreadyOwned: bool(c, 'alreadyOwned'),
    inUse: bool(c, 'alreadyInUse'),
    recommended: bool(c, 'recommended'),
  };
  if (b.author) b.author = nameCased(b.author);
  if (b.publisher) b.publisher = nameCased(b.publisher);
  b.id = int(c, 'bookId') ?? StableID.make(b.isbn, b.title);
  return b;
}

export function parseSchoolbooksResponse(c) {
  return {
    courses: arr(c, 'schoolbooks', (course) => ({
      id: int(course, 'courseId') ?? 0,
      name: sentenceCased(str(course, 'courseDesc') ?? 'Corso'),
      books: arr(course, 'books', parseSchoolbook),
    })),
  };
}

export function periodContains(period, date) {
  if (!period.start || !period.end) return false;
  return date >= startOfDay(period.start) && date < startOfDay(addDays(period.end, 1));
}
