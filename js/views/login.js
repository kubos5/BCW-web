// Accesso con le credenziali di Classeviva, scelta del profilo per gli account genitore
// con più figli e modalità demo.

import { icon } from '../icons.js';
import { spinner, button } from '../components.js';
import { APIError, Proxy } from '../api.js';
import { esc } from '../util.js';

function loginState(ctx) {
  return ctx.state('login', { username: '', password: '', loading: false, error: null, choices: [] });
}

export function renderLogin(ctx, { adding }) {
  const s = loginState(ctx);
  const disabled = !s.username || !s.password || s.loading;
  let proxyHost = Proxy.base;
  try { proxyHost = (new URL(Proxy.base).host + new URL(Proxy.base).pathname).replace(/\/$/, ''); } catch { /* indirizzo relativo */ }
  // Verifica subito che ci sia il proxy: su un hosting statico (es. GitHub Pages) manca.
  ctx.task(`proxy-check-${Proxy.base}`, () => Proxy.check());
  return `<div class="login ${adding ? 'adding' : ''}">
    <div class="login-header">
      <span class="logo">BCW</span><span class="logo-line"></span>
      <span class="logo-subtitle">${adding ? 'Aggiungi un account' : 'Better ClasseViVa'}</span>
    </div>
    ${proxyWarning()}
    <form class="login-form" data-submit="login-submit" autocomplete="on">
      <div class="login-fields">
        <label class="login-field">${icon('person')}<input name="username" type="text" inputmode="email" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false"
          placeholder="Codice utente o email" value="${esc(s.username)}" data-input="login-username" aria-label="Codice utente o email"></label>
        <hr class="divider inset-48">
        <label class="login-field">${icon('key')}<input name="password" type="password" autocomplete="current-password"
          placeholder="Password" value="${esc(s.password)}" data-input="login-password" aria-label="Password"></label>
      </div>
      ${s.error ? `<p class="login-error">${icon('alertTriangleFill')}<span>${esc(s.error)}</span></p>` : ''}
      <button class="btn btn-prominent large login-submit" type="submit"${disabled ? ' disabled' : ''}>${s.loading ? spinner() : '<span>Accedi</span>'}</button>
      ${adding ? '' : button('Prova la demo', { action: 'login-demo', cls: 'large wide' })}
    </form>
    <div class="login-footer">
      <p>Usa le stesse credenziali di Classeviva. Restano solo in questo browser e vengono inviate esclusivamente ai server di Classeviva.</p>
      <p>BCW non è affiliata a Gruppo Spaggiari Parma.</p>
      <p class="proxy-line">${icon('server')}<span>Server: ${esc(proxyHost)}</span> · <button class="link-button" data-action="proxy-sheet">Modifica</button></p>
    </div>
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
      <button class="btn btn-prominent small" data-action="proxy-sheet">Imposta il proxy</button>
      <a class="btn btn-glass small" href="https://github.com/kubos5/BCW-web#hosting-statico-github-pages-netlify" target="_blank" rel="noopener">Istruzioni</a>
    </div></div>`;
}

function profileSheet(ctx) {
  const s = loginState(ctx);
  return {
    id: 'profile-choice',
    render: () => ({
      title: 'Scegli il profilo',
      size: 'medium',
      body: `<div class="inset-list">${s.choices.map((c, i) => `<button class="list-row" data-action="login-choice" data-index="${i}">
        <span class="grow"><strong>${esc(c.name)}</strong><small>${esc(c.school)}</small></span>${icon('chevronRight', { cls: 'chev-right' })}</button>`).join('')}</div>`,
    }),
  };
}

export function addAccountSheet() {
  return {
    id: 'add-account',
    render: (ctx) => ({ title: '', size: 'login', body: renderLogin(ctx, { adding: true }) }),
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
        trailing: '<button class="btn btn-prominent" data-action="proxy-save">Salva</button>',
        body: `<div class="stack gap-14 sheet-pad">
          <p class="body-text">Il browser non può contattare direttamente Classeviva: BCW passa da un piccolo server proxy che inoltra le richieste solo ai server di Spaggiari.</p>
          <p class="caption secondary">Lascia vuoto per usare quello predefinito (<code>${esc(Proxy.defaultBase ?? '')}</code>), oppure inserisci l'indirizzo di un altro proxy (ad esempio un Cloudflare Worker).</p>
          <input class="text-input" type="url" placeholder="https://bcw-proxy.esempio.workers.dev" value="${esc(s.value)}" data-input="proxy-input" autocapitalize="none" spellcheck="false">
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
  'login-demo': (ctx) => ctx.model.startDemo(),
  'login-choice': (ctx, el) => {
    const s = loginState(ctx);
    const choice = s.choices[Number(el.dataset.index)];
    ctx.closeSheet();
    if (choice) return signIn(ctx, choice.ident);
    return null;
  },
  'proxy-sheet': (ctx) => ctx.openSheet(proxySheet()),
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
};
