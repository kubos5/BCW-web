// Accesso con le credenziali di Classeviva o con un account BCW (scelti con un gruppo di
// pulsanti), creazione dell'account BCW, scelta del profilo per gli account genitore con più
// figli e modalità demo.

import { icon } from '../icons.js';
import { spinner, button, segmented } from '../components.js';
import { shape } from '../shapes.js';
import { logo } from '../logo.js';
import { APIError, Proxy } from '../api.js';
import { BCWServer } from '../cloud.js';
import { esc } from '../util.js';

function loginState(ctx) {
  return ctx.state('login', () => ({
    username: '', password: '', loading: false, error: null, choices: [],
    // Dopo una sessione BCW scaduta si riparte dall'accesso con l'account BCW.
    mode: ctx.model.cloudNotice ? 'bcw' : 'classeviva',
    register: false, bcwUsername: ctx.model.cloudUser?.username ?? ctx.model.lastCloudUsername ?? '', bcwPassword: '', bcwConfirm: '',
  }));
}

/** Indirizzo da mostrare per un server ("host/percorso"). */
function hostOf(base) {
  try {
    const url = new URL(base);
    return (url.host + url.pathname).replace(/\/$/, '');
  } catch {
    return base;
  }
}

export function renderLogin(ctx, { adding }) {
  const s = loginState(ctx);
  const model = ctx.model;
  // Con un account BCW senza account abbinati si abbina il primo.
  const linkingFirst = !adding && model.isCloud;
  const mode = adding || linkingFirst ? 'classeviva' : s.mode;
  if (mode === 'classeviva') ctx.task(`proxy-check-${Proxy.base}`, () => Proxy.check());

  let subtitle = 'Better ClasseViVa';
  if (adding) subtitle = model.isCloud ? 'Abbina un account Classeviva' : 'Aggiungi un account';
  else if (linkingFirst) subtitle = `Ciao, ${model.cloudUser?.username ?? ''}`;

  const header = `<div class="login-header">
      ${adding ? '' : `<span class="login-art" aria-hidden="true">${shape('softBurst', 'a')}${shape('cookie9Sided', 'b')}${shape('pill', 'c')}</span>`}
      ${logo('logo')}
      <span class="logo-subtitle">${esc(subtitle)}</span>
    </div>`;
  const toggle = adding || linkingFirst ? '' : `<div class="login-mode">${segmented([['classeviva', 'Classeviva'], ['bcw', 'Account BCW']], mode, 'login-mode')}</div>`;
  const intro = linkingFirst
    ? '<p class="login-intro">Abbina il tuo primo account Classeviva: con il tuo account BCW entrerai in tutti gli account abbinati, su ogni dispositivo.</p>'
    : '';
  const form = mode === 'bcw' ? bcwForm(ctx, s) : classevivaForm(ctx, s, { adding, linkingFirst });
  return `<div class="login ${adding ? 'adding' : ''}">${header}${toggle}${intro}${form}${footer(ctx, mode, { adding, linkingFirst })}</div>`;
}

function errorLine(s) {
  return s.error ? `<p class="login-error">${icon('alertTriangleFill')}<span>${esc(s.error)}</span></p>` : '';
}

function classevivaForm(ctx, s, { adding, linkingFirst }) {
  const disabled = !s.username || !s.password || s.loading;
  const label = ctx.model.isCloud ? 'Abbina' : 'Accedi';
  return `${proxyWarning()}
    <form class="login-form" data-submit="login-submit" autocomplete="on">
      <div class="login-fields">
        <label class="login-field">${icon('person')}<input name="username" type="text" inputmode="email" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false"
          placeholder="Codice utente o email" value="${esc(s.username)}" data-input="login-username" aria-label="Codice utente o email"></label>
        <label class="login-field">${icon('key')}<input name="password" type="password" autocomplete="current-password"
          placeholder="Password" value="${esc(s.password)}" data-input="login-password" aria-label="Password"></label>
      </div>
      ${errorLine(s)}
      <button class="btn filled m wide login-submit" type="submit"${disabled ? ' disabled' : ''}>${s.loading ? spinner() : `<span>${label}</span>`}</button>
      ${adding ? '' : button('Prova la demo', { action: 'login-demo', iconName: 'sparkles', style: 'tonal', cls: 'm wide' })}
      ${linkingFirst ? button('Esci da BCW', { action: 'cloud-sign-out', iconName: 'logout', style: 'text', cls: 'm wide' }) : ''}
    </form>`;
}

function bcwForm(ctx, s) {
  const register = s.register;
  const disabled = !s.bcwUsername || !s.bcwPassword || (register && !s.bcwConfirm) || s.loading;
  const notice = ctx.model.cloudNotice && !s.error
    ? `<p class="login-notice">${icon('info')}<span>${esc(ctx.model.cloudNotice)}</span></p>` : '';
  const serverMissing = !BCWServer.isConfigured
    ? `<div class="proxy-warning"><div class="row gap-8">${icon('server')}<strong>Manca il server BCW</strong></div>
      <p>Per usare un account BCW inserisci l'indirizzo del server (BCW-api).</p>
      <div class="row gap-8"><button class="btn filled xs" type="button" data-action="cloud-server-sheet">Imposta il server</button></div></div>`
    : '';
  return `${serverMissing}${notice}
    <form class="login-form" data-submit="bcw-submit" autocomplete="on">
      <div class="login-fields">
        <label class="login-field">${icon('person')}<input name="bcw-username" type="text" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false"
          placeholder="Nome utente BCW" value="${esc(s.bcwUsername)}" data-input="bcw-username" aria-label="Nome utente BCW"></label>
        <label class="login-field">${icon('key')}<input name="bcw-password" type="password" autocomplete="${register ? 'new-password' : 'current-password'}"
          placeholder="Password" value="${esc(s.bcwPassword)}" data-input="bcw-password" aria-label="Password"></label>
        ${register ? `<label class="login-field">${icon('key')}<input name="bcw-confirm" type="password" autocomplete="new-password"
          placeholder="Ripeti la password" value="${esc(s.bcwConfirm)}" data-input="bcw-confirm" aria-label="Ripeti la password"></label>` : ''}
      </div>
      ${register ? '<p class="login-hint">Da 3 a 32 caratteri tra lettere, cifre, punto, trattino e trattino basso. La password deve avere almeno 8 caratteri.</p>' : ''}
      ${errorLine(s)}
      <button class="btn filled m wide login-submit" type="submit"${disabled ? ' disabled' : ''}>${s.loading ? spinner() : `<span>${register ? 'Crea account' : 'Accedi'}</span>`}</button>
      ${button(register ? 'Hai già un account? Accedi' : 'Crea un account BCW', { action: 'bcw-register-toggle', iconName: register ? null : 'userPlus', style: 'tonal', cls: 'm wide' })}
    </form>`;
}

function footer(ctx, mode, { adding, linkingFirst }) {
  if (mode === 'bcw') {
    return `<div class="login-footer">
      <p>Con un account BCW entri in tutti i tuoi account Classeviva abbinati e ritrovi impostazioni e orario su ogni dispositivo. Le credenziali di Classeviva sono salvate cifrate sul server di BCW.</p>
      <p>BCW non è affiliata a Gruppo Spaggiari Parma.</p>
      <p class="proxy-line">${icon('cloud')}<span>Server BCW: ${esc(BCWServer.isConfigured ? hostOf(BCWServer.base) : 'non impostato')}</span> · <button class="link-button" data-action="cloud-server-sheet">Modifica</button></p>
    </div>`;
  }
  const text = ctx.model.isCloud
    ? 'Usa le credenziali di Classeviva. Il server di BCW le verifica e le salva cifrate nel tuo account BCW; il browser le invia anche ai server di Classeviva per accedere.'
    : 'Usa le stesse credenziali di Classeviva. Restano solo in questo browser e vengono inviate esclusivamente ai server di Classeviva.';
  return `<div class="login-footer">
      <p>${esc(text)}</p>
      ${adding ? '' : '<p>BCW non è affiliata a Gruppo Spaggiari Parma.</p>'}
      <p class="proxy-line">${icon('server')}<span>Server: ${esc(hostOf(Proxy.base))}</span> · <button class="link-button" data-action="proxy-sheet">Modifica</button></p>
      ${linkingFirst ? `<p>Account BCW: ${esc(ctx.model.cloudUser?.username ?? '')}</p>` : ''}
    </div>`;
}

/** Avviso mostrato quando all'indirizzo del proxy non risponde il proxy di BCW. */
function proxyWarning() {
  if (Proxy.status !== 'missing' && Proxy.status !== 'unreachable') return '';
  const text = Proxy.status === 'missing'
    ? 'Questo sito è pubblicato senza il proxy che inoltra le richieste a Classeviva (succede con hosting statici come GitHub Pages). Crea un Cloudflare Worker gratuito con il file proxy/cloudflare-worker.js e inserisci qui il suo indirizzo.'
    : `Il proxy (${Proxy.host}) non risponde. Controlla l'indirizzo e che la variabile ALLOWED_ORIGINS del proxy includa ${location.origin}.`;
  return `<div class="proxy-warning">
    <div class="row gap-8">${icon('server')}<strong>${Proxy.status === 'missing' ? 'Serve un server proxy' : 'Proxy non raggiungibile'}</strong></div>
    <p>${esc(text)}</p>
    <div class="row gap-8">
      <button class="btn filled xs" data-action="proxy-sheet">Imposta il proxy</button>
      <a class="btn tonal xs" href="https://github.com/kubos5/BCW-web#hosting-statico-github-pages-netlify" target="_blank" rel="noopener">Istruzioni</a>
    </div></div>`;
}

function profileSheet(ctx) {
  const s = loginState(ctx);
  return {
    id: 'profile-choice',
    render: () => ({
      title: 'Scegli il profilo',
      size: 'medium',
      body: `<div class="sheet-pad"><div class="list-group">${s.choices.map((c, i) => `<button class="list-item" data-action="login-choice" data-index="${i}">
        <span class="li-text"><strong>${esc(c.name)}</strong><small>${esc(c.school)}</small></span>${icon('chevronRight', { cls: 'trailing-icon' })}</button>`).join('')}</div></div>`,
    }),
  };
}

export function addAccountSheet() {
  return {
    id: 'add-account',
    render: (ctx) => ({ title: '', size: 'login', body: renderLogin(ctx, { adding: true }) }),
  };
}

/** Accesso o creazione dell'account BCW da Impostazioni › Account. */
export function cloudLoginSheet({ register = false } = {}) {
  return {
    id: 'cloud-login',
    render: (ctx) => {
      const s = loginState(ctx);
      if (s.sheetRegister !== register) {
        s.sheetRegister = register;
        s.register = register;
        s.error = null;
      }
      return {
        title: '',
        size: 'login',
        body: `<div class="login adding"><div class="login-header">${logo('logo')}<span class="logo-subtitle">${s.register ? 'Crea un account BCW' : 'Accedi con un account BCW'}</span></div>
          ${bcwForm(ctx, s)}${footer(ctx, 'bcw', { adding: true })}</div>`,
      };
    },
  };
}

export function proxySheet() {
  return {
    id: 'proxy',
    render: (ctx) => {
      const s = ctx.state('proxy', () => ({ value: Proxy.isCustom ? Proxy.base : '' }));
      return {
        title: 'Server proxy',
        size: 'medium',
        trailing: '<button class="btn filled xs" data-action="proxy-save">Salva</button>',
        body: `<div class="stack gap-14 sheet-pad">
          <p class="body-text">Il browser non può contattare direttamente Classeviva: BCW passa da un piccolo server proxy che inoltra le richieste solo ai server di Spaggiari.</p>
          <p class="caption secondary">Lascia vuoto per usare quello predefinito (<code>${esc(Proxy.defaultBase ?? '')}</code>), oppure inserisci l'indirizzo di un altro proxy (ad esempio un Cloudflare Worker o il server BCW).</p>
          <input class="text-input" type="url" placeholder="https://bcw-proxy.esempio.workers.dev" value="${esc(s.value)}" data-input="proxy-input" autocapitalize="none" spellcheck="false">
        </div>`,
      };
    },
  };
}

/** Indirizzo del server BCW (BCW-api). */
export function cloudServerSheet() {
  return {
    id: 'cloud-server',
    render: (ctx) => {
      const s = ctx.state('cloud-server', () => ({ value: BCWServer.isCustom ? BCWServer.base : '' }));
      const locked = ctx.model.isCloud;
      return {
        title: 'Server BCW',
        size: 'medium',
        trailing: locked ? '' : '<button class="btn filled xs" data-action="cloud-server-save">Salva</button>',
        body: `<div class="stack gap-14 sheet-pad">
          <p class="body-text">Il server BCW (BCW-api) conserva gli account BCW, gli account Classeviva abbinati e le impostazioni e gli orari sincronizzati.</p>
          ${locked
    ? `<p class="caption secondary">Stai usando <code>${esc(BCWServer.base)}</code>. Per cambiare server esci prima dall'account BCW.</p>`
    : `<p class="caption secondary">Lascia vuoto per usare quello predefinito${BCWServer.defaultBase ? ` (<code>${esc(BCWServer.defaultBase)}</code>)` : ''}, oppure inserisci l'indirizzo di un altro server.</p>
          <input class="text-input" type="url" placeholder="https://bcw-api.esempio.workers.dev" value="${esc(s.value)}" data-input="cloud-server-input" autocapitalize="none" spellcheck="false">`}
        </div>`,
      };
    },
  };
}

async function signIn(ctx, ident) {
  const s = loginState(ctx);
  if (!s.username || !s.password) return;
  s.loading = true;
  s.error = null;
  ctx.update();
  try {
    await ctx.model.signIn(s.username, s.password, ident);
    const adding = ctx.app.sheet?.id === 'add-account';
    s.password = '';
    s.choices = [];
    if (adding) ctx.closeSheet();
  } catch (error) {
    if (error instanceof APIError && error.kind === 'needsProfileChoice') {
      s.choices = error.choices;
      ctx.openSheet(profileSheet(ctx));
    } else {
      s.error = error.message;
    }
  } finally {
    s.loading = false;
    ctx.update();
  }
}

/** Dopo l'accesso con l'account BCW propone di abbinare gli account già salvati nel browser. */
function offerLinking(ctx, candidates) {
  const names = candidates.map((a) => a.name).join(', ');
  const one = candidates.length === 1;
  setTimeout(() => ctx.confirm({
    title: one ? `Abbinare ${candidates[0].name} al tuo account BCW?` : `Abbinare ${candidates.length} account al tuo account BCW?`,
    message: `${one ? "In questo browser c'è un account Classeviva" : `In questo browser ci sono ${candidates.length} account Classeviva`} (${names}). Abbinandoli li ritroverai con il tuo account BCW su ogni dispositivo, insieme al loro orario.`,
    confirmLabel: 'Abbina',
    cancelLabel: 'Non ora',
    onConfirm: async () => {
      const failures = await ctx.model.linkLocalAccounts(candidates);
      if (!failures.length) {
        ctx.toast(one ? 'Account abbinato.' : 'Account abbinati.');
        return;
      }
      ctx.confirm({
        title: 'Alcuni account non sono stati abbinati',
        message: failures.map((f) => `${f.account.name}: ${f.message}`).join('\n'),
        confirmLabel: 'OK', cancelLabel: null,
      });
    },
  }), 450);
}

async function cloudSubmit(ctx) {
  const s = loginState(ctx);
  if (!s.bcwUsername || !s.bcwPassword) return;
  if (s.register) {
    if (s.bcwPassword.length < 8) {
      s.error = 'La password deve avere almeno 8 caratteri.';
      ctx.update();
      return;
    }
    if (s.bcwPassword !== s.bcwConfirm) {
      s.error = 'Le due password non coincidono.';
      ctx.update();
      return;
    }
  }
  s.loading = true;
  s.error = null;
  ctx.update();
  try {
    const candidates = await ctx.model.cloudSignIn(s.bcwUsername, s.bcwPassword, { register: s.register });
    s.bcwPassword = '';
    s.bcwConfirm = '';
    if (ctx.app.sheet?.id === 'cloud-login') ctx.closeSheet();
    if (candidates.length) offerLinking(ctx, candidates);
  } catch (error) {
    s.error = error.message;
  } finally {
    s.loading = false;
    ctx.update();
  }
}

export const loginActions = {
  'login-username': (ctx, el) => { loginState(ctx).username = el.value; },
  'login-password': (ctx, el) => { loginState(ctx).password = el.value; },
  'login-submit': (ctx, form) => {
    // I gestori di password a volte compilano i campi senza generare l'evento "input".
    const s = loginState(ctx);
    s.username = form.querySelector('[name="username"]').value;
    s.password = form.querySelector('[name="password"]').value;
    return signIn(ctx, null);
  },
  'login-mode': (ctx, el) => {
    const s = loginState(ctx);
    s.mode = el.dataset.value;
    s.error = null;
  },
  'bcw-username': (ctx, el) => { loginState(ctx).bcwUsername = el.value; },
  'bcw-password': (ctx, el) => { loginState(ctx).bcwPassword = el.value; },
  'bcw-confirm': (ctx, el) => { loginState(ctx).bcwConfirm = el.value; },
  'bcw-register-toggle': (ctx) => {
    const s = loginState(ctx);
    s.register = !s.register;
    s.error = null;
    s.bcwConfirm = '';
  },
  'bcw-submit': (ctx, form) => {
    const s = loginState(ctx);
    s.bcwUsername = form.querySelector('[name="bcw-username"]').value;
    s.bcwPassword = form.querySelector('[name="bcw-password"]').value;
    s.bcwConfirm = form.querySelector('[name="bcw-confirm"]')?.value ?? '';
    return cloudSubmit(ctx);
  },
  'cloud-login': (ctx) => ctx.openSheet(cloudLoginSheet()),
  'cloud-register': (ctx) => ctx.openSheet(cloudLoginSheet({ register: true })),
  'cloud-sign-out': (ctx) => ctx.confirm({
    title: `Vuoi uscire dall'account BCW ${ctx.model.cloudUser?.username ?? ''}?`,
    message: 'Gli account Classeviva abbinati e i loro dati verranno rimossi da questo browser. Restano nel tuo account BCW: li ritroverai accedendo di nuovo.',
    confirmLabel: 'Esci', destructive: true,
    onConfirm: () => ctx.model.cloudSignOut(),
  }),
  'login-demo': (ctx) => ctx.model.startDemo(),
  'login-choice': (ctx, el) => {
    const s = loginState(ctx);
    const choice = s.choices[Number(el.dataset.index)];
    ctx.closeSheet();
    if (choice) return signIn(ctx, choice.ident);
    return null;
  },
  'proxy-sheet': (ctx) => (ctx.app.sheet ? ctx.pushSheet(proxySheet()) : ctx.openSheet(proxySheet())),
  'proxy-input': (ctx, el) => { ctx.state('proxy', {}).value = el.value; },
  'proxy-save': (ctx) => {
    // Senza schema si aggiunge https:// (es. "bcw-proxy.esempio.workers.dev").
    Proxy.set(ctx.state('proxy', {}).value ?? '');
    ctx.app.viewState.delete('proxy');
    ctx.closeSheet();
    // La sessione aperta riparte con il nuovo indirizzo.
    const model = ctx.model;
    if (model.phase === 'signedIn' && !model.isDemo && model.activeAccount) model.activate(model.activeAccount);
    ctx.toast('Server aggiornato.');
  },
  'cloud-server-sheet': (ctx) => (ctx.app.sheet ? ctx.pushSheet(cloudServerSheet()) : ctx.openSheet(cloudServerSheet())),
  'cloud-server-input': (ctx, el) => { ctx.state('cloud-server', {}).value = el.value; },
  'cloud-server-save': (ctx) => {
    BCWServer.set(ctx.state('cloud-server', {}).value ?? '');
    ctx.app.viewState.delete('cloud-server');
    ctx.closeSheet();
    ctx.toast('Server BCW aggiornato.');
  },
};
