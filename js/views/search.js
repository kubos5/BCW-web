// Ricerca globale su compiti, voti, comunicazioni, materiale e note.

import { card, cardGrid, eyebrow, gradeBadge, subjectTag, agendaEventRow, filterChip, sectionHeader, emptyState, joinRows } from '../components.js';
import { icon } from '../icons.js';
import { NoteCategory } from '../models.js';
import { contains, esc, fmt, uniqueSorted } from '../util.js';

export const search = {
  title: 'Cerca',

  render(ctx) {
    const model = ctx.model;
    const prefs = ctx.prefs;
    const s = ctx.state('search', { query: '' });
    ctx.task('search-didactics', () => (model.didactics.length ? null : model.loadDidactics()));
    const q = s.query.trim();
    const field = { value: s.query, placeholder: 'Compiti, voti, comunicazioni…', input: 'search-input' };

    if (!q) {
      const suggestions = ['Verifica', 'Interrogazione', ...uniqueSorted(model.grades.map((g) => g.subjectName)).slice(0, 8)];
      return {
        title: 'Cerca', search: field,
        body: `<div class="stack gap-12">${sectionHeader('Suggerimenti')}<div class="flow-chips">${suggestions.map((t) =>
          filterChip(t, { action: 'search-suggestion', params: { value: t } })).join('')}</div></div>`,
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
      return { title: 'Cerca', search: field, body: emptyState(`Nessun risultato per "${q}"`, 'search', 'Controlla l\'ortografia o prova con un\'altra ricerca.') };
    }

    const group = (title, count, content) => card(`<div class="row-between">${eyebrow(title, 'var(--accent)')}<span class="caption secondary numeral-mono">${count}</span></div>${content}`, { cls: 'stack gap-12' });
    const expanded = ctx.app.viewState.get('expanded');
    const results = [];
    if (agenda.length) {
      results.push(group('Agenda', agenda.length, `<div class="rows">${joinRows(agenda.slice(0, 15), (e) =>
        agendaEventRow(e, { done: prefs.isCompleted(e), showsDate: true, scope: 'se', expanded: expanded?.has(`se${e.id}`) }))}</div>`));
    }
    if (grades.length) {
      results.push(group('Voti', grades.length, grades.slice(0, 15).map((g) => `<div class="search-grade">${gradeBadge(g, 40)}
        <div class="grow">${subjectTag(g.subjectName, g.subjectId)}<p class="row-caption">${esc(`${g.kind} · ${fmt.shortDay(g.date)}${g.notes ? ` · ${g.notes}` : ''}`)}</p></div></div>`).join('')));
    }
    if (notices.length) {
      results.push(group('Bacheca', notices.length, notices.slice(0, 10).map((n) =>
        `<button class="link-row" data-action="navigate" data-to="noticeboard/${n.id}"><span class="grow">${esc(n.title)}</span>${icon('chevronRight', { cls: 'chev-right' })}</button>`).join('')));
    }
    if (files.length) {
      results.push(group('Materiale didattico', files.length, files.slice(0, 10).map(({ teacher, content }) =>
        `<button class="link-row" data-action="navigate" data-to="didactics"><span class="file-icon" style="color:var(--accent)">${icon(content.icon)}</span>
          <span class="grow"><span>${esc(content.name)}</span><small>${esc(teacher.name)}</small></span></button>`).join('')));
    }
    if (notes.length) {
      results.push(group('Note', notes.length, notes.slice(0, 10).map((n) =>
        `<div class="search-note"><p>${esc(n.text)}</p><p class="row-caption">${esc(NoteCategory[n.category].singular)} · ${esc(fmt.shortDay(n.date))}</p></div>`).join('')));
    }
    return { title: 'Cerca', search: field, body: cardGrid(results.join(''), 400, 'search-results') };
  },

  actions: {
    'search-input': (ctx, el) => { ctx.state('search', { query: '' }).query = el.dataset.clear ? '' : el.value; },
    'search-suggestion': (ctx, el) => {
      ctx.state('search', { query: '' }).query = el.dataset.value;
      requestAnimationFrame(() => document.querySelector('.search-field input')?.focus());
    },
  },
};
