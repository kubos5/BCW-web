// Applica subito, prima del primo disegno, l'aspetto scelto nelle Impostazioni: tema chiaro
// o scuro, colori generati dal colore d'accento (salvati da `js/theme.js`), angoli,
// animazioni e caratteri. Script classico e minuscolo, così non ritarda l'apertura.
(function () {
  try {
    var prefs = JSON.parse(localStorage.getItem('bcw.preferences') || '{}');
    var html = document.documentElement;
    if (prefs.appearance === 'light' || prefs.appearance === 'dark') html.setAttribute('data-theme', prefs.appearance);
    if (prefs.corners && prefs.corners !== 'standard') html.setAttribute('data-corners', prefs.corners);
    if (prefs.motion && prefs.motion !== 'expressive') html.setAttribute('data-motion', prefs.motion);
    if (prefs.roundedText && prefs.roundedText !== 'titles') html.setAttribute('data-rounded', prefs.roundedText);
    var theme = JSON.parse(localStorage.getItem('bcw.theme') || 'null');
    if (theme && theme.css) {
      var style = document.createElement('style');
      style.id = 'bcw-theme';
      style.textContent = theme.css;
      style.dataset.signature = theme.signature;
      style.dataset.light = theme.light;
      style.dataset.dark = theme.dark;
      document.head.appendChild(style);
      var dark = prefs.appearance === 'dark' || (prefs.appearance !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
      var meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.content = dark ? theme.dark : theme.light;
    }
    // Favicon nel colore del marchio del tema scelto (lo aggiorna poi js/theme.js).
    var brand = getComputedStyle(html).getPropertyValue('--brand').trim();
    var icon = document.querySelector('link[rel="icon"][type="image/svg+xml"]');
    if (brand && icon) {
      icon.href = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect x="4" y="28.18" width="56" height="7.64" rx="3.82" fill="' + brand + '"/></svg>');
    }
  } catch { /* aspetto predefinito */ }
})();
