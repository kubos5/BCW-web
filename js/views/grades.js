// Voti: media generale e medie dei periodi, andamento, ultimi voti (espandibili e
// filtrabili per materia e periodo), elenco delle materie e dettaglio di ogni materia.

import {
  card, cardGrid, chipRow, chipDivider, filterChip, averageRing, eyebrow, gradeBadge, subjectTag, detailRow,
  collapsible, chevron, statusBanner, emptyState, segmented, sectionHeader, gradeColor, gradeColorValue,
  subjectColor, stepper,
} from '../components.js';
import { chartPlaceholder } from '../charts.js';
import { icon } from '../icons.js';
import { GradeBook } from '../gradebook.js';
import { esc, fmt, GradeFormat, byName } from '../util.js';

function bookState(ctx, key) {
  return ctx.state(key, () => ({ section: 'recent', period: null, subject: null, expanded: new Set() }));
}

function allSubjects(book) {
  const map = new Map();
  for (const g of book.grades) if (!map.has(g.subjectId)) map.set(g.subjectId, g.subjectName);
  return [...map.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => byName(a.name, b.name));
}

const numberOrNull = (v) => (v === '' || v == null ? null : Number(v));

// MARK: - Pagina Voti

export const grades = {
  title: 'Voti',

  render(ctx) {
    if (ctx.route.param) return subjectDetail(ctx, Number(ctx.route.param));
    const model = ctx.model;
    const book = model.gradeBook;
    const s = bookState(ctx, 'grades');
    const filtered = s.period != null || s.subject != null;
    const banner = model.lastError ? statusBanner(model.lastError, model.isOffline ? 'wifiOff' : 'alertTriangle') : '';
    const actions = [{ icon: filtered ? 'filterFill' : 'filter', label: 'Filtri', action: 'grades-filter-menu' }];
    const refresh = () => model.loadGrades();

    if (!book.grades.length) {
      return {
        title: 'Voti', actions, refresh,
        body: banner + emptyState('Nessun voto', 'graduationCap', 'I voti appariranno qui non appena verranno registrati.'),
      };
    }

    const picker = segmented([['recent', 'Ultimi voti'], ['subjects', 'Materie']], s.section, 'grades-section', { compact: ctx.wide });
    const list = s.section === 'recent' ? recentList(ctx, book, s, 'grades') : subjectList(ctx, book, s);
    const hero = averageHero(book, s.period);
    const trend = trendCard(book, s.period, s.subject);
    if (ctx.wide) {
      return {
        title: 'Voti', actions, refresh,
        split: { sideWidth: 350, side: hero + trend, main: banner + picker + filters(book, s) + list },
      };
    }
    return {
      title: 'Voti', actions, refresh,
      body: `<div class="stack gap-20">${banner}${hero}${trend}${picker}${filters(book, s)}${list}</div>`,
    };
  },

  actions: {
    'grades-section': (ctx, el) => { bookState(ctx, 'grades').section = el.dataset.value; },
    'grades-period': (ctx, el) => {
      const s = bookState(ctx, el.dataset.scope ?? 'grades');
      const value = numberOrNull(el.dataset.value);
      s.period = el.dataset.toggle && s.period === value ? null : value;
    },
    'grades-subject-menu': (ctx, el) => {
      const s = bookState(ctx, 'grades');
      const items = [{ label: 'Tutte le materie', checked: s.subject == null, run: () => { s.subject = null; } }];
      for (const subject of allSubjects(ctx.model.gradeBook)) {
        items.push({ label: subject.name, checked: s.subject === subject.id, run: () => { s.subject = subject.id; } });
      }
      ctx.openMenu(el, items, { align: 'start' });
    },
    'grades-filter-menu': (ctx, el) => {
      const s = bookState(ctx, 'grades');
      const book = ctx.model.gradeBook;
      const items = [{ section: 'Periodo' }, { label: "Tutto l'anno", checked: s.period == null, run: () => { s.period = null; } }];
      for (const p of book.activePeriods) items.push({ label: p.name, checked: s.period === p.position, run: () => { s.period = p.position; } });
      items.push({ section: 'Materia' }, { label: 'Tutte le materie', checked: s.subject == null, run: () => { s.subject = null; } });
      for (const subject of allSubjects(book)) items.push({ label: subject.name, checked: s.subject === subject.id, run: () => { s.subject = subject.id; } });
      if (s.period != null || s.subject != null) {
        items.push({ divider: true }, { label: 'Rimuovi filtri', icon: 'xCircle', destructive: true, run: () => { s.period = null; s.subject = null; } });
      }
      ctx.openMenu(el, items);
    },
    'grade-expand': (ctx, el) => {
      const s = bookState(ctx, el.dataset.scope);
      const id = Number(el.dataset.id);
      if (s.expanded.has(id)) s.expanded.delete(id); else s.expanded.add(id);
    },
    'open-subject': (ctx, el) => ctx.navigate(`${ctx.route.name === 'subjects' ? 'subjects' : 'grades'}/${el.dataset.id}`),
    'goal-target': (ctx, el) => {
      const prefs = ctx.prefs;
      const value = Math.min(10, Math.max(4, prefs.targetAverage + Number(el.dataset.delta)));
      prefs.set('targetAverage', value);
    },
    'goal-count': (ctx, el) => {
      const s = ctx.state('goal', { upcoming: 1 });
      s.upcoming = Math.min(5, Math.max(1, s.upcoming + Number(el.dataset.delta)));
    },
  },
};

function filters(book, s) {
  const periods = book.activePeriods.map((p) => filterChip(p.name, {
    selected: s.period === p.position, action: 'grades-period', params: { value: p.position, toggle: 1 },
  })).join('');
  const subject = allSubjects(book).find((x) => x.id === s.subject);
  return chipRow(filterChip("Tutto l'anno", { selected: s.period == null, action: 'grades-period', params: { value: '' } }) +
    periods + chipDivider() +
    filterChip(subject?.name ?? 'Materia', { iconName: 'library', trailingIcon: 'chevronDown', selected: s.subject != null, action: 'grades-subject-menu' }));
}

function recentList(ctx, book, s, scope) {
  const list = book.gradesIn(s.period)
    .filter((g) => s.subject == null || g.subjectId === s.subject)
    .sort((a, b) => b.date - a.date);
  if (!list.length) return emptyState('Nessun voto', 'filter', 'Nessun voto corrisponde ai filtri selezionati.');
  return cardGrid(list.map((g) => gradeCard(g, book, s.expanded.has(g.id), scope)).join(''), 340);
}

function subjectList(ctx, book, s) {
  const target = ctx.prefs.targetAverage;
  const subjects = book.subjects(s.period).filter((x) => s.subject == null || x.subjectId === s.subject);
  return cardGrid(subjects.map((summary) => subjectRow(summary, target)).join(''), 300);
}

// MARK: - Media generale

function averageHero(book, period) {
  const average = book.average(period);
  const periodName = period == null ? "Tutto l'anno" : (book.activePeriods.find((p) => p.position === period)?.name ?? "Tutto l'anno");
  const count = book.gradesIn(period).filter((g) => g.countsTowardAverage).length;
  const insufficient = book.subjects(period).filter((x) => (x.average ?? 10) < 6).length;
  const status = insufficient
    ? `<span class="status-line" style="color:var(--poor)">${icon('alertTriangleFill')}${insufficient === 1 ? '1 insufficienza' : `${insufficient} insufficienze`}</span>`
    : `<span class="status-line" style="color:var(--good)">${icon('checkSealFill')}Nessuna insufficienza</span>`;
  const tiles = book.activePeriods.map((p) => {
    const avg = book.average(p.position);
    const selected = period === p.position;
    return `<button class="period-tile ${selected ? 'selected' : ''}" data-action="grades-period" data-value="${p.position}" data-toggle="1" aria-pressed="${selected}">
      ${averageRing(avg, { size: 30, lineWidth: 4, showsLabel: false })}
      <span><small>${esc(p.name)}</small><strong class="numeral">${GradeFormat.average(avg)}</strong></span></button>`;
  }).join('');
  return card(`<div class="hero">${averageRing(average, { size: 118, lineWidth: 11 })}
      <div class="hero-text">${eyebrow(period == null ? 'Media generale' : 'Media del periodo')}
        <h2>${esc(periodName)}</h2><p>${count} voti che fanno media</p>${status}</div></div>
    ${tiles ? `<div class="period-tiles">${tiles}</div>` : ''}`, { padding: 18 });
}

// MARK: - Andamento

function trendCard(book, period, subjectId) {
  const points = book.runningAverage(subjectId, period);
  if (points.length < 2) return '';
  const delta = points[points.length - 1].value - points[0].value;
  const chart = chartPlaceholder('trend', {
    id: 'trend',
    height: 150,
    domain: [3, 10],
    ticks: [4, 6, 8, 10],
    line: points,
    area: true,
    monthAxis: true,
    label: 'Andamento della media',
    signature: `${period}|${subjectId}|${points.length}|${points[points.length - 1].value}|${book.weighted}|${book.mode}`,
  });
  return card(`<div class="row-between">${eyebrow('Andamento della media')}
    <span class="delta" style="color:${delta >= 0 ? 'var(--good)' : 'var(--poor)'}">${icon(delta >= 0 ? 'arrowUpRight' : 'arrowDownRight')}${GradeFormat.average(Math.abs(delta))}</span></div>${chart}`);
}

// MARK: - Righe

/** Di quanto questo voto ha spostato la media della materia. */
function impact(grade, book) {
  const same = book.grades.filter((g) => g.subjectId === grade.subjectId && g.periodPosition === grade.periodPosition);
  const before = same.filter((g) => g.date < grade.date || (g.date.getTime() === grade.date.getTime() && g.id < grade.id));
  const avgBefore = GradeBook.average(before, book.weighted);
  const avgAfter = GradeBook.average([...before, grade], book.weighted);
  if (avgBefore == null || avgAfter == null) return null;
  return avgAfter - avgBefore;
}

export function gradeCard(grade, book, expanded, scope) {
  let details = '';
  if (grade.notes) details += `<div class="note-box">${esc(grade.notes)}</div>`;
  details += detailRow('Data', fmt.longDay(grade.date));
  details += detailRow('Tipo', grade.kind);
  if (grade.periodName) details += detailRow('Periodo', grade.periodName);
  if (grade.teacherName) details += detailRow('Docente', grade.teacherName);
  if (grade.weight != null && grade.weight !== 1 && grade.weight > 0) details += detailRow('Peso', `${GradeFormat.short(grade.weight * 100)}%`);
  if (grade.value != null) details += detailRow('Valore', GradeFormat.average(grade.value));
  if (!grade.countsTowardAverage) {
    details += `<div class="status-line" style="color:var(--neutral)">${icon('info')}${grade.canceled ? 'Voto annullato' : 'Non fa media'}</div>`;
  } else {
    const delta = expanded ? impact(grade, book) : null;
    if (delta != null) {
      details += `<div class="detail-row"><span>Effetto sulla media di materia</span>
        <strong style="color:${delta >= 0 ? 'var(--good)' : 'var(--poor)'}" class="delta">${icon(delta >= 0 ? 'arrowUp' : 'arrowDown')}${GradeFormat.average(Math.abs(delta))}</strong></div>`;
    }
  }
  return card(`<button class="grade-head" data-action="grade-expand" data-id="${grade.id}" data-scope="${scope}" aria-expanded="${expanded}">
      ${gradeBadge(grade, 50)}
      <span class="grow">${subjectTag(grade.subjectName, grade.subjectId)}
        <span class="row-sub">${esc(grade.kind)} · ${esc(fmt.shortDay(grade.date))}</span>
        ${grade.notes && !expanded ? `<span class="row-note">${esc(grade.notes)}</span>` : ''}</span>
      ${chevron(!expanded, { rotateUp: true })}</button>
    ${collapsible(expanded, `<div class="stack gap-10">${details}</div>`, { spacing: 14 })}`,
  { padding: 14, cls: 'grade-card', attrs: ` data-key="g-${grade.id}"` });
}

function subjectRow(summary, target) {
  const chips = summary.grades.slice(0, 6).map((g) =>
    `<span class="mini-grade" style="--tint:${gradeColor(g)}">${esc(g.displayValue)}</span>`).join('');
  return `<button class="card subject-row" style="--pad:14px" data-action="open-subject" data-id="${summary.subjectId}" data-key="s-${summary.subjectId}">
    ${averageRing(summary.average, { size: 52, lineWidth: 5 })}
    <span class="grow"><strong>${esc(summary.name)}</strong><span class="mini-grades">${chips}</span></span>
    ${icon('chevronRight', { cls: 'chev-right' })}</button>`;
}

// MARK: - Dettaglio materia

export function subjectDetail(ctx, subjectId) {
  const model = ctx.model;
  const book = model.gradeBook;
  const s = bookState(ctx, `subject-${subjectId}`);
  const list = book.gradesIn(s.period).filter((g) => g.subjectId === subjectId).sort((a, b) => b.date - a.date);
  const name = book.grades.find((g) => g.subjectId === subjectId)?.subjectName
    ?? model.subjects.find((x) => x.id === subjectId)?.name ?? 'Materia';
  let teachers = model.subjects.find((x) => x.id === subjectId)?.teachers ?? [];
  if (!teachers.length) teachers = [...new Set(list.map((g) => g.teacherName).filter(Boolean))].sort(byName);

  const values = list.filter((g) => g.countsTowardAverage).map((g) => g.value);
  const header = card(`<div class="hero">${averageRing(GradeBook.average(list, book.weighted), { size: 96, lineWidth: 9 })}
    <div class="hero-text">${eyebrow('Media di materia', subjectColor(subjectId))}<h2>${esc(name)}</h2>
      ${teachers.length ? `<p>${esc(teachers.join(', '))}</p>` : ''}
      ${values.length ? `<span class="best-worst"><span style="color:var(--good)">${icon('arrowUp')}${GradeFormat.short(Math.max(...values))}</span>
        <span style="color:var(--poor)">${icon('arrowDown')}${GradeFormat.short(Math.min(...values))}</span></span>` : ''}</div></div>`, { padding: 18 });

  const periodPicker = book.activePeriods.length > 1
    ? segmentedPeriods(book, s.period, `subject-${subjectId}`) : '';

  const sorted = list.filter((g) => g.countsTowardAverage).sort((a, b) => a.date - b.date);
  const running = book.runningAverage(subjectId, s.period);
  const chart = sorted.length >= 2 ? card(eyebrow('Voti e media') + chartPlaceholder(`subject-${subjectId}`, {
    id: `subject-${subjectId}`,
    height: 170,
    domain: [2, 10],
    ticks: [2, 4, 6, 8, 10],
    line: running,
    lineWidth: 2,
    color: subjectColor(subjectId),
    dots: sorted.map((g) => ({ date: g.date, value: g.value, color: gradeColor(g), title: `${g.displayValue} · ${fmt.shortDay(g.date)}` })),
    label: `Voti di ${name}`,
    signature: `${s.period}|${sorted.length}|${running.at(-1)?.value}|${book.weighted}`,
  }), { cls: 'stack gap-12' }) : '';

  const goal = goalCalculator(ctx, list, book.weighted);
  const gradesHeader = sectionHeader('Voti', { subtitle: `${list.length} valutazioni` });
  const gradeList = cardGrid(list.map((g) => gradeCard(g, book, s.expanded.has(g.id), `subject-${subjectId}`)).join(''), 340);

  if (ctx.wide) {
    return { title: name, inline: true, split: { sideWidth: 350, side: header + periodPicker + chart + goal, main: gradesHeader + gradeList } };
  }
  return { title: name, inline: true, body: `<div class="stack gap-20">${header}${periodPicker}${chart}${goal}${gradesHeader}${gradeList}</div>` };
}

function segmentedPeriods(book, selected, scope) {
  const options = [['', 'Anno'], ...book.activePeriods.map((p) => [p.position, p.name])];
  return `<div class="segmented" role="tablist">${options.map(([value, label]) => {
    const isSelected = String(selected ?? '') === String(value);
    return `<button role="tab" class="${isSelected ? 'selected' : ''}" aria-selected="${isSelected}" data-action="grades-period" data-scope="${scope}" data-value="${value}">${esc(label)}</button>`;
  }).join('')}</div>`;
}

/** "Quanto devo prendere?": voto necessario per raggiungere una media obiettivo. */
function goalCalculator(ctx, list, weighted) {
  const target = ctx.prefs.targetAverage;
  const s = ctx.state('goal', { upcoming: 1 });
  const needed = GradeBook.neededGrade(target, list, s.upcoming, weighted);
  let result;
  if (needed <= 1) {
    result = `<div class="status-line" style="color:var(--good)">${icon('checkSealFill')}Hai già raggiunto l'obiettivo, qualunque voto prenderai.</div>`;
  } else if (needed > 10) {
    result = `<div class="status-line" style="color:var(--poor)">${icon('octagonX')}Obiettivo non raggiungibile con ${s.upcoming === 1 ? 'una prova' : `${s.upcoming} prove`}.</div>`;
  } else {
    result = `<div class="row-between baseline"><span class="secondary">${s.upcoming === 1 ? 'Ti serve almeno' : 'Ti serve in media almeno'}</span>
      <span class="numeral big" style="color:${gradeColorValue(needed)}">${GradeFormat.average(needed)}</span></div>`;
  }
  return card(`<div class="row-between">${eyebrow('Obiettivo')}<span style="color:var(--accent)">${icon('target')}</span></div>
    <div class="row-between"><span>Media desiderata</span>${stepper(target, { action: 'goal-target', min: 4, max: 10, step: 0.25, format: GradeFormat.short })}</div>
    <div class="row-between"><span>Prossime prove</span>${stepper(s.upcoming, { action: 'goal-count', min: 1, max: 5, step: 1 })}</div>
    <hr class="divider">${result}`, { cls: 'goal stack gap-14' });
}
