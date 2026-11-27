// BCW+ sul web (4.0.1). Nell'app per iPhone e iPad BCW+ è un acquisto unico che sblocca orario,
// attività in diretta e widget; sul web per ora non si compra: come in BCW per Android tutte le
// funzioni sono sbloccate. Arriverà presto anche qui per l'orario (2,99 €), quindi:
// - in cima alle Impostazioni un banner (come "Build GitHub" dell'app e il banner di Android) dice
//   che le funzioni sono sbloccate ma che tra poco non sarà più così;
// - in cima alla scheda Orario un avviso piccolo dice che l'orario è ancora gratuito.
// Si nascondono con la X e si rimostrano da Impostazioni › Generale › BCW+ (solo in questo browser,
// come `showsPlusBanner` nell'app). Niente acquisto: verrà dopo.

import { icon } from './icons.js';
import { shape } from './shapes.js';

/** Prezzo di BCW+ (lo stesso dell'App Store). */
export const PLUS_PRICE = '2,99 €';

/**
 * Banner in cima alle Impostazioni: contenitore secondario con angoli ampi, una forma grande che
 * ruota piano sporgendo dall'angolo in basso a destra, l'icona in una forma, i testi e la X. Nella
 * colonna stretta delle Impostazioni degli schermi larghi i testi vanno sotto l'icona.
 */
export function plusBanner(ctx) {
  if (!ctx.prefs.showsPlusBanner) return '';
  return `<section class="plus-banner" data-key="plus-banner" aria-label="BCW per il web">
    <span class="plus-banner-deco big" aria-hidden="true">${shape('clover8Leaf')}</span>
    <span class="plus-banner-deco small" aria-hidden="true">${shape('clover4Leaf')}</span>
    <div class="plus-banner-body"><span class="plus-banner-art shaped" aria-hidden="true">${shape('cookie12Sided')}${icon('globe')}</span>
      <span class="plus-banner-text"><strong>BCW per il web</strong>
        <small>Per ora le funzioni di BCW+ sono sbloccate anche sul web, ma tra poco arriverà BCW+ e non sarà più così</small></span>
      <button class="plus-banner-close" data-action="plus-banner-hide" aria-label="Nascondi il banner" title="Nascondi il banner">${icon('x')}</button></div>
  </section>`;
}

/** Avviso piccolo in cima alla scheda Orario (non nella modifica né nell'anteprima della bozza). */
export function plusTimetableNotice(ctx) {
  if (!ctx.prefs.showsTimetablePlusNotice) return '';
  return `<div class="plus-notice" data-key="plus-notice" role="note">
    <span class="plus-notice-art shaped" aria-hidden="true">${shape('cookie9Sided')}${icon('workspacePremium')}</span>
    <span class="plus-notice-text"><strong>L'orario è ancora gratuito</strong>
      <small>Tra poco richiederà BCW+, un pagamento unico di ${PLUS_PRICE}.</small></span>
    <button class="icon-btn small plus-notice-close" data-action="plus-notice-hide" aria-label="Nascondi l'avviso" title="Nascondi l'avviso">${icon('x')}</button>
  </div>`;
}

export const plusActions = {
  'plus-banner-hide': (ctx) => {
    navigator.vibrate?.(4);
    ctx.prefs.set('showsPlusBanner', false);
    ctx.toast('Banner nascosto: lo ritrovi in Impostazioni › Generale', 'eyeOff');
  },
  'plus-notice-hide': (ctx) => {
    navigator.vibrate?.(4);
    ctx.prefs.set('showsTimetablePlusNotice', false);
    ctx.toast('Avviso nascosto: lo ritrovi in Impostazioni › Generale', 'eyeOff');
  },
  'pref-plus-banner': (ctx, el) => ctx.prefs.set('showsPlusBanner', el.checked),
  'pref-plus-notice': (ctx, el) => ctx.prefs.set('showsTimetablePlusNotice', el.checked),
};
