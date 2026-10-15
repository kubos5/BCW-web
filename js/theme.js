// Aspetto personalizzato: colori generati dal colore d'accento scelto (schemi dinamici di
// Material 3, come i colori del sistema su Android), angoli, animazioni e caratteri.
//
// I colori predefiniti sono già in `css/bcw.css`; per gli altri si genera un foglio di stile
// con le stesse variabili (chiaro e scuro) che viene salvato nel browser, così all'apertura
// `js/theme-boot.js` lo applica subito, prima del primo disegno.

export const DEFAULT_ACCENT = '#a23e2f';

/** Colori proposti (il primo è quello di BCW). */
export const AccentPresets = [
  ['#a23e2f', 'Mattone (BCW)'],
  ['#c0661b', 'Arancio'],
  ['#9a7b12', 'Oro'],
  ['#2f7d55', 'Verde'],
  ['#1f7a80', 'Petrolio'],
  ['#2f6db5', 'Blu'],
  ['#5b5bb0', 'Indaco'],
  ['#8a4fb0', 'Viola'],
  ['#b8456f', 'Rosa'],
  ['#5f6b7a', 'Ardesia'],
];

/** Stili degli schemi dinamici di Material 3. */
export const ColorStyle = {
  tonalSpot: { title: 'Tonale', subtitle: 'Toni pacati' },
  vibrant: { title: 'Vivace', subtitle: 'Colori più saturi' },
  expressive: { title: 'Espressivo', subtitle: 'Accostamenti audaci' },
  fidelity: { title: 'Fedele', subtitle: 'Vicino al colore scelto' },
  neutral: { title: 'Neutro', subtitle: 'Toni quasi grigi' },
  rainbow: { title: 'Arcobaleno', subtitle: 'Superfici neutre' },
  fruitSalad: { title: 'Macedonia', subtitle: 'Tonalità diverse' },
};

export const Contrast = { standard: 'Standard', medium: 'Medio', high: 'Alto' };
const contrastLevel = { standard: 0, medium: 0.5, high: 1 };

export const Corners = { square: 'Meno arrotondati', standard: 'Standard', round: 'Più arrotondati' };
export const Motion = { expressive: 'Espressive', standard: 'Standard', reduced: 'Ridotte' };
export const RoundedText = { titles: 'Solo i titoli', all: 'Tutto il testo', none: 'Nessuno' };

const CACHE_KEY = 'bcw.theme';
const STYLE_ID = 'bcw-theme';

/** Firma delle impostazioni che decidono i colori: se cambia, il foglio va rigenerato. */
export function colorSignature(prefs) {
  return [normalizeHex(prefs.get('accentColor')) ?? DEFAULT_ACCENT, prefs.get('colorStyle'), prefs.get('contrast')].join('|');
}

const defaultSignature = [DEFAULT_ACCENT, 'tonalSpot', 'standard'].join('|');

export function normalizeHex(value) {
  const text = String(value ?? '').trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(text)) return text;
  if (/^#[0-9a-f]{3}$/.test(text)) return `#${[...text.slice(1)].map((c) => c + c).join('')}`;
  return null;
}

let lib = null;
let loading = null;

/** Carica (una volta sola) la libreria dei colori di Material. */
export function loadColorLibrary() {
  if (lib) return Promise.resolve(lib);
  loading ??= import('./vendor/material-color-utilities.js').then((m) => { lib = m; return m; });
  return loading;
}

export const Theme = {
  get library() { return lib; },

  /** Applica angoli, animazioni e caratteri (attributi su `<html>`, letti da `css/bcw.css`). */
  applyLayout(prefs) {
    const html = document.documentElement;
    const set = (name, value, fallback) => {
      if (value === fallback || value == null) html.removeAttribute(name);
      else if (html.getAttribute(name) !== value) html.setAttribute(name, value);
    };
    set('data-corners', prefs.get('corners'), 'standard');
    set('data-motion', prefs.get('motion'), 'expressive');
    set('data-rounded', prefs.get('roundedText'), 'titles');
  },

  /**
   * Applica i colori. Con le impostazioni predefinite basta `css/bcw.css`; altrimenti si usa
   * il foglio salvato o se ne genera uno nuovo (caricando la libreria dei colori).
   */
  async applyColors(prefs) {
    const signature = colorSignature(prefs);
    const element = document.getElementById(STYLE_ID);
    if (signature === defaultSignature) {
      if (element) {
        element.remove();
        try { localStorage.removeItem(CACHE_KEY); } catch { /* ignorato */ }
      }
      return false;
    }
    if (element?.dataset.signature === signature || pending === signature) return false;
    pending = signature;
    try {
      return await generate(prefs, signature);
    } finally {
      if (pending === signature) pending = null;
    }
  },

  /** Colore della barra del browser (`theme-color`) per il tema chiaro o scuro. */
  surface(dark) {
    const element = document.getElementById(STYLE_ID);
    if (element) return dark ? element.dataset.dark : element.dataset.light;
    return dark ? '#130d0b' : '#fff8f6';
  },
};

let pending = null;

async function generate(prefs, signature) {
  let cached = null;
  try { cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); } catch { /* rigenerato */ }
  if (cached?.signature !== signature) {
    const m = await loadColorLibrary();
    // Nel frattempo le impostazioni potrebbero essere cambiate di nuovo.
    if (colorSignature(prefs) !== signature) return false;
    cached = { signature, ...buildTheme(m, signature) };
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(cached)); } catch { /* archiviazione piena */ }
  }
  injectStyle(cached);
  return true;
}

function injectStyle(theme) {
  let element = document.getElementById(STYLE_ID);
  if (!element) {
    element = document.createElement('style');
    element.id = STYLE_ID;
    document.head.append(element);
  }
  element.textContent = theme.css;
  element.dataset.signature = theme.signature;
  element.dataset.light = theme.light;
  element.dataset.dark = theme.dark;
}

// MARK: - Generazione dei colori

const schemeClass = {
  tonalSpot: 'SchemeTonalSpot', vibrant: 'SchemeVibrant', expressive: 'SchemeExpressive', fidelity: 'SchemeFidelity',
  neutral: 'SchemeNeutral', rainbow: 'SchemeRainbow', fruitSalad: 'SchemeFruitSalad',
};

const ROLES = [
  'primary', 'on-primary', 'primary-container', 'on-primary-container',
  'secondary', 'on-secondary', 'secondary-container', 'on-secondary-container',
  'tertiary', 'on-tertiary', 'tertiary-container', 'on-tertiary-container',
  'error', 'on-error', 'error-container', 'on-error-container',
  'surface', 'surface-dim', 'surface-bright',
  'surface-container-lowest', 'surface-container-low', 'surface-container', 'surface-container-high', 'surface-container-highest',
  'on-surface', 'on-surface-variant', 'outline', 'outline-variant',
  'inverse-surface', 'inverse-on-surface', 'inverse-primary',
];

/**
 * Genera le variabili CSS per il tema chiaro e scuro, con gli stessi ritocchi dei colori
 * predefiniti di `css/bcw.css`: superfici mai bianche o nere pure, separatori più leggeri,
 * contenitori scuri nel tema scuro e superfici inverse come nella specifica 2021.
 */
export function buildTheme(m, signature) {
  const [accent, style, contrast] = signature.split('|');
  const seed = m.Hct.fromInt(m.argbFromHex(accent));
  const level = contrastLevel[contrast] ?? 0;
  const Scheme = m[schemeClass[style] ?? 'SchemeTonalSpot'];
  const colors = new m.MaterialDynamicColors().allColors.filter(Boolean);
  const hex = (argb) => m.hexFromArgb(argb);
  const tone = (palette, t) => hex(palette.tone(t));
  const toneOf = (value) => m.Hct.fromInt(m.argbFromHex(value)).tone;

  const make = (dark) => {
    const scheme = new Scheme(seed, dark, level, '2025', 'phone');
    const legacy = new Scheme(seed, dark, level, '2021', 'phone');
    const values = {};
    for (const color of colors) values[color.name.replace(/_/g, '-')] = hex(color.getArgb(scheme));
    for (const color of colors) {
      const name = color.name.replace(/_/g, '-');
      if (name === 'inverse-surface' || name === 'inverse-on-surface') values[name] = hex(color.getArgb(legacy));
    }
    const neutral = scheme.neutralPalette;
    values['surface-container-lowest'] = dark ? tone(neutral, 3) : mixWhite(values.surface, 0.6);
    if (level === 0) {
      values['outline-variant'] = tone(scheme.neutralVariantPalette, dark ? 26 : 84);
      if (dark) {
        // Nel tema scuro i contenitori restano scuri (la specifica 2025 li schiarisce).
        for (const [role, palette] of [['primary', scheme.primaryPalette], ['secondary', scheme.secondaryPalette], ['tertiary', scheme.tertiaryPalette]]) {
          if (toneOf(values[`${role}-container`]) > 50) {
            values[`${role}-container`] = tone(palette, 35);
            values[`on-${role}-container`] = tone(palette, 90);
          }
        }
        values['on-secondary-container'] = tone(scheme.secondaryPalette, 85);
        values['on-error-container'] = tone(scheme.errorPalette, 80);
      }
    }
    return { values, scheme };
  };

  const light = make(false);
  const dark = make(true);
  dark.values['inverse-primary'] = light.values.primary;

  const seedPalette = m.TonalPalette.fromHct(seed);
  const brand = (isDark) => (isDark
    ? hex(m.Hct.from(seed.hue, seed.chroma * 0.8, 64).toInt())
    : tone(seedPalette, 40));
  const rgb = (value) => {
    const n = parseInt(value.slice(1), 16);
    return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
  };

  const block = (part, isDark) => {
    const lines = ROLES.map((role) => `--${role}: ${part.values[role]};`);
    lines.push(`--brand: ${brand(isDark)};`);
    const shadow = rgb(tone(part.scheme.neutralPalette, isDark ? 2 : 6));
    lines.push(`--scrim: rgb(${shadow} / ${isDark ? '.55' : '.38'});`, `--shadow-color: ${shadow};`);
    return lines.join(' ');
  };

  const lightBlock = block(light, false);
  const darkBlock = block(dark, true);
  const css = `:root { ${lightBlock} }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { ${darkBlock} } }
:root[data-theme="dark"] { ${darkBlock} }`;
  return { css, light: light.values.surface, dark: dark.values.surface };
}

/** Avvicina un colore al bianco (senza arrivarci: niente sfondi bianchi puri). */
function mixWhite(value, amount) {
  const n = parseInt(value.slice(1), 16);
  const channel = (shift) => Math.round(((n >> shift) & 255) + (255 - ((n >> shift) & 255)) * amount);
  return `#${[16, 8, 0].map((shift) => Math.min(channel(shift), 254).toString(16).padStart(2, '0')).join('')}`;
}

/** Anteprima di un colore d'accento (come i campioni di Android): primario, secondario e terziario. */
export function swatchColors(m, accent, style, dark) {
  const Scheme = m[schemeClass[style] ?? 'SchemeTonalSpot'];
  const scheme = new Scheme(m.Hct.fromInt(m.argbFromHex(accent)), dark, 0, '2025', 'phone');
  const hex = (palette, t) => m.hexFromArgb(palette.tone(t));
  return dark
    ? [hex(scheme.primaryPalette, 80), hex(scheme.secondaryPalette, 70), hex(scheme.tertiaryPalette, 75)]
    : [hex(scheme.primaryPalette, 45), hex(scheme.secondaryPalette, 80), hex(scheme.tertiaryPalette, 70)];
}
