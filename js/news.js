// Notifiche delle novità: dopo ogni aggiornamento si confrontano voti, comunicazioni, note,
// assenze e compiti/verifiche futuri con quelli già visti (per account) e si notificano solo i
// tipi attivi in Impostazioni › Notifiche. La prima volta si ricorda senza notificare; più di
// 4 novità di un tipo diventano una notifica riassuntiva. Mai nella demo.

import { NewsKind } from './prefs.js';
import { AbsenceKind, NoteCategory } from './models.js';
import { Reminders } from './reminders.js';
import { fmt, sentenceCased, startOfDay } from './util.js';

const MAX_SEEN = 3000;
const key = (owner, kind) => `bcw.seenNews.${owner}.${kind}`;

function read(k) {
  try { return JSON.parse(localStorage.getItem(k)); } catch { return null; }
}

function write(k, value) {
  try { localStorage.setItem(k, JSON.stringify(value)); } catch { /* archiviazione piena */ }
}

/** Elementi attuali di ogni tipo, con id, titolo e testo della notifica. */
function items(model, kind) {
  switch (kind) {
    case 'grades':
      return model.grades.filter((g) => !g.canceled).map((g) => ({
        id: `${g.id}`,
        title: `${sentenceCased(g.subjectName)}: ${g.displayValue}`,
        body: [g.componentName, g.notes].filter(Boolean).join(' · '),
      }));
    case 'notices':
      return model.notices.map((n) => ({ id: `${n.id}`, title: n.title, body: n.category ?? '' }));
    case 'notes':
      return model.notes.map((n) => ({
        id: `${n.category}-${n.id}`,
        title: `${NoteCategory[n.category]?.title ?? 'Nota'} · ${n.authorName}`,
        body: n.text ?? '',
      }));
    case 'absences':
      return model.absences.map((a) => ({
        id: `${a.id}`,
        title: `${AbsenceKind[a.kind].title} del ${fmt.shortDay(a.date)}`,
        body: a.isJustified ? 'Giustificata' : 'Da giustificare',
      }));
    case 'agenda': {
      const today = startOfDay(new Date());
      return model.agenda.filter((e) => e.kind !== 'event' && e.begin >= today).map((e) => ({
        id: `${e.id}`,
        title: `${e.kind === 'test' ? 'Verifica' : 'Compiti'} di ${e.title.toLocaleLowerCase('it-IT')} · ${fmt.shortDay(e.begin)}`,
        body: e.notes,
      }));
    }
    default: return [];
  }
}

export const News = {
  async process(model) {
    const owner = model.activeAccountID;
    if (!owner || model.isDemo) return;
    const prefs = model.preferences;
    const toNotify = [];
    for (const kind of Object.keys(NewsKind)) {
      const current = items(model, kind);
      const stored = read(key(owner, kind));
      if (!Array.isArray(stored)) {
        // Prima volta: si ricorda tutto senza notificare (solo se i dati sono arrivati).
        if (current.length) write(key(owner, kind), current.map((i) => i.id).slice(-MAX_SEEN));
        continue;
      }
      const seen = new Set(stored);
      const fresh = current.filter((i) => !seen.has(i.id));
      if (!fresh.length) continue;
      write(key(owner, kind), [...stored, ...fresh.map((i) => i.id)].slice(-MAX_SEEN));
      if (prefs.newsEnabled(kind)) toNotify.push({ kind, fresh });
    }
    if (!toNotify.length || Reminders.permission !== 'granted') return;
    // Il browser non ha il sottotitolo: con più account il nome va in cima al testo.
    const account = model.accounts.length > 1 ? model.activeAccount?.name : null;
    const withAccount = (body) => [account, body].filter(Boolean).join('\n');
    for (const { kind, fresh } of toNotify) {
      const info = NewsKind[kind];
      if (fresh.length > 4) {
        const lines = fresh.slice(0, 5).map((i) => i.title).join('\n') + (fresh.length > 5 ? '\n…' : '');
        await Reminders.show(`${info.title}: ${fresh.length}`, withAccount(lines), `bcw.news.${kind}.${Date.now()}`);
      } else {
        for (const item of fresh) {
          await Reminders.show(item.title, withAccount(item.body || info.title), `bcw.news.${kind}.${item.id}`);
        }
      }
    }
  },
};
