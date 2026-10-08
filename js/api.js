// Client per le API REST non ufficiali di Classeviva (`web.spaggiari.eu/rest/v1`),
// le stesse usate dall'app mobile ufficiale.
//
// Il browser non può chiamare direttamente Classeviva: il server non consente richieste
// da altri siti (CORS) e l'API vuole lo User-Agent dell'app ufficiale, che il browser non
// permette di impostare. Le richieste passano quindi da un piccolo proxy (vedi `server.js`
// o `proxy/cloudflare-worker.js`), che inoltra soltanto verso i server di Classeviva.

import { parseLoginResponse } from './models.js';

export class APIError extends Error {
  constructor(kind, message, extra = {}) {
    super(message);
    this.kind = kind;
    Object.assign(this, extra);
  }

  static wrongCredentials(message) { return new APIError('wrongCredentials', message); }
  static needsProfileChoice(choices) { return new APIError('needsProfileChoice', 'Scegli il profilo a cui accedere.', { choices }); }
  static notAuthenticated() { return new APIError('notAuthenticated', 'Sessione scaduta. Accedi di nuovo.'); }
  static server(code, message) { return new APIError('server', message || `Errore del server (${code}).`, { code }); }
  static unavailable(message) { return new APIError('unavailable', message); }
  static decoding() { return new APIError('decoding', 'Risposta inattesa da Classeviva.'); }
  /** Equivalente di `URLError`: la rete non risponde. */
  static offline(message = 'Impossibile contattare Classeviva.') { return new APIError('offline', message); }
}

export const isOfflineError = (e) => e instanceof APIError && e.kind === 'offline';

// MARK: - Server proxy

const PROXY_KEY = 'bcw.proxy';

export const MISSING_PROXY = 'Manca il server proxy per contattare Classeviva: impostalo con "Imposta il proxy" o da Impostazioni › Server.';

/** "bcw-proxy.esempio.workers.dev/" → "https://bcw-proxy.esempio.workers.dev". */
export function normalizeProxyURL(value) {
  const text = String(value ?? '').trim().replace(/\/+$/, '');
  if (!text) return '';
  return /^https?:\/\//i.test(text) ? text : `https://${text}`;
}

const sameSiteProxy = () => new URL('api', document.baseURI).href.replace(/\/+$/, '');

async function fetchWithTimeout(url, ms, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export const Proxy = {
  /** Proxy predefinito, deciso all'avvio da `init()`. */
  defaultBase: null,
  /** `true` se il proxy predefinito viene da `config.json`. */
  defaultFromConfig: false,

  /**
   * Sceglie il proxy predefinito. Se il sito ha un proxy proprio (`server.js`, sotto `/api`)
   * si usa quello; altrimenti quello indicato in `config.json` nella radice del sito, così
   * su un hosting statico (es. GitHub Pages) nessuno deve configurarlo a mano.
   * Un indirizzo impostato dall'utente ha sempre la precedenza.
   */
  async init() {
    const local = sameSiteProxy();
    const [configured, hasLocal] = await Promise.all([
      fetchWithTimeout(new URL('config.json', document.baseURI), 4000, { cache: 'no-cache' })
        .then((r) => (r.ok ? r.json() : null))
        .then((config) => normalizeProxyURL(config?.proxy))
        .catch(() => ''),
      fetchWithTimeout(`${local}/ping`, 3000, { cache: 'no-store' })
        .then((r) => !!r.headers.get('X-BCW-Proxy'))
        .catch(() => false),
    ]);
    this.defaultFromConfig = !hasLocal && !!configured;
    this.defaultBase = this.defaultFromConfig ? configured : local;
  },

  /** Indirizzo del proxy in uso. */
  get base() {
    try {
      const stored = localStorage.getItem(PROXY_KEY);
      if (stored) return normalizeProxyURL(stored);
    } catch { /* archiviazione non disponibile */ }
    return this.defaultBase ?? sameSiteProxy();
  },
  get isCustom() {
    try { return !!localStorage.getItem(PROXY_KEY); } catch { return false; }
  },
  set(url) {
    this.status = null;
    try {
      const value = normalizeProxyURL(url);
      if (value) localStorage.setItem(PROXY_KEY, value);
      else localStorage.removeItem(PROXY_KEY);
    } catch { /* ignorato */ }
  },
  officialBase() { return `${this.base}/v1`; },

  /** Esito dell'ultima verifica: 'ok', 'missing' (nessun proxy a quell'indirizzo) o 'unreachable'. */
  status: null,

  /** Controlla che all'indirizzo configurato risponda davvero il proxy di BCW. */
  async check() {
    const base = this.base;
    try {
      const response = await fetch(`${base}/ping`, { cache: 'no-store' });
      this.status = response.headers.get('X-BCW-Proxy') ? 'ok' : 'missing';
    } catch {
      this.status = navigator.onLine === false ? null : 'unreachable';
    }
    return this.status;
  },

  get host() {
    try { return new URL(this.base).host; } catch { return this.base; }
  },
  /** Archivio di un anno scolastico passato (es. `web24` per il 2024/25). */
  archiveBase(startYear) { return `${this.base}/archive/${String(startYear % 100).padStart(2, '0')}`; },
};

// MARK: - Trasporto

export class HttpTransport {
  constructor(baseURL) {
    this.baseURL = baseURL;
  }

  async send(method, path, body, token) {
    const headers = { Accept: 'application/json', 'Z-Dev-Apikey': 'Tg1NWEwNGIgIC0K' };
    if (token) headers['Z-Auth-Token'] = token;
    let payload;
    if (method === 'POST') {
      // Classeviva rifiuta il JSON vuoto `{}` con "101:CvvRestApi/invalid payload",
      // mentre accetta un corpo vuoto.
      payload = !body || body.replace(/\s/g, '') === '{}' ? '' : body;
      headers['Content-Type'] = 'application/json';
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25_000);
    let response;
    try {
      response = await fetch(this.baseURL + path, {
        method, headers, body: payload, cache: 'no-store', signal: controller.signal,
      });
    } catch {
      if (navigator.onLine === false) throw APIError.offline('Nessuna connessione a Internet.');
      throw APIError.offline(Proxy.isCustom
        ? `Impossibile contattare il proxy (${Proxy.host}). Controlla l'indirizzo e che il proxy accetti richieste da questo sito.`
        : 'Impossibile contattare Classeviva.');
    } finally {
      clearTimeout(timer);
    }
    const contentType = response.headers.get('Content-Type');
    // Il proxy di BCW segna ogni risposta. Senza il segno, a rispondere è il sito stesso:
    // un hosting statico (es. GitHub Pages) restituisce 404 o, per le POST, 405.
    if (!response.headers.get('X-BCW-Proxy')) {
      Proxy.status = 'missing';
      throw APIError.unavailable(MISSING_PROXY);
    }
    const data = new Uint8Array(await response.arrayBuffer());
    return {
      status: response.status,
      contentType,
      fileName: fileName(response.headers.get('Content-Disposition')),
      data,
    };
  }
}

function fileName(disposition) {
  if (!disposition) return null;
  for (const part of disposition.split(';')) {
    const trimmed = part.trim();
    const lower = trimmed.toLowerCase();
    if (lower.startsWith('filename*=')) {
      const value = trimmed.slice('filename*='.length);
      const index = value.indexOf("''");
      if (index >= 0) {
        try { return decodeURIComponent(value.slice(index + 2)); } catch { /* continua */ }
      }
    }
    if (lower.startsWith('filename=')) return trimmed.slice('filename='.length).replace(/^"|"$/g, '');
  }
  return null;
}

const decoder = new TextDecoder();
export const resultText = (result) => decoder.decode(result.data);
export const isJSON = (result) => (result.contentType ?? '').includes('json');

function parseJSON(result) {
  try { return JSON.parse(resultText(result)); } catch { return null; }
}

// MARK: - Cache su disco (IndexedDB)

let dbPromise = null;

function openDB() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      try {
        const request = indexedDB.open('bcw-cache', 1);
        request.onupgradeneeded = () => request.result.createObjectStore('responses');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }
  return dbPromise;
}

async function idb(mode, fn) {
  const db = await openDB();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction('responses', mode);
      const request = fn(tx.objectStore('responses'));
      tx.oncomplete = () => resolve(request?.result ?? null);
      tx.onerror = () => resolve(null);
      tx.onabort = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/** Cache delle risposte JSON, usata per la modalità offline. */
export class DiskCache {
  constructor(namespace) {
    this.namespace = namespace;
  }

  key(path) { return `${this.namespace}/${path}`; }

  store(text, path) { return idb('readwrite', (s) => s.put(text, this.key(path))); }
  load(path) { return idb('readonly', (s) => s.get(this.key(path))); }
  clear() { return DiskCache.remove(this.namespace); }

  /** Elimina del tutto una cache (es. quella di un account rimosso). */
  static remove(namespace) {
    const range = IDBKeyRange.bound(`${namespace}/`, `${namespace}/￿`);
    return idb('readwrite', (s) => s.delete(range));
  }
}

// MARK: - Client

export class ClassevivaClient {
  constructor(transport, cacheNamespace, credentials) {
    this.transport = transport;
    this.cache = new DiskCache(cacheNamespace);
    this.credentials = credentials ? { ...credentials } : null;
    this.token = null;
    this.tokenExpiry = null;
    this.ident = credentials?.ident ?? null;
    this.loginPromise = null;
  }

  /** ID numerico dello studente: "S1234567X" → "1234567". */
  get studentId() {
    const digits = (this.ident ?? '').replace(/\D/g, '');
    return digits || null;
  }

  // MARK: Autenticazione

  login() {
    if (!this.loginPromise) {
      this.loginPromise = this.performLogin().finally(() => { this.loginPromise = null; });
    }
    return this.loginPromise;
  }

  async performLogin() {
    const credentials = this.credentials;
    if (!credentials) throw APIError.notAuthenticated();
    const body = JSON.stringify({ uid: credentials.username, pass: credentials.password, ident: credentials.ident ?? null });
    const result = await this.transport.send('POST', '/auth/login', body, null);

    if (result.status < 200 || result.status >= 300) {
      const message = errorMessage(result);
      if ([400, 401, 422].includes(result.status)) {
        throw APIError.wrongCredentials(message ?? 'Nome utente o password non validi.');
      }
      throw APIError.server(result.status, message ?? '');
    }

    const json = parseJSON(result);
    if (!json || typeof json !== 'object') throw APIError.decoding();
    const response = parseLoginResponse(json);
    if (!response.token && response.choices.length) throw APIError.needsProfileChoice(response.choices);
    if (!response.token) throw APIError.decoding();
    this.token = response.token;
    this.tokenExpiry = response.expire ?? new Date(Date.now() + 60 * 60_000);
    this.ident = response.ident ?? credentials.ident ?? null;
    return response;
  }

  /** Riusa la sessione di un altro client (es. quello usato per verificare le credenziali). */
  adoptSession(other) {
    this.token = other.token;
    this.tokenExpiry = other.tokenExpiry;
    this.ident = other.ident;
  }

  async ensureToken() {
    if (this.token && this.tokenExpiry && this.tokenExpiry - Date.now() > 120_000) return;
    await this.login();
  }

  // MARK: Richieste

  /** Richiesta autenticata su un percorso relativo allo studente. Rinnova il token se scaduto. */
  async raw(method, studentPath, body = null) {
    await this.ensureToken();
    if (!this.studentId) throw APIError.notAuthenticated();
    const path = `/students/${this.studentId}/${studentPath}`;
    let result = await this.transport.send(method, path, body, this.token);
    if (result.status === 401 || result.status === 403) {
      this.token = null;
      await this.login();
      result = await this.transport.send(method, path, body, this.token);
    }
    if (result.status < 200 || result.status >= 300) {
      if (result.status === 401) throw APIError.notAuthenticated();
      throw APIError.server(result.status, errorMessage(result) ?? '');
    }
    return result;
  }

  /**
   * Scarica e decodifica una risposta JSON. In caso di errore di rete
   * restituisce l'ultima copia salvata (modalità offline).
   */
  async fetch(parse, studentPath, { method = 'GET', body = null, useCache = true } = {}) {
    try {
      const result = await this.raw(method, studentPath, body);
      const text = resultText(result);
      let json;
      try { json = JSON.parse(text); } catch { throw APIError.decoding(); }
      const value = parse(json);
      if (useCache) this.cache.store(text, studentPath);
      return { value, fromCache: false };
    } catch (error) {
      if (useCache && isOfflineError(error)) {
        const cached = await this.cached(parse, studentPath);
        if (cached) return { value: cached, fromCache: true };
      }
      throw error;
    }
  }

  /**
   * Prova più endpoint equivalenti in ordine (Classeviva ne versiona alcuni,
   * es. `grades` / `grades2324`) e usa il primo che risponde.
   */
  async fetchFirst(parse, paths, accept = () => true) {
    let lastError = APIError.decoding();
    let fallback = null;
    for (const path of paths) {
      try {
        const result = await this.fetch(parse, path);
        if (accept(result.value)) return result;
        fallback ??= result;
      } catch (error) {
        const skippable = error instanceof APIError &&
          ((error.kind === 'server' && [400, 404, 405].includes(error.code)) || error.kind === 'decoding');
        if (!skippable) throw error;
        lastError = error;
      }
    }
    if (fallback) return fallback;
    throw lastError;
  }

  /** Ultima risposta salvata, per mostrare subito i dati all'avvio. */
  async cached(parse, studentPath) {
    const text = await this.cache.load(studentPath);
    if (!text) return null;
    try { return parse(JSON.parse(text)); } catch { return null; }
  }

  /** Scarica un file, pronto per l'anteprima. */
  async download(studentPath, { method = 'GET', suggestedName }) {
    const result = await this.raw(method, studentPath);
    return makeFile(result, suggestedName);
  }

  signOut() {
    this.token = null;
    this.tokenExpiry = null;
    this.credentials = null;
  }
}

export function makeFile(result, suggestedName) {
  let name = (result.fileName ?? suggestedName ?? 'documento').replace(/\//g, '-');
  const type = result.contentType?.split(';')[0] || 'application/octet-stream';
  if (!/\.[a-z0-9]{2,5}$/i.test(name)) {
    if (type.includes('pdf')) name += '.pdf';
    else if (type.includes('png')) name += '.png';
    else if (type.includes('jpeg')) name += '.jpg';
  }
  const blob = new Blob([result.data], { type });
  return { blob, name, type, url: URL.createObjectURL(blob) };
}

function errorMessage(result) {
  const json = parseJSON(result);
  if (!json || typeof json !== 'object') return null;
  if (typeof json.message === 'string' && json.message) return json.message;
  if (typeof json.error === 'string' && json.error) return readable(json.error);
  return null;
}

/** Traduce i codici d'errore più comuni di Classeviva (es. "101:CvvRestApi/invalid payload"). */
function readable(error) {
  const lower = error.toLowerCase();
  if (lower.includes('must first be read')) return "Apri prima la comunicazione, poi riprova a scaricare l'allegato.";
  if (lower.includes('invalid payload')) return `Classeviva ha rifiutato la richiesta (${error}).`;
  if (lower.includes('authentication failed')) return 'Nome utente o password non validi.';
  if (lower.includes('not found')) return 'Elemento non trovato su Classeviva.';
  return error;
}
