// Componenti riutilizzabili in stile Material 3 Expressive: card, liste segmentate, chip,
// pulsanti, badge dei voti a forma di "biscotto", indicatori ondulati, righe dell'agenda…
// Ogni funzione restituisce HTML; i colori arrivano dalle variabili CSS del tema.

import { icon } from './icons.js';
import { shape } from './shapes.js';
import { data } from './dom.js';
import { esc, fmt, GradeFormat } from './util.js';
import { AbsenceKind } from './models.js';

// MARK: - Colori

export function subjectColor(id) {
  if (id == null) return 'var(--on-surface-variant)';
  return `var(--subject-${Math.abs(Number(id)) % 12})`;
}

/** Tono di una media o di un voto: bene, quasi, insufficiente, neutro. */
export function gradeTone(value) {
  if (value == null) return 'neutral';
  if (value >= 6) return 'good';
  if (value >= 5.5) return 'fair';
  return 'poor';
}

export const gradeColorValue = (value) => `var(--${gradeTone(value)})`;

export function gradeToneOf(grade) {
  if (grade.canceled || !grade.countsTowardAverage) return 'neutral';
  return gradeTone(grade.value);
}

export function gradeColor(grade) {
  if (grade.canceled) return 'var(--on-surface-variant)';
  return `var(--${gradeToneOf(grade)})`;
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

/** Lista segmentata: voci separate da 2 px, la prima e l'ultima con gli angoli ampi. */
export function listGroup(items, { header, footer, cls = '', background, attrs = '' } = {}) {
  const rows = items.filter(Boolean).join('');
  if (!rows) return '';
  const style = background ? ` style="--cell-bg:${background}"` : '';
  return `<section class="list-section ${cls}"${attrs}>${header ? `<h3 class="list-header">${esc(header)}</h3>` : ''}<div class="list-group"${style}>${rows}</div>${footer ? `<p class="list-footer">${esc(footer)}</p>` : ''}</section>`;
}

/**
 * Voce di una lista. `leading`/`trailing` sono HTML; con `action` diventa un pulsante.
 */
export function listItem({ title, subtitle, leading = '', trailing = '', action, params = {}, href, cls = '', attrs = '', disabled = false }) {
  const text = `<span class="li-text"><strong>${esc(title)}</strong>${subtitle ? `<small>${esc(subtitle)}</small>` : ''}</span>`;
  const inner = `${leading}${text}${trailing}`;
  if (href) return `<a class="list-item ${cls}" href="${esc(href)}" target="_blank" rel="noopener"${attrs}>${inner}</a>`;
  if (action) return `<button class="list-item ${cls}" data-action="${action}"${data(params)}${disabled ? ' disabled' : ''}${attrs}>${inner}</button>`;
  return `<div class="list-item ${cls}"${attrs}>${inner}</div>`;
}

// MARK: - Intestazioni

export function sectionHeader(title, { subtitle, trailing = '' } = {}) {
  return `<div class="section-header"><div><h3>${esc(title)}</h3>${subtitle ? `<p>${esc(subtitle)}</p>` : ''}</div>${trailing}</div>`;
}

/** Etichetta breve sopra a un contenuto. */
export function eyebrow(text, color = 'var(--on-surface-variant)') {
  return `<span class="eyebrow" style="color:${color}">${esc(text)}</span>`;
}

// MARK: - Voti

/**
 * Voto in una forma di M3 Expressive: i voti che fanno media stanno in un "biscotto" a nove
 * lobi nel colore del loro esito, gli altri in un cerchio con il contorno.
 */
export function gradeBadge(grade, size = 48) {
  const tone = gradeToneOf(grade);
  const counts = grade.countsTowardAverage;
  const text = grade.displayValue;
  const fontSize = Math.round(size * (text.length > 3 ? 0.27 : text.length > 2 ? 0.32 : 0.4));
  return `<span class="grade-badge shaped ${counts ? 'counts' : ''} ${grade.canceled ? 'canceled' : ''}" style="--size:${size}px;--tone:var(--${tone});--tone-container:var(--${tone}-container);--on-tone-container:var(--on-${tone}-container)" aria-label="Voto ${esc(text)}">
    ${shape(counts ? 'cookie9Sided' : 'circle')}<span style="font-size:${fontSize}px">${esc(text)}</span></span>`;
}

/** Arco ondulato (come gli indicatori di avanzamento di M3 Expressive). */
function wavyArc(cx, cy, r, from, to, amplitude, wavelength) {
  const length = (to - from) * r;
  if (length <= 0) return '';
  const steps = Math.max(8, Math.ceil(length / 2));
  let d = '';
  for (let i = 0; i <= steps; i++) {
    const t = from + ((to - from) * i) / steps;
    const s = (t - from) * r;
    // L'onda si appiattisce agli estremi, così l'arco comincia e finisce sul cerchio.
    const fade = Math.min(1, s / wavelength, (length - s) / wavelength);
    const rr = r + amplitude * fade * Math.sin((s / wavelength) * 2 * Math.PI);
    const x = cx + rr * Math.cos(t);
    const y = cy + rr * Math.sin(t);
    d += `${i ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`;
  }
  return d;
}

function plainArc(cx, cy, r, from, to) {
  if (to - from <= 0.001) return '';
  // Un giro intero: due mezze circonferenze (un arco da un punto a sé stesso non si disegna).
  if (to - from >= 2 * Math.PI - 0.01) return `${plainArc(cx, cy, r, from, from + Math.PI)} ${plainArc(cx, cy, r, from + Math.PI, from + 2 * Math.PI - 0.011)}`;
  const large = to - from > Math.PI ? 1 : 0;
  const x1 = cx + r * Math.cos(from);
  const y1 = cy + r * Math.sin(from);
  const x2 = cx + r * Math.cos(to);
  const y2 = cy + r * Math.sin(to);
  return `M${x1.toFixed(2)},${y1.toFixed(2)} A${r},${r} 0 ${large} 1 ${x2.toFixed(2)},${y2.toFixed(2)}`;
}

/**
 * Anello che si riempie in proporzione alla media (su 10): un indicatore circolare di M3
 * Expressive, con la parte piena ondulata e uno spazio prima della traccia.
 */
export function averageRing(value, { size = 120, lineWidth = 10, showsLabel = true } = {}) {
  const tone = gradeTone(value);
  const r = (size - lineWidth) / 2 - (size >= 60 ? 3 : 0);
  const c = size / 2;
  const progress = Math.min(1, Math.max(0, (value ?? 0) / 10));
  const start = -Math.PI / 2;
  const gap = (lineWidth * 1.1 + 4) / r;
  const end = start + progress * 2 * Math.PI;
  const wavy = size >= 60;
  let active = '';
  let track = '';
  if (progress >= 0.999) {
    active = wavy ? wavyArc(c, c, r, start, start + 2 * Math.PI, Math.min(3, size / 40), Math.max(16, size / 4)) : plainArc(c, c, r, start, start + 2 * Math.PI - 0.001);
  } else {
    if (progress > 0) active = wavy ? wavyArc(c, c, r, start, end, Math.min(3, size / 40), Math.max(16, size / 4)) : plainArc(c, c, r, start, end);
    track = plainArc(c, c, r, progress > 0 ? end + gap : start, start + 2 * Math.PI - (progress > 0 ? gap : 0));
  }
  const label = showsLabel
    ? `<span class="ring-label numeral" style="font-size:${Math.round(size * 0.25)}px">${GradeFormat.average(value)}</span>` : '';
  return `<span class="ring" style="width:${size}px;height:${size}px;--tone:var(--${tone});--tone-container:var(--${tone}-container)" aria-label="Media ${GradeFormat.average(value)}">
    <svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
      ${track ? `<path d="${track}" class="ring-track" stroke-width="${lineWidth}"/>` : ''}
      ${active ? `<path d="${active}" class="ring-fill" stroke-width="${lineWidth}"/>` : ''}
    </svg>${label}</span>`;
}

/** Barra di avanzamento lineare e ondulata, con lo spazio e il punto finale di M3. */
export function wavyProgress(value, max, { label = '' } = {}) {
  const p = Math.min(1, Math.max(0, max ? value / max : 0));
  // Come nell'app: a zero solo la pista, al completo solo l'onda (senza spazio né punto finale).
  return `<div class="wavy-progress" role="progressbar" aria-valuenow="${value}" aria-valuemax="${max}" aria-label="${esc(label)}" style="--p:${p}">
    ${p > 0 ? '<span class="wp-active"></span>' : ''}${p < 1 ? '<span class="wp-track"></span>' : ''}</div>`;
}

/** Linea ondulata orizzontale (separatori degli intervalli dell'orario). */
export const wavyLine = () => '<span class="wavy-line" aria-hidden="true"></span>';

// MARK: - Materie e filtri

export function subjectTag(name, id) {
  return `<span class="subject-tag"><span class="dot" style="background:${subjectColor(id)}"></span><span class="name">${esc(name)}</span></span>`;
}

/** Chip di filtro: quando è scelto mostra il segno di spunta al posto dell'icona. */
export function filterChip(title, { iconName, selected = false, action, params = {}, trailingIcon } = {}) {
  const leading = selected && !trailingIcon ? icon('check', { cls: 'small' }) : (iconName ? icon(iconName, { cls: 'small' }) : '');
  return `<button class="chip ${selected ? 'selected' : ''}" data-action="${action}"${data(params)} aria-pressed="${selected}">` +
    `${leading}<span>${esc(title)}</span>${trailingIcon ? icon(trailingIcon, { cls: 'small' }) : ''}</button>`;
}

/**
 * Etichetta di stato. Resta sempre su una riga: se lo spazio non basta usa la versione
 * abbreviata (`short`), invece di andare a capo.
 */
export function pill(text, { short, color = 'var(--primary)', filled = false, cls = '' } = {}) {
  const content = short
    ? `<span class="long">${esc(text)}</span><span class="short">${esc(short)}</span>`
    : esc(text);
  return `<span class="pill ${filled ? 'filled' : ''} ${short ? 'has-short' : ''} ${cls}" style="${tint(color)}" title="${esc(text)}">${content}</span>`;
}

/**
 * Riquadro con un numero (assenze, ritardi, medie…): l'icona sta in una forma. In una griglia
 * collegata (`corners`: tl, tr, bl, br, l, r, c) solo gli angoli verso l'esterno sono ampi.
 * `vertical` mette l'icona sopra il numero (riquadri stretti, es. tre per riga).
 */
export function statTile(title, value, iconName, color = 'var(--primary)', shapeName = 'cookie4Sided', { corners = '', vertical = false, action, params = {} } = {}) {
  const art = `<span class="stat-icon shaped" style="${tint(color)}">${shape(shapeName)}${icon(iconName)}</span>`;
  // `--len` serve al CSS per rimpicciolire il titolo che non sta su una riga.
  const text = `<span class="stat-text"><span class="stat-value numeral">${esc(value)}</span><span class="stat-title" style="--len:${String(title).length}">${esc(title)}</span></span>`;
  const cls = `stat-tile ${vertical ? 'vertical' : ''} ${corners ? `corners-${corners}` : ''}`;
  const inner = vertical ? art + text : text + art;
  if (action) return `<button class="card ${cls}" data-action="${action}"${data(params)}>${inner}</button>`;
  return `<div class="card ${cls}">${inner}</div>`;
}

/** Chip di stato (32 px, contenitore tonale): un conteggio o uno stato del giorno. */
export function statusChip(text, iconName, tone = 'secondary') {
  return `<span class="status-chip tone-${tone}">${icon(iconName)}<span>${esc(text)}</span></span>`;
}

/**
 * Sezione di una pagina in stile M3 Expressive: intestazione (icona nel colore, titolo, valore a
 * destra, avanzamento facoltativo e freccia) e sotto le voci in una lista segmentata. Toccando
 * l'intestazione la lista si chiude; lo stato è ricordato tra un avvio e l'altro.
 */
export function segmentedSection(ctx, { section, title, iconName, color = 'var(--primary)', trailing = '', progress = null, cells }) {
  const collapsed = ctx.prefs.isCollapsed(section);
  const bar = progress == null ? '' : `<span class="seg-progress">${wavyProgress(progress, 1, { label: title })}</span>`;
  return `<section class="seg-section" data-key="sec-${section}">
    <button class="seg-head" data-action="toggle-section" data-section="${section}" aria-expanded="${!collapsed}">
      <span class="seg-icon" style="color:${color}">${icon(iconName)}</span><span class="seg-title">${esc(title)}</span><span class="flex"></span>
      ${bar}${trailing ? `<span class="seg-trailing numeral-mono">${esc(trailing)}</span>` : ''}${chevron(collapsed)}</button>
    ${collapsible(!collapsed, `<div class="list-group">${cells.join('')}</div>`, { spacing: 6 })}</section>`;
}

/** Voce di una lista segmentata con il contenuto libero e i margini delle voci. */
export function segCell(content, { cls = '', attrs = '' } = {}) {
  return `<div class="seg-cell ${cls}"${attrs}>${content}</div>`;
}

/**
 * Data in un riquadro (iniziali del giorno e numero), come nella vista Programma di Google
 * Calendar: piena nel colore primario se è oggi, nel contenitore terziario se c'è una verifica.
 */
export function dateBadge(day, { highlighted = false, today = false } = {}) {
  return `<span class="date-badge ${today ? 'today' : ''} ${highlighted ? 'highlighted' : ''}"><small>${esc(fmt.weekdayShort(day).toUpperCase())}</small><span class="numeral">${day.getDate()}</span></span>`;
}

/**
 * Gruppo di pulsanti collegati di M3 Expressive con etichette libere (es. periodo e media):
 * 2 px tra i pulsanti, angoli interni piccoli ed esterni pieni; quello scelto diventa tutto
 * arrotondato e pieno. `options`: [[valore, html]].
 */
export function connectedGroup(options, selected, action, { height = 56, params = {}, cls = '' } = {}) {
  return `<div class="connected-group ${cls}" role="tablist" style="--h:${height}px">${options.map(([value, label]) => {
    const isSelected = String(value ?? '') === String(selected ?? '');
    return `<button role="tab" class="${isSelected ? 'selected' : ''}" aria-selected="${isSelected}" data-action="${action}" data-value="${esc(value ?? '')}"${data(params)}>${label}</button>`;
  }).join('')}</div>`;
}

/** Schede principali di Material 3: etichette di uguale larghezza con l'indicatore sotto quella scelta. */
export function primaryTabs(tabs, selected, action) {
  return `<div class="primary-tabs" role="tablist">${tabs.map(([value, label]) => {
    const isSelected = String(value) === String(selected);
    return `<button role="tab" class="${isSelected ? 'selected' : ''}" aria-selected="${isSelected}" data-action="${action}" data-value="${esc(value)}"><span>${esc(label)}<i></i></span></button>`;
  }).join('')}</div>`;
}

/**
 * Barra degli strumenti flottante di M3 Expressive: una pillola di 64 px in basso al centro.
 * Quella vivace (contenitore primario) segnala una modalità temporanea, come la modifica.
 */
export function floatingToolbar(content, { vibrant = false, label = 'Strumenti' } = {}) {
  return `<div class="floating-toolbar ${vibrant ? 'vibrant' : ''}" role="toolbar" aria-label="${esc(label)}">${content}</div>`;
}

export function toolbarButton(iconName, { action, label, selected = false, params = {} }) {
  return `<button class="tb-btn ${selected ? 'selected' : ''}" data-action="${action}"${data(params)} aria-label="${esc(label)}" title="${esc(label)}" aria-pressed="${selected}">${icon(iconName)}</button>`;
}

export const toolbarSeparator = () => '<span class="tb-sep"></span>';

export function iconBadge(iconName, color = 'var(--primary)', size = 40) {
  return `<span class="icon-badge" style="${tint(color)};--size:${size}px">${icon(iconName)}</span>`;
}

// MARK: - Righe comuni

function absenceTint(absence) {
  switch (absence.kind) {
    case 'absence': return 'poor';
    case 'late': case 'shortLate': return 'fair';
    default: return 'neutral';
  }
}

export function absenceRow(absence, { showsReason = false } = {}) {
  const kind = AbsenceKind[absence.kind];
  const tone = absenceTint(absence);
  const status = absence.isJustified
    ? `<span class="justified" title="Giustificata">${icon('checkSealFill')}</span>`
    : pill('Da giustificare', { short: 'Da giust.', color: 'var(--poor)' });
  return `<div class="absence-row">
    <span class="absence-letter shaped numeral" style="--shape-fill:var(--${tone}-container);color:var(--on-${tone}-container)">${shape('cookie6Sided')}<span>${kind.letter}</span></span>
    <div class="grow"><div class="row-title">${kind.title}</div><div class="row-sub">${esc(absence.detail)}</div>
    ${showsReason && absence.justificationReason ? `<div class="row-caption">${esc(absence.justificationReason)}</div>` : ''}</div>
    ${status}</div>`;
}

export function lessonRow(lesson) {
  const meta = [lesson.type, lesson.authorName].filter(Boolean).join(' · ');
  return `<div class="lesson-row">
    <div class="lesson-hour" style="--tint:${subjectColor(lesson.subjectId)}"><span class="numeral">${lesson.hour}</span><small>ora</small></div>
    <div class="grow">
      <div class="row-head">${subjectTag(lesson.subjectName, lesson.subjectId)}${lesson.duration > 1 ? `<span class="row-caption">${Math.trunc(lesson.duration)} ore</span>` : ''}</div>
      ${lesson.topic ? `<div class="lesson-topic">${esc(lesson.topic)}</div>` : ''}
      ${meta ? `<div class="row-caption">${esc(meta)}</div>` : ''}
    </div></div>`;
}

/**
 * Riga di un compito, una verifica o un evento. Il cerchio a sinistra segna i compiti
 * come fatti; toccando il testo lo si apre (se è tagliato); tenendo premuto (o con il tasto
 * destro) si apre il menu con le altre azioni.
 */
export function agendaEventRow(event, { done = false, expanded = false, showsDate = false, scope = '' } = {}) {
  const color = subjectColor(event.subjectId);
  const leading = event.kind === 'event'
    ? `<span class="agenda-lead event" style="${tint(color)}">${icon('calendar')}</span>`
    : `<button class="check ${done ? 'done' : ''}" style="${tint(done ? 'var(--good)' : color)}"
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
  return `<div class="status-banner" role="status">${icon(iconName)}<span>${esc(message)}</span></div>`;
}

/** Indicatore di caricamento di M3 Expressive (forme che si trasformano ruotando). */
export function loadingIndicator({ contained = false, size = '' } = {}) {
  return `<span class="loading-indicator ${contained ? 'contained' : ''} ${size}" role="progressbar" aria-label="Caricamento"><i></i></span>`;
}

export function loadingCard(text = 'Caricamento…') {
  return card(`<div class="loading">${loadingIndicator({ size: 'medium' })}<span>${esc(text)}</span></div>`);
}

export const spinner = () => loadingIndicator({ size: 'small' });

/** Riga "chiave: valore" per le schede di dettaglio. */
export function detailRow(label, value) {
  return `<div class="detail-row"><span>${esc(label)}</span><span>${esc(value)}</span></div>`;
}

const emptyShapes = ['cookie12Sided', 'clover4Leaf', 'softBurst', 'sunny', 'cookie7Sided', 'flower', 'puffy', 'gem'];

/** Equivalente di `ContentUnavailableView`: l'icona sta in una forma espressiva. */
export function emptyState(title, iconName, description = '', actions = '') {
  let hash = 0;
  for (const ch of title) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return `<div class="empty-state"><span class="empty-art shaped">${shape(emptyShapes[hash % emptyShapes.length])}${icon(iconName)}</span><h3>${esc(title)}</h3>${description ? `<p>${esc(description)}</p>` : ''}${actions ? `<div class="empty-actions">${actions}</div>` : ''}</div>`;
}

const buttonStyles = { glass: 'tonal', prominent: 'filled', destructive: 'danger', plain: 'text' };

/** Pulsante: `style` = filled, tonal, outlined, text, elevated, danger (accetta anche i vecchi nomi). */
export function button(label, { action, params = {}, iconName, style = 'tonal', cls = '', disabled = false, attrs = '' } = {}) {
  return `<button class="btn ${buttonStyles[style] ?? style} ${cls}" data-action="${action}"${data(params)}${disabled ? ' disabled' : ''}${attrs}>` +
    `${iconName ? icon(iconName) : ''}${label ? `<span>${esc(label)}</span>` : ''}</button>`;
}

export function iconButton(iconName, { action, params = {}, label, disabled = false, cls = '', attrs = '' } = {}) {
  return `<button class="icon-btn ${cls}" data-action="${action}"${data(params)} aria-label="${esc(label ?? '')}" title="${esc(label ?? '')}"${disabled ? ' disabled' : ''}${attrs}>${icon(iconName)}</button>`;
}

/** Vecchio nome di `iconButton` (pulsante tonale piccolo). */
export function circleButton(iconName, { action, params = {}, label, disabled = false, cls = '', attrs = '' } = {}) {
  return iconButton(iconName, { action, params, label, disabled, cls: `tonal ${cls}`, attrs });
}

/** Gruppo di pulsanti collegati (al posto del controllo segmentato). */
export function segmented(options, selected, action, { compact = false, icons = false } = {}) {
  return `<div class="segmented ${compact ? 'compact' : ''} ${icons ? 'icons' : ''}" role="tablist">${options.map(([value, label, iconName]) => {
    const isSelected = String(value) === String(selected);
    const content = icons && iconName ? icon(iconName) : `${isSelected && !compact ? icon('check') : ''}<span>${esc(label)}</span>`;
    return `<button role="tab" class="${isSelected ? 'selected' : ''}" aria-selected="${isSelected}" data-action="${action}" data-value="${esc(value)}"${icons ? ` aria-label="${esc(label)}" title="${esc(label)}"` : ''}>${content}</button>`;
  }).join('')}</div>`;
}

export function toggle(checked, action, { label = '', disabled = false } = {}) {
  return `<label class="switch"><input type="checkbox" role="switch" data-change="${action}"${checked ? ' checked' : ''}${disabled ? ' disabled' : ''} aria-label="${esc(label)}"><span></span></label>`;
}

export function stepper(value, { action, min, max, step, format = (v) => v }) {
  return `<span class="stepper">
    <button class="icon-btn small tonal" data-action="${action}" data-delta="${-step}" ${value <= min ? 'disabled' : ''} aria-label="Diminuisci">${icon('minus')}</button>
    <span class="numeral">${esc(format(value))}</span>
    <button class="icon-btn small tonal" data-action="${action}" data-delta="${step}" ${value >= max ? 'disabled' : ''} aria-label="Aumenta">${icon('plus')}</button></span>`;
}

/**
 * Scelta da un elenco: un pulsante che apre un menu. L'azione riceve un elemento con
 * `value` (come un `<select>`).
 */
export function select(options, selected, action, { label = '', params = {} } = {}) {
  const current = options.find(([value]) => String(value) === String(selected));
  const payload = esc(JSON.stringify(options.map(([value, text]) => [String(value), text])));
  return `<button class="select-btn" data-action="open-select" data-target="${action}" data-selected="${esc(selected)}" data-options="${payload}"${data(params)} aria-label="${esc(label)}" aria-haspopup="menu">
    <span>${esc(current?.[1] ?? '')}</span>${icon('chevronUpDown', { cls: 'small' })}</button>`;
}

/**
 * Ricerca dentro una singola pagina (Bacheca, Agenda, Materiale) su schermi larghi: nella
 * barra c'è già quella generale, quindi il campo sta nel contenuto.
 */
export function localSearchField(value, placeholder, action) {
  return `<label class="search-bar local-search">${icon('search')}<input type="search" value="${esc(value)}" placeholder="${esc(placeholder)}" data-input="${action}" autocomplete="off" aria-label="${esc(placeholder)}">` +
    `${value ? `<button class="icon-btn small" data-action="${action}" data-clear="1" aria-label="Cancella" title="Cancella">${icon('x')}</button>` : ''}</label>`;
}

/** Iniziali in una forma (biscotto, cerchio…), nel colore indicato. */
export function avatar(initials, { size = 64, color, cls = '', shapeName = 'circle' } = {}) {
  const tinted = color ? `tinted" style="--size:${size}px;--tint:${color}` : `" style="--size:${size}px`;
  return `<span class="avatar shaped ${cls} ${tinted}">${shape(shapeName)}<span>${esc(initials)}</span></span>`;
}

// MARK: - Giorni

/**
 * Pagina che cambia con la transizione ad asse condiviso X (giorni, schede): la nuova entra
 * dal lato del verso (`dir`), quella vecchia esce dall'altro (vedi `animateAxisExits` in app.js).
 */
export function axisPage(name, dir, key, content, { cls = '' } = {}) {
  const d = dir < 0 ? -1 : 1;
  return `<div class="axis ${cls}" data-axis="${name}" data-axis-dir="${d}"><div class="axis-page ${dir ? 'axis-in' : ''}" style="--dir:${d}" data-key="${esc(key)}">${content}</div></div>`;
}

/**
 * Il giorno in grande (Dashboard e Orario): "Domani" o il giorno della settimana, la data sotto,
 * a destra il pulsante per tornare al giorno predefinito e sotto i chip di stato.
 */
export function dayHero(day, { jump = null, chips = [] } = {}) {
  const relative = isTodayLike(day);
  const title = relative ? fmt.relativeDayName(day) : fmt.weekdayLong(day);
  const subtitle = relative ? fmt.longDay(day) : fmt.dayMonthYear(day);
  const button = jump ? `<button class="btn s tonal day-jump" data-action="${jump.action}" title="${esc(jump.help ?? jump.title)}">${icon('today')}<span>${esc(jump.title)}</span></button>` : '';
  return `<div class="day-hero"><div class="day-hero-row"><div class="day-hero-text"><h2>${esc(title)}</h2><p>${esc(subtitle)}</p></div>${button}</div>
    ${chips.length ? `<div class="chip-flow">${chips.join('')}</div>` : ''}</div>`;
}

function isTodayLike(day) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((new Date(day).setHours(0, 0, 0, 0) - today) / 86_400_000);
  return diff >= -1 && diff <= 1;
}
