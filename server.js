#!/usr/bin/env node
// Server di BCW: pubblica l'app e fa da proxy verso le API di Classeviva.
//
// Il browser non può chiamare direttamente `web.spaggiari.eu`: il server non consente
// richieste da altri siti (CORS) e l'API vuole lo User-Agent dell'app ufficiale, che il
// browser non permette di impostare. Questo proxy inoltra le richieste SOLO verso i server
// di Classeviva e non salva nulla: credenziali e token passano e basta.
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

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.md': 'text/markdown; charset=utf-8',
};

/** Solo questi file e cartelle sono pubblici (il proxy e la documentazione no). */
const PUBLIC = ['index.html', 'manifest.webmanifest', 'config.json', 'sw.js', 'css', 'js', 'icons'];

function upstreamURL(path) {
  // /api/v1/<percorso>            → https://web.spaggiari.eu/rest/v1/<percorso>
  // /api/archive/<aa>/<percorso>  → https://web<aa>.spaggiari.eu/rest/v1/<percorso>
  let m = /^\/api\/v1(\/[^?#]*)$/.exec(path);
  if (m) return `https://web.spaggiari.eu/rest/v1${m[1]}`;
  m = /^\/api\/archive\/(\d{2})(\/[^?#]*)$/.exec(path);
  if (m) return `https://web${m[1]}.spaggiari.eu/rest/v1${m[2]}`;
  return null;
}

function corsHeaders(origin) {
  if (!origin || !(ALLOWED_ORIGINS.includes('*') || ALLOWED_ORIGINS.includes(origin))) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Z-Auth-Token, Z-Dev-Apikey',
    'Access-Control-Expose-Headers': 'Content-Disposition, X-BCW-Proxy',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
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
    const upstream = await fetch(target, { method: req.method, headers, body, redirect: 'manual', signal: AbortSignal.timeout(25_000) });
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
