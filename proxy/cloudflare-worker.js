// Proxy di BCW come Cloudflare Worker: utile se l'app è pubblicata su un hosting statico
// (es. GitHub Pages). Inoltra le richieste SOLO verso i server di Classeviva.
//
// 1. crea un Worker su dash.cloudflare.com e incolla questo file
// 2. in Settings › Variables aggiungi ALLOWED_ORIGINS con l'indirizzo dell'app
//    (es. https://tuonome.github.io), oppure "*" per qualsiasi sito
// 3. in BCW apri Impostazioni › Server (o "Modifica" nella schermata di accesso)
//    e inserisci l'indirizzo del Worker, es. https://bcw-proxy.tuonome.workers.dev

const CLASSEVIVA_HEADERS = {
  'User-Agent': 'CVVS/std/4.2.3 Android/12',
  'Z-Dev-Apikey': 'Tg1NWEwNGIgIC0K',
  Accept: 'application/json',
};

// Sito di Classeviva (4.0, compiti del modulo Compiti): API del sito (`rest/w1`) con il token
// dell'app o con la sessione del sito. `/site-login` entra con le credenziali e restituisce i cookie,
// che l'app tiene in memoria e rimanda in `X-BCW-Session`. Il Worker non salva nulla.
const SITE_USER_AGENT = 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1';
const SITE_AUTH = 'https://web.spaggiari.eu/auth-p7/app/default/AuthApi4.php';

function setCookies(headers) {
  if (typeof headers.getSetCookie === 'function') return headers.getSetCookie();
  if (typeof headers.getAll === 'function') {
    try { return headers.getAll('Set-Cookie'); } catch { /* non disponibile */ }
  }
  const raw = headers.get('Set-Cookie');
  return raw ? raw.split(/,(?=\s*[^;,=\s]+=)/) : [];
}

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

async function siteLogin({ uid, pwd, ident }) {
  const jar = new Map();
  const authenticate = async (action, fields) => {
    const headers = { 'User-Agent': SITE_USER_AGENT, Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' };
    if (jar.size) headers.Cookie = cookieHeader(jar);
    const response = await fetch(`${SITE_AUTH}?a=${action}`, { method: 'POST', headers, body: new URLSearchParams(fields).toString(), redirect: 'manual' });
    storeCookies(jar, response.headers);
    const json = await response.json().catch(() => null);
    return json?.data?.auth ?? null;
  };
  let auth = await authenticate('aLoginPwd', { cid: '', uid, pwd, pin: '', target: '' });
  if (auth && auth.loggedIn !== true && auth.verified === true && ident) auth = await authenticate('aLoginSam', { uid: ident });
  if (!auth) return null;
  return { loggedIn: auth.loggedIn === true, session: auth.loggedIn === true ? cookieHeader(jar) : null };
}

function upstreamURL(pathname) {
  let m = /^(?:\/api)?\/v1(\/[^?#]*)$/.exec(pathname);
  if (m) return `https://web.spaggiari.eu/rest/v1${m[1]}`;
  m = /^(?:\/api)?\/archive\/(\d{2})(\/[^?#]*)$/.exec(pathname);
  if (m) return `https://web${m[1]}.spaggiari.eu/rest/v1${m[2]}`;
  return null;
}

/**
 * Inoltra la richiesta seguendo i reindirizzamenti come l'app iOS (alcuni allegati della
 * Bacheca vengono serviti da un altro indirizzo). Il token va solo ai server di Classeviva.
 */
async function fetchUpstream(url, { method, headers, body }) {
  let response = await fetch(url, { method, headers, body, redirect: 'manual' });
  for (let hops = 0; hops < 5 && [301, 302, 303, 307, 308].includes(response.status); hops++) {
    const location = response.headers.get('Location');
    if (!location) break;
    const next = new URL(location, url);
    if (next.protocol !== 'https:') break;
    headers = { ...headers };
    if (!/(^|\.)spaggiari\.eu$/.test(next.hostname)) delete headers['Z-Auth-Token'];
    if (response.status !== 307 && response.status !== 308) {
      method = 'GET';
      body = undefined;
      delete headers['Content-Type'];
    }
    url = next.href;
    response = await fetch(url, { method, headers, body, redirect: 'manual' });
  }
  return response;
}

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin');
  const allowed = (env.ALLOWED_ORIGINS || '*').split(',').map((s) => s.trim());
  if (!origin || !(allowed.includes('*') || allowed.includes(origin))) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Z-Auth-Token, Z-Dev-Apikey, X-BCW-Session',
    'Access-Control-Expose-Headers': 'Content-Disposition, X-BCW-Proxy, X-BCW-Session',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request, env);
    const json = (status, message) => new Response(JSON.stringify({ message }), {
      status, headers: { ...cors, 'Content-Type': 'application/json', 'X-BCW-Proxy': '1' },
    });
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'GET' && request.method !== 'POST') return json(405, 'Metodo non consentito');

    const { pathname } = new URL(request.url);
    // Usato dall'app per verificare che il proxy sia presente.
    if (/^(?:\/api)?\/ping$/.test(pathname)) {
      return new Response('{"ok":true}', { headers: { ...cors, 'Content-Type': 'application/json', 'X-BCW-Proxy': '1', 'Cache-Control': 'no-store' } });
    }
    // Accesso al sito di Classeviva: `{ uid, pwd, ident }` → `{ loggedIn, session }`.
    if (/^(?:\/api)?\/site-login$/.test(pathname)) {
      if (request.method !== 'POST') return json(405, 'Metodo non consentito');
      let input;
      try { input = await request.json(); } catch { return json(400, 'Richiesta non valida'); }
      if (typeof input?.uid !== 'string' || typeof input?.pwd !== 'string') return json(400, 'Richiesta non valida');
      try {
        const result = await siteLogin({ uid: input.uid, pwd: input.pwd, ident: typeof input.ident === 'string' ? input.ident : null });
        if (!result) return json(502, 'Risposta inattesa dal sito di Classeviva.');
        return new Response(JSON.stringify(result), { headers: { ...cors, 'Content-Type': 'application/json', 'X-BCW-Proxy': '1', 'Cache-Control': 'no-store' } });
      } catch {
        return json(502, 'Impossibile contattare Classeviva.');
      }
    }
    // API del sito (solo GET), senza reindirizzamenti: con la sessione scaduta l'app rientra.
    const site = /^(?:\/api)?\/w1(\/[^?#]*)$/.exec(pathname);
    if (site) {
      if (request.method !== 'GET') return json(405, 'Metodo non consentito');
      const session = request.headers.get('X-BCW-Session');
      const token = request.headers.get('Z-Auth-Token');
      const headers = session
        ? { 'User-Agent': SITE_USER_AGENT, Accept: 'application/json', Cookie: session }
        : { ...CLASSEVIVA_HEADERS, ...(token ? { 'Z-Auth-Token': token } : {}) };
      try {
        const upstream = await fetch(`https://web.spaggiari.eu/rest/w1${site[1]}`, { headers, redirect: 'manual' });
        const out = new Headers({ ...cors, 'X-BCW-Proxy': '1', 'Cache-Control': 'no-store' });
        const type = upstream.headers.get('Content-Type');
        if (type) out.set('Content-Type', type);
        if (session) {
          const jar = parseCookies(session);
          storeCookies(jar, upstream.headers);
          out.set('X-BCW-Session', cookieHeader(jar));
        }
        return new Response(upstream.body, { status: upstream.status, headers: out });
      } catch {
        return json(502, 'Impossibile contattare Classeviva.');
      }
    }

    const target = upstreamURL(pathname);
    if (!target) return json(404, 'Percorso non valido');

    const headers = { ...CLASSEVIVA_HEADERS };
    const token = request.headers.get('Z-Auth-Token');
    if (token) headers['Z-Auth-Token'] = token;
    let body;
    if (request.method === 'POST') {
      body = await request.text();
      // Classeviva rifiuta il JSON vuoto `{}` ma accetta un corpo vuoto.
      if (body.replace(/\s/g, '') === '{}') body = '';
      headers['Content-Type'] = 'application/json';
    }
    try {
      const upstream = await fetchUpstream(target, { method: request.method, headers, body });
      const out = new Headers({ ...cors, 'X-BCW-Proxy': '1', 'Cache-Control': 'no-store' });
      for (const name of ['Content-Type', 'Content-Disposition']) {
        const value = upstream.headers.get(name);
        if (value) out.set(name, value);
      }
      return new Response(upstream.body, { status: upstream.status, headers: out });
    } catch {
      return json(502, 'Impossibile contattare Classeviva.');
    }
  },
};
