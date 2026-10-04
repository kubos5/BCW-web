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

function upstreamURL(pathname) {
  let m = /^(?:\/api)?\/v1(\/[^?#]*)$/.exec(pathname);
  if (m) return `https://web.spaggiari.eu/rest/v1${m[1]}`;
  m = /^(?:\/api)?\/archive\/(\d{2})(\/[^?#]*)$/.exec(pathname);
  if (m) return `https://web${m[1]}.spaggiari.eu/rest/v1${m[2]}`;
  return null;
}

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin');
  const allowed = (env.ALLOWED_ORIGINS || '*').split(',').map((s) => s.trim());
  if (!origin || !(allowed.includes('*') || allowed.includes(origin))) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Z-Auth-Token, Z-Dev-Apikey',
    'Access-Control-Expose-Headers': 'Content-Disposition, X-BCW-Proxy',
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

    const target = upstreamURL(new URL(request.url).pathname);
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
      const upstream = await fetch(target, { method: request.method, headers, body, redirect: 'manual' });
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
