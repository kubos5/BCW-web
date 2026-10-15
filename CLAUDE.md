# CLAUDE.md — BCW web

Versione web di BCW (Better ClasseViVa, https://github.com/kubos5/BCW), client per il registro Classeviva.
Rispondi all'utente in **italiano**. Testi UI e commenti in italiano.

- HTML + JavaScript (moduli ES) senza dipendenze né build. Avvio: `node server.js` → http://localhost:8080.
- `server.js` serve i file pubblici e fa da proxy (`/api/v1/*` → `web.spaggiari.eu/rest/v1/*`,
  `/api/archive/YY/*` → `webYY.spaggiari.eu`), aggiungendo User-Agent e Z-Dev-Apikey. Variante: `proxy/cloudflare-worker.js`.
- Le viste (`js/views/*`) restituiscono un descrittore di pagina (`title`, `subtitle`, `actions`, `body` o `split` o `full`,
  `search`, `refresh`, `floating`, `fab`, `reselect`); `js/app.js` costruisce la shell e applica l'HTML con `dom.js` (morph).
  Azioni delegate via `data-action` / `data-input` / `data-change` / `data-context` / `data-longpress` / `data-dblclick`;
  ogni vista esporta `actions`. `ctx.afterRender(fn)` esegue codice dopo il disegno (es. scorrere a un'ora).
- Stato locale delle viste con `ctx.state(key, init)`; operazioni asincrone una tantum con `ctx.task(key, fn)`.
  Fogli: `openSheet` (sostituisce), `pushSheet` (sopra, chiudendo si torna indietro); i fogli dell'Orario tengono lo
  stato in `sheet:<id>` e lo cancellano in `onClose`. `confirm({ actions })` per dialoghi con più scelte.
- Proxy predefinito in `config.json` (`{"proxy": "https://…"}`); `Proxy.init()` all'avvio: indirizzo dell'utente
  (localStorage) > proxy del sito stesso (`/api/ping` con `X-BCW-Proxy`) > `config.json`.
- Design Material 3 Expressive: colori come variabili CSS (`--primary`, `--surface-container…`, `--good/--fair/--poor/
  --neutral` con `-container`, `--subject-N`); alias brevi `--bg`, `--card`, `--ink`, `--ink2`, `--accent`. Font Google
  Sans Flex in `fonts/` (asse ROND per i titoli). Icone Material Symbols Rounded incorporate in `js/icons.js` (varianti
  `…Fill`); forme in `js/shapes.js` (`shape(name)` dentro un `.shaped`); logo come testo (`js/logo.js`: "BCW" in Google
  Sans Flex e la linea in `--brand`), così segue il tema scelto nell'app; il favicon si ridisegna con `--brand`
  (`Theme.updateFavicon()`). Movimento con le molle `--spring`, `--spring-fast`, `--effects` (approssimate con `linear()`).
- Larghezze: sotto 600 px barra di navigazione in basso (Dashboard, Orario, Voti, Tu, Cerca); 600–839 le stesse schede in
  una barra laterale compatta; da 840 barra laterale espansa con tutte le sezioni (riducibile; tra 840 e 1000 si apre
  sopra il contenuto) e pagina in un pannello con angoli ampi.
- Su schermi larghi segue l'app Mac: ricerca generale nella barra (fuori dalla `.page`, così non perde il fuoco),
  niente sezione Cerca nella barra laterale, ricerche di pagina nel contenuto (`localSearchField`); nella Dashboard il
  giorno scelto è il titolo, con "Domani" (Alt+Maiusc+T) e il menu della vista (con "Vai a oggi").
- Calendario galleggiante sui telefoni (`page.floating`, Dashboard e Orario): `.cal-float` sopra `.page-scroll`, che
  ha il margine superiore dell'altezza intera; l'avanzamento `--p` (0 intero, 1 striscia) segue `scrollTop` e lo
  imposta `applyCollapse()` dopo ogni disegno; a metà strada scatta. Il giorno accanto si raggiunge con `data-day-swipe`.
- Orario: logica in `js/timetable.js` (stesso JSON dell'app iOS: minuti dalla mezzanotte, giorni 1 = lunedì, UUID
  maiuscoli, date senza millisecondi, backup `com.bcw.timetable-backup`), viste in `views/timetable.js` e fogli in
  `views/timetable-sheets.js`. Un documento per account in `localStorage` (`bcw.timetable.<account>`), file in IndexedDB
  (`BlobStore`, spazio `ttfile-<account>`); la demo usa `demo` e si cancella uscendo.
- Cambi di sessione (account, demo) con `model.changeSession(fn)`: dissolvenza, cambio dei dati e ritorno quando ci
  sono (al massimo 3 s). La demo non è un account: si apre anche con un account collegato e uscendo si torna a quello.
- `dom.js`: i nodi con `data-key` scomparsi vanno tolti prima di quelli nuovi; spostare un nodo gli toglie il fuoco.
  Niente stato negli attributi aggiunti a mano (il morph li toglie), tranne `data-signature` dei grafici e lo stile
  `--p` del calendario galleggiante, reimpostato dopo ogni disegno.
- Aree scorrevoli: niente scorrimento orizzontale; nelle pagine a più aree (colonne, bacheca, barra laterale,
  settimana dell'orario) le barre di scorrimento sono nascoste.
- Colori solo dalle variabili CSS, mai nero/bianco puri come sfondo (i colori scelti dall'utente nell'orario passano
  da `light-dark()`).
- Aspetto (Impostazioni › Aspetto, `js/theme.js`): con un colore d'accento, stile o contrasto diversi dai predefiniti
  si genera con `js/vendor/material-color-utilities.js` un `<style id="bcw-theme">` con le stesse variabili di
  `css/bcw.css` (chiaro e scuro), salvato in `bcw.theme` e applicato all'avvio da `js/theme-boot.js`. Angoli, animazioni
  e caratteri sono attributi su `<html>` (`data-corners`, `data-motion`, `data-rounded`): usare `--r-*` per gli angoli,
  `--spring*` per il movimento e `"ROND" var(--rond)` per i titoli.
- Anteprima dei file in `js/viewer.js` (`openFile(file)`): immagini con zoom relativo alla dimensione adattata
  (`zoom`, `fit`), schermo intero (`full`), apertura in una nuova scheda e Scarica.
- Per provare usare "Prova la demo" (`js/demo.js`, dati deterministici generati nel browser); nell'Orario "Genera"
  crea la bozza dalle lezioni della demo.
