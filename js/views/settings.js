// Impostazioni (Generale, Aspetto, Voti, Dashboard, Orario, Notifiche, Account) e pagina Account.
// Sugli schermi stretti sono un elenco di sottopagine, su quelli larghi elenco e dettaglio
// affiancati.

import { avatar, toggle, select, stepper, listGroup, listItem, iconBadge, spinner } from '../components.js';
import { icon } from '../icons.js';
import { AverageMode } from '../gradebook.js';
import { AppearanceMode, DashboardMode, NewsKind } from '../prefs.js';
import { Reminders } from '../reminders.js';
import { Lock } from '../lock.js';
import { AccentPresets, ColorStyle, Contrast, Corners, Motion, RoundedText, DEFAULT_ACCENT, normalizeHex, loadColorLibrary, swatchColors, Theme } from '../theme.js';
import { shape } from '../shapes.js';
import { Proxy } from '../api.js';
import { makeICS, downloadFile } from '../calendar-export.js';
import { accountColorID, accountInitials } from '../store.js';
import { subjectColor } from '../components.js';
import { readBackup, Alignment } from '../timetable.js';
import { requestAlignment } from './timetable.js';
import { esc, fmt, GradeFormat, sentenceCased, nameCased, startOfDay } from '../util.js';
import { proxySheet } from './login.js';
import { BCWServer } from '../cloud.js';

export const VERSION = '3.0';

// MARK: - Mattoni del modulo

const section = (rows, options = {}) => listGroup(rows, options);

function row(label, control = '', { iconName, subtitle, cls = '' } = {}) {
  return `<div class="list-item form-row ${cls}">${iconName ? `<span class="form-icon">${icon(iconName)}</span>` : ''}<span class="li-text"><strong>${esc(label)}</strong>${subtitle ? `<small>${esc(subtitle)}</small>` : ''}</span>${control}</div>`;
}

/** Riga con un interruttore: toccando la riga intera l'interruttore cambia. */
function toggleRow(label, checked, action, { iconName, subtitle, disabled = false, extra = '' } = {}) {
  return `<label class="list-item form-row toggle-row ${disabled ? 'disabled' : ''}">${iconName ? `<span class="form-icon">${icon(iconName)}</span>` : ''}<span class="li-text"><strong>${esc(label)}${extra}</strong>${subtitle ? `<small>${esc(subtitle)}</small>` : ''}</span>${toggle(checked, action, { label, disabled })}</label>`;
}

const valueRow = (label, value) => row(label, `<span class="form-value">${esc(value)}</span>`, { cls: 'value-row' });

function buttonRow(label, action, iconName, { destructive = false, disabled = false, params = {} } = {}) {
  return listItem({ title: label, action, params, cls: `form-button ${destructive ? 'danger' : ''}`, disabled, leading: `<span class="form-icon">${icon(iconName)}</span>` });
}

// MARK: - Sezioni

function securitySection(ctx) {
  const p = ctx.prefs;
  const lockLabel = Lock.biometryAvailable ? 'Blocca con passkey' : 'Blocca con un codice';
  return section([
    toggleRow(lockLabel, p.get('useLock') && !!Lock.method, 'pref-lock', { iconName: 'lock' }),
  ], { header: 'Sicurezza', footer: "BCW si blocca all'apertura e quando torni dopo almeno 30 secondi in un'altra app o scheda." });
}

/** Il tema scuro è attivo in questo momento? */
function isDark(ctx) {
  const mode = ctx.prefs.get('appearance');
  return mode === 'dark' || (mode === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
}

/** Campioni dei colori d'accento (come quelli di Android) e selettore per un colore qualsiasi. */
function accentPicker(ctx) {
  const p = ctx.prefs;
  const accent = normalizeHex(p.get('accentColor')) ?? DEFAULT_ACCENT;
  const lib = Theme.library;
  // La libreria dei colori serve per le anteprime: si carica una volta sola.
  if (!lib) ctx.task('color-library', () => loadColorLibrary().catch(() => {}));
  const dark = isDark(ctx);
  const preview = (hex) => {
    const [a, b, c] = lib ? swatchColors(lib, hex, p.get('colorStyle'), dark) : [hex, hex, hex];
    return `--c1:${a};--c2:${b};--c3:${c}`;
  };
  const isPreset = AccentPresets.some(([hex]) => hex === accent);
  const swatches = AccentPresets.map(([hex, name]) => {
    const selected = hex === accent;
    return `<button class="accent-swatch ${selected ? 'selected' : ''}" style="${preview(hex)}" data-action="pref-accent" data-value="${hex}" aria-label="${esc(name)}" aria-pressed="${selected}" title="${esc(name)}">
      <span class="accent-fill"></span>${selected ? `<span class="accent-check">${icon('check')}</span>` : ''}</button>`;
  }).join('');
  const custom = `<label class="accent-swatch custom ${isPreset ? '' : 'selected'}" style="${isPreset ? '' : preview(accent)}" title="Scegli un colore qualsiasi">
    <span class="accent-fill"></span><span class="accent-check">${icon(isPreset ? 'colorize' : 'check')}</span>
    <input type="color" value="${accent}" data-input="pref-accent-pick" data-change="pref-accent-pick" aria-label="Scegli un colore qualsiasi"></label>`;
  return `<div class="list-item accent-picker"><div class="accent-grid">${swatches}${custom}</div>
    <div class="accent-value"><span class="accent-dot" style="background:${accent}"></span><span class="numeral">${accent.toUpperCase()}</span>
    ${accent !== DEFAULT_ACCENT ? `<button class="btn xs text" data-action="pref-accent" data-value="${DEFAULT_ACCENT}">${icon('refresh')}<span>Colore di BCW</span></button>` : ''}</div></div>`;
}

/** Piccola anteprima dei componenti con i colori e le forme scelti. */
function themePreview() {
  return `<div class="list-item theme-preview" aria-hidden="true">
    <span class="tp-shape shaped">${shape('cookie9Sided')}<span>${icon('palette')}</span></span>
    <span class="tp-body"><strong>Anteprima</strong><small>Pulsanti, schede e forme</small>
      <span class="tp-row"><span class="btn xs filled">Primario</span><span class="btn xs tonal">Tonale</span><span class="tp-chip">Terziario</span></span></span>
    <span class="tp-tones"><i style="background:var(--primary)"></i><i style="background:var(--secondary-container)"></i><i style="background:var(--tertiary-container)"></i><i style="background:var(--surface-container-highest)"></i></span></div>`;
}

function appearancePane(ctx) {
  const p = ctx.prefs;
  return section([
    themePreview(),
    row('Tema', select(Object.entries(AppearanceMode), p.get('appearance'), 'pref-appearance', { label: 'Tema' }), { iconName: 'sun' }),
  ], { header: 'Tema' }) + section([
    accentPicker(ctx),
    row('Stile dei colori', select(Object.entries(ColorStyle).map(([k, v]) => [k, v.title]), p.get('colorStyle'), 'pref-color-style', { label: 'Stile dei colori' }),
      { iconName: 'colorStyle', subtitle: ColorStyle[p.get('colorStyle')]?.subtitle }),
    row('Contrasto', select(Object.entries(Contrast), p.get('contrast'), 'pref-contrast', { label: 'Contrasto' }), { iconName: 'contrast' }),
  ], {
    header: "Colore d'accento",
    footer: 'Tutti i colori di BCW (pulsanti, superfici, schede) sono generati dal colore scelto con i colori dinamici di Material 3, nel tema chiaro e in quello scuro. I colori di materie, voti e assenze non cambiano.',
  }) + section([
    row('Angoli', select(Object.entries(Corners), p.get('corners'), 'pref-corners', { label: 'Angoli' }), { iconName: 'corners' }),
    row('Animazioni', select(Object.entries(Motion), p.get('motion'), 'pref-motion', { label: 'Animazioni' }), { iconName: 'motion' }),
    row('Caratteri arrotondati', select(Object.entries(RoundedText), p.get('roundedText'), 'pref-rounded-text', { label: 'Caratteri arrotondati' }), { iconName: 'textStyle' }),
    p.isDefaultAppearance ? '' : buttonRow("Ripristina l'aspetto di BCW", 'appearance-reset', 'refresh'),
  ], {
    header: 'Forme e movimento',
    footer: 'Espressive: animazioni a molla con un piccolo rimbalzo, come in Material 3 Expressive. Standard: senza rimbalzo. Ridotte: brevi e senza movimenti ampi. I caratteri arrotondati usano l\'asse ROND di Google Sans Flex.',
  });
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
    row('Proxy', `<span class="form-value">${esc(Proxy.isCustom ? host : (Proxy.defaultFromConfig ? `${host} (predefinito)` : 'Questo sito'))}</span>`, { iconName: 'server', cls: 'value-row' }),
    buttonRow('Cambia server…', 'proxy-sheet', 'edit'),
  ], { header: 'Server', footer: 'Il browser non può contattare direttamente Classeviva: le richieste passano da un piccolo proxy che le inoltra solo ai server di Spaggiari.' });
}

function aboutSection(ctx) {
  return section([
    valueRow('Versione', VERSION),
    listItem({ title: 'Apri Classeviva sul web', href: 'https://web.spaggiari.eu', leading: `<span class="form-icon">${icon('compass')}</span>`, trailing: icon('externalLink', { cls: 'small trailing-icon' }) }),
  ], {
    header: 'Informazioni',
    footer: ctx.model.isCloud
      ? 'BCW (Better ClasseViVa) è un client non ufficiale e non è affiliato a Gruppo Spaggiari Parma S.p.A. Le credenziali degli account abbinati sono salvate cifrate nel tuo account BCW e inviate ai server di Classeviva per accedere.'
      : 'BCW (Better ClasseViVa) è un client non ufficiale e non è affiliato a Gruppo Spaggiari Parma S.p.A. Le credenziali sono salvate solo in questo browser e inviate esclusivamente ai server di Classeviva.',
  });
}

function generalPane(ctx) {
  return securitySection(ctx) + dataSection() + serverSection() + aboutSection(ctx);
}

function gradesPane(ctx) {
  const p = ctx.prefs;
  return section([
    row('Calcolo della media', select(Object.entries(AverageMode), p.averageMode, 'pref-average-mode', { label: 'Calcolo della media' })),
    toggleRow('Usa i pesi dei voti', p.weightedAverage, 'pref-weighted'),
    row('Media obiettivo', stepper(p.targetAverage, { action: 'goal-target', min: 4, max: 10, step: 0.25, format: GradeFormat.short })),
  ], { header: 'Voti', footer: 'I voti blu, annullati o "non fa media" sono sempre esclusi. I pesi sono quelli impostati dai docenti su Classeviva.' });
}

function dashboardPane(ctx) {
  const p = ctx.prefs;
  return section([
    row('Vista', select(Object.entries(DashboardMode).map(([k, v]) => [k, v.title]), p.dashboardMode, 'pref-dashboard-mode', { label: 'Vista' })),
    toggleRow('Mostra "Nei prossimi giorni"', p.showUpcomingDays, 'pref-upcoming'),
  ], {
    header: 'Dashboard',
    footer: 'La vista Lista mostra in alto la settimana, la vista Calendario il mese intero. "Nei prossimi giorni" sui telefoni c\'è nella vista Lista.',
  });
}

function timetablePane(ctx) {
  const store = ctx.model.timetable;
  const p = ctx.prefs;
  const hasOwner = store.owner != null;
  return section([
    row('Allineamento', select(Object.values(Alignment).map((a) => [a.id, a.shortTitle]), store.alignment, 'tt-alignment', { label: 'Allineamento' }), { iconName: Alignment[store.alignment].icon }),
    toggleRow('Mostra le verifiche nella lista', p.timetableShowsTests, 'pref-tt-tests', { iconName: 'test' }),
  ], {
    header: 'Vista e allineamento',
    footer: 'Con "Mostra le verifiche" la vista Lista segna le verifiche di Classeviva e quelle segnate a mano; si vedono sempre nel dettaglio dell\'evento e nella vista Giorno. Quelle nascoste, e le regole per nasconderle in automatico, sono in Verifiche nascoste (menu dell\'orario). L\'allineamento vale per tutto l\'orario e per la modalità di modifica (pulsante + dell\'orario › Modifica orario). Automatico: gli eventi iniziano all\'ora o alla mezz\'ora e durano 30 minuti o un\'ora; passando all\'automatico gli eventi non allineati vengono allineati, dopo una conferma. Libero: qualsiasi orario e durata. Gli intervalli si posizionano sempre liberamente.',
  }) + section([
    buttonRow("Esporta un backup dell'orario", 'tt-export', 'upload', { disabled: !hasOwner }),
    buttonRow('Importa un backup…', 'tt-import', 'download', { disabled: !hasOwner }),
    buttonRow("Elimina l'orario", 'tt-delete-all', 'trash', { destructive: true, disabled: store.isEmpty }),
  ], {
    header: "Backup dell'orario",
    footer: `${ctx.model.isCloud ? "L'orario di ogni account abbinato si sincronizza con il tuo account BCW." : "L'orario è salvato solo in questo browser, separato per ogni account."} Il backup contiene eventi, colori, palette, note, verifiche segnate e file allegati; importandolo sostituisce l'orario attuale. È compatibile con l'app BCW per iPhone e iPad.`,
  }) + `<input type="file" id="tt-import-input" accept=".json,application/json" hidden data-change="tt-import-file">` + timetableSyncSection(ctx);
}

function timetableSyncSection(ctx) {
  const model = ctx.model;
  if (!model.isCloud) {
    return section([
      buttonRow('Accedi con un account BCW…', 'cloud-login', 'cloud'),
    ], {
      header: 'Sincronizzazione',
      footer: "Con un account BCW l'orario di ogni account Classeviva abbinato, con i file allegati, si sincronizza tra i tuoi dispositivi (app per iPhone e iPad compresa).",
    });
  }
  return section([
    row('Sincronizzazione', `<span class="form-value">${esc(syncStatus(model.sync))}</span>`, { iconName: 'cloud', cls: 'value-row', subtitle: model.sync.fileWarning ?? undefined }),
    buttonRow('Sincronizza ora', 'cloud-sync-now', 'refresh', { disabled: model.sync.status === 'syncing' || model.isDemo }),
  ], {
    header: 'Sincronizzazione',
    footer: model.isDemo
      ? "L'orario della demo non si sincronizza."
      : `L'orario di questo account, con i file allegati, si sincronizza con l'account BCW ${model.cloudUser?.username ?? ''}.`,
  });
}

/** Stato della sincronizzazione in poche parole. */
function syncStatus(sync) {
  switch (sync.status) {
    case 'syncing': return 'In corso…';
    case 'ok': return sync.lastSync ? `Aggiornata alle ${fmt.time(sync.lastSync)}` : 'Aggiornata';
    case 'offline': return 'Offline';
    case 'error': return 'Non riuscita';
    default: return 'Attiva';
  }
}

function notificationsPane(ctx) {
  const p = ctx.prefs;
  const enabled = p.get('homeworkReminders');
  const hours = [];
  for (let h = 14; h <= 22; h++) hours.push([h, `${h}:00`]);
  return section([
    toggleRow('Promemoria compiti e verifiche', enabled, 'pref-reminders', { iconName: 'bell', disabled: !Reminders.supported }),
    enabled ? row('Orario', select(hours, p.get('reminderHour'), 'pref-reminder-hour', { label: 'Orario' }), { iconName: 'clock' }) : '',
    buttonRow("Esporta l'agenda nel Calendario", 'export-agenda', 'calendarPlus'),
  ], {
    header: 'Promemoria',
    footer: Reminders.supported
      ? 'Ricevi una notifica la sera prima di ogni compito o verifica, mentre BCW è aperta (anche in secondo piano o installata come app). I compiti segnati come fatti vengono saltati. Per avvisi sempre affidabili esporta l\'agenda nel Calendario: ogni compito e verifica avrà un avviso all\'orario scelto.'
      : 'Questo browser non supporta le notifiche. Puoi esportare l\'agenda nel Calendario: ogni compito e verifica avrà un avviso la sera prima.',
  }) + section(Object.values(NewsKind).map((kind) => toggleRow(kind.title, p.newsEnabled(kind.id), 'pref-news', { iconName: kind.icon, disabled: !Reminders.supported }).replace('data-change="pref-news"', `data-change="pref-news" data-kind="${kind.id}"`)), {
    header: 'Novità',
    footer: 'Una notifica per ogni novità trovata aggiornando i dati mentre BCW è aperta (anche in secondo piano o installata come app).',
  });
}

/** Righe degli account salvati: tocco = passa a quell'account; il cestino lo rimuove. */
export function accountsSection(ctx, { showsHeader = true } = {}) {
  const model = ctx.model;
  const cloud = model.isCloud;
  const removeLabel = cloud ? 'Scollega' : 'Rimuovi';
  const removeTitle = cloud ? "Scollega l'account dal tuo account BCW" : "Rimuovi l'account e le sue credenziali da questo browser";
  const rows = model.accounts.map((a) => {
    const active = !model.isDemo && a.id === model.activeAccountID;
    return `<div class="account-row" data-context="account" data-id="${esc(a.id)}">
      ${listItem({
    title: a.name, subtitle: a.school ?? a.credentials.username, action: 'account-switch', params: { id: a.id }, cls: active ? 'selected' : '',
    leading: avatar(accountInitials(a), { size: 40, color: subjectColor(accountColorID(a)), shapeName: 'cookie9Sided' }),
    trailing: active ? `<span class="active-check">${icon('check')}</span>` : '',
  })}<button class="icon-btn account-remove" data-action="account-remove" data-id="${esc(a.id)}" aria-label="${removeLabel}" title="${removeTitle}">${icon(cloud ? 'minusCircle' : 'trash')}</button></div>`;
  });
  rows.push(buttonRow(cloud ? 'Abbina un account Classeviva' : 'Aggiungi account', 'add-account', 'userPlus'));
  if (!model.isDemo) rows.push(buttonRow('Prova la demo', 'start-demo', 'sparkles'));
  const tap = ctx.wide ? 'Fai clic su un account per passare ad esso.' : 'Tocca un account per passare ad esso.';
  let footer;
  if (cloud) {
    footer = `Gli account Classeviva abbinati all'account BCW ${model.cloudUser?.username ?? ''}: li ritrovi accedendo con l'account BCW su qualsiasi dispositivo.${model.accounts.length > 1 ? ` ${tap}` : ''}`;
  } else {
    footer = model.accounts.length > 1
      ? `${tap} Usa il cestino per rimuoverlo.`
      : "Puoi aggiungere altri account Classeviva (ad esempio quelli di fratelli o sorelle) e passare dall'uno all'altro.";
  }
  return section(rows, { header: showsHeader ? (cloud ? 'Account Classeviva abbinati' : 'Account') : null, footer });
}

/**
 * Account BCW: chi ha effettuato l'accesso, la sincronizzazione e le azioni sull'account;
 * con gli account del browser, l'invito ad accedere o a crearne uno.
 */
export function cloudSection(ctx) {
  const model = ctx.model;
  const serverRow = listItem({
    title: 'Server BCW', subtitle: BCWServer.isConfigured ? BCWServer.host : 'Non impostato', action: 'cloud-server-sheet',
    leading: `<span class="form-icon">${icon('server')}</span>`, trailing: icon('chevronRight', { cls: 'trailing-icon' }), cls: 'form-button',
  });
  if (!model.isCloud) {
    return section([
      buttonRow('Accedi con un account BCW', 'cloud-login', 'cloud'),
      buttonRow('Crea un account BCW', 'cloud-register', 'userPlus'),
      serverRow,
    ], {
      header: 'Account BCW',
      footer: "Con un account BCW abbini i tuoi account Classeviva e ritrovi impostazioni, aspetto e orario su ogni dispositivo, anche nell'app per iPhone e iPad. Dopo l'accesso potrai abbinare gli account salvati in questo browser.",
    });
  }
  const sync = model.sync;
  const user = model.cloudUser;
  return section([
    listItem({
      title: user?.username ?? '', subtitle: 'Account BCW',
      leading: avatar((user?.username ?? '?').charAt(0).toUpperCase(), { size: 40, color: 'var(--primary)', shapeName: 'cookie9Sided' }),
    }),
    row('Sincronizzazione', `<span class="form-value">${sync.status === 'syncing' ? spinner() : ''}${esc(syncStatus(sync))}</span>`, {
      iconName: 'cloud', cls: 'value-row', subtitle: (sync.status === 'error' || sync.status === 'offline' ? sync.message : sync.fileWarning) ?? undefined,
    }),
    buttonRow('Sincronizza ora', 'cloud-sync-now', 'refresh', { disabled: sync.status === 'syncing' }),
    buttonRow('Cambia password…', 'cloud-password', 'key'),
    serverRow,
    buttonRow('Esci da BCW', 'cloud-sign-out', 'logout', { destructive: true }),
    buttonRow("Elimina l'account BCW…", 'cloud-delete', 'trash', { destructive: true }),
  ], {
    header: 'Account BCW',
    footer: "Si sincronizzano le impostazioni (tranne blocco, promemoria e notifiche, che valgono solo in questo browser), l'aspetto e l'orario di ogni account abbinato, con i file allegati.",
  });
}

/**
 * Account BCW a cui è abbinato il profilo Classeviva attivo, con lo scollegamento: funziona
 * anche entrando con l'account Classeviva, senza conoscere la password di quegli account BCW.
 * Senza account BCW l'elenco si carica solo a richiesta, perché il server BCW riceve il token
 * della sessione di Classeviva per verificare l'accesso.
 */
export function linksSection(ctx) {
  const model = ctx.model;
  if (model.isDemo || !model.client || !model.activeAccountID || !BCWServer.isConfigured) return '';
  const s = ctx.state(`cvv-links-${model.activeAccountID}`, { links: null, error: null, round: 0, requested: false });
  const name = model.activeAccount?.name ?? 'questo account Classeviva';
  if (!model.isCloud && !s.requested) {
    return section([buttonRow('Mostra gli account BCW abbinati', 'cvv-links-show', 'cloud')], {
      header: 'Account BCW abbinati',
      footer: `Puoi vedere a quali account BCW è abbinato ${name} e scollegarlo da ognuno. Per verificare l'accesso, il server BCW riceve il token della sessione di Classeviva (non la password).`,
    });
  }
  ctx.task(`cvv-links-${model.activeAccountID}-${s.round}`, async () => {
    try {
      s.links = await model.classevivaLinks();
      s.error = null;
    } catch (error) {
      s.error = error.message;
    }
  });
  const rows = [];
  if (s.error) {
    rows.push(row('Elenco non disponibile', '', { iconName: 'alertTriangle', subtitle: s.error }));
    rows.push(buttonRow('Riprova', 'cvv-links-reload', 'refresh'));
  } else if (!s.links) {
    rows.push(row('Caricamento…', spinner(), { iconName: 'cloud' }));
  } else if (!s.links.length) {
    rows.push(row('Nessun account BCW', '', { iconName: 'cloud', subtitle: 'Questo account Classeviva non è abbinato a nessun account BCW.' }));
  } else {
    for (const link of s.links) {
      const mine = model.isCloud && link.id === model.activeAccountID;
      rows.push(`<div class="account-row">${listItem({
        title: link.username,
        subtitle: `Abbinato il ${fmt.shortDayWithYear(new Date(link.linkedAt))}${mine ? ' · questo account BCW' : ''}`,
        leading: iconBadge('cloud', mine ? 'var(--primary)' : 'var(--secondary)', 40),
      })}<button class="icon-btn account-remove" data-action="cvv-link-remove" data-id="${esc(link.id)}" data-name="${esc(link.username)}" aria-label="Scollega" title="Scollega da questo account BCW">${icon('minusCircle')}</button></div>`);
    }
    if (s.links.length > 1) rows.push(buttonRow('Scollega da tutti', 'cvv-link-remove-all', 'trash', { destructive: true }));
  }
  return section(rows, {
    header: 'Account BCW abbinati',
    footer: `Gli account BCW con cui si entra in ${model.activeAccount?.name ?? 'questo account Classeviva'}. Scollegandolo da uno, quell'account BCW non potrà più entrarci e l'orario sincronizzato per questo account viene eliminato dal server. Per toglierli basta l'accesso a Classeviva.`,
  });
}

function accountsPane(ctx) {
  const model = ctx.model;
  return accountsSection(ctx) + linksSection(ctx) + cloudSection(ctx) + (model.isDemo ? section([row(model.demoExitMessage)]) : '');
}

// MARK: - Pagina Impostazioni

const panes = {
  general: { title: 'Generale', icon: 'gear', tint: 'var(--on-surface-variant)', render: generalPane },
  appearance: { title: 'Aspetto', icon: 'palette', tint: 'var(--tertiary)', render: appearancePane },
  grades: { title: 'Voti', icon: 'graduationCap', tint: 'var(--subject-1)', render: gradesPane },
  dashboard: { title: 'Dashboard', icon: 'dashboard', tint: 'var(--primary)', render: dashboardPane },
  timetable: { title: 'Orario', icon: 'timetable', tint: 'var(--subject-3)', render: timetablePane },
  notifications: { title: 'Notifiche', icon: 'bellActive', tint: 'var(--fair)', render: notificationsPane },
  accounts: { title: 'Account', icon: 'users', tint: 'var(--subject-5)', render: accountsPane },
};

export const settings = {
  title: 'Impostazioni',

  render(ctx) {
    const param = ctx.route.param;
    if (ctx.wide) {
      const s = ctx.state('settings', { pane: 'general' });
      if (param && panes[param] && s.routedPane !== param) {
        s.pane = param;
        s.routedPane = param;
      }
      const pane = panes[s.pane] ?? panes.general;
      // Elenco e dettaglio affiancati (layout elenco-dettaglio di Material 3).
      const list = listGroup(Object.entries(panes).map(([key, p]) => listItem({
        title: p.title, action: 'settings-pane', params: { value: key }, cls: key === s.pane ? 'selected' : '', leading: iconBadge(p.icon, p.tint, 40),
      })));
      return {
        title: 'Impostazioni',
        split: { sideWidth: 320, side: list, main: `<div class="form readable" data-key="pane-${s.pane}">${pane.render(ctx)}</div>` },
      };
    }
    if (param && panes[param]) {
      return { title: panes[param].title, body: `<div class="form">${panes[param].render(ctx)}</div>`, bottomInset: true };
    }
    // Su schermi stretti: elenco delle sottopagine.
    const nav = (key) => {
      const p = panes[key];
      return listItem({ title: p.title, action: key === 'accounts' ? 'navigate' : 'settings-open', params: key === 'accounts' ? { to: 'account' } : { pane: key },
        leading: iconBadge(p.icon, p.tint, 40), trailing: icon('chevronRight', { cls: 'trailing-icon' }) });
    };
    return {
      title: 'Impostazioni',
      body: `<div class="form">${section([nav('general'), nav('appearance')])}${section(['grades', 'dashboard', 'timetable', 'notifications'].map(nav))}${section([nav('accounts')])}</div>`,
      bottomInset: true,
    };
  },

  actions: {
    'settings-pane': (ctx, el) => { ctx.state('settings', {}).pane = el.dataset.value; },
    'settings-open': (ctx, el) => ctx.navigate(`settings/${el.dataset.pane}`),
    'pref-average-mode': (ctx, el) => ctx.prefs.set('averageMode', el.value),
    'pref-weighted': (ctx, el) => ctx.prefs.set('weightedAverage', el.checked),
    'pref-dashboard-mode': (ctx, el) => ctx.prefs.set('dashboardMode', el.value),
    'pref-upcoming': (ctx, el) => ctx.prefs.set('showUpcomingDays', el.checked),
    'pref-appearance': (ctx, el) => ctx.prefs.set('appearance', el.value),
    'pref-accent': (ctx, el) => ctx.prefs.set('accentColor', el.dataset.value),
    'pref-accent-pick': (ctx, el) => {
      const value = normalizeHex(el.value);
      if (value) ctx.prefs.set('accentColor', value);
    },
    'pref-color-style': (ctx, el) => ctx.prefs.set('colorStyle', el.value),
    'pref-contrast': (ctx, el) => ctx.prefs.set('contrast', el.value),
    'pref-corners': (ctx, el) => ctx.prefs.set('corners', el.value),
    'pref-motion': (ctx, el) => ctx.prefs.set('motion', el.value),
    'pref-rounded-text': (ctx, el) => ctx.prefs.set('roundedText', el.value),
    'appearance-reset': (ctx) => ctx.prefs.resetAppearance(),
    'pref-tt-tests': (ctx, el) => ctx.prefs.set('timetableShowsTests', el.checked),
    'tt-alignment': (ctx, el) => requestAlignment(ctx, el.value),
    'pref-reminder-hour': (ctx, el) => {
      ctx.prefs.set('reminderHour', Number(el.value));
      ctx.model.rescheduleReminders();
    },
    'pref-reminders': async (ctx, el) => {
      if (el.checked && !(await askPermission(ctx))) {
        el.checked = false;
        ctx.prefs.set('homeworkReminders', false);
        return;
      }
      ctx.prefs.set('homeworkReminders', el.checked);
      ctx.model.rescheduleReminders();
    },
    'pref-news': async (ctx, el) => {
      const kind = el.dataset.kind;
      if (el.checked) {
        ctx.prefs.setNews(kind, true);
        if (!(await askPermission(ctx))) {
          el.checked = false;
          ctx.prefs.setNews(kind, false);
        }
        return;
      }
      ctx.prefs.setNews(kind, false);
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
      ctx.toast(`${events.length === 1 ? '1 elemento esportato' : `${events.length} elementi esportati`} con gli avvisi alle ${ctx.prefs.get('reminderHour')}:00.`);
    },
    'account-switch': (ctx, el) => {
      if (ctx.app.sheet?.id === 'account-switcher') ctx.closeSheet();
      ctx.model.switchAccount(el.dataset.id);
    },
    'account-remove': (ctx, el) => {
      const account = ctx.model.accounts.find((a) => a.id === el.dataset.id);
      if (!account) return;
      if (ctx.model.isCloud) {
        ctx.confirm({
          title: `Scollegare ${account.name}?`,
          message: `${account.name} non sarà più disponibile con l'account BCW ${ctx.model.cloudUser?.username ?? ''}, su nessun dispositivo, e il suo orario verrà eliminato dal server. Il registro su Classeviva non cambia.`,
          confirmLabel: 'Scollega', destructive: true,
          onConfirm: async () => {
            try {
              await ctx.model.unlinkAccount(account.id);
              ctx.toast('Account scollegato.');
            } catch (error) {
              ctx.toast(error.message, 'alertTriangle');
            }
          },
        });
        return;
      }
      ctx.confirm({
        title: `Vuoi rimuovere ${account.name}?`,
        message: 'Le credenziali e i dati salvati di questo account verranno eliminati da questo browser.',
        confirmLabel: 'Rimuovi', destructive: true,
        onConfirm: () => ctx.model.removeAccount(account.id),
      });
    },
    'proxy-sheet': (ctx) => ctx.openSheet(proxySheet()),

    // Account BCW.
    'cloud-sync-now': async (ctx) => {
      const model = ctx.model;
      await model.sync.flush();
      await model.refreshCloud({ force: true });
      if (model.sync.status === 'ok') ctx.toast('Sincronizzazione completata.');
      else if (model.sync.message) ctx.toast(model.sync.message, 'alertTriangle');
    },
    'cloud-password': (ctx) => ctx.openSheet(cloudPasswordSheet()),
    'cloud-password-input': (ctx, el) => { ctx.state('cloud-password', {})[el.dataset.field] = el.value; },
    'cloud-password-save': async (ctx) => {
      const s = ctx.state('cloud-password', {});
      if ((s.next ?? '').length < 8) {
        s.error = 'La nuova password deve avere almeno 8 caratteri.';
        return;
      }
      if (s.next !== s.confirm) {
        s.error = 'Le due password nuove non coincidono.';
        return;
      }
      s.loading = true;
      s.error = null;
      ctx.update();
      try {
        await ctx.model.changeCloudPassword(s.current ?? '', s.next);
        ctx.app.viewState.delete('cloud-password');
        ctx.closeSheet();
        ctx.toast("Password cambiata. Sugli altri dispositivi va rifatto l'accesso.");
      } catch (error) {
        s.error = error.message;
      } finally {
        s.loading = false;
        ctx.update();
      }
    },
    'cloud-delete': (ctx) => ctx.openSheet(cloudDeleteSheet()),
    'cloud-delete-input': (ctx, el) => { ctx.state('cloud-delete', {}).password = el.value; },
    'cloud-delete-confirm': (ctx) => {
      const s = ctx.state('cloud-delete', {});
      if (!s.password) {
        s.error = "Inserisci la password dell'account BCW.";
        return;
      }
      ctx.confirm({
        title: `Eliminare l'account BCW ${ctx.model.cloudUser?.username ?? ''}?`,
        message: "L'account BCW, gli abbinamenti con gli account Classeviva, le impostazioni sincronizzate e gli orari salvati sul server verranno eliminati definitivamente. Gli account Classeviva non cambiano.",
        confirmLabel: 'Elimina', destructive: true,
        onConfirm: async () => {
          s.loading = true;
          s.error = null;
          ctx.update();
          try {
            await ctx.model.deleteCloudAccount(s.password);
            ctx.app.viewState.delete('cloud-delete');
            ctx.closeSheet();
            ctx.toast('Account BCW eliminato.');
          } catch (error) {
            s.error = error.message;
          } finally {
            s.loading = false;
            ctx.update();
          }
        },
      });
    },
    'cvv-links-show': (ctx) => {
      ctx.state(`cvv-links-${ctx.model.activeAccountID}`, { links: null, error: null, round: 0, requested: false }).requested = true;
    },
    'cvv-links-reload': (ctx) => {
      const s = ctx.state(`cvv-links-${ctx.model.activeAccountID}`, { links: null, error: null, round: 0 });
      s.error = null;
      s.links = null;
      s.round += 1;
    },
    'cvv-link-remove': (ctx, el) => {
      const { id, name } = el.dataset;
      const model = ctx.model;
      const mine = model.isCloud && id === model.activeAccountID;
      ctx.confirm({
        title: `Scollegare da ${name}?`,
        message: mine
          ? `È l'account BCW con cui hai effettuato l'accesso: ${model.activeAccount?.name ?? 'questo account'} non sarà più disponibile con esso e il suo orario verrà eliminato dal server.`
          : `L'account BCW ${name} non potrà più entrare in ${model.activeAccount?.name ?? 'questo account Classeviva'} e l'orario che ha sincronizzato per questo account verrà eliminato dal server.`,
        confirmLabel: 'Scollega', destructive: true,
        onConfirm: () => removeLinks(ctx, id),
      });
    },
    'cvv-link-remove-all': (ctx) => {
      const model = ctx.model;
      ctx.confirm({
        title: 'Scollegare da tutti gli account BCW?',
        message: `Nessun account BCW potrà più entrare in ${model.activeAccount?.name ?? 'questo account Classeviva'}${model.isCloud ? ", compreso quello con cui hai effettuato l'accesso" : ''}. Gli orari sincronizzati per questo account verranno eliminati dal server.`,
        confirmLabel: 'Scollega da tutti', destructive: true,
        onConfirm: () => removeLinks(ctx, null),
      });
    },

    // Backup dell'orario.
    'tt-export': async (ctx) => {
      try {
        const text = await ctx.model.timetable.makeBackup(VERSION);
        const date = new Date();
        const name = `Orario BCW ${String(date.getDate()).padStart(2, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${date.getFullYear()}.json`;
        downloadFile(text, name, 'application/json');
        ctx.confirm({ title: 'Backup esportato', message: 'Potrai importarlo da qui in qualsiasi momento, anche su un altro dispositivo.', confirmLabel: 'OK', cancelLabel: null });
      } catch (error) {
        ctx.confirm({ title: 'Esportazione non riuscita', message: error.message, confirmLabel: 'OK', cancelLabel: null });
      }
    },
    'tt-import': () => document.getElementById('tt-import-input')?.click(),
    'tt-import-file': async (ctx, el) => {
      const file = el.files?.[0];
      el.value = '';
      if (!file) return;
      const store = ctx.model.timetable;
      let backup;
      try {
        backup = readBackup(await file.text());
      } catch (error) {
        ctx.confirm({ title: 'Importazione non riuscita', message: error.message, confirmLabel: 'OK', cancelLabel: null });
        return;
      }
      const events = backup.timetable.entries.length;
      const files = backup.files.length;
      const current = store.timetable.entries.length;
      const count = (n) => (n === 1 ? '1 evento' : `${n} eventi`);
      const message = `Il backup del ${fmt.day(backup.exportedAt)} ${new Intl.DateTimeFormat('it-IT', { month: 'long', year: 'numeric' }).format(backup.exportedAt)} contiene ${count(events)}` +
        (files > 0 ? ` e ${files === 1 ? '1 file' : `${files} file`}` : '') + '. ' +
        (current > 0 ? `Il tuo orario attuale (${count(current)}) verrà sostituito.` : 'Il tuo orario attuale è vuoto.');
      ctx.confirm({
        title: 'Importare questo orario?', message, confirmLabel: 'Continua',
        onConfirm: () => setTimeout(() => ctx.confirm({
          title: "Sostituire l'orario attuale?",
          message: current === 0
            ? "Colori, palette e impostazioni dell'orario di questo account verranno sostituiti da quelli del backup."
            : "L'orario attuale, con le sue note, i file, le verifiche segnate, i colori e le palette salvati, verrà eliminato definitivamente e non potrà essere recuperato. Se vuoi conservarlo, annulla ed esportane prima un backup.",
          confirmLabel: 'Sostituisci', destructive: true,
          onConfirm: async () => {
            try {
              await store.restore(backup);
              const n = store.timetable.entries.length;
              setTimeout(() => ctx.confirm({ title: 'Orario importato', message: n === 1 ? "Ora l'orario contiene 1 evento." : `Ora l'orario contiene ${n} eventi.`, confirmLabel: 'OK', cancelLabel: null }), 350);
            } catch (error) {
              setTimeout(() => ctx.confirm({ title: 'Importazione non riuscita', message: error.message, confirmLabel: 'OK', cancelLabel: null }), 350);
            }
          },
        }), 350),
      });
    },
    'tt-delete-all': (ctx) => ctx.confirm({
      title: "Eliminare l'orario?",
      message: 'Verranno eliminati tutti gli eventi con note, file e verifiche segnate. Colori e palette salvati restano.',
      confirmLabel: "Elimina l'orario", destructive: true,
      onConfirm: () => ctx.model.timetable.deleteAll(),
    }),
  },
};

async function removeLinks(ctx, id) {
  const model = ctx.model;
  const key = `cvv-links-${model.activeAccountID}`;
  try {
    await model.removeClassevivaLink(id);
    ctx.toast(id ? 'Account BCW scollegato.' : 'Scollegato da tutti gli account BCW.');
  } catch (error) {
    ctx.toast(error.message, 'alertTriangle');
  }
  const s = ctx.state(key, { links: null, error: null, round: 0 });
  s.links = null;
  s.round += 1;
  ctx.update();
}

function cloudPasswordSheet() {
  return {
    id: 'cloud-password',
    render: (ctx) => {
      const s = ctx.state('cloud-password', { current: '', next: '', confirm: '', loading: false, error: null });
      const field = (name, placeholder, autocomplete) => `<input class="text-input" type="password" autocomplete="${autocomplete}" placeholder="${placeholder}" value="${esc(s[name] ?? '')}" data-input="cloud-password-input" data-field="${name}">`;
      return {
        title: 'Cambia password',
        size: 'medium',
        trailing: `<button class="btn filled xs" data-action="cloud-password-save"${s.loading ? ' disabled' : ''}>${s.loading ? spinner() : 'Salva'}</button>`,
        body: `<div class="stack gap-14 sheet-pad">
          <p class="body-text">Cambiando la password dell'account BCW ${esc(ctx.model.cloudUser?.username ?? '')} uscirai da BCW sugli altri dispositivi.</p>
          ${field('current', 'Password attuale', 'current-password')}
          ${field('next', 'Nuova password (almeno 8 caratteri)', 'new-password')}
          ${field('confirm', 'Ripeti la nuova password', 'new-password')}
          ${s.error ? `<p class="login-error">${icon('alertTriangleFill')}<span>${esc(s.error)}</span></p>` : ''}
        </div>`,
      };
    },
  };
}

function cloudDeleteSheet() {
  return {
    id: 'cloud-delete',
    render: (ctx) => {
      const s = ctx.state('cloud-delete', { password: '', loading: false, error: null });
      return {
        title: "Elimina l'account BCW",
        size: 'medium',
        body: `<div class="stack gap-14 sheet-pad">
          <p class="body-text">Verranno eliminati l'account BCW ${esc(ctx.model.cloudUser?.username ?? '')}, gli abbinamenti con gli account Classeviva, le impostazioni sincronizzate e gli orari salvati sul server, con i loro file. Da questo browser spariranno gli account abbinati.</p>
          <input class="text-input" type="password" autocomplete="current-password" placeholder="Password dell'account BCW" value="${esc(s.password)}" data-input="cloud-delete-input">
          ${s.error ? `<p class="login-error">${icon('alertTriangleFill')}<span>${esc(s.error)}</span></p>` : ''}
          <button class="btn danger m wide" data-action="cloud-delete-confirm"${s.loading ? ' disabled' : ''}>${s.loading ? spinner() : "<span>Elimina l'account BCW</span>"}</button>
        </div>`,
      };
    },
  };
}

/** Chiede il permesso per le notifiche; se manca spiega come darlo. */
async function askPermission(ctx) {
  if (await Reminders.requestAuthorization()) return true;
  ctx.confirm({
    title: 'Notifiche disattivate',
    message: 'Per ricevere i promemoria consenti le notifiche a questo sito nelle impostazioni del browser. Su iPhone e iPad le notifiche funzionano dopo aver aggiunto BCW alla schermata Home.',
    confirmLabel: 'OK', cancelLabel: null,
  });
  return false;
}

function pinSheet() {
  return {
    id: 'pin',
    render: (ctx) => {
      const s = ctx.state('pin', { first: '', second: '' });
      return {
        title: 'Codice di blocco',
        size: 'medium',
        trailing: '<button class="btn filled xs" data-action="pin-save">Attiva</button>',
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

/** Popup degli account (dal pulsante in Tu o tenendo premuta la scheda Tu). */
export function accountSwitcherSheet() {
  return {
    id: 'account-switcher',
    closesOnSessionChange: true,
    render: (ctx) => ({ title: 'Account', size: 'medium', body: `<div class="form sheet-form">${accountsSection(ctx, { showsHeader: false })}</div>` }),
  };
}

export function accountRow(account, active) {
  return `<span class="account-line">${avatar(accountInitials(account), { size: 40, color: subjectColor(accountColorID(account)), shapeName: 'cookie9Sided' })}
    <span class="grow"><strong>${esc(account.name)}</strong><small>${esc(account.school ?? account.credentials.username)}</small></span>
    ${active ? `<span class="active-check">${icon('check')}</span>` : ''}</span>`;
}

export const account = {
  title: 'Account',

  render(ctx) {
    const model = ctx.model;
    const card = model.card;
    const header = `<div class="account-header">${avatar(model.initials, { size: 104, shapeName: 'cookie12Sided', cls: 'morph' })}<h2>${esc(model.displayName)}</h2>
      ${model.classDescription ? `<p>${esc(sentenceCased(model.classDescription))}</p>` : ''}</div>`;
    let html = header + accountsSection(ctx);
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
    html += linksSection(ctx) + cloudSection(ctx);
    if (model.isCloud && !model.isDemo && model.activeAccount) {
      html += section([buttonRow('Scollega da BCW', 'account-remove', 'minusCircle', { destructive: true, params: { id: model.activeAccount.id } })], {
        footer: `${model.activeAccount.name} non sarà più disponibile con l'account BCW ${model.cloudUser?.username ?? ''} e il suo orario verrà eliminato dal server.`,
      });
    } else if (!model.isCloud || model.isDemo) {
      const footer = model.isDemo ? model.demoExitMessage
        : model.accounts.length > 1
          ? 'Le credenziali di questo account verranno rimosse e passerai a un altro account salvato.'
          : 'Uscendo, le credenziali verranno rimosse da questo browser.';
      html += section([buttonRow(model.isDemo ? 'Esci dalla demo' : 'Esci da questo account', 'sign-out', 'logout', { destructive: true })], { footer });
    }
    return { title: 'Account', narrow: true, body: `<div class="form">${html}</div>`, bottomInset: true };
  },
};
