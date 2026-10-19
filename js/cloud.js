// Account BCW (backend BCW-api, https://github.com/kubos5/BCW-api): indirizzo del server,
// richieste, sessione salvata e sincronizzazione di impostazioni, orario e file dell'orario.
//
// Con un account BCW gli account Classeviva abbinati arrivano dal server (con le credenziali)
// e l'app vi accede come a quelli salvati nel browser. Impostazioni e orario sono documenti
// con una versione: chi salva invia la versione da cui è partito e, se nel frattempo un altro
// dispositivo ha salvato, riceve il documento attuale e unisce le modifiche.

import { BlobStore, fetchWithTimeout, loadConfig, normalizeProxyURL } from './api.js';
import { TimetableStore } from './timetable.js';

const API_KEY = 'bcw.api';
const SESSION_KEY = 'bcw.cloud.session';
const ACCOUNTS_KEY = 'bcw.cloud.accounts';
const ACTIVE_KEY = 'bcw.cloud.activeAccount';
const SYNC_KEY = 'bcw.cloud.sync';

function readJSON(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}

function writeJSON(key, value) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch { /* archiviazione piena o non disponibile */ }
}

// MARK: - Server

export const BCWServer = {
  /** Server predefinito, da `config.json` (`api`). */
  defaultBase: '',

  async init() {
    const config = await loadConfig();
    this.defaultBase = normalizeProxyURL(config?.api);
  },

  get base() {
    try {
      const stored = localStorage.getItem(API_KEY);
      if (stored) return normalizeProxyURL(stored);
    } catch { /* archiviazione non disponibile */ }
    return this.defaultBase;
  },
  get isCustom() {
    try { return !!localStorage.getItem(API_KEY); } catch { return false; }
  },
  get isConfigured() { return !!this.base; },
  set(url) {
    try {
      const value = normalizeProxyURL(url);
      if (value) localStorage.setItem(API_KEY, value);
      else localStorage.removeItem(API_KEY);
    } catch { /* ignorato */ }
  },
  get host() {
    try { return new URL(this.base).host; } catch { return this.base; }
  },
};

// MARK: - Richieste

/** Errore dell'API: `code` è quello del server (es. `conflict`) oppure `offline`. */
export class CloudError extends Error {
  constructor(code, message, extra = {}) {
    super(message);
    this.code = code;
    Object.assign(this, extra);
  }
}

export const isCloudOffline = (error) => error instanceof CloudError && error.code === 'offline';

/**
 * Richiesta all'API di BCW. Restituisce il JSON della risposta (o un `Blob` con `binary`);
 * gli errori diventano `CloudError` con il messaggio del server.
 */
export async function cloudRequest(method, path, { token, body, raw, type, headers = {}, binary = false, timeout = 25_000 } = {}) {
  const base = BCWServer.base;
  if (!base) throw new CloudError('not_configured', 'Manca l\'indirizzo del server BCW: impostalo in Impostazioni › Account › Server BCW.');
  const h = { Accept: 'application/json', 'X-BCW-Client': 'web', ...headers };
  if (token) h.Authorization = `Bearer ${token}`;
  let payload;
  if (body !== undefined) {
    payload = JSON.stringify(body);
    h['Content-Type'] = 'application/json';
  } else if (raw !== undefined) {
    payload = raw;
    h['Content-Type'] = type || 'application/octet-stream';
  }
  let response;
  try {
    response = await fetchWithTimeout(base + path, timeout, { method, headers: h, body: payload, cache: 'no-store' });
  } catch {
    throw new CloudError('offline', navigator.onLine === false
      ? 'Nessuna connessione a Internet.'
      : `Impossibile contattare il server BCW (${BCWServer.host}).`);
  }
  // Il server di BCW segna ogni risposta: senza il segno all'indirizzo risponde altro.
  if (!response.headers.get('X-BCW-API')) {
    throw new CloudError('not_configured', `All'indirizzo ${BCWServer.host} non risponde il server BCW. Controlla l'indirizzo in Impostazioni › Account › Server BCW.`);
  }
  if (response.ok) {
    if (binary) return response.blob();
    try { return await response.json(); } catch { return {}; }
  }
  let json = null;
  try { json = await response.json(); } catch { /* non è JSON */ }
  const { error, message, ...extra } = json ?? {};
  throw new CloudError(error || 'server_error', message || `Errore del server BCW (${response.status}).`, { status: response.status, ...extra });
}

// MARK: - Sessione e account abbinati salvati

export const CloudStorage = {
  session: () => readJSON(SESSION_KEY, null),
  saveSession: (session) => writeJSON(SESSION_KEY, session),
  accounts: () => readJSON(ACCOUNTS_KEY, []),
  saveAccounts: (accounts) => writeJSON(ACCOUNTS_KEY, accounts.length ? accounts : null),
  activeAccount: () => readJSON(ACTIVE_KEY, null),
  saveActiveAccount: (id) => writeJSON(ACTIVE_KEY, id),
  clear() {
    for (const key of [SESSION_KEY, ACCOUNTS_KEY, ACTIVE_KEY, SYNC_KEY]) writeJSON(key, null);
  },
};

/** Account abbinato nel formato degli account salvati nel browser. */
export function accountFromServer(remote) {
  if (!remote?.credentials?.username) return null;
  return {
    id: remote.id,
    credentials: { username: remote.credentials.username, password: remote.credentials.password, ident: remote.credentials.ident ?? remote.ident ?? null },
    name: remote.name || remote.credentials.username,
    school: remote.school ?? null,
  };
}

// MARK: - Sincronizzazione

/**
 * Impostazioni che valgono su tutti i dispositivi. Restano locali quelle legate al
 * dispositivo: blocco, promemoria e notifiche (vogliono un permesso per ogni browser).
 */
export const SYNCED_PREFERENCES = [
  'averageMode', 'weightedAverage', 'targetAverage', 'dashboardMode', 'hideCompletedHomework', 'showUpcomingDays',
  'completedHomework', 'collapsedSections', 'timetableMode', 'timetableShowsTests', 'titleAbbreviation',
  'appearance', 'accentColor', 'colorStyle', 'contrast', 'corners', 'motion', 'roundedText',
];

const oneOf = (...allowed) => (v) => allowed.includes(v);
const isBool = (v) => typeof v === 'boolean';

/** Valori accettati da questa versione (l'app iOS ne ha alcuni in più, es. la vista Calendario). */
const validators = {
  averageMode: oneOf('allGrades', 'subjectAverages'),
  weightedAverage: isBool,
  targetAverage: (v) => typeof v === 'number' && v >= 1 && v <= 10,
  dashboardMode: oneOf('list', 'calendar'),
  hideCompletedHomework: isBool,
  showUpcomingDays: isBool,
  completedHomework: (v) => Array.isArray(v) && v.every((x) => Number.isInteger(x)),
  collapsedSections: (v) => Array.isArray(v) && v.every((x) => typeof x === 'string'),
  timetableMode: oneOf('list', 'day'),
  timetableShowsTests: isBool,
  titleAbbreviation: oneOf('automatic', 'always', 'never'),
  appearance: oneOf('system', 'light', 'dark'),
  accentColor: (v) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v),
  colorStyle: oneOf('tonalSpot', 'vibrant', 'expressive', 'fidelity', 'neutral', 'rainbow', 'fruitSalad'),
  contrast: oneOf('standard', 'medium', 'high'),
  corners: oneOf('square', 'standard', 'round'),
  motion: oneOf('expressive', 'standard', 'reduced'),
  roundedText: oneOf('titles', 'all', 'none'),
};

function validSettings(values) {
  const out = {};
  for (const [key, value] of Object.entries(values)) if (validators[key]?.(value)) out[key] = key === 'accentColor' ? value.toLowerCase() : value;
  return out;
}

function pick(values, keys) {
  const out = {};
  for (const key of keys) if (values?.[key] !== undefined) out[key] = values[key];
  return out;
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** Hash FNV-1a del testo, per capire se un documento è cambiato dall'ultima sincronizzazione. */
function hashText(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `${text.length}:${(h >>> 0).toString(16)}`;
}

/** File citati da un orario (anche nel formato dell'app iOS). */
function referencedNames(data) {
  const names = new Set();
  const add = (list) => {
    if (Array.isArray(list)) for (const a of list) if (typeof a?.storedName === 'string') names.add(a.storedName);
  };
  for (const e of Array.isArray(data?.entries) ? data.entries : []) add(e?.attachments);
  if (data?.occurrences && typeof data.occurrences === 'object') for (const o of Object.values(data.occurrences)) add(o?.attachments);
  return names;
}

const emptyState = () => ({ settings: { version: 0, snapshot: null, remote: null }, timetables: {} });

export class CloudSync {
  constructor(model) {
    this.model = model;
    this.state = { ...emptyState(), ...readJSON(SYNC_KEY, {}) };
    /** `syncing`, `ok`, `offline`, `error` oppure `null` (mai sincronizzato in questa sessione). */
    this.status = null;
    this.message = null;
    this.lastSync = null;
    /** Avviso sui file non caricati (spazio esaurito, file troppo grande). */
    this.fileWarning = null;
    this.timers = new Map();
    this.queues = new Map();
    this.pending = 0;
    this.applying = false;
  }

  get token() { return this.model.cloud?.token ?? null; }
  get enabled() { return !!this.token; }

  saveState() { writeJSON(SYNC_KEY, this.state); }

  reset() {
    for (const { timer } of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
    this.state = emptyState();
    this.status = null;
    this.message = null;
    this.lastSync = null;
    this.fileWarning = null;
    writeJSON(SYNC_KEY, null);
  }

  request(method, path, options = {}) {
    return cloudRequest(method, path, { ...options, token: this.token });
  }

  notify() { this.model.onChange?.(); }

  /** Le operazioni sullo stesso documento vanno una dopo l'altra. */
  serial(key, fn) {
    const previous = this.queues.get(key) ?? Promise.resolve();
    const next = previous.catch(() => {}).then(fn);
    this.queues.set(key, next);
    return next.finally(() => { if (this.queues.get(key) === next) this.queues.delete(key); });
  }

  /** Esegue un'operazione aggiornando lo stato mostrato nelle impostazioni. */
  async run(key, fn) {
    if (!this.enabled) return;
    this.pending += 1;
    this.status = 'syncing';
    this.notify();
    try {
      await this.serial(key, fn);
      this.pending -= 1;
      if (!this.pending) {
        this.status = 'ok';
        this.message = null;
        this.lastSync = new Date();
      }
    } catch (error) {
      this.pending -= 1;
      if (error instanceof CloudError && error.code === 'unauthorized') {
        this.model.cloudSessionExpired();
        return;
      }
      if (error instanceof CloudError && error.code === 'not_found') {
        // Account scollegato da un altro dispositivo: l'elenco aggiornato lo toglie.
        this.model.refreshCloud({ force: true });
        if (!this.pending) this.status = null;
        this.notify();
        return;
      }
      this.status = isCloudOffline(error) ? 'offline' : 'error';
      this.message = error.message;
    }
    this.notify();
  }

  schedule(key, fn, delay = 1500) {
    clearTimeout(this.timers.get(key)?.timer);
    const timer = setTimeout(() => {
      this.timers.delete(key);
      this.run(key, fn);
    }, delay);
    this.timers.set(key, { timer, fn });
  }

  /** Invia subito le modifiche in attesa (es. quando la pagina passa in secondo piano). */
  flush() {
    const pending = [...this.timers.entries()];
    for (const [key, { timer }] of pending) {
      clearTimeout(timer);
      this.timers.delete(key);
    }
    return Promise.allSettled(pending.map(([key, { fn }]) => this.run(key, fn)));
  }

  // MARK: Impostazioni

  localSettings() { return pick(this.model.preferences.values, SYNCED_PREFERENCES); }

  settingsChanged() {
    if (!this.enabled || this.applying) return;
    this.schedule('settings', () => this.syncSettings(false));
  }

  pullSettings() { return this.run('settings', () => this.syncSettings(true)); }

  applySettings(values) {
    this.applying = true;
    try {
      this.model.preferences.applyRemote(validSettings(pick(values, SYNCED_PREFERENCES)));
    } finally {
      this.applying = false;
    }
    this.model.settingsApplied?.();
  }

  /**
   * Unione a tre vie: le chiavi cambiate qui dall'ultima sincronizzazione vincono, le altre
   * arrivano dal server. La prima volta su un dispositivo vince il server.
   */
  async syncSettings(fetchFirst) {
    const st = this.state.settings;
    const before = st.snapshot ? JSON.parse(st.snapshot) : null;
    let remote = fetchFirst ? await this.request('GET', '/sync/settings') : { data: st.remote, version: st.version };
    for (let attempt = 0; attempt < 3; attempt++) {
      const local = this.localSettings();
      const changed = before ? SYNCED_PREFERENCES.filter((k) => !same(local[k], before[k])) : null;
      let merged;
      if (!remote.version || !remote.data) {
        merged = { ...(remote.data ?? {}), ...local };
      } else if (changed === null) {
        this.applySettings(remote.data);
        this.finishSettings(remote.version, remote.data);
        return;
      } else {
        merged = { ...remote.data, ...pick(local, changed) };
        if (!same(pick(merged, SYNCED_PREFERENCES), local)) this.applySettings(merged);
        if (!changed.length) {
          this.finishSettings(remote.version, remote.data);
          return;
        }
      }
      try {
        const saved = await this.request('PUT', '/sync/settings', { body: { data: merged, baseVersion: remote.version || 0 } });
        this.finishSettings(saved.version, merged);
        return;
      } catch (error) {
        if (!(error instanceof CloudError) || error.code !== 'conflict') throw error;
        remote = { data: error.data, version: error.version ?? 0 };
      }
    }
  }

  finishSettings(version, data) {
    this.state.settings = { version, snapshot: JSON.stringify(this.localSettings()), remote: data };
    this.saveState();
  }

  // MARK: Orario

  isCloudAccount(id) { return this.model.isCloud && this.model.accounts.some((a) => a.id === id); }

  timetableChanged(owner) {
    if (!this.enabled || this.applying || !this.isCloudAccount(owner)) return;
    this.schedule(`timetable:${owner}`, () => this.syncTimetable(owner, false), 2000);
  }

  pullTimetable(id) {
    if (!this.isCloudAccount(id)) return Promise.resolve();
    return this.run(`timetable:${id}`, () => this.syncTimetable(id, true));
  }

  /**
   * L'orario è un documento unico: se è cambiato solo da una parte vince quella; se è
   * cambiato da entrambe vince questo dispositivo. La prima volta vince il server, se ha già
   * un orario.
   */
  async syncTimetable(id, fetchFirst) {
    const st = this.state.timetables[id] ?? { version: 0, hash: null };
    const neverSynced = !st.version && st.hash == null;
    let remote = fetchFirst ? await this.request('GET', `/sync/timetable/${id}`) : { data: undefined, version: st.version };
    for (let attempt = 0; attempt < 3; attempt++) {
      const text = TimetableStore.storedText(id);
      if (!text) {
        // Nessun orario salvato in questo browser: si prende quello del server, se c'è.
        if (remote.version && remote.data) this.applyTimetable(id, remote.data, remote.version);
        return;
      }
      const hash = hashText(text);
      const dirty = !neverSynced && hash !== st.hash;
      let base;
      if (!remote.version) {
        base = 0;
      } else if (neverSynced && remote.data) {
        this.applyTimetable(id, remote.data, remote.version);
        return;
      } else if (remote.version === st.version) {
        if (!dirty) return;
        base = st.version;
      } else if (!dirty && remote.data) {
        this.applyTimetable(id, remote.data, remote.version);
        return;
      } else {
        base = remote.version;
      }
      const data = JSON.parse(text);
      await this.uploadFiles(id, data);
      try {
        const saved = await this.request('PUT', `/sync/timetable/${id}`, { body: { data, baseVersion: base } });
        this.state.timetables[id] = { version: saved.version, hash };
        this.saveState();
        return;
      } catch (error) {
        if (!(error instanceof CloudError) || error.code !== 'conflict') throw error;
        remote = { data: error.data, version: error.version ?? 0 };
      }
    }
  }

  applyTimetable(id, data, version) {
    this.applying = true;
    let text;
    try {
      text = this.model.timetable.applyRemote(id, data);
    } finally {
      this.applying = false;
    }
    this.state.timetables[id] = { version, hash: text ? hashText(text) : null };
    this.saveState();
    this.downloadMissing(id, data);
  }

  forgetTimetable(id) {
    delete this.state.timetables[id];
    this.saveState();
  }

  // MARK: File dell'orario

  async uploadFiles(id, data) {
    const names = [...referencedNames(data)];
    if (!names.length) return;
    const list = await this.request('GET', `/files/${id}`);
    const present = new Set((list.files ?? []).map((f) => f.name));
    for (const name of names) {
      if (present.has(name)) continue;
      const blob = await BlobStore.get(TimetableStore.fileKey(id, name));
      if (!blob) continue;
      try {
        await this.request('PUT', `/files/${id}/${encodeURIComponent(name)}`, { raw: blob, type: blob.type, timeout: 120_000 });
      } catch (error) {
        // Un file troppo grande o lo spazio esaurito non fermano l'orario.
        if (error instanceof CloudError && (error.code === 'quota_exceeded' || error.code === 'too_large')) {
          this.fileWarning = error.message;
          continue;
        }
        throw error;
      }
    }
  }

  async downloadMissing(id, data) {
    for (const name of referencedNames(data)) {
      try {
        if (await BlobStore.get(TimetableStore.fileKey(id, name))) continue;
        await this.fetchFile(id, name);
      } catch { /* si riprova aprendo il file */ }
    }
  }

  /** Scarica un file dell'orario mancante in questo browser. */
  async fetchFile(id, name) {
    if (!this.enabled || !this.isCloudAccount(id)) return null;
    const blob = await this.request('GET', `/files/${id}/${encodeURIComponent(name)}`, { binary: true, timeout: 120_000 });
    await BlobStore.put(TimetableStore.fileKey(id, name), blob);
    return blob;
  }
}
