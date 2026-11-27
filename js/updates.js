// Versione e note di rilascio (4.0, come `UpdateChecker` e `ReleaseSheet` nell'app).
//
// Dopo un aggiornamento (mai alla prima apertura) un foglio mostra le note della release di GitHub
// di questa versione; Impostazioni › Generale › Note di rilascio le riapre. Le release sono quelle
// di BCW-web (`api.github.com/repos/kubos5/BCW-web/releases`): le richieste vanno solo a GitHub e
// non portano dati dell'utente. Niente avviso delle versioni nuove: il sito si aggiorna da solo.

import { icon } from './icons.js';
import { shape } from './shapes.js';
import { esc, fmt } from './util.js';

/** Versione di BCW per il web (la stessa dell'app per iPhone e iPad). */
export const VERSION = '4.0.1';

const REPOSITORY = 'kubos5/BCW-web';
const LAST_KEY = 'bcw.lastRunVersion';
const PENDING_KEY = 'bcw.pendingReleaseNotes';

/** "v3.3.1", "4.0" → [3, 3, 1], [4, 0]; le parti mancanti valgono 0. */
const versionParts = (text) => String(text ?? '').replace(/^[^\d]*/, '').split('.').map((p) => parseInt(p, 10) || 0);

/** < 0, 0 o > 0 come `a` è più vecchia, uguale o più recente di `b`. */
export function compareVersions(a, b) {
  const x = versionParts(a);
  const y = versionParts(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

const storage = {
  get(key) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch { /* ignorato */ } },
  remove(key) { try { localStorage.removeItem(key); } catch { /* ignorato */ } },
};

async function fetchReleases() {
  try {
    const response = await fetch(`https://api.github.com/repos/${REPOSITORY}/releases?per_page=20`, {
      headers: { Accept: 'application/vnd.github+json' }, cache: 'no-store',
    });
    if (!response.ok) return null;
    const list = await response.json();
    return Array.isArray(list) ? list.filter((r) => r && typeof r.tag_name === 'string' && !r.draft) : null;
  } catch {
    return null;
  }
}

const latestOf = (releases) => releases.filter((r) => !r.prerelease)
  .reduce((best, r) => (!best || compareVersions(r.tag_name, best.tag_name) > 0 ? r : best), null);

export const Updates = {
  pending: false,
  running: false,
  /** Le note in attesa si cercano una volta per apertura (si riprova alla prossima). */
  tried: false,

  /**
   * All'avvio: ricorda la versione e, se BCW è stata aggiornata (non alla prima apertura), mette in
   * attesa le note della versione nuova. Chi arriva dalla 3.3.1 o prima non ha la versione salvata.
   */
  launch({ firstRun }) {
    const last = storage.get(LAST_KEY);
    storage.set(LAST_KEY, VERSION);
    if (!firstRun && (!last || compareVersions(last, VERSION) < 0)) storage.set(PENDING_KEY, VERSION);
    const pending = storage.get(PENDING_KEY);
    // Le note in attesa di una versione diversa da quella in uso non servono più.
    if (pending && compareVersions(pending, VERSION) !== 0) storage.remove(PENDING_KEY);
    this.pending = !!storage.get(PENDING_KEY);
  },

  /**
   * Con BCW pronta (niente introduzione, blocco o fogli aperti): le note in attesa. La release di
   * questa versione o, se non c'è ancora, l'ultima pubblicata purché non più vecchia.
   */
  async presentIfNeeded(open) {
    if (!this.pending || this.running || this.tried) return;
    this.running = true;
    this.tried = true;
    try {
      const releases = await fetchReleases();
      if (!releases) return;
      let latest = latestOf(releases);
      if (latest && compareVersions(latest.tag_name, VERSION) < 0) latest = null;
      const release = releases.find((r) => compareVersions(r.tag_name, VERSION) === 0) ?? latest;
      // Se nel frattempo si è aperto altro (`open` restituisce `false`) si riprova alla prossima apertura.
      if (!release || open(releaseSheet(release)) === false) return;
      storage.remove(PENDING_KEY);
      this.pending = false;
    } finally {
      this.running = false;
    }
  },

  /**
   * "Note di rilascio" (Impostazioni › Generale): le novità di questa versione o, se la sua release
   * non c'è, dell'ultima pubblicata. `'shown'`, `'unavailable'` (nessuna release) o `'failed'`.
   */
  async showLatestNotes(open) {
    const releases = await fetchReleases();
    if (!releases) return 'failed';
    const latest = latestOf(releases);
    if (!latest) return 'unavailable';
    open(releaseSheet(releases.find((r) => compareVersions(r.tag_name, VERSION) === 0 && !r.prerelease) ?? latest));
    return 'shown';
  },
};

// MARK: - Foglio

/** Il foglio con le note: in alto la versione e la data, sotto il testo della release. */
export function releaseSheet(release) {
  const version = versionParts(release.tag_name).join('.');
  const published = release.published_at ? new Date(release.published_at) : null;
  const url = typeof release.html_url === 'string' && release.html_url.startsWith('https://github.com/')
    ? release.html_url : `https://github.com/${REPOSITORY}/releases`;
  return {
    id: 'release-notes',
    render: () => ({
      title: 'Note di rilascio',
      size: 'large',
      body: `<div class="release">
        <div class="release-head"><span class="release-art shaped">${shape('sunny')}${icon('newReleases')}</span>
          <span class="grow"><strong>Novità di BCW ${esc(version)}</strong>${published && !Number.isNaN(published.getTime()) ? `<small>Pubblicata il ${esc(fmt.dayMonthYear(published))}</small>` : ''}</span></div>
        <div class="release-notes">${releaseNotesHTML(release.body ?? '')}</div></div>`,
      footer: `<a class="btn text s" href="${esc(url)}" target="_blank" rel="noopener">${icon('externalLink')}<span>Apri su GitHub</span></a>
        <button class="btn filled s" data-action="sheet-close">Continua</button>`,
    }),
  };
}

/**
 * Il testo di una release di GitHub (Markdown): titoli, elenchi puntati e numerati, citazioni e
 * paragrafi, con grassetto, corsivo, codice e collegamenti dentro le righe. Il primo titolo di primo
 * livello (es. "BCW v4.0.1") si salta: c'è già in cima al foglio. Immagini e HTML no.
 */
export function releaseNotesHTML(markdown) {
  const blocks = [];
  let skippedTitle = false;
  for (const raw of String(markdown).replace(/\r\n/g, '\n').split('\n')) {
    const indent = raw.match(/^[ \t]*/)[0].length;
    const line = raw.trim();
    if (!line) {
      if (blocks.length && blocks.at(-1).type !== 'gap') blocks.push({ type: 'gap' });
      continue;
    }
    if (line.startsWith('<') || line.startsWith('![') || line.startsWith('---')) continue;
    let m;
    if ((m = /^(#+)\s*(.*)$/.exec(line))) {
      const level = m[1].length;
      if (level === 1 && !skippedTitle && blocks.every((b) => b.type === 'gap')) {
        skippedTitle = true;
        continue;
      }
      blocks.push({ type: 'heading', level, text: m[2] });
    } else if ((m = /^[-*+]\s+(.*)$/.exec(line))) {
      blocks.push({ type: 'bullet', depth: Math.floor(indent / 2), text: m[1] });
    } else if ((m = /^(\d+)\.\s+(.*)$/.exec(line))) {
      blocks.push({ type: 'numbered', number: m[1], text: m[2] });
    } else if (line.startsWith('>')) {
      blocks.push({ type: 'quote', text: line.replace(/^>+\s*/, '') });
    } else {
      blocks.push({ type: 'paragraph', text: line });
    }
  }
  while (blocks[0]?.type === 'gap') blocks.shift();
  while (blocks.at(-1)?.type === 'gap') blocks.pop();
  if (!blocks.length) return '<p class="rn-empty">Nessuna nota per questa versione.</p>';
  return blocks.map((b) => {
    switch (b.type) {
      case 'heading': return `<h3 class="rn-h${Math.min(b.level, 4)}">${inline(b.text)}</h3>`;
      case 'bullet': return `<p class="rn-bullet${b.depth ? ' nested' : ''}" style="--depth:${Math.min(b.depth, 3)}"><span class="rn-dot shaped">${shape(b.depth ? 'circle' : 'cookie4Sided')}</span><span>${inline(b.text)}</span></p>`;
      case 'numbered': return `<p class="rn-numbered"><span class="rn-number numeral">${esc(b.number)}.</span><span>${inline(b.text)}</span></p>`;
      case 'quote': return `<p class="rn-quote">${inline(b.text)}</p>`;
      case 'paragraph': return `<p class="rn-paragraph">${inline(b.text)}</p>`;
      default: return '<span class="rn-gap"></span>';
    }
  }).join('');
}

/** Grassetto, corsivo, codice e collegamenti (solo https) di una riga, già sicuri per l'HTML. */
function inline(text) {
  const codes = [];
  let html = esc(text).replace(/`([^`]+)`/g, (_, code) => {
    codes.push(code);
    return `\u0000${codes.length - 1}\u0000`;
  });
  html = html
    .replace(/\[([^\]]+)\]\((https:\/\/[^\s)]+)\)/g, (_, label, href) => `<a href="${href}" target="_blank" rel="noopener">${label}</a>`)
    .replace(/(^|[\s(])(https:\/\/[^\s<)]+)/g, (_, lead, href) => `${lead}<a href="${href}" target="_blank" rel="noopener">${href.replace(/^https:\/\//, '')}</a>`)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_]+)__/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
    .replace(/(^|[^\w])_([^_\s][^_]*)_(?!\w)/g, '$1<em>$2</em>');
  return html.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[Number(i)]}</code>`);
}
