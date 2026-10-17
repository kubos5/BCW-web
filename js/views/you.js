// "Tu": profilo centrato (come la pagina dell'account Google), statistiche collegate, ciò che
// aspetta l'utente e tutte le altre funzioni in liste segmentate. Le Impostazioni si aprono
// dall'ingranaggio in alto. Su schermi larghi le funzioni sono anche nella barra di navigazione.

import { avatar, statTile, iconBadge, pill, listGroup, listItem, gradeColorValue } from '../components.js';
import { icon } from '../icons.js';
import { logo } from '../logo.js';
import { esc, fmt, GradeFormat, nameCased } from '../util.js';
import { sections, sectionGroups, sectionSubtitle, sectionBadge } from './sections-meta.js';

export const you = {
  title: 'Tu',

  render(ctx) {
    const model = ctx.model;
    const footer = `<div class="page-footer">${logo()}<strong>Better ClasseViVa</strong>
      ${model.lastUpdated ? `<span>Aggiornato alle ${fmt.time(model.lastUpdated)}</span>` : ''}
      ${model.isDemo ? '<span>Modalità demo: i dati sono di esempio.</span>' : ''}</div>`;
    const groups = sectionGroups.slice(1).map((group) => listGroup(group.sections.map((key) => menuRow(ctx, key)), { header: group.title }));
    // Sugli schermi larghi l'ingranaggio è già nella barra in alto.
    const actions = ctx.wide ? [] : [{ icon: 'gear', label: 'Impostazioni', action: 'open-settings' }];

    if (ctx.wide) {
      // Profilo accanto alle statistiche se c'è spazio; le sezioni in due colonne.
      const side = ctx.mainWidth - 56 >= 820;
      return {
        title: 'Tu',
        actions,
        body: `<div class="you-wide stack gap-28">
          <div class="you-top ${side ? 'side' : ''}">${profileHero(ctx)}<div class="stack gap-20">${stats(ctx)}${attention(ctx)}</div></div>
          <div class="you-groups">${groups.join('')}</div>${footer}</div>`,
        bottomInset: true,
      };
    }
    return {
      title: 'Tu',
      actions,
      body: `<div class="stack gap-28">${profileHero(ctx)}${stats(ctx)}${attention(ctx)}${groups.join('')}${footer}</div>`,
      bottomInset: true,
      refresh: () => model.refreshAll(),
    };
  },

  actions: {
    'open-section': (ctx, el) => {
      if (ctx.wide && sections[el.dataset.section]) ctx.selectSection(el.dataset.section);
      else ctx.navigate(el.dataset.section);
    },
    'profile-spin': (ctx) => {
      const s = ctx.state('you', { turns: 0 });
      s.turns += 1;
      navigator.vibrate?.(6);
    },
  },
};

/**
 * Profilo in cima a Tu: l'avatar grande in un biscotto che ruota piano al tocco, nome e scuola
 * al centro, poi i pulsanti per l'account.
 */
export function profileHero(ctx) {
  const model = ctx.model;
  const card = model.card;
  const school = card?.schoolDescription
    ? [card.schoolDescription, card.schoolCity ? nameCased(card.schoolCity) : null].filter(Boolean).join(' · ') : '';
  const turns = ctx.state('you', { turns: 0 }).turns;
  const many = model.accounts.length > 1;
  return `<div class="profile-hero">
    <button class="profile-avatar" data-action="profile-spin" aria-hidden="true" tabindex="-1" style="--turn:${turns * 60}deg">${avatar(model.initials, { size: 112, shapeName: 'cookie12Sided' })}</button>
    <div class="profile-text"><h2>${esc(model.displayName)}</h2>${school ? `<p>${esc(school)}</p>` : ''}</div>
    <div class="profile-actions">
      <button class="btn tonal" data-action="navigate" data-to="account">${icon('manageAccounts')}<span>Gestisci account</span></button>
      <button class="btn outlined" data-action="account-switcher">${icon(many ? 'switchAccount' : 'userPlus')}<span>${many ? 'Cambia' : 'Aggiungi'}</span></button>
    </div></div>`;
}

/**
 * Media e frequenza in una griglia collegata (angoli ampi solo all'esterno, come le liste
 * segmentate). Assenze, ritardi e uscite aprono la pagina delle assenze.
 */
function stats(ctx) {
  const model = ctx.model;
  const count = (kinds) => model.absences.filter((a) => kinds.includes(a.kind)).length;
  const average = model.gradeBook.average();
  const link = { action: 'open-section', params: { section: 'absences' } };
  return `<div class="stat-grid connected">
    ${statTile('Media generale', GradeFormat.average(average), 'graduationCap', gradeColorValue(average), 'cookie9Sided', { corners: 'tl' })}
    ${statTile('Assenze', String(count(['absence'])), 'userX', 'var(--poor)', 'clover4Leaf', { corners: 'tr', ...link })}
    ${statTile('Ritardi', String(count(['late', 'shortLate'])), 'clock', 'var(--fair)', 'sunny', { corners: 'bl', ...link })}
    ${statTile('Uscite', String(count(['earlyExit'])), 'doorOpen', 'var(--neutral)', 'cookie6Sided', { corners: 'br', ...link })}</div>`;
}

/**
 * Ciò che aspetta l'utente (comunicazioni e note da leggere, assenze da giustificare), in
 * evidenza nel contenitore secondario. Non c'è se è tutto a posto.
 */
function attention(ctx) {
  const model = ctx.model;
  const notices = model.unreadNoticesCount;
  const notes = model.unreadNotesCount;
  const absences = model.unjustifiedAbsences.length;
  const row = (title, key, iconName, tint) => listItem({
    title, action: 'open-section', params: { section: key }, leading: iconBadge(iconName, tint, 40),
    trailing: icon('chevronRight', { cls: 'trailing-icon' }),
  });
  return listGroup([
    notices ? row(notices === 1 ? '1 comunicazione da leggere' : `${notices} comunicazioni da leggere`, 'noticeboard', 'megaphone', 'var(--primary)') : '',
    notes ? row(notes === 1 ? '1 nota da leggere' : `${notes} note da leggere`, 'notes', 'messageAlert', 'var(--poor)') : '',
    absences ? row(absences === 1 ? '1 assenza da giustificare' : `${absences} assenze da giustificare`, 'absences', 'userClock', 'var(--fair)') : '',
  ], { header: 'Da vedere', background: 'var(--secondary-container)', cls: 'attention' });
}

function menuRow(ctx, key) {
  const s = sections[key];
  const badge = sectionBadge(ctx.model, key);
  return listItem({
    title: s.title, subtitle: sectionSubtitle(ctx.model, key), action: 'open-section', params: { section: key },
    leading: iconBadge(s.icon, s.tint, 40),
    trailing: `${badge ? pill(String(badge), { filled: true, cls: 'count', color: 'var(--error)' }) : ''}${icon('chevronRight', { cls: 'trailing-icon' })}`,
  });
}
