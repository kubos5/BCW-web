// Impostazioni (medie, promemoria, Dashboard, aspetto, blocco, dati, server) e pagina Account.

import { avatar, toggle, select, stepper, segmented } from '../components.js';
import { icon } from '../icons.js';
import { AverageMode } from '../gradebook.js';
import { AppearanceMode, DashboardMode, TitleAbbreviation } from '../prefs.js';
import { Reminders } from '../reminders.js';
import { Lock } from '../lock.js';
import { Proxy } from '../api.js';
import { makeICS, downloadFile } from '../calendar-export.js';
import { accountColorID, accountInitials } from '../store.js';
import { subjectColor } from '../components.js';
import { esc, fmt, GradeFormat, sentenceCased, nameCased, startOfDay } from '../util.js';
import { proxySheet } from './login.js';

const VERSION = '1.0';

// MARK: - Mattoni del modulo

function section(rows, { header, footer } = {}) {
  return `<section class="form-section">${header ? `<h3>${esc(header)}</h3>` : ''}<div class="form-rows">${rows.filter(Boolean).join('')}</div>${footer ? `<p class="form-footer">${esc(footer)}</p>` : ''}</section>`;
}

const row = (label, control = '', cls = '') => `<div class="form-row ${cls}"><span class="form-label">${esc(label)}</span>${control}</div>`;
const valueRow = (label, value) => row(label, `<span class="form-value">${esc(value)}</span>`, 'value-row');
const buttonRow = (label, action, iconName, { destructive = false, params = '' } = {}) =>
  `<button class="form-row form-button ${destructive ? 'destructive' : ''}" data-action="${action}"${params}>${icon(iconName)}<span>${esc(label)}</span></button>`;

// MARK: - Sezioni

function gradeSection(ctx) {
  const p = ctx.prefs;
  return section([
    row('Calcolo della media', select(Object.entries(AverageMode), p.averageMode, 'pref-average-mode', { label: 'Calcolo della media' })),
    row('Usa i pesi dei voti', toggle(p.weightedAverage, 'pref-weighted', { label: 'Usa i pesi dei voti' })),
    row('Media obiettivo', stepper(p.targetAverage, { action: 'goal-target', min: 4, max: 10, step: 0.25, format: GradeFormat.short })),
  ], { header: 'Voti', footer: 'I voti blu, annullati o "non fa media" sono sempre esclusi. I pesi sono quelli impostati dai docenti su Classeviva.' });
}

function notificationSection(ctx) {
  const p = ctx.prefs;
  const enabled = p.get('homeworkReminders');
  const hours = [];
  for (let h = 14; h <= 22; h++) hours.push([h, `${h}:00`]);
  return section([
    row('Promemoria compiti e verifiche', toggle(enabled, 'pref-reminders', { label: 'Promemoria compiti e verifiche', disabled: !Reminders.supported })),
    enabled ? row('Orario', select(hours, p.get('reminderHour'), 'pref-reminder-hour', { label: 'Orario' })) : '',
    buttonRow("Esporta l'agenda nel Calendario", 'export-agenda', 'calendarPlus'),
  ], {
    header: 'Notifiche',
    footer: Reminders.supported
      ? 'Ricevi una notifica la sera prima di ogni compito o verifica, mentre BCW è aperta (anche in secondo piano o installata come app). I compiti segnati come fatti vengono saltati. Per avvisi sempre affidabili esporta l\'agenda nel Calendario: ogni compito e verifica avrà un avviso all\'orario scelto.'
      : 'Questo browser non supporta le notifiche. Puoi esportare l\'agenda nel Calendario: ogni compito e verifica avrà un avviso la sera prima.',
  });
}

function dashboardSection(ctx) {
  const p = ctx.prefs;
  return section([
    row('Vista', select(Object.entries(DashboardMode).map(([k, v]) => [k, v.title]), p.dashboardMode, 'pref-dashboard-mode', { label: 'Vista' })),
    row('Mostra "Nei prossimi giorni"', toggle(p.showUpcomingDays, 'pref-upcoming', { label: 'Mostra i prossimi giorni' })),
    ctx.wide ? '' : row('Abbrevia il titolo', select(Object.entries(TitleAbbreviation), p.get('titleAbbreviation'), 'pref-abbreviation', { label: 'Abbrevia il titolo' })),
  ], {
    header: 'Dashboard',
    footer: ctx.wide
      ? 'La vista Calendario mostra il mese intero accanto al giorno scelto; la vista Lista la sola settimana.'
      : 'Il titolo abbreviato mostra la data in forma breve (es. "Gio 1 ott"). In automatico si abbrevia solo se il nome completo non entra.',
  });
}

function appearanceSection(ctx) {
  const p = ctx.prefs;
  const lockLabel = Lock.biometryAvailable ? `Blocca con ${Lock.name}` : 'Blocca con un codice';
  return section([
    row('Tema', select(Object.entries(AppearanceMode), p.get('appearance'), 'pref-appearance', { label: 'Tema' })),
    row(lockLabel, toggle(p.get('useLock') && !!Lock.method, 'pref-lock', { label: lockLabel })),
  ], { header: 'Aspetto e sicurezza', footer: 'BCW si blocca all\'apertura e quando torni dopo almeno 30 secondi in un\'altra app o scheda.' });
}

function dataSection() {
  return section([
    buttonRow('Aggiorna tutto', 'refresh-all', 'refresh'),
    buttonRow('Azzera compiti segnati come fatti', 'clear-completed', 'listUnchecked'),
  ], { header: 'Dati' });
}

function serverSection() {
  let host = Proxy.base;
  try { host = new URL(Proxy.base).host; } catch { /* relativo */ }
  return section([
    row('Proxy', `<span class="form-value">${esc(Proxy.isCustom ? host : 'Questo sito')}</span>`),
    buttonRow('Cambia server…', 'proxy-sheet', 'server'),
  ], { header: 'Server', footer: 'Il browser non può contattare direttamente Classeviva: le richieste passano da un piccolo proxy che le inoltra solo ai server di Spaggiari.' });
}

function aboutSection() {
  return section([
    valueRow('Versione', VERSION),
    `<a class="form-row form-button" href="https://web.spaggiari.eu" target="_blank" rel="noopener">${icon('compass')}<span>Apri Classeviva sul web</span></a>`,
  ], {
    header: 'Informazioni',
    footer: 'BCW (Better ClasseViVa) è un client non ufficiale e non è affiliato a Gruppo Spaggiari Parma S.p.A. Le credenziali sono salvate solo in questo browser e inviate esclusivamente ai server di Classeviva.',
  });
}

function accountsSection(ctx) {
  const model = ctx.model;
  const rows = model.accounts.map((account) => {
    const active = !model.isDemo && account.id === model.activeAccountID;
    return `<div class="form-row account-row">${accountRow(account, active)}
      ${active ? '' : `<button class="btn btn-glass small" data-action="account-switch" data-id="${esc(account.id)}">Usa</button>`}
      <button class="icon-button destructive" data-action="account-remove" data-id="${esc(account.id)}" aria-label="Rimuovi" title="Rimuovi l'account e le sue credenziali da questo browser">${icon('minusCircle')}</button></div>`;
  });
  if (!model.accounts.length) rows.push(row(model.isDemo ? 'Stai usando la modalità demo.' : 'Nessun account salvato.'));
  return section(rows, { header: 'Account salvati', footer: 'Le credenziali restano solo in questo browser.' }) +
    section([buttonRow('Aggiungi account…', 'add-account', 'userPlus')]);
}

// MARK: - Pagina Impostazioni

const panes = [['general', 'Generale'], ['grades', 'Voti'], ['dashboard', 'Dashboard'], ['notifications', 'Notifiche'], ['accounts', 'Account']];

export const settings = {
  title: 'Impostazioni',

  render(ctx) {
    if (ctx.wide) {
      // Come la finestra Impostazioni di macOS: le stesse sezioni, divise in schede.
      const s = ctx.state('settings', { pane: 'general' });
      let content;
      switch (s.pane) {
        case 'grades': content = gradeSection(ctx); break;
        case 'dashboard': content = dashboardSection(ctx); break;
        case 'notifications': content = notificationSection(ctx); break;
        case 'accounts': content = accountsSection(ctx); break;
        default: content = appearanceSection(ctx) + dataSection() + serverSection() + aboutSection();
      }
      return {
        title: 'Impostazioni',
        narrow: true,
        body: `<div class="settings-panes">${segmented(panes, s.pane, 'settings-pane', { compact: true })}</div><div class="form">${content}</div>`,
      };
    }
    return {
      title: 'Impostazioni',
      inline: false,
      body: `<div class="form">${gradeSection(ctx)}${notificationSection(ctx)}${dashboardSection(ctx)}${appearanceSection(ctx)}${dataSection()}${serverSection()}${aboutSection()}</div>`,
      bottomInset: true,
    };
  },

  actions: {
    'settings-pane': (ctx, el) => { ctx.state('settings', {}).pane = el.dataset.value; },
    'pref-average-mode': (ctx, el) => ctx.prefs.set('averageMode', el.value),
    'pref-weighted': (ctx, el) => ctx.prefs.set('weightedAverage', el.checked),
    'pref-dashboard-mode': (ctx, el) => ctx.prefs.set('dashboardMode', el.value),
    'pref-upcoming': (ctx, el) => ctx.prefs.set('showUpcomingDays', el.checked),
    'pref-abbreviation': (ctx, el) => ctx.prefs.set('titleAbbreviation', el.value),
    'pref-appearance': (ctx, el) => ctx.prefs.set('appearance', el.value),
    'pref-reminder-hour': (ctx, el) => {
      ctx.prefs.set('reminderHour', Number(el.value));
      ctx.model.rescheduleReminders();
    },
    'pref-reminders': async (ctx, el) => {
      if (el.checked) {
        const granted = await Reminders.requestAuthorization();
        if (!granted) {
          el.checked = false;
          ctx.prefs.set('homeworkReminders', false);
          ctx.confirm({
            title: 'Notifiche disattivate',
            message: 'Per ricevere i promemoria consenti le notifiche a questo sito nelle impostazioni del browser. Su iPhone e iPad le notifiche funzionano dopo aver aggiunto BCW alla schermata Home.',
            confirmLabel: 'OK', cancelLabel: 'Chiudi',
          });
          return;
        }
      }
      ctx.prefs.set('homeworkReminders', el.checked);
      ctx.model.rescheduleReminders();
    },
    'pref-lock': async (ctx, el) => {
      if (!el.checked) {
        Lock.disable();
        ctx.prefs.set('useLock', false);
        return;
      }
      if (Lock.biometryAvailable) {
        try {
          await Lock.enablePasskey();
          ctx.prefs.set('useLock', true);
          ctx.toast('Blocco attivato.');
        } catch (error) {
          el.checked = false;
          if (error.name !== 'NotAllowedError') ctx.toast(error.message, 'alertTriangle');
        }
        return;
      }
      el.checked = false;
      ctx.openSheet(pinSheet());
    },
    'pin-input': (ctx, el) => { ctx.state('pin', { first: '', second: '' })[el.dataset.field] = el.value; },
    'pin-save': async (ctx) => {
      const s = ctx.state('pin', { first: '', second: '' });
      if (!/^\d{4,}$/.test(s.first)) {
        ctx.toast('Il codice deve avere almeno 4 cifre.', 'alertTriangle');
        return;
      }
      if (s.first !== s.second) {
        ctx.toast('I due codici non coincidono.', 'alertTriangle');
        return;
      }
      await Lock.enablePin(s.first);
      ctx.app.viewState.delete('pin');
      ctx.prefs.set('useLock', true);
      ctx.closeSheet();
      ctx.toast('Blocco attivato.');
    },
    'clear-completed': (ctx) => {
      ctx.prefs.clearCompleted();
      ctx.model.rescheduleReminders();
      ctx.toast('Compiti azzerati.');
    },
    'export-agenda': (ctx) => {
      const today = startOfDay(new Date());
      const events = ctx.model.agenda.filter((e) => e.begin >= today);
      if (!events.length) {
        ctx.toast('Non ci sono compiti, verifiche o eventi in arrivo.', 'info');
        return;
      }
      downloadFile(makeICS(events, { reminderHour: ctx.prefs.get('reminderHour'), name: `BCW · ${ctx.model.displayName}` }), 'BCW-agenda.ics', 'text/calendar');
      ctx.toast(`${events.length} elementi esportati con gli avvisi alle ${ctx.prefs.get('reminderHour')}:00.`);
    },
    'account-switch': (ctx, el) => ctx.model.switchAccount(el.dataset.id),
    'account-remove': (ctx, el) => {
      const account = ctx.model.accounts.find((a) => a.id === el.dataset.id);
      if (!account) return;
      ctx.confirm({
        title: `Vuoi rimuovere ${account.name}?`,
        message: 'Le credenziali e i dati salvati di questo account verranno eliminati da questo browser.',
        confirmLabel: 'Rimuovi', destructive: true,
        onConfirm: () => ctx.model.removeAccount(account.id),
      });
    },
    'proxy-sheet': (ctx) => ctx.openSheet(proxySheet()),
  },
};

function pinSheet() {
  return {
    id: 'pin',
    render: (ctx) => {
      const s = ctx.state('pin', { first: '', second: '' });
      return {
        title: 'Codice di blocco',
        size: 'medium',
        trailing: '<button class="btn btn-prominent" data-action="pin-save">Attiva</button>',
        body: `<div class="stack gap-14 sheet-pad">
          <p class="body-text">Questo browser non ha uno sblocco biometrico disponibile: scegli un codice di almeno 4 cifre per bloccare BCW.</p>
          <input class="text-input" type="password" inputmode="numeric" autocomplete="new-password" placeholder="Codice" value="${esc(s.first)}" data-input="pin-input" data-field="first">
          <input class="text-input" type="password" inputmode="numeric" autocomplete="new-password" placeholder="Ripeti il codice" value="${esc(s.second)}" data-input="pin-input" data-field="second">
        </div>`,
      };
    },
  };
}

// MARK: - Account

export function accountRow(account, active) {
  return `<span class="account-line">${avatar(accountInitials(account), { size: 36, color: subjectColor(accountColorID(account)) })}
    <span class="grow"><strong>${esc(account.name)}</strong><small>${esc(account.school ?? account.credentials.username)}</small></span>
    ${active ? `<span class="active-check">${icon('check')}</span>` : ''}</span>`;
}

export const account = {
  title: 'Account',

  render(ctx) {
    const model = ctx.model;
    const card = model.card;
    const header = `<div class="account-header">${avatar(model.initials, { size: 88, cls: 'gradient' })}<h2>${esc(model.displayName)}</h2>
      ${model.classDescription ? `<p>${esc(sentenceCased(model.classDescription))}</p>` : ''}</div>`;
    const accounts = model.accounts.map((a) => {
      const active = !model.isDemo && a.id === model.activeAccountID;
      return `<div class="form-row account-row" data-context="account" data-id="${esc(a.id)}">
        <button class="account-switch" data-action="account-switch" data-id="${esc(a.id)}">${accountRow(a, active)}</button>
        <button class="icon-button destructive" data-action="account-remove" data-id="${esc(a.id)}" aria-label="Rimuovi" title="Rimuovi">${icon('trash')}</button></div>`;
    });
    accounts.push(buttonRow('Aggiungi account', 'add-account', 'userPlus'));
    let html = header + section(accounts, {
      header: 'Account',
      footer: model.accounts.length > 1
        ? 'Tocca un account per passare ad esso. Usa il cestino per rimuoverlo.'
        : "Puoi aggiungere altri account Classeviva (ad esempio quelli di fratelli o sorelle) e passare dall'uno all'altro.",
    });
    if (card) {
      html += section([
        valueRow('Codice utente', card.ident),
        valueRow('Tipo di account', card.userTypeDescription),
        card.birthDate ? valueRow('Data di nascita', fmt.shortDayWithYear(card.birthDate)) : '',
        card.fiscalCode?.trim() ? valueRow('Codice fiscale', card.fiscalCode) : '',
      ], { header: 'Profilo' });
      html += section([
        card.schoolDescription ? valueRow('Istituto', card.schoolDescription) : '',
        card.schoolCity?.trim() ? valueRow('Città', `${nameCased(card.schoolCity)}${card.schoolProvince ? ` (${card.schoolProvince})` : ''}`) : '',
        card.miurSchoolCode?.trim() ? valueRow('Codice meccanografico', card.miurSchoolCode) : '',
      ], { header: 'Scuola' });
    }
    const footer = model.isDemo ? 'Stai usando la modalità demo.'
      : model.accounts.length > 1
        ? 'Le credenziali di questo account verranno rimosse e passerai a un altro account salvato.'
        : 'Uscendo, le credenziali verranno rimosse da questo browser.';
    html += section([`<button class="form-row form-button accent" data-action="sign-out">${icon('logout')}<span>${model.isDemo ? 'Esci dalla demo' : 'Esci da questo account'}</span></button>`], { footer });
    return { title: 'Account', inline: true, narrow: true, body: `<div class="form">${html}</div>`, bottomInset: true };
  },
};
