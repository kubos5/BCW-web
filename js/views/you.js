// "Tu": profilo, statistiche e tutte le altre funzioni. Su schermi larghi le funzioni sono
// già nella barra laterale, quindi la pagina diventa un riepilogo a riquadri.

import { avatar, statTile, iconBadge, pill, eyebrow } from '../components.js';
import { icon } from '../icons.js';
import { esc, fmt, GradeFormat, nameCased } from '../util.js';
import { gradeColorValue } from '../components.js';
import { sections, extraRows, sectionGroups, sectionSubtitle, sectionBadge } from './sections-meta.js';

export const you = {
  title: 'Tu',

  render(ctx) {
    const model = ctx.model;
    const footer = `<div class="page-footer"><strong>BCW · Better ClasseViVa</strong>
      ${model.lastUpdated ? `<span>Aggiornato alle ${fmt.time(model.lastUpdated)}</span>` : ''}
      ${model.isDemo ? '<span>Modalità demo: i dati sono di esempio.</span>' : ''}</div>`;

    if (ctx.wide) {
      const groups = sectionGroups.slice(1).map((group) => `<div class="stack gap-10">${eyebrow(group.title)}
        <div class="tile-grid">${group.sections.map((key) => sectionTile(ctx, key)).join('')}</div></div>`).join('');
      return {
        title: 'Tu',
        // Profilo e statistiche affiancati se c'è spazio (alti uguali), altrimenti uno sotto l'altro.
        body: `<div class="stack gap-26"><div class="profile-stats ${ctx.mainWidth - 56 >= 380 + 14 + 520 ? 'side' : ''}">${profileCard(ctx)}${stats(ctx, true)}</div>${groups}${footer}</div>`,
        bottomInset: true,
      };
    }

    const menuSection = (title, keys) => `<div class="menu-section">${eyebrow(title)}<div class="menu-list">${keys.map((key) => menuRow(ctx, key)).join('')}</div></div>`;
    return {
      title: 'Tu',
      actions: [{ icon: model.accounts.length > 1 ? 'users' : 'userPlus', label: 'Cambia account', action: 'account-switcher' }],
      body: `<div class="stack gap-22">${profileCard(ctx)}${stats(ctx, false)}
        ${menuSection('Comunicazioni', ['noticeboard', 'notes'])}
        ${menuSection('Valutazioni', ['reports', 'previous'])}
        ${menuSection('Frequenza', ['absences'])}
        ${menuSection('Didattica', ['didactics', 'lessons', 'agenda', 'subjects', 'schoolbooks', 'calendar'])}
        ${menuSection('App', ['settings'])}
        ${footer}</div>`,
      bottomInset: true,
      refresh: () => model.refreshAll(),
    };
  },

  actions: {
    'open-section': (ctx, el) => {
      if (ctx.wide && sections[el.dataset.section]) ctx.selectSection(el.dataset.section);
      else ctx.navigate(el.dataset.section);
    },
    'account-switcher': (ctx, el) => {
      const model = ctx.model;
      const items = [{ section: 'Account' }];
      for (const account of model.accounts) {
        const active = !model.isDemo && account.id === model.activeAccountID;
        items.push({ label: account.name, subtitle: account.school ?? account.credentials.username, checked: active, disabled: active,
          run: () => model.switchAccount(account.id) });
      }
      if (model.isDemo) items.push({ label: 'Demo', checked: true, disabled: true });
      items.push({ divider: true }, { label: 'Aggiungi account', icon: 'userPlus', run: () => ctx.run('add-account') });
      ctx.openMenu(el, items);
    },
  },
};

export function profileCard(ctx) {
  const model = ctx.model;
  const card_ = model.card;
  const school = card_?.schoolDescription
    ? [card_.schoolDescription, card_.schoolCity ? nameCased(card_.schoolCity) : null].filter(Boolean).join(' · ') : '';
  // Solo nome e scuola: la classe è nella pagina Account.
  return `<button class="card profile-card" style="--pad:18px" data-action="navigate" data-to="account">
    ${avatar(model.initials, { size: 66, cls: 'gradient' })}
    <span class="grow"><strong>${esc(model.displayName)}</strong>${school ? `<small>${esc(school)}</small>` : ''}</span>
    ${icon('chevronRight', { cls: 'chev-right' })}</button>`;
}

function stats(ctx, row) {
  const model = ctx.model;
  const count = (kinds) => model.absences.filter((a) => kinds.includes(a.kind)).length;
  const average = model.gradeBook.average();
  const tiles = [
    statTile('Media', GradeFormat.average(average), 'graduationCap', gradeColorValue(average)),
    statTile('Assenze', String(count(['absence'])), 'userX', 'var(--poor)'),
    statTile('Ritardi', String(count(['late', 'shortLate'])), 'clock', 'var(--fair)'),
    statTile('Uscite', String(count(['earlyExit'])), 'doorOpen', 'var(--neutral)'),
  ];
  return `<div class="stat-grid ${row ? 'row' : ''}">${tiles.join('')}</div>`;
}

function menuRow(ctx, key) {
  const s = sections[key] ?? extraRows[key];
  const badge = sectionBadge(ctx.model, key);
  return `<button class="menu-row" data-action="open-section" data-section="${key}">
    ${iconBadge(s.icon, s.tint)}
    <span class="grow"><strong>${esc(s.title)}</strong><small>${esc(sectionSubtitle(ctx.model, key))}</small></span>
    ${badge ? pill(String(badge), { filled: true, cls: 'count' }) : ''}
    ${icon('chevronRight', { cls: 'chev-right' })}</button>`;
}

/** Riquadro di una sezione nella pagina "Tu" su schermi larghi. */
function sectionTile(ctx, key) {
  const s = sections[key];
  const badge = sectionBadge(ctx.model, key);
  return `<button class="card section-tile" style="--pad:14px;--tint:${s.tint}" data-action="open-section" data-section="${key}">
    ${iconBadge(s.icon, s.tint, 40)}
    <span class="grow"><strong>${esc(s.title)}</strong><small>${esc(sectionSubtitle(ctx.model, key))}</small></span>
    ${badge ? pill(String(badge), { filled: true, cls: 'count' }) : ''}
    ${icon('chevronRight', { cls: 'chev-right' })}</button>`;
}

