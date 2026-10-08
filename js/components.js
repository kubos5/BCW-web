// Componenti riutilizzabili: card, occhielli, badge dei voti, anelli, righe dell'agenda…
// Ogni funzione restituisce HTML; i colori arrivano dalle variabili CSS del tema.

import { icon } from './icons.js';
import { data } from './dom.js';
import { esc, fmt, GradeFormat } from './util.js';
import { AbsenceKind } from './models.js';

// MARK: - Colori

export function subjectColor(id) {
  if (id == null) return 'var(--ink2)';
  return `var(--subject-${Math.abs(Number(id)) % 12})`;
}

export function gradeColorValue(value) {
  if (value == null) return 'var(--neutral)';
  if (value >= 6) return 'var(--good)';
  if (value >= 5.5) return 'var(--fair)';
  return 'var(--poor)';
}

export function gradeColor(grade) {
  if (grade.canceled) return 'var(--ink2)';
  if (!grade.countsTowardAverage) return 'var(--neutral)';
  return gradeColorValue(grade.value);
}

const tint = (color) => `--tint:${color}`;

// MARK: - Contenitori

export function card(content, { padding = 16, cls = '', attrs = '' } = {}) {
  return `<div class="card ${cls}" style="--pad:${padding}px"${attrs}>${content}</div>`;
}

export function cardGrid(content, minWidth = 340, cls = '') {
  return `<div class="card-grid ${cls}" style="--min:${minWidth}px">${content}</div>`;
}

export function chipRow(content) {
  return `<div class="chip-row"><div class="chip-row-inner">${content}</div></div>`;
}

export const chipDivider = () => '<span class="chip-divider"></span>';

export const divider = () => '<hr class="divider">';

export function joinRows(items, render, sep = divider()) {
  return items.map(render).join(sep);
}

// MARK: - Intestazioni

export function sectionHeader(title, { subtitle, trailing = '' } = {}) {
  return `<div class="section-header"><div><h3>${esc(title)}</h3>${subtitle ? `<p>${esc(subtitle)}</p>` : ''}</div>${trailing}</div>`;
}

/** Piccola etichetta maiuscola con spaziatura, usata come occhiello. */
export function eyebrow(text, color = 'var(--ink2)') {
  return `<span class="eyebrow" style="color:${color}">${esc(text)}</span>`;
}

// MARK: - Voti

export function gradeBadge(grade, size = 48) {
  const color = gradeColor(grade);
  const cls = grade.countsTowardAverage ? 'counts' : '';
  return `<span class="grade-badge ${cls} ${grade.canceled ? 'canceled' : ''}" style="${tint(color)};--size:${size}px" aria-label="Voto ${esc(grade.displayValue)}"><span>${esc(grade.displayValue)}</span></span>`;
}

/** Anello che si riempie in proporzione alla media (su 10). */
export function averageRing(value, { size = 120, lineWidth = 10, showsLabel = true } = {}) {
  const color = gradeColorValue(value);
  const r = (size - lineWidth) / 2;
  const c = 2 * Math.PI * r;
  const progress = Math.min(1, Math.max(0, (value ?? 0) / 10));
  const label = showsLabel
    ? `<span class="ring-label" style="font-size:${Math.round(size * 0.26)}px">${GradeFormat.average(value)}</span>` : '';
  return `<span class="ring" style="width:${size}px;height:${size}px;${tint(color)}" aria-label="Media ${GradeFormat.average(value)}">
    <svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" class="ring-track" stroke-width="${lineWidth}"/>
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" class="ring-fill" stroke-width="${lineWidth}"
        stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - progress)}"
        transform="rotate(-90 ${size / 2} ${size / 2})"/>
    </svg>${label}</span>`;
}

// MARK: - Materie e filtri

export function subjectTag(name, id) {
  return `<span class="subject-tag"><span class="dot" style="background:${subjectColor(id)}"></span><span class="name">${esc(name)}</span></span>`;
}

export function filterChip(title, { iconName, selected = false, action, params = {}, trailingIcon } = {}) {
  return `<button class="chip ${selected ? 'selected' : ''}" data-action="${action}"${data(params)} aria-pressed="${selected}">` +
    `${iconName ? icon(iconName, { cls: 'small' }) : ''}<span>${esc(title)}</span>${trailingIcon ? icon(trailingIcon, { cls: 'small' }) : ''}</button>`;
}

/**
 * Etichetta di stato a capsula. Resta sempre su una riga: se lo spazio non basta
 * usa la versione abbreviata (`short`), invece di andare a capo.
 */
export function pill(text, { short, color = 'var(--accent)', filled = false, cls = '' } = {}) {
  const content = short
    ? `<span class="long">${esc(text)}</span><span class="short">${esc(short)}</span>`
    : esc(text);
  return `<span class="pill ${filled ? 'filled' : ''} ${short ? 'has-short' : ''} ${cls}" style="${tint(color)}" title="${esc(text)}">${content}</span>`;
}

export function statTile(title, value, iconName, color = 'var(--accent)') {
  return card(`<span class="stat-icon" style="${tint(color)}">${icon(iconName)}</span>
    <span class="stat-value numeral">${esc(value)}</span><span class="stat-title">${esc(title)}</span>`, { padding: 14, cls: 'stat-tile' });
}

export function iconBadge(iconName, color = 'var(--accent)', size = 36) {
  return `<span class="icon-badge" style="${tint(color)};--size:${size}px">${icon(iconName)}</span>`;
}

// MARK: - Righe comuni

function absenceTint(absence) {
  switch (absence.kind) {
    case 'absence': return 'var(--poor)';
    case 'late': case 'shortLate': return 'var(--fair)';
    default: return 'var(--neutral)';
  }
}

export function absenceRow(absence, { showsReason = false } = {}) {
  const kind = AbsenceKind[absence.kind];
  const status = absence.isJustified
    ? `<span class="justified" title="Giustificata">${icon('checkSealFill')}</span>`
    : pill('Da giustificare', { short: 'Da giust.', color: 'var(--poor)' });
  return `<div class="absence-row">
    <span class="absence-letter numeral" style="${tint(absenceTint(absence))}">${kind.letter}</span>
    <div class="grow"><div class="row-title">${kind.title}</div><div class="row-sub">${esc(absence.detail)}</div>
    ${showsReason && absence.justificationReason ? `<div class="row-caption">${esc(absence.justificationReason)}</div>` : ''}</div>
    ${status}</div>`;
}

export function lessonRow(lesson) {
  const meta = [lesson.type, lesson.authorName].filter(Boolean).join(' · ');
  return `<div class="lesson-row">
    <div class="lesson-hour"><span class="numeral" style="color:${subjectColor(lesson.subjectId)}">${lesson.hour}</span><small>ora</small></div>
    <div class="grow">
      <div class="row-head">${subjectTag(lesson.subjectName, lesson.subjectId)}${lesson.duration > 1 ? `<span class="row-caption">${Math.trunc(lesson.duration)} ore</span>` : ''}</div>
      ${lesson.topic ? `<div class="lesson-topic">${esc(lesson.topic)}</div>` : ''}
      ${meta ? `<div class="row-caption">${esc(meta)}</div>` : ''}
    </div></div>`;
}

/**
 * Riga di un compito, una verifica o un evento. Il cerchio a sinistra segna i compiti
 * come fatti; tenendo premuto (o con il tasto destro) si apre il menu con le altre azioni.
 */
export function agendaEventRow(event, { done = false, expanded = false, showsDate = false, scope = '' } = {}) {
  const leading = event.kind === 'event'
    ? iconBadge('calendar', subjectColor(event.subjectId), 30)
    : `<button class="check ${done ? 'done' : ''}" style="${tint(done ? 'var(--good)' : subjectColor(event.subjectId))}"
        data-action="agenda-toggle"${data({ id: event.id })} aria-label="${done ? 'Fatto' : 'Da fare'}" aria-pressed="${done}">
        ${icon(done ? 'checkCircleFill' : 'circle')}</button>`;
  const meta = [];
  if (showsDate) meta.push(fmt.relativeDayName(event.begin));
  if (event.kind !== 'homework') meta.push(event.timeDescription);
  if (event.authorName && event.subjectName != null) meta.push(event.authorName);
  return `<div class="agenda-row ${expanded ? 'expanded' : ''}" data-key="ev-${scope}${event.id}" data-context="agenda"${data({ id: event.id })}>
    ${leading}
    <div class="grow" data-action="agenda-expand"${data({ id: event.id, scope })}>
      <div class="row-head">${subjectTag(event.title, event.subjectId)}${event.kind === 'test' ? pill('Verifica', { cls: 'bold' }) : ''}</div>
      <div class="agenda-notes ${done ? 'done' : ''}">${esc(event.notes || 'Nessuna descrizione')}</div>
      ${meta.length ? `<div class="row-caption">${esc(meta.join(' · '))}</div>` : ''}
    </div></div>`;
}

// MARK: - Sezioni comprimibili

/** Contenuto di una sezione comprimibile, con la sfumatura sul bordo superiore. */
export function collapsible(expanded, content, { spacing = 0 } = {}) {
  return `<div class="collapsible ${expanded ? 'open' : ''}" style="--gap:${spacing}px" ${expanded ? '' : 'inert'}><div class="collapsible-inner"><div class="collapsible-content">${content}</div></div></div>`;
}

export function chevron(collapsed, { rotateUp = false } = {}) {
  const cls = rotateUp ? (collapsed ? '' : 'up') : (collapsed ? 'left' : '');
  return `<span class="chev ${cls}">${icon('chevronDown')}</span>`;
}

// MARK: - Stati

export function statusBanner(message, iconName = 'wifiOff') {
  return `<div class="status-banner">${icon(iconName)}<span>${esc(message)}</span></div>`;
}

export function loadingCard(text = 'Caricamento…') {
  return card(`<div class="loading">${spinner()}<span>${esc(text)}</span></div>`);
}

export const spinner = () => '<span class="spinner" role="progressbar" aria-label="Caricamento"></span>';

/** Riga "chiave: valore" per le schede di dettaglio. */
export function detailRow(label, value) {
  return `<div class="detail-row"><span>${esc(label)}</span><span>${esc(value)}</span></div>`;
}

/** Equivalente di `ContentUnavailableView`. */
export function emptyState(title, iconName, description = '', actions = '') {
  return `<div class="empty-state">${icon(iconName)}<h3>${esc(title)}</h3>${description ? `<p>${esc(description)}</p>` : ''}${actions}</div>`;
}

export function button(label, { action, params = {}, iconName, style = 'glass', cls = '', disabled = false, attrs = '' } = {}) {
  return `<button class="btn btn-${style} ${cls}" data-action="${action}"${data(params)}${disabled ? ' disabled' : ''}${attrs}>` +
    `${iconName ? icon(iconName) : ''}${label ? `<span>${esc(label)}</span>` : ''}</button>`;
}

export function circleButton(iconName, { action, params = {}, label, disabled = false, cls = '', attrs = '' } = {}) {
  return `<button class="btn-circle glass ${cls}" data-action="${action}"${data(params)} aria-label="${esc(label ?? '')}" title="${esc(label ?? '')}"${disabled ? ' disabled' : ''}${attrs}>${icon(iconName)}</button>`;
}

/** Controllo segmentato. */
export function segmented(options, selected, action, { compact = false } = {}) {
  return `<div class="segmented ${compact ? 'compact' : ''}" role="tablist">${options.map(([value, label]) =>
    `<button role="tab" class="${String(value) === String(selected) ? 'selected' : ''}" aria-selected="${String(value) === String(selected)}" data-action="${action}" data-value="${esc(value)}">${esc(label)}</button>`,
  ).join('')}</div>`;
}

export function toggle(checked, action, { label = '', disabled = false } = {}) {
  return `<label class="switch"><input type="checkbox" data-change="${action}"${checked ? ' checked' : ''}${disabled ? ' disabled' : ''} aria-label="${esc(label)}"><span></span></label>`;
}

export function stepper(value, { action, min, max, step, format = (v) => v }) {
  return `<span class="stepper">
    <button data-action="${action}" data-delta="${-step}" ${value <= min ? 'disabled' : ''} aria-label="Diminuisci">${icon('minus')}</button>
    <span class="numeral">${esc(format(value))}</span>
    <button data-action="${action}" data-delta="${step}" ${value >= max ? 'disabled' : ''} aria-label="Aumenta">${icon('plus')}</button></span>`;
}

export function select(options, selected, action, { label = '' } = {}) {
  return `<span class="select"><select data-change="${action}" aria-label="${esc(label)}">${options.map(([value, text]) =>
    `<option value="${esc(value)}"${String(value) === String(selected) ? ' selected' : ''}>${esc(text)}</option>`).join('')}</select>${icon('chevronUpDown')}</span>`;
}

/**
 * Ricerca dentro una singola pagina (Bacheca, Agenda, Materiale) su schermi larghi: nella
 * barra c'è già quella generale, quindi il campo sta nel contenuto (come `LocalSearchField`).
 */
export function localSearchField(value, placeholder, action) {
  return `<label class="local-search">${icon('search')}<input type="search" value="${esc(value)}" placeholder="${esc(placeholder)}" data-input="${action}" autocomplete="off" aria-label="${esc(placeholder)}">` +
    `${value ? `<button class="search-clear" data-action="${action}" data-clear="1" aria-label="Cancella" title="Cancella">${icon('xCircle')}</button>` : ''}</label>`;
}

export function avatar(initials, { size = 66, color = 'var(--accent)', cls = '' } = {}) {
  return `<span class="avatar ${cls}" style="--size:${size}px;${tint(color)}">${esc(initials)}</span>`;
}
