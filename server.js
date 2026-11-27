#!/usr/bin/env node
// Server di BCW: pubblica l'app e fa da proxy verso le API di Classeviva.
//
// Il browser non può chiamare direttamente `web.spaggiari.eu`: il server non consente
// richieste da altri siti (CORS) e l'API vuole lo User-Agent dell'app ufficiale, che il
// browser non permette di impostare. Questo proxy inoltra le richieste SOLO verso i server
// di Classeviva e non salva nulla: credenziali, token e cookie del sito passano e basta.
//
// Uso: `node server.js` (porta 8080) oppure `PORT=3000 node server.js`. Nessuna dipendenza.

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const PORT = Number(process.env.PORT) || 8080;
const HOST = process.env.HOST || '0.0.0.0';
/** Origini autorizzate a usare il proxy da un altro sito (separate da virgole). Vuoto = solo questo sito. */
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);

const CLASSEVIVA_HEADERS = {
  'User-Agent': 'CVVS/std/4.2.3 Android/12',
  'Z-Dev-Apikey': 'Tg1NWEwNGIgIC0K',
  Accept: 'application/json',
};

// Sito di Classeviva (4.0, come `ClassevivaWebSession` nell'app): le API del sito (`rest/w1`, stessi
// percorsi di `rest/v1`) servono solo per i compiti del modulo Compiti (`homeworks/index`), che
// l'API dell'app potrebbe non dare. Si leggono con il token dell'app oppure con la sessione del
// sito: `/api/site-login` entra con le credenziali e restituisce i cookie, che l'app tiene in
// memoria e rimanda nell'intestazione `X-BCW-Session`. Il proxy non salva nulla.
const SITE_USER_AGENT = 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1';
const SITE_AUTH = 'https://web.spaggiari.eu/auth-p7/app/default/AuthApi4.php';

/** I cookie impostati da una risposta (`Set-Cookie`, anche più d'uno). */
function setCookies(headers) {
  if (typeof headers.getSetCookie === 'function') return headers.getSetCookie();
  const raw = headers.get('set-cookie');
  return raw ? raw.split(/,(?=\s*[^;,=\s]+=)/) : [];
}

/** Aggiunge (o toglie, se scaduti) i cookie di una risposta a quelli in `jar`. */
function storeCookies(jar, headers) {
  for (const line of setCookies(headers)) {
    const [pair, ...attributes] = line.split(';');
    const index = pair.indexOf('=');
    if (index <= 0) continue;
    const name = pair.slice(0, index).trim();
    const value = pair.slice(index + 1).trim();
    const expired = value === '' || value === 'deleted' || attributes.some((a) => /^\s*max-age\s*=\s*(0|-)/i.test(a));
    if (expired) jar.delete(name);
    else jar.set(name, value);
  }
}

const cookieHeader = (jar) => [...jar].map(([name, value]) => `${name}=${value}`).join('; ');

function parseCookies(header) {
  const jar = new Map();
  for (const part of String(header || '').split(';')) {
    const index = part.indexOf('=');
    if (index > 0) jar.set(part.slice(0, index).trim(), part.slice(index + 1).trim());
  }
  return jar;
}

/** Accesso al sito con le credenziali di Classeviva (più profili: `aLoginSam` con l'ident). */
async function siteLogin({ uid, pwd, ident }) {
  const jar = new Map();
  const authenticate = async (action, fields) => {
    const headers = {
      'User-Agent': SITE_USER_AGENT,
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    };
    if (jar.size) headers.Cookie = cookieHeader(jar);
    const response = await fetch(`${SITE_AUTH}?a=${action}`, {
      method: 'POST', headers, body: new URLSearchParams(fields).toString(), redirect: 'manual', signal: AbortSignal.timeout(25_000),
    });
    storeCookies(jar, response.headers);
    const json = await response.json().catch(() => null);
    return json?.data?.auth ?? null;
  };
  let auth = await authenticate('aLoginPwd', { cid: '', uid, pwd, pin: '', target: '' });
  if (auth && auth.loggedIn !== true && auth.verified === true && ident) auth = await authenticate('aLoginSam', { uid: ident });
  if (!auth) return null;
  return { loggedIn: auth.loggedIn === true, session: auth.loggedIn === true ? cookieHeader(jar) : null };
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.md': 'text/markdown; charset=utf-8',
};

/** Solo questi file e cartelle sono pubblici (il proxy e la documentazione no). */
const PUBLIC = ['index.html', 'manifest.webmanifest', 'config.json', 'sw.js', 'css', 'js', 'icons', 'fonts', 'logo'];

function upstreamURL(path) {
  // /api/v1/<percorso>            → https://web.spaggiari.eu/rest/v1/<percorso>
  // /api/archive/<aa>/<percorso>  → https://web<aa>.spaggiari.eu/rest/v1/<percorso>
  let m = /^\/api\/v1(\/[^?#]*)$/.exec(path);
  if (m) return `https://web.spaggiari.eu/rest/v1${m[1]}`;
  m = /^\/api\/archive\/(\d{2})(\/[^?#]*)$/.exec(path);
  if (m) return `https://web${m[1]}.spaggiari.eu/rest/v1${m[2]}`;
  return null;
}

/** /api/w1/<percorso> → https://web.spaggiari.eu/rest/w1/<percorso> (API del sito). */
function siteURL(path) {
  const m = /^\/api\/w1(\/[^?#]*)$/.exec(path);
  return m ? `https://web.spaggiari.eu/rest/w1${m[1]}` : null;
}

function corsHeaders(origin) {
  if (!origin || !(ALLOWED_ORIGINS.includes('*') || ALLOWED_ORIGINS.includes(origin))) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Z-Auth-Token, Z-Dev-Apikey, X-BCW-Session',
    'Access-Control-Expose-Headers': 'Content-Disposition, X-BCW-Proxy, X-BCW-Session',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

/**
 * Inoltra la richiesta seguendo i reindirizzamenti come l'app iOS (alcuni allegati della
 * Bacheca vengono serviti da un altro indirizzo). Il token va solo ai server di Classeviva.
 */
async function fetchUpstream(url, { method, headers, body }) {
  const signal = AbortSignal.timeout(25_000);
  let response = await fetch(url, { method, headers, body, redirect: 'manual', signal });
  for (let hops = 0; hops < 5 && [301, 302, 303, 307, 308].includes(response.status); hops++) {
    const location = response.headers.get('location');
    if (!location) break;
    const next = new URL(location, url);
    if (next.protocol !== 'https:') break;
    headers = { ...headers };
    if (!/(^|\.)spaggiari\.eu$/.test(next.hostname)) delete headers['Z-Auth-Token'];
    if (response.status !== 307 && response.status !== 308) {
      method = 'GET';
      body = undefined;
      delete headers['Content-Type'];
      delete headers['Content-Length'];
    }
    url = next.href;
    response = await fetch(url, { method, headers, body, redirect: 'manual', signal });
  }
  return response;
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 1_000_000) throw new Error('Richiesta troppo grande');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function proxy(req, res, target) {
  const cors = corsHeaders(req.headers.origin);
  if (req.method === 'OPTIONS') {
    res.writeHead(204, cors);
    res.end();
    return;
  }
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.writeHead(405, { ...cors, 'Content-Type': 'application/json', 'X-BCW-Proxy': '1' });
    res.end('{"message":"Metodo non consentito"}');
    return;
  }
  const headers = { ...CLASSEVIVA_HEADERS };
  if (req.headers['z-auth-token']) headers['Z-Auth-Token'] = String(req.headers['z-auth-token']);
  let body;
  if (req.method === 'POST') {
    body = await readBody(req);
    // Classeviva rifiuta il JSON vuoto `{}` ma accetta un corpo vuoto; il CDN vuole sempre Content-Length.
    if (body.toString().replace(/\s/g, '') === '{}') body = Buffer.alloc(0);
    headers['Content-Type'] = 'application/json';
    headers['Content-Length'] = String(body.length);
  }
  try {
    const upstream = await fetchUpstream(target, { method: req.method, headers, body });
    const data = Buffer.from(await upstream.arrayBuffer());
    const out = { ...cors, 'X-BCW-Proxy': '1', 'Cache-Control': 'no-store' };
    const type = upstream.headers.get('content-type');
    if (type) out['Content-Type'] = type;
    const disposition = upstream.headers.get('content-disposition');
    if (disposition) out['Content-Disposition'] = disposition;
    res.writeHead(upstream.status, out);
    res.end(data);
  } catch (error) {
    res.writeHead(502, { ...cors, 'Content-Type': 'application/json', 'X-BCW-Proxy': '1' });
    res.end(JSON.stringify({ message: 'Impossibile contattare Classeviva.', detail: String(error?.cause?.code ?? error?.name ?? error) }));
  }
}

/**
 * API del sito (solo GET): con `X-BCW-Session` (i cookie di `/api/site-login`) come il browser,
 * altrimenti con il token dell'app. Niente reindirizzamenti: con la sessione scaduta il sito rimanda
 * alla pagina di accesso, e l'app rientra. I cookie aggiornati tornano in `X-BCW-Session`.
 */
async function proxySite(req, res, target) {
  const cors = corsHeaders(req.headers.origin);
  if (req.method === 'OPTIONS') {
    res.writeHead(204, cors);
    res.end();
    return;
  }
  if (req.method !== 'GET') {
    res.writeHead(405, { ...cors, 'Content-Type': 'application/json', 'X-BCW-Proxy': '1' });
    res.end('{"message":"Metodo non consentito"}');
    return;
  }
  const session = req.headers['x-bcw-session'] ? String(req.headers['x-bcw-session']) : null;
  const headers = session
    ? { 'User-Agent': SITE_USER_AGENT, Accept: 'application/json', Cookie: session }
    : { ...CLASSEVIVA_HEADERS, ...(req.headers['z-auth-token'] ? { 'Z-Auth-Token': String(req.headers['z-auth-token']) } : {}) };
  try {
    const upstream = await fetch(target, { headers, redirect: 'manual', signal: AbortSignal.timeout(25_000) });
    const data = Buffer.from(await upstream.arrayBuffer());
    const out = { ...cors, 'X-BCW-Proxy': '1', 'Cache-Control': 'no-store' };
    const type = upstream.headers.get('content-type');
    if (type) out['Content-Type'] = type;
    if (session) {
      const jar = parseCookies(session);
      storeCookies(jar, upstream.headers);
      out['X-BCW-Session'] = cookieHeader(jar);
    }
    res.writeHead(upstream.status, out);
    res.end(data);
  } catch (error) {
    res.writeHead(502, { ...cors, 'Content-Type': 'application/json', 'X-BCW-Proxy': '1' });
    res.end(JSON.stringify({ message: 'Impossibile contattare Classeviva.', detail: String(error?.cause?.code ?? error?.name ?? error) }));
  }
}

/** POST /api/site-login con `{ uid, pwd, ident }`: risponde `{ loggedIn, session }`. */
async function proxySiteLogin(req, res) {
  const cors = corsHeaders(req.headers.origin);
  const reply = (status, value) => {
    res.writeHead(status, { ...cors, 'Content-Type': 'application/json', 'X-BCW-Proxy': '1', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(value));
  };
  if (req.method === 'OPTIONS') {
    res.writeHead(204, cors);
    res.end();
    return;
  }
  if (req.method !== 'POST') return reply(405, { message: 'Metodo non consentito' });
  let input;
  try {
    input = JSON.parse((await readBody(req)).toString() || '{}');
  } catch {
    return reply(400, { message: 'Richiesta non valida' });
  }
  if (typeof input?.uid !== 'string' || typeof input?.pwd !== 'string') return reply(400, { message: 'Richiesta non valida' });
  try {
    const result = await siteLogin({ uid: input.uid, pwd: input.pwd, ident: typeof input.ident === 'string' ? input.ident : null });
    if (!result) return reply(502, { message: 'Risposta inattesa dal sito di Classeviva.' });
    return reply(200, result);
  } catch (error) {
    return reply(502, { message: 'Impossibile contattare Classeviva.', detail: String(error?.cause?.code ?? error?.name ?? error) });
  }
}

async function serveStatic(req, res, pathname) {
  let path = decodeURIComponent(pathname);
  if (path === '/') path = '/index.html';
  const relative = normalize(path).replace(/^([/\\])+/, '');
  const top = relative.split(sep)[0];
  if (!PUBLIC.includes(top) || relative.includes('..')) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Non trovato');
    return;
  }
  const file = join(ROOT, relative);
  try {
    const info = await stat(file);
    if (!info.isFile()) throw new Error('not a file');
    const data = await readFile(file);
    res.writeHead(200, {
      'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    });
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Non trovato');
  }
}

const server = createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  try {
    if (pathname === '/api/ping') {
      // Usato dall'app per verificare che il proxy sia presente.
      res.writeHead(200, { ...corsHeaders(req.headers.origin), 'Content-Type': 'application/json', 'X-BCW-Proxy': '1', 'Cache-Control': 'no-store' });
      res.end('{"ok":true}');
      return;
    }
    if (pathname === '/api/site-login') {
      await proxySiteLogin(req, res);
      return;
    }
    const site = siteURL(pathname);
    if (site) {
      await proxySite(req, res, site);
      return;
    }
    if (pathname.startsWith('/api/')) {
      const target = upstreamURL(pathname);
      if (!target) {
        res.writeHead(404, { 'Content-Type': 'application/json', 'X-BCW-Proxy': '1' });
        res.end('{"message":"Percorso non valido"}');
        return;
      }
      await proxy(req, res, target);
      return;
    }
    await serveStatic(req, res, pathname);
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(String(error.message));
  }
});

server.listen(PORT, HOST, () => {
  console.log(`BCW è pronta su http://localhost:${PORT}`);
});
