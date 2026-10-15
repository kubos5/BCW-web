// Logo di BCW: la scritta nel font del sito (Google Sans Flex) e la linea nel colore del
// marchio. È testo nel documento, così segue il tema e il colore d'accento scelti nell'app.

export function logo(cls = '') {
  return `<span class="bcw-logo ${cls}" role="img" aria-label="BCW"><span class="logo-text" aria-hidden="true">BCW</span><span class="logo-line" aria-hidden="true"></span></span>`;
}
