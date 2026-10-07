// Le sezioni di "Tu": note, assenze, agenda, lezioni, materiale didattico, scrutini,
// anni precedenti, materie, libri di testo e calendario scolastico.

import {
  localSearchField, card, cardGrid, chipRow, filterChip, pill, eyebrow, iconBadge, loadingCard, statusBanner, emptyState, spinner,
  statTile, absenceRow, agendaEventRow, lessonRow, subjectTag, segmented, sectionHeader, collapsible, chevron,
  joinRows, button, gradeColorValue, subjectColor, circleButton,
} from '../components.js';
import { icon } from '../icons.js';
import { data } from '../dom.js';
import { monthCalendar } from './dashboard.js';
import { subjectDetail } from './grades.js';
import { NoteCategory, AgendaKind, AbsenceKind } from '../models.js';
import { ArchiveModel } from '../store.js';
import {
  addDays, addMonths, byName, contains, daysBetween, esc, fmt, groupBy, GradeFormat, isToday, isWeekend, schoolYear,
  startOfDay, startOfMonth, startOfWeek, dayKey, StableID,
} from '../util.js';

const noteTint = { NTTE: 'var(--neutral)', NTCL: 'var(--poor)', NTST: 'var(--poor)', NTWN: 'var(--fair)' };

// MARK: - Note

export const notes = {
  title: 'Note',

  render(ctx) {
    const model = ctx.model;
    const s = ctx.state('notes', { category: null });
    const list = model.notes.filter((n) => s.category == null || n.category === s.category);
    const summary = `<div class="stat-grid two">${['NTTE', 'NTCL'].map((c) => statTile(NoteCategory[c].title,
      String(model.notes.filter((n) => n.category === c).length), NoteCategory[c].icon, c === 'NTTE' ? 'var(--neutral)' : 'var(--poor)')).join('')}</div>`;
    const chips = chipRow(filterChip('Tutte', { selected: s.category == null, action: 'notes-category', params: { value: '' } }) +
      Object.values(NoteCategory).map((c) => filterChip(c.title, { iconName: c.icon, selected: s.category === c.id, action: 'notes-category', params: { value: c.id } })).join(''));
    // Le note si segnano come lette quando compaiono, come in Classeviva.
    for (const note of list) if (!note.isRead) ctx.task(`note-${note.category}-${note.id}`, () => model.readNote(note));
    const content = list.length
      ? cardGrid(list.map((note) => card(`<div class="row-between"><span class="label-line" style="color:${noteTint[note.category]}">${icon(NoteCategory[note.category].icon)}${esc(NoteCategory[note.category].singular)}</span>
          ${note.isRead ? '' : pill('Nuova', { filled: true, cls: 'small' })}</div>
          <p class="note-text">${esc(note.text || 'Tocca per leggere il contenuto.')}</p>
          <p class="row-caption">${esc(note.authorName)} · ${esc(fmt.longDay(note.date))}</p>`, { padding: 14, cls: 'stack gap-10', attrs: ` data-key="note-${note.category}-${note.id}"` })).join(''), 360)
      : emptyState('Nessuna nota', 'thumbsUp', 'Continua così!');
    return { title: 'Note', body: `<div class="stack gap-16">${summary}${chips}${content}</div>`, refresh: () => model.loadNotes() };
  },

  actions: {
    'notes-category': (ctx, el) => {
      const s = ctx.state('notes', { category: null });
      const value = el.dataset.value || null;
      s.category = value && s.category === value ? null : value;
    },
  },
};

// MARK: - Assenze e ritardi

export const absences = {
  title: 'Assenze e ritardi',

  render(ctx) {
    const model = ctx.model;
    const s = ctx.state('absences', { kind: null, onlyPending: false });
    const list = model.absences.filter((a) => (s.kind == null || a.kind === s.kind || (s.kind === 'late' && a.kind === 'shortLate')) &&
      (!s.onlyPending || !a.isJustified));
    const count = (kind) => model.absences.filter((a) => a.kind === kind).length;
    const counters = `<div class="stat-grid three">
      ${statTile('Assenze', String(count('absence')), AbsenceKind.absence.icon, 'var(--poor)')}
      ${statTile('Ritardi', String(count('late') + count('shortLate')), AbsenceKind.late.icon, 'var(--fair)')}
      ${statTile('Uscite', String(count('earlyExit')), AbsenceKind.earlyExit.icon, 'var(--neutral)')}</div>`;
    const pending = model.unjustifiedAbsences.length;
    const warning = pending ? `<div class="warning-box">${icon('alertCircleFill')}${pending === 1 ? 'Hai un evento da giustificare' : `Hai ${pending} eventi da giustificare`}</div>` : '';
    const chips = chipRow(filterChip('Da giustificare', { iconName: 'alertCircle', selected: s.onlyPending, action: 'absences-pending' }) +
      filterChip('Tutti', { selected: s.kind == null, action: 'absences-kind', params: { value: '' } }) +
      ['absence', 'late', 'earlyExit'].map((k) => filterChip(AbsenceKind[k].plural, { iconName: AbsenceKind[k].icon, selected: s.kind === k, action: 'absences-kind', params: { value: k } })).join(''));
    let content;
    if (!list.length) {
      content = emptyState('Nessun evento', 'checkCircle', 'Nessuna assenza, ritardo o uscita registrati.');
    } else {
      const months = [...groupBy(list, (a) => startOfMonth(a.date).getTime()).entries()].sort(([a], [b]) => b - a);
      content = cardGrid(months.map(([time, events]) => `<div class="stack gap-10" data-key="am-${time}">${eyebrow(fmt.monthYear(new Date(time)))}
        ${card(joinRows([...events].sort((a, b) => b.date - a.date), (e) => `<div class="absence-day"><div class="date-box"><span class="numeral">${e.date.getDate()}</span><small>${esc(fmt.weekdayShort(e.date))}</small></div>${absenceRow(e, { showsReason: true })}</div>`), { padding: 14, cls: 'rows' })}</div>`).join(''), 440);
    }
    return { title: 'Assenze e ritardi', body: `<div class="stack gap-18">${counters}${warning}${chips}${content}</div>`, refresh: () => model.loadAbsences() };
  },

  actions: {
    'absences-pending': (ctx) => { const s = ctx.state('absences', {}); s.onlyPending = !s.onlyPending; },
    'absences-kind': (ctx, el) => {
      const s = ctx.state('absences', {});
      const value = el.dataset.value || null;
      s.kind = value && s.kind === value ? null : value;
    },
  },
};

// MARK: - Agenda completa

export const agenda = {
  title: 'Agenda',

  render(ctx) {
    const model = ctx.model;
    const prefs = ctx.prefs;
    const s = ctx.state('agenda', { kind: null, showPast: false, onlyPending: false, search: '' });
    const today = startOfDay(new Date());
    const items = model.agenda.filter((e) => (s.showPast ? e.begin < today : e.begin >= today) &&
      (s.kind == null || e.kind === s.kind) && (!s.onlyPending || !prefs.isCompleted(e)) &&
      (contains(e.notes, s.search) || contains(e.subjectName, s.search)));
    const days = [...groupBy(items, (e) => e.day.getTime()).entries()].sort(([a], [b]) => (s.showPast ? b - a : a - b));
    const segments = segmented([['false', 'In arrivo'], ['true', 'Passati']], String(s.showPast), 'agenda-past', { compact: ctx.wide });
    // Su schermi larghi la ricerca della pagina sta sulla stessa riga del periodo.
    const picker = ctx.wide
      ? `<div class="row gap-12 wrap">${segments}<span class="flex"></span>${localSearchField(s.search, 'Cerca compiti ed eventi', 'agenda-search')}</div>`
      : segments;
    const chips = chipRow(filterChip('Da fare', { iconName: 'circle', selected: s.onlyPending, action: 'agenda-pending' }) +
      filterChip('Tutto', { selected: s.kind == null, action: 'agenda-kind', params: { value: '' } }) +
      Object.values(AgendaKind).map((k) => filterChip(k.title, { iconName: k.icon, selected: s.kind === k.id, action: 'agenda-kind', params: { value: k.id } })).join(''));
    const expanded = ctx.app.viewState.get('expanded');
    const content = days.length
      ? cardGrid(days.slice(0, 120).map(([time, events]) => card(`${eyebrow(fmt.relativeDayName(new Date(time)), 'var(--accent)')}
        <div class="rows">${joinRows(events, (e) => agendaEventRow(e, { done: prefs.isCompleted(e), scope: 'ag', expanded: expanded?.has(`ag${e.id}`) }))}</div>`,
      { cls: 'stack gap-12', attrs: ` data-key="ad-${time}"` })).join(''), 380)
      : emptyState('Niente da mostrare', 'checklist', 'Nessun elemento corrisponde ai filtri.');
    return {
      title: 'Agenda',
      search: ctx.wide ? null : { value: s.search, placeholder: 'Cerca compiti ed eventi', input: 'agenda-search' },
      actions: [{ icon: 'calendarPlus', label: 'Esporta nel calendario', action: 'export-agenda' }],
      body: `<div class="stack gap-16">${picker}${chips}${content}</div>`,
      refresh: () => model.loadAgenda(),
    };
  },

  actions: {
    'agenda-past': (ctx, el) => { ctx.state('agenda', {}).showPast = el.dataset.value === 'true'; },
    'agenda-pending': (ctx) => { const s = ctx.state('agenda', {}); s.onlyPending = !s.onlyPending; },
    'agenda-kind': (ctx, el) => {
      const s = ctx.state('agenda', {});
      const value = el.dataset.value || null;
      s.kind = value && s.kind === value ? null : value;
    },
    'agenda-search': (ctx, el) => { ctx.state('agenda', {}).search = el.dataset.clear ? '' : el.value; },
  },
};

// MARK: - Registro delle lezioni

function previousSchoolDay(date) {
  let d = addDays(date, -1);
  while (isWeekend(d)) d = addDays(d, -1);
  return d;
}

function nextSchoolDay(date) {
  let d = addDays(date, 1);
  while (isWeekend(d)) d = addDays(d, 1);
  return d;
}

function lessonsState(ctx) {
  return ctx.state('lessons', () => {
    const today = startOfDay(new Date());
    return { mode: 'day', day: today, month: startOfMonth(today), all: null, loadingAll: false, subject: null };
  });
}

export const lessons = {
  title: 'Lezioni',

  render(ctx) {
    const model = ctx.model;
    const s = lessonsState(ctx);
    const week = startOfWeek(s.day);
    ctx.task(`lessons-week-${dayKey(week)}-${model.lastUpdated?.getTime() ?? 0}`, () => model.ensureLessons(week, addDays(week, 6)));
    if (s.mode === 'subject') {
      ctx.task('lessons-all', async () => {
        s.loadingAll = true;
        ctx.update();
        try { s.all = await model.fetchLessons(schoolYear().start, new Date()); } catch { s.all = []; }
        s.loadingAll = false;
      });
    }
    const picker = segmented([['day', 'Per giorno'], ['subject', 'Per materia']], s.mode, 'lessons-mode');

    if (ctx.wide) {
      const side = s.mode === 'day'
        ? monthCalendar(ctx, { selected: s.day, month: s.month, monthDir: s.monthDir }, { action: 'lessons-day', shiftAction: 'lessons-month' })
        : (s.loadingAll ? '' : subjectChips(s));
      return {
        title: 'Lezioni',
        split: { sideWidth: 320, side: picker + side, main: s.mode === 'day' ? dayLessons(ctx, s) : subjectCards(s) },
      };
    }
    const body = s.mode === 'day'
      ? dayNavigator(s) + dayLessons(ctx, s)
      : (s.loadingAll ? '' : subjectChips(s)) + subjectCards(s);
    return { title: 'Lezioni', body: `<div class="stack gap-16">${picker}${body}</div>` };
  },

  actions: {
    'lessons-mode': (ctx, el) => { lessonsState(ctx).mode = el.dataset.value; },
    'lessons-day': (ctx, el) => {
      const s = lessonsState(ctx);
      const day = startOfDay(new Date(Number(el.dataset.time)));
      if (startOfMonth(day).getTime() !== s.month.getTime()) s.monthDir = Math.sign(day - s.month);
      s.day = day;
      s.month = startOfMonth(day);
    },
    'lessons-date': (ctx, el) => {
      const [y, m, d] = el.value.split('-').map(Number);
      if (!y) return;
      const s = lessonsState(ctx);
      s.day = new Date(y, m - 1, d);
      s.month = startOfMonth(s.day);
    },
    'lessons-month': (ctx, el) => {
      const s = lessonsState(ctx);
      s.monthDir = Number(el.dataset.delta);
      s.month = addMonths(s.month, Number(el.dataset.delta));
    },
    'lessons-prev': (ctx) => { const s = lessonsState(ctx); s.day = previousSchoolDay(s.day); },
    'lessons-next': (ctx) => {
      const s = lessonsState(ctx);
      const next = nextSchoolDay(s.day);
      const today = startOfDay(new Date());
      s.day = next < today ? next : today;
    },
    'lessons-subject': (ctx, el) => {
      const s = lessonsState(ctx);
      const value = el.dataset.value === '' ? null : Number(el.dataset.value);
      s.subject = value != null && s.subject === value && el.dataset.toggle ? null : value;
    },
  },
};

function dayNavigator(s) {
  const min = dayKey(schoolYear().start);
  const max = dayKey(new Date());
  return `<div class="day-navigator">
    ${circleButton('chevronLeft', { action: 'lessons-prev', label: 'Giorno precedente' })}
    <input type="date" class="date-input" value="${dayKey(s.day)}" min="${min}" max="${max}" data-change="lessons-date" aria-label="Giorno">
    ${circleButton('chevronRight', { action: 'lessons-next', label: 'Giorno successivo', disabled: isToday(s.day) })}</div>`;
}

function dayLessons(ctx, s) {
  const model = ctx.model;
  const list = model.lessons(s.day);
  let content;
  if (!list.length) {
    if (startOfDay(s.day) > startOfDay(new Date())) {
      content = emptyState('Nessuna lezione', 'bookText', 'Le lezioni compaiono nel registro dopo essere state svolte.');
    } else if (model.hasLoadedLessons(s.day)) {
      content = emptyState('Nessuna lezione', 'bookText', isWeekend(s.day) ? 'È il fine settimana.' : 'Non ci sono lezioni registrate per questo giorno.');
    } else {
      content = loadingCard();
    }
  } else {
    content = card(`<div class="rows">${joinRows(list, lessonRow)}</div>`);
  }
  return `<h2 class="day-title">${esc(fmt.longDay(s.day))}</h2>${content}`;
}

function subjectGroups(s) {
  return [...groupBy(s.all ?? [], (l) => l.subjectId ?? 0).entries()]
    .map(([id, list]) => ({ id, name: list[0]?.subjectName ?? '', lessons: [...list].sort((a, b) => b.date - a.date) }))
    .sort((a, b) => byName(a.name, b.name));
}

function subjectChips(s) {
  return chipRow(filterChip('Tutte', { selected: s.subject == null, action: 'lessons-subject', params: { value: '' } }) +
    subjectGroups(s).map((g) => filterChip(g.name, { selected: s.subject === g.id, action: 'lessons-subject', params: { value: g.id, toggle: 1 } })).join(''));
}

function subjectCards(s) {
  if (s.loadingAll || s.all == null) return loadingCard("Carico il registro dell'anno…");
  const groups = subjectGroups(s).filter((g) => s.subject == null || g.id === s.subject);
  if (!groups.length) return emptyState('Nessuna lezione', 'bookText', 'Non ci sono lezioni registrate.');
  return cardGrid(groups.map((g) => {
    const topics = g.lessons.filter((l) => l.topic);
    const hours = g.lessons.reduce((sum, l) => sum + Math.trunc(l.duration), 0);
    const shown = topics.slice(0, s.subject == null ? 4 : 200);
    return card(`<div class="row-between">${subjectTag(g.name, g.id)}<span class="row-caption">${hours} ore</span></div>
      ${shown.map((l) => `<div class="topic-row"><span class="numeral-mono">${esc(fmt.shortDay(l.date))}</span><span>${esc(l.topic)}</span></div>`).join('')}
      ${s.subject == null && topics.length > 4 ? `<button class="link-button" data-action="lessons-subject" data-value="${g.id}">Mostra tutti i ${topics.length} argomenti</button>` : ''}`,
    { cls: 'stack gap-12', attrs: ` data-key="ls-${g.id}"` });
  }).join(''), 380);
}

// MARK: - Materiale didattico

function didacticsState(ctx) {
  return ctx.state('didactics', () => ({ teacher: null, search: '', expanded: new Set(), opening: null, error: null, loading: false, text: null }));
}

export const didactics = {
  title: 'Materiale didattico',

  render(ctx) {
    const model = ctx.model;
    const s = didacticsState(ctx);
    ctx.task('didactics', async () => {
      if (model.didactics.length) return;
      s.loading = true;
      ctx.update();
      s.error = await model.loadDidactics();
      s.loading = false;
    });
    let body = s.error ? statusBanner(s.error, 'alertTriangle') : '';
    if (model.didactics.length && ctx.wide) body += localSearchField(s.search, 'Cerca file o cartelle', 'didactics-search');
    if (model.didactics.length) {
      body += chipRow(filterChip('Tutti i docenti', { selected: s.teacher == null, action: 'didactics-teacher', params: { value: '' } }) +
        model.didactics.map((t) => filterChip(t.name, { selected: s.teacher === t.id, action: 'didactics-teacher', params: { value: t.id } })).join(''));
    }
    if (s.loading && !model.didactics.length) body += loadingCard();
    else if (!model.didactics.length) body += emptyState('Nessun materiale', 'folder', 'I file condivisi dai docenti appariranno qui.');

    const teachers = model.didactics.filter((t) => s.teacher == null || t.id === s.teacher)
      .sort((a, b) => (b.lastShare ?? 0) - (a.lastShare ?? 0));
    for (const teacher of teachers) {
      const folders = teacher.folders.filter((f) => !s.search || contains(f.name, s.search) || f.contents.some((c) => contains(c.name, s.search)))
        .sort((a, b) => (b.lastShare ?? 0) - (a.lastShare ?? 0));
      if (!folders.length) continue;
      body += `<div class="stack gap-10" data-key="t-${esc(teacher.id)}"><div class="teacher-head"><span class="teacher-initial numeral" style="background:${subjectColor(StableID.make(teacher.id))}">${esc(teacher.name.charAt(0))}</span><h3>${esc(teacher.name)}</h3></div>
        ${cardGrid(folders.map((f) => folderCard(s, teacher, f)).join(''), 360)}</div>`;
    }
    return {
      title: 'Materiale didattico',
      search: ctx.wide ? null : { value: s.search, placeholder: 'Cerca file o cartelle', input: 'didactics-search' },
      body: `<div class="stack gap-18">${body}</div>`,
      refresh: async () => { s.error = await model.loadDidactics(); },
    };
  },

  actions: {
    'didactics-teacher': (ctx, el) => {
      const s = didacticsState(ctx);
      const value = el.dataset.value || null;
      s.teacher = value && s.teacher === value ? null : value;
    },
    'didactics-search': (ctx, el) => { didacticsState(ctx).search = el.dataset.clear ? '' : el.value; },
    'didactics-folder': (ctx, el) => {
      const s = didacticsState(ctx);
      const key = el.dataset.folder;
      if (s.expanded.has(key)) s.expanded.delete(key); else s.expanded.add(key);
    },
    'didactics-open': async (ctx, el) => {
      const s = didacticsState(ctx);
      const id = Number(el.dataset.id);
      const content = ctx.model.didactics.flatMap((t) => t.folders.flatMap((f) => f.contents)).find((c) => c.id === id);
      if (!content) return;
      // Il collegamento va aperto subito, finché il clic è "fresco", o il browser lo blocca.
      const popup = content.kind === 'link' ? window.open('', '_blank') : null;
      s.opening = id;
      ctx.update();
      try {
        const item = await ctx.model.openDidacticContent(content);
        s.error = null;
        if (item.kind === 'link') {
          if (popup) popup.location.href = item.url; else window.open(item.url, '_blank', 'noopener');
        } else {
          popup?.close();
          if (item.kind === 'text') {
            ctx.openSheet({ id: `text-${id}`, render: () => ({ title: content.name, size: 'medium',
              leading: '<span></span>', trailing: '<button class="btn btn-glass" data-action="sheet-close">Fine</button>',
              body: `<div class="text-sheet">${esc(item.text)}</div>` }) });
          } else {
            ctx.openFile(item.file);
          }
        }
      } catch (error) {
        popup?.close();
        s.error = error.message;
      } finally {
        s.opening = null;
        ctx.update();
      }
    },
  },
};

function folderCard(s, teacher, folder) {
  const key = `${teacher.id}-${folder.id}`;
  const expanded = s.expanded.has(key) || !!s.search;
  const contents = folder.contents.filter((c) => !s.search || contains(c.name, s.search) || contains(folder.name, s.search));
  const rows = contents.map((c) => `<hr class="divider inset">
    <button class="file-row" data-action="didactics-open" data-id="${c.id}">
      <span class="file-icon">${icon(c.icon)}</span>
      <span class="grow"><span>${esc(c.name)}</span>${c.sharedAt ? `<small>${esc(fmt.shortDayWithYear(c.sharedAt))}</small>` : ''}</span>
      ${s.opening === c.id ? spinner() : `<span style="color:var(--accent)">${icon(c.kind === 'link' ? 'externalLink' : 'download')}</span>`}</button>`).join('');
  return `<div class="card folder-card" style="--pad:0px" data-key="f-${esc(key)}">
    <button class="folder-head" data-action="didactics-folder" data-folder="${esc(key)}" aria-expanded="${expanded}">
      <span class="folder-icon">${icon(expanded ? 'folderFill' : 'folder')}</span>
      <span class="grow"><strong>${esc(folder.name)}</strong><small>${folder.contents.length} elementi${folder.lastShare ? ` · ${esc(fmt.shortDayWithYear(folder.lastShare))}` : ''}</small></span>
      ${chevron(!expanded, { rotateUp: true })}</button>
    ${collapsible(expanded, rows)}</div>`;
}

// MARK: - Scrutini e pagelle

export function documentButton(title, { action, params, iconName = 'fileText', loading = false }) {
  return `<button class="card document-button" style="--pad:14px" data-action="${action}"${data(params)}${loading ? ' disabled' : ''}>
    ${iconBadge(iconName, 'var(--neutral)')}<span class="grow">${esc(title)}</span>${loading ? spinner() : icon('chevronRight', { cls: 'chev-right' })}</button>`;
}

export const reports = {
  title: 'Scrutini',

  render(ctx) {
    const model = ctx.model;
    const s = ctx.state('reports', { loading: false, error: null, downloading: null });
    ctx.task('documents', async () => {
      s.loading = true;
      ctx.update();
      s.error = await model.loadDocuments();
      s.loading = false;
    });
    const banner = s.error ? statusBanner(s.error, 'alertTriangle') : '';
    const book = model.gradeBook;
    const periods = book.activePeriods.map((p) => {
      const below = book.subjects(p.position).filter((x) => (x.average ?? 10) < 6);
      const avg = book.average(p.position);
      return `<div class="row-between"><div><strong class="headline">${esc(p.name)}</strong>
        <p class="caption" style="color:${below.length ? 'var(--poor)' : 'var(--good)'}">${below.length ? `Insufficienze: ${esc(below.map((x) => x.name).join(', '))}` : 'Nessuna insufficienza'}</p></div>
        <span class="numeral period-average" style="color:${gradeColorValue(avg)}">${GradeFormat.average(avg)}</span></div>`;
    }).join('');
    const summary = card(`${eyebrow('Situazione per periodo')}${periods || '<p class="secondary">Nessun voto registrato.</p>'}`, { cls: 'stack gap-12' });

    let docs = '';
    const documents = model.documents;
    if (s.loading && !documents) {
      docs = loadingCard();
    } else if (documents) {
      if (!documents.documents.length && !documents.schoolReports.length) {
        docs = emptyState('Nessun documento', 'fileText', 'Pagelle e documenti di valutazione appariranno qui dopo gli scrutini.');
      }
      if (documents.documents.length) {
        docs += `<div class="stack gap-10">${sectionHeader('Documenti')}${cardGrid(documents.documents.map((d) =>
          documentButton(d.title, { action: 'report-open', params: { hash: d.documentHash }, loading: s.downloading === d.documentHash })).join(''), 320)}</div>`;
      }
      if (documents.schoolReports.length) {
        docs += `<div class="stack gap-10">${sectionHeader('Pagelle online', { subtitle: 'Si aprono sul sito di Classeviva' })}${cardGrid(documents.schoolReports.map((r) =>
          `<a class="card document-button" style="--pad:14px" href="${esc(r.viewLink ?? '#')}" target="_blank" rel="noopener">${iconBadge('compass', 'var(--neutral)')}<span class="grow">${esc(r.title)}</span>${icon('externalLink', { cls: 'chev-right' })}</a>`).join(''), 320)}</div>`;
      }
    }
    const refresh = async () => { s.error = await model.loadDocuments(); };
    if (ctx.wide) return { title: 'Scrutini', split: { sideWidth: 360, side: summary, main: banner + docs }, refresh };
    return { title: 'Scrutini', body: `<div class="stack gap-18">${banner}${summary}${docs}</div>`, refresh };
  },

  actions: {
    'report-open': async (ctx, el) => {
      const s = ctx.state('reports', {});
      const doc = ctx.model.documents?.documents.find((d) => d.documentHash === el.dataset.hash);
      if (!doc) return;
      s.downloading = doc.documentHash;
      ctx.update();
      try {
        ctx.openFile(await ctx.model.downloadDocument(doc));
        s.error = null;
      } catch (error) {
        s.error = error.message;
      } finally {
        s.downloading = null;
      }
    },
  },
};

// MARK: - Anni precedenti

export const previous = {
  title: 'Anni precedenti',

  render(ctx) {
    const model = ctx.model;
    const s = ctx.state('previous', { startYear: ArchiveModel.previousStartYear, downloading: null, error: null });
    const archive = model.archive(s.startYear);
    ctx.task(`archive-${s.startYear}-${archive.state === 'idle' ? 'load' : 'done'}`, () => archive.load(model.credentialsForArchive, model.isDemo));

    const webCard = card(`<div class="row gap-12">${iconBadge('compass', 'var(--neutral)')}<div><strong class="headline">Voti, assenze e note</strong><p class="caption secondary">Disponibili sul sito di Classeviva</p></div></div>
      <p class="body-text">Classeviva non rende disponibili all'app i dati degli anni passati. Accedi al sito, che si apre in una nuova scheda, e, dal menu principale, scegli "Vai all'a.s. ${esc(archive.title)}".</p>
      <a class="btn btn-prominent large" href="${ArchiveModel.webURL}" target="_blank" rel="noopener">${icon('externalLink')}<span>Apri l'archivio di Classeviva</span></a>`, { cls: 'stack gap-14' });

    let docs = sectionHeader('Pagelle e documenti', { subtitle: `Anno scolastico ${archive.title}` });
    if (s.error) docs += statusBanner(s.error, 'alertTriangle');
    const unavailable = (message) => card(emptyState('Nessun documento', 'fileText', message, button('Riprova', { action: 'previous-retry' })));
    switch (archive.state) {
      case 'idle': case 'loading': docs += loadingCard(`Accesso all'archivio ${archive.title}…`); break;
      case 'failed': docs += unavailable(archive.failure); break;
      default:
        docs += archive.documents.length
          ? cardGrid(archive.documents.map((d) => documentButton(d.title, { action: 'previous-open', params: { hash: d.documentHash }, loading: s.downloading === d.documentHash })).join(''), 320)
          : unavailable(archive.documentsError ? `Classeviva ha risposto: ${archive.documentsError}` : 'La scuola non ha pubblicato documenti per questo anno.');
    }
    docs = `<div class="stack gap-10">${docs}</div>`;
    const actions = [{ icon: 'calendarClock', label: "Scegli l'anno", action: 'previous-year-menu' }];
    const title = `Anno ${archive.title}`;
    if (ctx.wide) return { title, inline: true, actions, split: { sideWidth: 360, side: webCard, main: docs } };
    return { title, inline: true, actions, body: `<div class="stack gap-20">${webCard}${docs}</div>` };
  },

  actions: {
    'previous-year-menu': (ctx, el) => {
      const s = ctx.state('previous', {});
      ctx.openMenu(el, [{ section: 'Anno scolastico' }, ...ArchiveModel.availableStartYears.map((year) => ({
        label: ArchiveModel.title(year), checked: s.startYear === year, run: () => { s.startYear = year; s.error = null; },
      }))]);
    },
    'previous-retry': (ctx) => {
      const s = ctx.state('previous', {});
      const archive = ctx.model.reloadArchive(s.startYear);
      archive.load(ctx.model.credentialsForArchive, ctx.model.isDemo);
    },
    'previous-open': async (ctx, el) => {
      const s = ctx.state('previous', {});
      const archive = ctx.model.archive(s.startYear);
      const doc = archive.documents.find((d) => d.documentHash === el.dataset.hash);
      if (!doc) return;
      s.downloading = doc.documentHash;
      ctx.update();
      try {
        ctx.openFile(await archive.downloadDocument(doc));
        s.error = null;
      } catch (error) {
        s.error = error.message;
      } finally {
        s.downloading = null;
      }
    },
  },
};

// MARK: - Materie e docenti

export const subjects = {
  title: 'Materie',

  render(ctx) {
    if (ctx.route.param) return subjectDetail(ctx, Number(ctx.route.param));
    const model = ctx.model;
    const sorted = [...model.subjects].sort((a, b) => a.order - b.order);
    const summaries = model.gradeBook.subjects();
    const rows = sorted.map((subject) => {
      const average = summaries.find((x) => x.subjectId === subject.id)?.average ?? null;
      return `<button class="${ctx.wide ? 'card ' : ''}list-row" style="--pad:14px" data-action="open-subject" data-id="${subject.id}" data-key="sub-${subject.id}">
        <span class="dot big" style="background:${subjectColor(subject.id)}"></span>
        <span class="grow"><strong>${esc(subject.name)}</strong>${subject.teachers.length ? `<small>${esc(subject.teachers.join(', '))}</small>` : ''}</span>
        <span class="numeral list-average" style="color:${gradeColorValue(average)}">${GradeFormat.average(average)}</span>
        ${icon('chevronRight', { cls: 'chev-right' })}</button>`;
    });
    const body = !sorted.length
      ? emptyState('Nessuna materia', 'library')
      // Le card della stessa riga hanno l'altezza della più alta (es. una materia con molti docenti).
      : ctx.wide ? cardGrid(rows.join(''), 320, 'equal-rows') : `<div class="inset-list">${rows.join('')}</div>`;
    return { title: 'Materie', body, bottomInset: true, refresh: () => model.loadGrades() };
  },
};

// MARK: - Libri di testo

export const schoolbooks = {
  title: 'Libri di testo',

  render(ctx) {
    const model = ctx.model;
    const s = ctx.state('schoolbooks', { loading: false });
    ctx.task('schoolbooks', async () => {
      s.loading = true;
      ctx.update();
      await model.loadSchoolbooks();
      s.loading = false;
    });
    let body;
    if (!model.schoolbooks.length) {
      body = s.loading ? loadingCard() : emptyState('Nessun libro', 'library', 'La scuola non ha pubblicato le adozioni.');
    } else {
      body = model.schoolbooks.map((course) => `<div class="stack gap-10">${sectionHeader(course.name)}
        ${ctx.wide ? cardGrid(course.books.map((b) => card(bookRow(b), { padding: 14 })).join(''), 380, 'equal-rows')
    : `<div class="inset-list">${course.books.map((b) => `<div class="list-row">${bookRow(b)}</div>`).join('')}</div>`}</div>`).join('');
    }
    return { title: 'Libri di testo', body: `<div class="stack gap-22">${body}</div>`, bottomInset: true };
  },
};

function bookRow(book) {
  const tags = [
    book.toBuy ? pill('Da acquistare', { color: 'var(--fair)', cls: 'small' }) : '',
    book.inUse ? pill('Già in uso', { color: 'var(--good)', cls: 'small' }) : '',
    book.recommended ? pill('Consigliato', { color: 'var(--neutral)', cls: 'small' }) : '',
  ].join('');
  return `<div class="book stack gap-5">
    <div class="row-between baseline"><strong>${esc(book.title)}</strong>${book.price > 0 ? `<span class="secondary numeral-mono">${GradeFormat.euro(book.price)}</span>` : ''}</div>
    <span class="caption" style="color:var(--accent)">${esc([book.subject, book.volume].filter(Boolean).join(' · '))}</span>
    <span class="caption secondary">${esc([book.author, book.publisher].filter(Boolean).join(' · '))}</span>
    <div class="row gap-6">${tags}<span class="flex"></span>${book.isbn ? `<span class="isbn">ISBN ${esc(book.isbn)}</span>` : ''}</div></div>`;
}

// MARK: - Calendario scolastico

export const calendar = {
  title: 'Calendario',

  render(ctx) {
    const model = ctx.model;
    ctx.task('calendar', () => (model.calendarDays.length ? null : model.loadCalendar()));
    const today = startOfDay(new Date());
    const days = [...model.calendarDays].sort((a, b) => a.date - b.date);
    // Periodi consecutivi di vacanza nei giorni feriali.
    const holidays = [];
    let current = null;
    for (const day of days) {
      if (!day.isHoliday || isWeekend(day.date)) continue;
      if (current && daysBetween(current.end, day.date) <= 3) current.end = day.date;
      else {
        if (current) holidays.push(current);
        current = { start: day.date, end: day.date };
      }
    }
    if (current) holidays.push(current);
    const school = days.filter((d) => d.isSchoolDay);
    const done = school.filter((d) => d.date < today).length;
    const total = school.length;
    const range = (h) => (h.start.getTime() === h.end.getTime() ? fmt.longDay(h.start) : `${fmt.shortDay(h.start)} – ${fmt.shortDay(h.end)}`);

    const progress = total ? card(`${eyebrow('Anno scolastico')}<div class="row baseline gap-8"><span class="numeral huge">${done}</span><span class="secondary">di ${total} giorni di lezione</span></div>
      <progress value="${done}" max="${Math.max(total, 1)}"></progress><p class="caption secondary">Mancano ${total - done} giorni di scuola</p>`, { cls: 'stack gap-12' }) : '';
    const next = holidays.find((h) => h.end >= today);
    const nextCard = next ? card(`${eyebrow('Prossima vacanza', 'var(--accent)')}<div class="next-holiday stack gap-8"><h3 class="title3">${esc(range(next))}</h3>
      <p class="secondary">${daysBetween(today, next.start) <= 0 ? 'Sei in vacanza!' : `Tra ${daysBetween(today, next.start)} giorni`}</p></div>`, { cls: 'stack gap-8' }) : '';
    const list = holidays.map((h) => {
      const past = h.end < today;
      const count = daysBetween(h.start, h.end) + 1;
      return `<div class="holiday-row ${past ? 'past' : ''}"><span style="color:${past ? 'var(--ink2)' : 'var(--fair)'}">${icon(past ? 'checkCircle' : 'sun')}</span>
        <span class="grow">${esc(range(h))}</span><span class="caption secondary">${count === 1 ? '1 giorno' : `${count} giorni`}</span></div>`;
    });
    const listCard = card(list.length ? `<div class="rows">${list.join('<hr class="divider">')}</div>` : '<p class="secondary">Il calendario non è ancora disponibile.</p>');
    // Su schermi larghi i due riepiloghi stanno affiancati; la prossima vacanza ha meno
    // contenuto, quindi la sua card è più stretta, con data e giorni al centro.
    const top = ctx.wide && progress && nextCard ? `<div class="year-summary">${progress}${nextCard}</div>` : progress + nextCard;
    return { title: 'Calendario', body: `<div class="stack gap-18">${top}${sectionHeader('Vacanze e chiusure')}${listCard}</div>` };
  },
};

