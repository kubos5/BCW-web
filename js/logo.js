// Logo di BCW: la scritta nel font del sito (Google Sans Flex) e la linea nel colore del
// marchio. È testo nel documento, così segue il tema e il colore d'accento scelti nell'app.

/**
 * `stacked`: la barra sotto la scritta, centrata (3.3, come nell'introduzione e nell'icona
 * dell'app); altrimenti a fianco. `flip`: prefisso degli id `data-flip` di scritta e barra, così
 * cambiando disposizione si spostano e si rimpiccioliscono con la molla (`playFlips` in `app.js`).
 */
export function logo(cls = '', { stacked = false, flip = null } = {}) {
  const attr = (part) => (flip ? ` data-flip="${flip}-${part}" data-flip-mode="scale"` : '');
  return `<span class="bcw-logo ${stacked ? 'stacked' : ''} ${cls}" role="img" aria-label="BCW"><span class="logo-text" aria-hidden="true"${attr('text')}>BCW</span><span class="logo-line" aria-hidden="true"${attr('line')}></span></span>`;
}
