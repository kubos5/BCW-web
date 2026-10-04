// Stato globale dell'app: sessione, account salvati, dati del registro e operazioni.

import {
  APIError, ClassevivaClient, DiskCache, HttpTransport, Proxy, isOfflineError, isJSON, resultText, makeFile,
} from './api.js';
import { DemoTransport } from './demo.js';
import { GradeBook } from './gradebook.js';
import { Preferences } from './prefs.js';
import { Reminders } from './reminders.js';
import {
  parseAbsencesResponse, parseAgendaResponse, parseCalendarResponse, parseCardResponse, parseDidacticsResponse,
  parseDocumentCheck, parseDocumentsResponse, parseGradesResponse, parseLessonsResponse, parseNoteReadResponse,
  parseNoticeDetail, parseNoticeboardResponse, parseNotesResponse, parsePeriodsResponse, parseSchoolbooksResponse,
  parseSubjectsResponse,
} from './models.js';
import { addDays, apiString, dayKey, isSameDay, nameCased, schoolYear, startOfDay, uuid, StableID } from './util.js';

const ACCOUNTS_KEY = 'bcw.accounts';
const ACTIVE_KEY = 'bcw.activeAccount';
const DEMO_KEY = 'bcw.demoMode';
const gradePaths = ['grades', 'grades2324', 'grades2'];

const OFFLINE_MESSAGE = 'Sei offline: stai vedendo gli ultimi dati salvati.';

function readJSON(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}

function writeJSON(key, value) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch { /* ignorato */ }
}

export function accountInitials(account) {
  const letters = account.name.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]).join('');
  return letters ? letters.toUpperCase() : '?';
}

export const accountColorID = (account) => StableID.make(account.id);

/** Stesso utente e stesso profilo (i genitori possono avere un account per figlio). */
function matches(account, credentials) {
  return account.credentials.username.toLowerCase() === credentials.username.toLowerCase() &&
    (account.credentials.ident ?? '') === (credentials.ident ?? '');
}

export class AppModel {
  constructor(onChange) {
    this.onChange = onChange;
    this.phase = 'launching';
    this.isDemo = false;
    this.client = null;
    this.preferences = new Preferences(() => this.changed());
    this.accounts = [];
    this.activeAccountID = null;
    this.sessionID = uuid();
    this.archives = new Map();
    this.resetFields();
  }

  changed() {
    this._gradeBook = null;
    this.onChange?.();
  }

  resetFields() {
    this.loginName = null;
    this.card = null;
    this.grades = [];
    this.periods = [];
    this.subjects = [];
    this.agenda = [];
    this.absences = [];
    this.notices = [];
    this.notes = [];
    this.didactics = [];
    this.documents = null;
    this.calendarDays = [];
    this.schoolbooks = [];
    this.lessonsByDay = new Map();
    this.loadedLessonDays = new Set();
    this.isRefreshing = false;
    this.isOffline = false;
    this.lastUpdated = null;
    this.lastError = null;
    this.refreshingClient = null;
  }

  // MARK: Sessione

  get activeAccount() {
    return this.accounts.find((a) => a.id === this.activeAccountID) ?? null;
  }

  bootstrap() {
    this.accounts = readJSON(ACCOUNTS_KEY, []);
    if (readJSON(DEMO_KEY, false)) {
      this.startDemo();
      return;
    }
    const storedID = readJSON(ACTIVE_KEY, null);
    const account = this.accounts.find((a) => a.id === storedID) ?? this.accounts[0];
    if (!account) {
      this.phase = 'signedOut';
      this.changed();
      return;
    }
    this.activate(account);
  }

  saveAccounts() {
    writeJSON(ACCOUNTS_KEY, this.accounts.length ? this.accounts : null);
  }

  /**
   * Accede con le credenziali e aggiunge (o aggiorna) l'account tra quelli salvati,
   * rendendolo quello attivo. Lancia `needsProfileChoice` per gli account genitore con più
   * figli: in quel caso richiamare passando `ident`.
   */
  async signIn(username, password, ident = null) {
    const credentials = { username: username.trim(), password, ident };
    const probe = new ClassevivaClient(new HttpTransport(Proxy.officialBase()), 'login', credentials);
    const response = await probe.login();
    const stored = { ...credentials, ident: ident ?? response.ident };
    const name = nameCased([response.firstName, response.lastName].filter(Boolean).join(' '));

    let account = this.accounts.find((a) => matches(a, stored));
    if (account) {
      account.credentials = stored;
      if (name) account.name = name;
    } else {
      account = { id: uuid(), credentials: stored, name: name || stored.username, school: null };
      this.accounts.push(account);
    }
    this.saveAccounts();
    this.activate(account, false);
    this.client.adoptSession(probe);
    await this.refreshAll();
  }

  /** Passa a un altro account salvato. */
  switchAccount(id) {
    const account = this.accounts.find((a) => a.id === id);
    if (!account) return;
    if (!this.isDemo && account.id === this.activeAccountID) return;
    this.activate(account);
  }

  /** Rende attivo un account: azzera i dati, mostra subito la cache e aggiorna. */
  activate(account, refresh = true) {
    this.resetData();
    this.isDemo = false;
    writeJSON(DEMO_KEY, null);
    this.activeAccountID = account.id;
    writeJSON(ACTIVE_KEY, account.id);
    this.loginName = account.name;
    this.client = new ClassevivaClient(new HttpTransport(Proxy.officialBase()), `live-${account.id}`, account.credentials);
    this.phase = 'signedIn';
    this.changed();
    const client = this.client;
    this.loadFromCache(client).then(() => {
      if (refresh) this.refreshAll();
    });
  }

  startDemo() {
    this.resetData();
    this.isDemo = true;
    writeJSON(DEMO_KEY, true);
    this.client = new ClassevivaClient(new DemoTransport(), 'demo', { username: 'demo', password: 'demo' });
    this.phase = 'signedIn';
    this.changed();
    this.refreshAll();
  }

  /**
   * Esce dall'account attivo (o dalla demo). Se ci sono altri account salvati
   * passa al successivo, altrimenti torna alla schermata di accesso.
   */
  signOut() {
    if (this.isDemo) {
      this.resetData();
      DiskCache.remove('demo');
      writeJSON(DEMO_KEY, null);
      this.isDemo = false;
      const next = this.accounts.find((a) => a.id === this.activeAccountID) ?? this.accounts[0];
      if (next) this.activate(next);
      else this.endSession();
      return;
    }
    if (this.activeAccountID) this.removeAccount(this.activeAccountID);
    else this.endSession();
  }

  /** Rimuove un account salvato e la sua cache. */
  removeAccount(id) {
    const account = this.accounts.find((a) => a.id === id);
    if (!account) return;
    const wasActive = id === this.activeAccountID && !this.isDemo;
    if (wasActive) this.resetData();
    this.removeCaches(account.id);
    this.accounts = this.accounts.filter((a) => a.id !== id);
    this.saveAccounts();
    if (!wasActive) {
      this.changed();
      return;
    }
    if (this.accounts[0]) this.activate(this.accounts[0]);
    else this.endSession();
  }

  endSession() {
    this.resetData();
    this.activeAccountID = null;
    writeJSON(ACTIVE_KEY, null);
    Reminders.reschedule([], 18, false, new Set());
    this.phase = 'signedOut';
    this.changed();
  }

  resetData() {
    this.client?.signOut();
    this.client = null;
    this.archives = new Map();
    this.sessionID = uuid();
    this.resetFields();
  }

  /** Aggiorna nome e scuola dell'account salvato con i dati della scheda. */
  updateActiveAccount(card) {
    if (this.isDemo) return;
    const account = this.activeAccount;
    if (!account) return;
    const name = card.fullName.trim();
    const school = card.schoolDescription;
    if (!((name && account.name !== name) || account.school !== school)) return;
    if (name) account.name = name;
    account.school = school;
    this.saveAccounts();
  }

  get credentialsForArchive() { return this.client?.credentials ?? null; }

  /** Proprietario della cache della sessione attuale. */
  get cacheOwner() { return this.isDemo ? 'demo' : (this.activeAccountID ?? 'live'); }

  /** Archivio di un anno passato per la sessione attuale (viene azzerato cambiando sessione). */
  archive(startYear) {
    let archive = this.archives.get(startYear);
    if (!archive) {
      archive = new ArchiveModel(startYear, this.cacheOwner, () => this.changed());
      this.archives.set(startYear, archive);
    }
    return archive;
  }

  /** Scarta l'archivio di un anno (e la sua cache) per ricaricarlo da capo. */
  reloadArchive(startYear) {
    this.archives.delete(startYear);
    DiskCache.remove(ArchiveModel.cacheNamespace(this.cacheOwner, startYear));
    return this.archive(startYear);
  }

  removeCaches(owner) {
    DiskCache.remove(owner === 'demo' ? 'demo' : `live-${owner}`);
    for (const year of ArchiveModel.availableStartYears) {
      DiskCache.remove(ArchiveModel.cacheNamespace(owner, year));
    }
  }

  // MARK: Caricamento

  get agendaPath() {
    const year = schoolYear();
    return `agenda/all/${apiString(year.start)}/${apiString(year.end)}`;
  }

  /** Mostra subito gli ultimi dati salvati, prima che arrivi la risposta di rete. */
  async loadFromCache(client) {
    const [card, periods, subjects, agenda, absences, notices, notes, calendar] = await Promise.all([
      client.cached(parseCardResponse, 'card'),
      client.cached(parsePeriodsResponse, 'periods'),
      client.cached(parseSubjectsResponse, 'subjects'),
      client.cached(parseAgendaResponse, this.agendaPath),
      client.cached(parseAbsencesResponse, 'absences/details'),
      client.cached(parseNoticeboardResponse, 'noticeboard'),
      client.cached(parseNotesResponse, 'notes/all'),
      client.cached(parseCalendarResponse, 'calendar/all'),
    ]);
    let grades = null;
    for (const path of gradePaths) {
      grades = await client.cached(parseGradesResponse, path);
      if (grades) break;
    }
    if (client !== this.client) return;
    // I dati di rete arrivati nel frattempo hanno la precedenza.
    if (!this.lastUpdated) {
      this.card ??= card?.card ?? null;
      if (!this.grades.length && grades) this.grades = grades.grades.sort((a, b) => b.date - a.date);
      if (!this.periods.length && periods) this.periods = periods.periods;
      if (!this.subjects.length && subjects) this.subjects = subjects.subjects;
      if (!this.agenda.length && agenda) this.agenda = agenda.events.sort((a, b) => a.begin - b.begin);
      if (!this.absences.length && absences) this.absences = absences.events.sort((a, b) => b.date - a.date);
      if (!this.notices.length && notices) this.notices = this.sortedNotices(notices.items);
      if (!this.notes.length && notes) this.notes = notes.notes;
      if (!this.calendarDays.length && calendar) this.calendarDays = calendar.days;
    }
    this.changed();
  }

  async refreshAll() {
    const client = this.client;
    if (!client || this.refreshingClient === client) return;
    this.refreshingClient = client;
    this.isRefreshing = true;
    this.lastError = null;
    this.changed();
    try {
      // Il primo login serve a tutte le richieste successive.
      try {
        if (!client.token) await client.login();
      } catch (error) {
        if (client !== this.client) return;
        if (isOfflineError(error)) {
          this.isOffline = true;
          this.lastError = OFFLINE_MESSAGE;
        } else if (error instanceof APIError && error.kind === 'wrongCredentials') {
          this.lastError = `Le credenziali di ${this.displayName} non sono più valide. Accedi di nuovo da Tu › Account › Aggiungi account.`;
        } else {
          this.lastError = error.message;
        }
        return;
      }

      await Promise.all([
        this.loadCard(), this.loadGrades(), this.loadAgenda(), this.loadAbsences(),
        this.loadNotices(), this.loadNotes(), this.loadCalendar(),
      ]);
      if (client !== this.client) return;
      this.lessonsByDay = new Map();
      this.loadedLessonDays = new Set();
      this.lastUpdated = new Date();
    } finally {
      if (this.refreshingClient === client) {
        this.refreshingClient = null;
        this.isRefreshing = false;
      }
      this.changed();
    }
  }

  /**
   * Scarica un endpoint e applica il risultato. Gli errori delle sezioni principali
   * finiscono nel banner globale; quelli delle sezioni secondarie (`global: false`)
   * vengono solo restituiti, così non compaiono in Dashboard o in Voti.
   */
  async run(parse, path, apply, { method = 'GET', global = true } = {}) {
    const client = this.client;
    if (!client) return null;
    try {
      const result = await client.fetch(parse, path, { method });
      if (client !== this.client) return null;
      apply(result.value);
      if (global) {
        if (result.fromCache) {
          this.isOffline = true;
          this.lastError = OFFLINE_MESSAGE;
        } else {
          this.isOffline = false;
        }
      }
      this.changed();
      return null;
    } catch (error) {
      if (client !== this.client) return null;
      if (global && !this.lastError) this.lastError = error.message;
      this.changed();
      return error.message;
    }
  }

  loadCard() {
    return this.run(parseCardResponse, 'card', (r) => {
      this.card = r.card;
      if (r.card) this.updateActiveAccount(r.card);
    });
  }

  loadGrades() {
    return Promise.all([
      this.run(parsePeriodsResponse, 'periods', (r) => { this.periods = r.periods; }),
      this.run(parseSubjectsResponse, 'subjects', (r) => { this.subjects = r.subjects; }),
      this.loadGradeList(),
    ]);
  }

  async loadGradeList() {
    const client = this.client;
    if (!client) return;
    try {
      const result = await client.fetchFirst(parseGradesResponse, gradePaths, (v) => v.grades.length > 0);
      if (client !== this.client) return;
      this.grades = result.value.grades.sort((a, b) => b.date - a.date);
      if (result.fromCache) this.isOffline = true;
    } catch (error) {
      if (client !== this.client) return;
      if (!this.lastError) this.lastError = error.message;
    }
    this.changed();
  }

  async loadAgenda() {
    await this.run(parseAgendaResponse, this.agendaPath, (r) => { this.agenda = r.events.sort((a, b) => a.begin - b.begin); });
    this.rescheduleReminders();
  }

  loadAbsences() {
    return this.run(parseAbsencesResponse, 'absences/details', (r) => { this.absences = r.events.sort((a, b) => b.date - a.date); });
  }

  sortedNotices(items) {
    return items.filter((n) => !n.isDeleted).sort((a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0));
  }

  loadNotices() {
    return this.run(parseNoticeboardResponse, 'noticeboard', (r) => { this.notices = this.sortedNotices(r.items); });
  }

  loadNotes() {
    return this.run(parseNotesResponse, 'notes/all', (r) => { this.notes = r.notes; });
  }

  loadDidactics() {
    return this.run(parseDidacticsResponse, 'didactics', (r) => { this.didactics = r.teachers; }, { global: false });
  }

  loadDocuments() {
    return this.run(parseDocumentsResponse, 'documents', (r) => { this.documents = r; }, { method: 'POST', global: false });
  }

  loadCalendar() {
    return this.run(parseCalendarResponse, 'calendar/all', (r) => { this.calendarDays = r.days; });
  }

  loadSchoolbooks() {
    return this.run(parseSchoolbooksResponse, 'schoolbooks', (r) => { this.schoolbooks = r.courses; }, { global: false });
  }

  rescheduleReminders() {
    const p = this.preferences;
    Reminders.reschedule(this.agenda, p.get('reminderHour'), p.get('homeworkReminders'), p.completed);
  }

  // MARK: Lezioni

  lessons(day) { return this.lessonsByDay.get(dayKey(day)) ?? []; }

  hasLoadedLessons(day) { return this.loadedLessonDays.has(dayKey(day)); }

  /** Scarica le lezioni dei giorni non ancora caricati nell'intervallo (solo giorni passati e oggi). */
  async ensureLessons(from, to) {
    const client = this.client;
    if (!client) return;
    const today = startOfDay(new Date());
    const end = startOfDay(to) < today ? startOfDay(to) : today;
    let start = startOfDay(from);
    while (start <= end && this.loadedLessonDays.has(dayKey(start))) start = addDays(start, 1);
    if (start > end) return;
    const path = `lessons/${apiString(start)}/${apiString(end)}`;
    try {
      const result = await client.fetch(parseLessonsResponse, path);
      if (client !== this.client) return;
      for (let day = start; day <= end; day = addDays(day, 1)) {
        const key = dayKey(day);
        this.loadedLessonDays.add(key);
        this.lessonsByDay.set(key, []);
      }
      for (const lesson of result.value.lessons) {
        const key = dayKey(lesson.date);
        if (!this.lessonsByDay.has(key)) this.lessonsByDay.set(key, []);
        this.lessonsByDay.get(key).push(lesson);
      }
      for (const list of this.lessonsByDay.values()) list.sort((a, b) => a.hour - b.hour);
      this.changed();
    } catch {
      // Le lezioni non sono essenziali: in caso di errore restano vuote.
    }
  }

  /** Lezioni di un intervallo, senza salvarle (usato dal registro per materia). */
  async fetchLessons(from, to) {
    if (!this.client) return [];
    const path = `lessons/${apiString(from)}/${apiString(to)}`;
    return (await this.client.fetch(parseLessonsResponse, path)).value.lessons;
  }

  // MARK: Bacheca

  /** Apre una comunicazione (segnandola come letta) ed eventualmente aderisce, firma o risponde. */
  async openNotice(notice, { join, sign, text } = {}) {
    if (!this.client) throw APIError.notAuthenticated();
    // Per la sola lettura si invia un corpo vuoto: `{}` viene rifiutato dal server.
    const body = {};
    if (join != null) body.join = join;
    if (sign != null) body.sign = sign;
    if (text != null) body.text = text;
    const data = Object.keys(body).length ? JSON.stringify(body) : null;
    const path = `noticeboard/read/${notice.eventCode}/${notice.pubId}/101`;
    const detail = (await this.client.fetch(parseNoticeDetail, path, { method: 'POST', body: data, useCache: false })).value;
    const stored = this.notices.find((n) => n.id === notice.id);
    if (stored && !stored.isRead) {
      stored.isRead = true;
      this.changed();
    }
    return detail;
  }

  async downloadAttachment(attachment, notice) {
    if (!this.client) throw APIError.notAuthenticated();
    // Classeviva risponde "item must first be read" se la comunicazione non è stata aperta.
    if (this.notices.find((n) => n.id === notice.id)?.isRead !== true) await this.openNotice(notice);
    const path = `noticeboard/attach/${notice.eventCode}/${notice.pubId}/${attachment.number}`;
    return this.client.download(path, { suggestedName: attachment.fileName });
  }

  get unreadNoticesCount() { return this.notices.filter((n) => !n.isRead).length; }

  // MARK: Note

  async readNote(note) {
    if (!this.client || note.isRead || note._reading) return;
    note._reading = true;
    try {
      const path = `notes/${note.category}/read/${note.id}`;
      const response = (await this.client.fetch(parseNoteReadResponse, path, { method: 'POST', useCache: false })).value;
      const stored = this.notes.find((n) => n.id === note.id && n.category === note.category);
      if (stored) {
        stored.isRead = true;
        if (response.text) stored.text = response.text;
        this.changed();
      }
    } catch {
      // Riprova alla prossima apertura.
    } finally {
      note._reading = false;
    }
  }

  get unreadNotesCount() { return this.notes.filter((n) => !n.isRead).length; }

  // MARK: Didattica

  async openDidacticContent(content) {
    if (!this.client) throw APIError.notAuthenticated();
    const result = await this.client.raw('GET', `didactics/item/${content.id}`);
    if (isJSON(result)) {
      let json = null;
      try { json = JSON.parse(resultText(result)); } catch { /* non è JSON */ }
      if (json && typeof json === 'object') {
        const item = json.item && typeof json.item === 'object' ? json.item : json;
        if (typeof item.link === 'string') {
          return { kind: 'link', url: item.link.startsWith('http') ? item.link : `https://${item.link}` };
        }
        if (typeof item.text === 'string') return { kind: 'text', text: item.text };
      }
    }
    return { kind: 'file', file: makeFile(result, content.name) };
  }

  // MARK: Documenti

  async downloadDocument(document) {
    if (!this.client) throw APIError.notAuthenticated();
    const check = (await this.client.fetch(parseDocumentCheck, `documents/check/${document.documentHash}`,
      { method: 'POST', useCache: false })).value;
    if (!check.available) throw APIError.unavailable('Il documento non è ancora disponibile.');
    return this.client.download(`documents/read/${document.documentHash}`, { method: 'POST', suggestedName: `${document.title}.pdf` });
  }

  // MARK: Dati derivati

  get gradeBook() {
    if (!this._gradeBook) {
      this._gradeBook = new GradeBook(this.grades, this.periods, this.preferences.averageMode, this.preferences.weightedAverage);
    }
    return this._gradeBook;
  }

  get displayName() {
    return this.card?.fullName ?? this.loginName ?? (this.isDemo ? 'Giulia Esposito' : 'Studente');
  }

  get initials() {
    return this.card?.initials || this.displayName.charAt(0).toUpperCase();
  }

  /** Classe dello studente, ricavata da agenda/lezioni (la scheda non la include). */
  get classDescription() {
    const fromAgenda = this.agenda.find((e) => e.classDescription)?.classDescription;
    if (fromAgenda) return fromAgenda;
    for (const list of this.lessonsByDay.values()) {
      const lesson = list.find((l) => l.classDescription);
      if (lesson) return lesson.classDescription;
    }
    return null;
  }

  events(day) { return this.agenda.filter((e) => isSameDay(e.begin, day)); }
  absencesOn(day) { return this.absences.filter((a) => isSameDay(a.date, day)); }
  calendarStatus(day) { return this.calendarDays.find((d) => isSameDay(d.date, day)) ?? null; }
  get unjustifiedAbsences() { return this.absences.filter((a) => !a.isJustified); }
}

/**
 * Pagelle e documenti di un anno scolastico passato.
 *
 * Classeviva archivia gli anni passati su `webYY.spaggiari.eu`. Lì l'API REST esiste solo
 * per l'anno appena concluso e accetta solo date dell'anno in corso: voti, assenze e note
 * risultano vuoti, mentre i documenti arrivano correttamente. Il resto dell'archivio si
 * consulta sul sito web di Classeviva.
 */
export class ArchiveModel {
  constructor(startYear, owner, onChange) {
    this.startYear = startYear;
    this.owner = owner;
    this.onChange = onChange;
    this.state = 'idle';
    this.failure = null;
    this.documents = [];
    this.documentsError = null;
    this.client = null;
  }

  static get previousStartYear() { return schoolYear().startYear - 1; }
  /** Anni selezionabili: gli ultimi cinque anni scolastici conclusi. */
  static get availableStartYears() { return [0, 1, 2, 3, 4].map((i) => ArchiveModel.previousStartYear - i); }
  static title(startYear) { return `${startYear}/${String(startYear + 1).slice(-2)}`; }
  static cacheNamespace(owner, startYear) { return `archive-${owner}-${startYear}`; }
  /** Indirizzo del sito web di Classeviva: l'archivio si raggiunge da lì con "Vai all'a.s. …". */
  static webURL = 'https://web.spaggiari.eu/home/app/default/login.php';

  get title() { return ArchiveModel.title(this.startYear); }

  async load(credentials, demo) {
    if (this.state === 'loaded' || this.state === 'loading') return;
    this.state = 'loading';
    this.documentsError = null;
    this.onChange();
    const transport = demo
      ? new DemoTransport(this.startYear - schoolYear().startYear)
      : new HttpTransport(Proxy.archiveBase(this.startYear));
    // Per l'archivio non riutilizziamo subito l'ident: lo studente potrebbe avere un codice diverso.
    const archiveCredentials = credentials ? { ...credentials, ident: null } : null;
    const client = new ClassevivaClient(transport, ArchiveModel.cacheNamespace(this.owner, this.startYear), archiveCredentials);
    this.client = client;
    try {
      await this.login(client, credentials?.ident ?? null);
    } catch (error) {
      if (error instanceof APIError && error.kind === 'wrongCredentials') {
        this.fail(`Classeviva non ha accettato le credenziali per l'archivio ${this.title}. Se hai cambiato password dopo la fine dell'anno, nell'archivio potrebbe valere ancora quella vecchia.`);
      } else if (error instanceof APIError && error.kind === 'decoding') {
        // Gli archivi più vecchi non hanno l'API REST: il login risponde senza contenuto.
        this.fail(`Per l'anno ${this.title} Classeviva non permette di scaricare le pagelle dall'app.`);
      } else if (isOfflineError(error)) {
        this.fail(`L'archivio ${this.title} non è raggiungibile.`);
      } else {
        this.fail(error.message);
      }
      return;
    }
    try {
      this.documents = (await client.fetch(parseDocumentsResponse, 'documents', { method: 'POST' })).value.documents;
    } catch (error) {
      this.documentsError = error.message;
    }
    this.state = 'loaded';
    this.onChange();
  }

  fail(message) {
    this.state = 'failed';
    this.failure = message;
    this.onChange();
  }

  /**
   * Accede all'archivio. Per gli account con più profili sceglie quello che corrisponde
   * all'account attivo; se l'accesso senza profilo fallisce, riprova con quello.
   */
  async login(client, mainIdent) {
    try {
      await client.login();
    } catch (error) {
      if (error instanceof APIError && error.kind === 'needsProfileChoice') {
        const digits = mainIdent?.replace(/\D/g, '');
        const choice = error.choices.find((c) => c.ident === mainIdent) ??
          error.choices.find((c) => digits && c.ident.replace(/\D/g, '') === digits) ??
          error.choices[0];
        if (!choice) throw APIError.notAuthenticated();
        client.credentials.ident = choice.ident;
        await client.login();
      } else if (error instanceof APIError && error.kind === 'wrongCredentials' && mainIdent) {
        client.credentials.ident = mainIdent;
        await client.login();
      } else {
        throw error;
      }
    }
  }

  async downloadDocument(document) {
    if (!this.client) throw APIError.notAuthenticated();
    return this.client.download(`documents/read/${document.documentHash}`, { method: 'POST', suggestedName: `${document.title}.pdf` });
  }
}
