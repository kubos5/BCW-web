// Voti: media generale e medie dei periodi, andamento, ultimi voti (espandibili e
// filtrabili per materia e periodo), elenco delle materie e dettaglio di ogni materia.

import {
  chipRow, filterChip, averageRing, gradeBadge, subjectTag, detailRow, collapsible, chevron, statusBanner, emptyState,
  sectionHeader, gradeColor, gradeColorValue, gradeTone, subjectColor, stepper, listGroup, statusChip, connectedGroup, primaryTabs, axisPage,
  select, button,
} from '../components.js';
import { chartPlaceholder } from '../charts.js';
import { icon } from '../icons.js';
import { shape } from '../shapes.js';
import { GradeBook, newHypothetical } from '../gradebook.js';
import { esc, fmt, GradeFormat, byName, groupBy, startOfMonth } from '../util.js';

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

    const tabs = primaryTabs([['recent', 'Ultimi voti'], ['subjects', 'Materie']], s.section, 'grades-section');
    // Asse condiviso orizzontale tra le schede: gli ultimi voti a sinistra, le materie a destra.
    const list = axisPage('grades-tab', s.tabDir ?? 0, `tab-${s.section}`,
      s.section === 'recent' ? recentList(ctx, book, s, 'grades') : subjectList(ctx, book, s));
    const hero = averageHero(book, s.period, { size: ctx.wide ? 168 : 188 });
    const trend = trendCard(book, s.period, s.subject);
    // "E se prendessi…" (3.3), comprimibile: nei Voti starebbe sopra l'elenco.
    const simulator = gradeSimulator(ctx, book, { period: s.period, suggestedSubject: s.subject, collapsible: true });
    const lists = `<div class="stack gap-16">${tabs}${filters(book, s)}${list}</div>`;
    if (ctx.wide) {
      return { title: 'Voti', actions, refresh, split: { sideWidth: 380, side: hero + trend + simulator, main: banner + lists } };
    }
    return { title: 'Voti', actions, refresh, body: `<div class="stack gap-24">${banner}${hero}${trend}${simulator}${lists}</div>` };
  },

  /**
   * Nuovo tocco sulla scheda Voti, già in cima: la media dell'anno se era scelto un periodo. Sugli
   * schermi larghi (voti accanto alla media, come sull'iPad) il periodo torna subito all'anno e la
   * colonna dei voti torna in cima.
   */
  reselect(ctx) {
    const s = bookState(ctx, 'grades');
    if (s.period != null) {
      navigator.vibrate?.(4);
      s.period = null;
    }
    if (ctx.wide) ctx.scrollToTop();
  },
  reselectSkipsTop: (ctx) => ctx.wide && !ctx.route.param,

  actions: {
    'grades-section': (ctx, el) => {
      const s = bookState(ctx, 'grades');
      if (s.section === el.dataset.value) return;
      s.tabDir = el.dataset.value === 'subjects' ? 1 : -1;
      s.section = el.dataset.value;
    },
    'grades-period': (ctx, el) => {
      const s = bookState(ctx, el.dataset.scope ?? 'grades');
      s.period = numberOrNull(el.dataset.value);
    },
    'grades-subject-menu': (ctx, el) => {
      const s = bookState(ctx, 'grades');
      const items = [{ label: 'Tutte le materie', checked: s.subject == null, run: () => { s.subject = null; } }];
      for (const subject of allSubjects(ctx.model.gradeBook)) {
        items.push({ label: subject.name, checked: s.subject === subject.id, run: () => { s.subject = subject.id; } });
      }
      ctx.openMenu(el, items, { align: 'start' });
    },
    'grades-subject-clear': (ctx) => { bookState(ctx, 'grades').subject = null; },
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
    // Le azioni di "E se prendessi…" si aggiungono in fondo al file (`simulatorActions`).
  },
};

/** Filtro per materia (il periodo si sceglie con il gruppo di pulsanti della media). */
function filters(book, s) {
  const subject = allSubjects(book).find((x) => x.id === s.subject);
  return chipRow(filterChip(subject?.name ?? 'Tutte le materie', { iconName: subject ? 'check' : 'library', trailingIcon: 'chevronDown', selected: s.subject != null, action: 'grades-subject-menu' }) +
    (subject ? filterChip('Rimuovi filtro', { iconName: 'x', action: 'grades-subject-clear' }) : ''));
}

/** Ultimi voti divisi per mese, ognuno in una lista segmentata. */
function recentList(ctx, book, s, scope) {
  const list = book.gradesIn(s.period)
    .filter((g) => s.subject == null || g.subjectId === s.subject)
    .sort((a, b) => b.date - a.date);
  if (!list.length) return emptyState('Nessun voto', 'filter', 'Nessun voto corrisponde ai filtri selezionati.');
  const months = [...groupBy(list, (g) => startOfMonth(g.date).getTime()).entries()].sort(([a], [b]) => b - a);
  return `<div class="stack gap-20">${months.map(([time, items]) => listGroup(items.map((g) => gradeCard(g, book, s.expanded.has(g.id), scope)),
    { header: fmt.monthYear(new Date(time)), attrs: ` data-key="gm-${time}"` })).join('')}</div>`;
}

function subjectList(ctx, book, s) {
  const target = ctx.prefs.targetAverage;
  const subjects = book.subjects(s.period).filter((x) => s.subject == null || x.subjectId === s.subject);
  return listGroup(subjects.map((summary) => subjectRow(summary, target)));
}

// MARK: - Media generale

/**
 * La media in primo piano: un grande indicatore circolare ondulato al centro, sotto il periodo e
 * lo stato delle insufficienze; poi i periodi in un gruppo di pulsanti collegati, ognuno con la
 * sua media (quello scelto cambia la media mostrata e i voti sotto).
 */
function averageHero(book, period, { size = 188 } = {}) {
  const average = book.average(period);
  const periodName = period == null ? null : book.activePeriods.find((p) => p.position === period)?.name;
  const count = book.gradesIn(period).filter((g) => g.countsTowardAverage).length;
  const insufficient = book.subjects(period).filter((x) => (x.average ?? 10) < 6).length;
  const status = insufficient
    ? statusChip(insufficient === 1 ? '1 insufficienza' : `${insufficient} insufficienze`, 'alertTriangleFill', 'poor')
    : statusChip('Nessuna insufficienza', 'checkSealFill', 'good');
  const periods = book.activePeriods.length
    ? connectedGroup([[null, 'Anno'], ...book.activePeriods.map((p) => [p.position, p.name])].map(([value, name]) =>
      [value, `<span class="cg-stack"><small>${esc(name)}</small><strong class="numeral">${GradeFormat.average(book.average(value))}</strong></span>`]),
    period, 'grades-period', { height: 64 })
    : '';
  return `<div class="average-hero">
    <div class="ah-main">${averageRing(average, { size, lineWidth: size >= 180 ? 14 : 12 })}
      <div class="ah-text"><h2>${esc(periodName ? `Media del ${periodName.toLowerCase()}` : 'Media generale')}</h2>
      <p>${count === 1 ? '1 voto che fa media' : `${count} voti che fanno media`}</p></div>${status}</div>
    ${periods}</div>`;
}

// MARK: - Andamento

/**
 * Andamento della media in stile Material 3 Expressive: linea spessa e arrotondata nel colore
 * primario con l'area tonale sotto, la fascia dell'insufficienza nel contenitore rosso e
 * l'ultimo valore segnato da un punto grande; in alto la media in grande e la variazione.
 */
function trendCard(book, period, subjectId) {
  const points = book.runningAverage(subjectId, period);
  if (points.length < 2) return '';
  const last = points[points.length - 1];
  const delta = last.value - points[0].value;
  const chart = chartPlaceholder('trend', {
    id: 'trend',
    height: 160,
    domain: [3, 10],
    ticks: [4, 6, 8, 10],
    line: points,
    lineWidth: 4,
    color: 'var(--primary)',
    area: true,
    band: true,
    lastDot: true,
    monthAxis: true,
    label: 'Andamento della media',
    signature: `${period}|${subjectId}|${points.length}|${last.value}|${book.weighted}|${book.mode}`,
  });
  return `<div class="card trend-card"><div class="trend-head"><div><span class="trend-label">Andamento della media</span>
    <div class="trend-value"><strong class="numeral">${GradeFormat.average(last.value)}</strong><span>ultimo voto</span></div></div>
    ${statusChip(`${delta >= 0 ? '+' : '−'}${GradeFormat.average(Math.abs(delta))}`, delta >= 0 ? 'trendingUp' : 'trendingDown', delta >= 0 ? 'good' : 'poor')}</div>${chart}</div>`;
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

/** Voto in una lista segmentata: si apre per i dettagli e l'effetto sulla media. */
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
  return `<div class="grade-cell ${expanded ? 'expanded' : ''}" data-key="g-${grade.id}"><button class="grade-head" data-action="grade-expand" data-id="${grade.id}" data-scope="${scope}" aria-expanded="${expanded}">
      ${gradeBadge(grade, 50)}
      <span class="grow">${subjectTag(grade.subjectName, grade.subjectId)}
        <span class="row-sub">${esc(grade.kind)} · ${esc(fmt.shortDay(grade.date))}</span>
        ${grade.notes && !expanded ? `<span class="row-note">${esc(grade.notes)}</span>` : ''}</span>
      ${chevron(!expanded, { rotateUp: true })}</button>
    ${collapsible(expanded, `<div class="stack gap-10">${details}</div>`, { spacing: 14 })}</div>`;
}

function subjectRow(summary) {
  const chips = summary.grades.slice(0, 6).map((g) =>
    `<span class="mini-grade" style="--tint:${gradeColor(g)}">${esc(g.displayValue)}</span>`).join('');
  return `<button class="list-item subject-row" data-action="open-subject" data-id="${summary.subjectId}" data-key="s-${summary.subjectId}">
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

  // La media della materia in primo piano, al centro, con docenti e voto migliore e peggiore.
  const values = list.filter((g) => g.countsTowardAverage).map((g) => g.value);
  const header = `<div class="average-hero subject"><div class="ah-main">${averageRing(GradeBook.average(list, book.weighted), { size: 156, lineWidth: 12 })}
    <div class="ah-text"><h2>${esc(name)}</h2>${teachers.length ? `<p>${esc(teachers.join(', '))}</p>` : ''}</div>
    ${values.length ? `<div class="chip-flow center">${statusChip(`Migliore ${GradeFormat.short(Math.max(...values))}`, 'arrowUp', 'good')}${statusChip(`Peggiore ${GradeFormat.short(Math.min(...values))}`, 'arrowDown', 'poor')}</div>` : ''}</div></div>`;

  const periodPicker = book.activePeriods.length > 1
    ? connectedGroup([[null, 'Anno'], ...book.activePeriods.map((p) => [p.position, p.name])].map(([value, label]) => [value, `<span>${esc(label)}</span>`]),
      s.period, 'grades-period', { height: 48, params: { scope: `subject-${subjectId}` } })
    : '';

  const sorted = list.filter((g) => g.countsTowardAverage).sort((a, b) => a.date - b.date);
  const running = book.runningAverage(subjectId, s.period);
  const chart = sorted.length >= 2 ? `<div class="card trend-card"><span class="card-title">Voti e media</span>${chartPlaceholder(`subject-${subjectId}`, {
    id: `subject-${subjectId}`,
    height: 170,
    domain: [2, 10],
    ticks: [2, 4, 6, 8, 10],
    line: running,
    lineWidth: 4,
    band: true,
    color: subjectColor(subjectId),
    dots: sorted.map((g) => ({ date: g.date, value: g.value, color: gradeColor(g), title: `${g.displayValue} · ${fmt.shortDay(g.date)}` })),
    label: `Voti di ${name}`,
    signature: `${s.period}|${sorted.length}|${running.at(-1)?.value}|${book.weighted}`,
  })}</div>` : '';

  const goal = goalCalculator(ctx, list, book.weighted) + gradeSimulator(ctx, book, { period: s.period, subjectId });
  const gradesHeader = sectionHeader('Voti', { subtitle: list.length === 1 ? '1 valutazione' : `${list.length} valutazioni` });
  const gradeList = listGroup(list.map((g) => gradeCard(g, book, s.expanded.has(g.id), `subject-${subjectId}`)));

  if (ctx.wide) {
    return { title: name, split: { sideWidth: 380, side: header + periodPicker + chart + goal, main: gradesHeader + gradeList } };
  }
  return { title: name, body: `<div class="stack gap-20">${header}${periodPicker}${chart}${goal}<div class="stack gap-12">${gradesHeader}${gradeList}</div></div>` };
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
  return `<div class="card goal stack gap-14"><div class="goal-head"><span class="goal-art shaped">${shape('cookie9Sided')}${icon('target')}</span>
      <span><strong>Obiettivo</strong><small>Quanto ti serve per arrivarci</small></span></div>
    <div class="row-between"><span>Media desiderata</span>${stepper(target, { action: 'goal-target', min: 4, max: 10, step: 0.25, format: GradeFormat.short })}</div>
    <div class="row-between"><span>Prossime prove</span>${stepper(s.upcoming, { action: 'goal-count', min: 1, max: 5, step: 1 })}</div>
    <hr class="divider">${result}</div>`;
}

// MARK: - E se prendessi…

/**
 * "E se prendessi…" (3.3, come `GradeSimulator` nell'app): come cambierebbe la media con uno o più
 * voti ipotetici. Nella pagina di una materia i voti sono di quella materia, nei Voti si sceglie la
 * materia di ognuno tra tutte quelle dell'anno (anche senza voti). Nulla viene salvato: i voti
 * ipotetici spariscono uscendo dalla pagina della materia (`ctx.pageState`); nei Voti restano finché
 * resta aperta la sessione, come la scheda nell'app.
 */
function simulatorState(ctx, subjectId) {
  const init = () => ({ open: false, grades: [], value: 7, weight: 1, chosen: null });
  if (subjectId == null) return { key: 'sim:grades', state: ctx.state('sim:grades', init) };
  return ctx.pageState(`sim-${subjectId}`, init);
}

/** Lo stato del simulatore a cui appartiene un controllo (`data-sim`). */
const simulatorOf = (ctx, el) => ctx.app.viewState.get(el.dataset.sim);

/**
 * Tutte le materie dell'anno (anche quelle ancora senza voti), più quelle che compaiono solo nei
 * voti (es. un anno con l'elenco delle materie non ancora scaricato).
 */
function simulatorSubjects(model, book) {
  const names = new Map();
  for (const subject of model.subjects ?? []) if (subject.id && subject.name) names.set(subject.id, subject.name);
  for (const grade of book.grades) if (!names.has(grade.subjectId)) names.set(grade.subjectId, grade.subjectName);
  return [...names.entries()].map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, 'it', { numeric: true, sensitivity: 'base' }));
}

/** In che periodo cade un voto ipotetico: quello scelto o, con tutto l'anno, l'ultimo. */
function simulatorPeriod(book, period) {
  const chosen = period != null ? book.activePeriods.find((p) => p.position === period) : null;
  if (chosen) return { position: chosen.position, name: chosen.name };
  const last = book.activePeriods.at(-1);
  if (last) return { position: last.position, name: last.name };
  return { position: period ?? 1, name: '' };
}

function simulatorTarget(s, subjects, { subjectId, suggestedSubject }) {
  if (subjectId != null) return subjectId;
  const known = (id) => id != null && subjects.some((x) => x.id === id);
  if (known(s.chosen)) return s.chosen;
  if (known(suggestedSubject)) return suggestedSubject;
  return subjects[0]?.id ?? null;
}

export function gradeSimulator(ctx, book, { period = null, subjectId = null, suggestedSubject = null, collapsible: canCollapse = false } = {}) {
  const { key, state: s } = simulatorState(ctx, subjectId);
  const subjects = simulatorSubjects(ctx.model, book);
  const target = simulatorTarget(s, subjects, { subjectId, suggestedSubject });
  const nameOf = (id) => subjects.find((x) => x.id === id)?.name ?? 'Materia';
  const sim = { sim: key };

  const heading = `<span class="sim-heading"><span class="sim-art shaped">${shape('clover4Leaf')}${icon('wand')}</span>
    <span class="grow"><strong>E se prendessi…</strong><small>Come cambierebbe la media</small></span></span>`;
  const head = canCollapse
    ? `<button class="sim-head" data-action="sim-toggle"${dataAttrs(sim)} aria-expanded="${s.open}" title="${s.open ? 'Nasconde la simulazione' : 'Apre la simulazione'}">${heading}${chevron(!s.open, { rotateUp: true })}</button>`
    : `<div class="sim-head">${heading}</div>`;

  const form = [];
  if (subjectId == null && subjects.length) {
    // Il nome della materia può essere lungo: l'etichetta resta intera e il campo prende il resto
    // della riga, andando a capo su due righe.
    form.push(`<div class="sim-row sim-subject"><span>Materia</span>${select(subjects.map((x) => [x.id, x.name]), target, 'sim-subject', { label: 'Materia', params: sim })}</div>`);
  }
  form.push(`<div class="sim-row"><span>Voto</span>${stepper(s.value, { action: `sim-value"${dataAttrs(sim)} data-x="`, min: 1, max: 10, step: 0.25, format: GradeFormat.short })}</div>`);
  if (book.weighted) {
    form.push(`<div class="sim-row"><span>Peso</span>${stepper(s.weight, { action: `sim-weight"${dataAttrs(sim)} data-x="`, min: 0.25, max: 3, step: 0.25, format: (v) => `${GradeFormat.short(v * 100)}%` })}</div>`);
  }
  form.push(button('Aggiungi questo voto', { action: 'sim-add', params: { ...sim, subject: target ?? '' }, iconName: 'plus', style: 'tonal', cls: 's wide', disabled: target == null }));

  let extra = '';
  if (s.grades.length) {
    const chips = s.grades.map((g) => {
      const tone = gradeTone(g.value);
      return `<button class="sim-chip" style="--chip-bg:var(--${tone}-container);--chip-fg:var(--on-${tone}-container)" data-action="sim-remove"${dataAttrs({ ...sim, id: g.id })} data-key="sim-${g.id}" aria-label="Togli il voto ${esc(GradeFormat.short(g.value))}">
        <strong class="numeral">${esc(GradeFormat.short(g.value))}</strong>${subjectId == null ? `<span class="sim-chip-name">${esc(g.subjectName)}</span>` : ''}
        ${book.weighted && g.weight !== 1 ? `<span>${esc(GradeFormat.short(g.weight * 100))}%</span>` : ''}${icon('x', { cls: 'small' })}</button>`;
    }).join('');
    const where = simulatorPeriod(book, period);
    const simulated = book.adding(s.grades, where.position, where.name);
    const touched = [...new Set(s.grades.map((g) => g.subjectId))].sort((a, b) => nameOf(a).localeCompare(nameOf(b), 'it'));
    const rows = touched.map((id) => simulatorRow(subjectId == null ? nameOf(id) : 'Media della materia',
      GradeBook.average(book.gradesIn(period).filter((g) => g.subjectId === id), book.weighted),
      GradeBook.average(simulated.gradesIn(period).filter((g) => g.subjectId === id), book.weighted),
      subjectId != null));
    rows.push(simulatorRow(period == null ? 'Media generale' : 'Media del periodo', book.average(period), simulated.average(period), subjectId == null));
    extra = `<div class="sim-chips">${chips}</div><hr class="divider"><div class="sim-results">${rows.join('')}</div>
      <div class="sim-reset">${button('Azzera', { action: 'sim-reset', params: sim, style: 'text', cls: 'xs' })}</div>`;
  }
  const body = `<div class="stack gap-14">${form.join('')}${extra}</div>`;
  return `<section class="card sim-card" data-key="${esc(key)}">${head}${collapsible(!canCollapse || s.open, body, { spacing: 14 })}</section>`;
}

/** Prima e dopo: la media (in piccolo quella di prima, in grande quella nuova) e la differenza. */
function simulatorRow(title, before, after, prominent) {
  const delta = before != null && after != null && Math.abs(after - before) >= 0.005 ? after - before : null;
  return `<div class="sim-result ${prominent ? 'prominent' : ''}"><span class="sim-result-title">${esc(title)}</span>
    <span class="sim-before numeral">${GradeFormat.average(before)}</span>${icon('chevronRight', { cls: 'small' })}
    <strong class="sim-after numeral" style="color:${gradeColorValue(after)}">${GradeFormat.average(after)}</strong>
    ${delta != null ? `<span class="sim-delta ${delta > 0 ? 'up' : 'down'}">${delta > 0 ? '+' : '−'}${GradeFormat.average(Math.abs(delta))}</span>` : ''}</div>`;
}

const dataAttrs = (params) => Object.entries(params).filter(([, v]) => v != null)
  .map(([k, v]) => ` data-${k}="${esc(String(v))}"`).join('');

const simulatorActions = {
  'sim-toggle': (ctx, el) => { const s = simulatorOf(ctx, el); if (s) s.open = !s.open; },
  'sim-subject': (ctx, el) => { const s = simulatorOf(ctx, el); if (s) s.chosen = Number(el.value); },
  'sim-value': (ctx, el) => {
    const s = simulatorOf(ctx, el);
    if (s) s.value = Math.min(10, Math.max(1, s.value + Number(el.dataset.delta)));
  },
  'sim-weight': (ctx, el) => {
    const s = simulatorOf(ctx, el);
    if (s) s.weight = Math.min(3, Math.max(0.25, s.weight + Number(el.dataset.delta)));
  },
  'sim-add': (ctx, el) => {
    const s = simulatorOf(ctx, el);
    const subjectId = Number(el.dataset.subject);
    if (!s || !el.dataset.subject) return;
    const book = ctx.model.gradeBook;
    const name = simulatorSubjects(ctx.model, book).find((x) => x.id === subjectId)?.name ?? 'Materia';
    navigator.vibrate?.(4);
    s.grades = [...s.grades, newHypothetical({ subjectId, subjectName: name, value: s.value, weight: book.weighted ? s.weight : 1 })];
  },
  'sim-remove': (ctx, el) => {
    const s = simulatorOf(ctx, el);
    if (!s) return;
    navigator.vibrate?.(4);
    s.grades = s.grades.filter((g) => g.id !== Number(el.dataset.id));
  },
  'sim-reset': (ctx, el) => { const s = simulatorOf(ctx, el); if (s) s.grades = []; },
};

Object.assign(grades.actions, simulatorActions);
