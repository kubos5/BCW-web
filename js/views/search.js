// Ricerca globale su compiti, voti, comunicazioni, materiale e note. Sui telefoni si apre dalla
// barra in cima alla Dashboard (i risultati prendono il posto della pagina); sugli schermi
// larghi dal campo nella barra in alto.

import {
  gradeBadge, subjectTag, agendaEventRow, filterChip, emptyState, listGroup, listItem, segCell, iconBadge,
} from '../components.js';
import { icon } from '../icons.js';
import { NoteCategory } from '../models.js';
import { contains, esc, fmt, uniqueSorted } from '../util.js';

const kinds = [['Verifica', 'test'], ['Interrogazione', 'person'], ['Compiti', 'book'], ['Comunicazione', 'megaphone']];

export const search = {
  title: 'Cerca',

  render(ctx) {
    const model = ctx.model;
    const prefs = ctx.prefs;
    const s = ctx.state('search', { query: '' });
    ctx.task('search-didactics', () => (model.didactics.length ? null : model.loadDidactics()));
    const q = s.query.trim();

    if (!q) {
      // Prima di scrivere: scorciatoie per tipo e suggerimenti dalle materie.
      const subjects = uniqueSorted(model.grades.map((g) => g.subjectName)).slice(0, 10);
      return {
        title: 'Cerca',
        body: `<div class="stack gap-20 search-suggestions">
          <section class="list-section"><h3 class="list-header">Cerca per tipo</h3><div class="flow-chips">${kinds.map(([label, iconName]) =>
            `<button class="btn tonal" data-action="search-suggestion" data-value="${esc(label)}">${icon(iconName)}<span>${esc(label)}</span></button>`).join('')}</div></section>
          ${subjects.length ? `<section class="list-section"><h3 class="list-header">Materie</h3><div class="flow-chips">${subjects.map((t) =>
            filterChip(t, { action: 'search-suggestion', params: { value: t } })).join('')}</div></section>` : ''}</div>`,
      };
    }

    const now = Date.now();
    const agenda = model.agenda.filter((e) => contains(e.notes, q) || contains(e.subjectName, q))
      .sort((a, b) => Math.abs(a.begin - now) - Math.abs(b.begin - now));
    const grades = model.grades.filter((g) => contains(g.subjectName, q) || contains(g.notes, q));
    const notices = model.notices.filter((n) => contains(n.title, q) || contains(n.category, q));
    const notes = model.notes.filter((n) => contains(n.text, q) || contains(n.authorName, q));
    const files = model.didactics.flatMap((t) => t.folders.flatMap((f) => f.contents)
      .filter((c) => contains(c.name, q) || contains(t.name, q)).map((c) => ({ teacher: t, content: c })));

    if (!agenda.length && !grades.length && !notices.length && !notes.length && !files.length) {
      return { title: 'Cerca', body: emptyState(`Nessun risultato per "${q}"`, 'search', 'Controlla l\'ortografia o prova con un\'altra ricerca.') };
    }

    const header = (title, count) => (count > 15 ? `${title} · ${count}` : title);
    const chevron = icon('chevronRight', { cls: 'trailing-icon' });
    const expanded = ctx.app.viewState.get('expanded');
    const results = [];
    if (agenda.length) {
      results.push(listGroup(agenda.slice(0, 15).map((e) => segCell(agendaEventRow(e, {
        done: prefs.isCompleted(e), showsDate: true, scope: 'se', expanded: expanded?.has(`se${e.id}`),
      }))), { header: header('Agenda', agenda.length) }));
    }
    if (grades.length) {
      results.push(listGroup(grades.slice(0, 15).map((g) => segCell(`<div class="search-grade">${gradeBadge(g, 44)}
        <div class="grow">${subjectTag(g.subjectName, g.subjectId)}<p class="row-caption">${esc(`${g.kind} · ${fmt.shortDay(g.date)}${g.notes ? ` · ${g.notes}` : ''}`)}</p></div></div>`)),
      { header: header('Voti', grades.length) }));
    }
    if (notices.length) {
      results.push(listGroup(notices.slice(0, 10).map((n) => listItem({
        title: n.title, subtitle: n.category, action: 'navigate', params: { to: `noticeboard/${n.id}` },
        leading: iconBadge('megaphone', 'var(--primary)', 40), trailing: chevron,
      })), { header: header('Bacheca', notices.length) }));
    }
    if (files.length) {
      results.push(listGroup(files.slice(0, 10).map(({ teacher, content }) => listItem({
        title: content.name, subtitle: teacher.name, action: 'navigate', params: { to: 'didactics' },
        leading: iconBadge(content.icon, 'var(--tertiary)', 40), trailing: chevron,
      })), { header: header('Materiale didattico', files.length) }));
    }
    if (notes.length) {
      results.push(listGroup(notes.slice(0, 10).map((n) => listItem({
        title: n.text, subtitle: `${NoteCategory[n.category].singular} · ${fmt.shortDay(n.date)}`,
        leading: iconBadge('messageAlert', 'var(--poor)', 40), cls: 'multiline',
      })), { header: header('Note', notes.length) }));
    }
    return { title: 'Cerca', body: `<div class="search-results">${results.join('')}</div>` };
  },

  actions: {
    'search-input': (ctx, el) => {
      ctx.state('search', { query: '' }).query = el.dataset.clear ? '' : el.value;
      if (el.dataset.clear) requestAnimationFrame(() => document.querySelector('.search-app-bar input, .global-search input')?.focus());
    },
    'search-suggestion': (ctx, el) => {
      ctx.state('search', { query: '' }).query = el.dataset.value;
      requestAnimationFrame(() => document.querySelector('.global-search input, .search-app-bar input')?.focus());
    },
  },
};
