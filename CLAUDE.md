# CLAUDE.md — BCW web

Versione web di BCW (Better ClasseViVa, https://github.com/kubos5/BCW), client per il registro Classeviva.
Rispondi all'utente in **italiano**. Testi UI e commenti in italiano.

- HTML + JavaScript (moduli ES) senza dipendenze né build. Avvio: `node server.js` → http://localhost:8080.
- `server.js` serve i file pubblici e fa da proxy (`/api/v1/*` → `web.spaggiari.eu/rest/v1/*`,
  `/api/archive/YY/*` → `webYY.spaggiari.eu`), aggiungendo User-Agent e Z-Dev-Apikey. Variante: `proxy/cloudflare-worker.js`.
- Le viste (`js/views/*`) restituiscono un descrittore di pagina (`title`, `subtitle`, `actions`, `body` o `split` o `full`,
  `search`, `refresh`, `fixed` (parte ferma sopra l'area che scorre, sui telefoni), `searchBar` (barra di ricerca al posto
  della barra superiore), `fabMenu`, `fab`, `toolbar` + `hidesNav`, `reselect`); `js/app.js` costruisce la shell e applica
  l'HTML con `dom.js` (morph).
  Azioni delegate via `data-action` / `data-input` / `data-change` / `data-context` / `data-longpress` / `data-dblclick`;
  ogni vista esporta `actions`. `ctx.afterRender(fn)` esegue codice dopo il disegno (es. scorrere a un'ora).
- Stato locale delle viste con `ctx.state(key, init)`; operazioni asincrone una tantum con `ctx.task(key, fn)`.
  Fogli: `openSheet` (sostituisce), `pushSheet` (sopra, chiudendo si torna indietro); i fogli dell'Orario tengono lo
  stato in `sheet:<id>` e lo cancellano in `onClose`. `confirm({ actions })` per dialoghi con più scelte.
- Proxy predefinito in `config.json` (`{"proxy": "https://…", "api": "https://…"}`, letto una volta da `loadConfig()`);
  `Proxy.init()` all'avvio: indirizzo dell'utente (localStorage) > proxy del sito stesso (`/api/ping` con `X-BCW-Proxy`)
  > `config.json`. `api` è il server degli account BCW (BCW-api, https://github.com/kubos5/BCW-api), `BCWServer` in
  `js/cloud.js` (cambiabile da Impostazioni › Account › Server BCW, `bcw.api`).
- Account BCW (`js/cloud.js`, metodi `cloud…` di `AppModel`): `model.cloud` = `{ token, user }` (`bcw.cloud.session`).
  Con l'account BCW `model.accounts` sono gli account Classeviva abbinati (id del server, con le credenziali, in
  `bcw.cloud.accounts`, attivo in `bcw.cloud.activeAccount`); quelli del browser restano in `bcw.accounts` e tornano
  uscendo da BCW. Senza account abbinati la schermata di accesso chiede di abbinare il primo. `signIn` con l'account BCW
  abbina sul server (`POST /accounts`); il cestino diventa "Scollega" (`unlinkAccount`). `refreshCloud` (all'avvio, con
  Aggiorna, tornando sulla pagina, al massimo ogni 30 s) allinea gli account; un 401 fa uscire con `cloudNotice`.
  Lato Classeviva: `classevivaLinks()`/`removeClassevivaLink()` con il token di Classeviva (`linksSection` in
  Impostazioni; senza account BCW l'elenco si carica solo con "Mostra gli account BCW abbinati", perché il server
  riceve il token). Sincronizzazione (`CloudSync`): impostazioni di `SYNCED_PREFERENCES` con unione a tre vie (validate prima
  di applicarle), orario per account (vince il lato cambiato, entrambi = questo dispositivo, la prima volta il server) con
  i file caricati prima dell'orario; `Preferences.onPersist` e `TimetableStore.onSaved` avvisano, `applyRemote` non
  avvisa. Per provarla in locale: BCW-api con `npm start` e il suo indirizzo in Server BCW.
- Design dell'app iOS 3.0 (Material 3 Expressive, senza Liquid Glass) e solo componenti di https://m3.material.io. Il Mac non
  c'è più: il layout degli schermi larghi è un adattamento libero di quello dell'app.
- Design Material 3 Expressive: colori come variabili CSS (`--primary`, `--surface-container…`, `--good/--fair/--poor/
  --neutral` con `-container`, `--subject-N`); alias brevi `--bg`, `--card`, `--ink`, `--ink2`, `--accent`. Font Google
  Sans Flex in `fonts/` (asse ROND per i titoli). Icone Material Symbols Rounded incorporate in `js/icons.js` (varianti
  `…Fill`); forme in `js/shapes.js` (`shape(name)` dentro un `.shaped`); logo come testo (`js/logo.js`: "BCW" in Google
  Sans Flex e la linea in `--brand`), così segue il tema scelto nell'app; il favicon si ridisegna con `--brand`
  (`Theme.updateFavicon()`). Movimento con le molle `--spring`, `--spring-fast`, `--effects` (approssimate con `linear()`).
- Larghezze: sotto 600 px barra di navigazione in basso con quattro schede (Dashboard, Orario, Voti, Tu); la ricerca è la
  barra in cima alla Dashboard (`page.searchBar`; `openSearch()` / `app.searching`: i risultati di `views/search.js`
  prendono il posto della pagina e la barra di navigazione si nasconde). 600–839 le stesse schede in una barra laterale.
  Le pagine principali delle schede hanno il titolo grande (34 px) nella riga dei pulsanti; quelle aperte da un'altra il
  titolo piccolo e la freccia. Le Impostazioni si aprono dall'ingranaggio di Tu.
- Da 840 px (come le app Google sul web): barra superiore con logo, ricerca generale (fuori dalla `.page`, così non perde il
  fuoco), Aggiorna, Impostazioni e avatar (menu degli account); barra di navigazione espansa con tutte le sezioni
  (riducibile; tra 840 e 1000 si apre sopra il contenuto); pagina in un pannello con angoli ampi; ricerche di pagina nel
  contenuto (`localSearchField`); Impostazioni e Bacheca con elenco e dettaglio affiancati.
- Accesso (`views/login.js`): sui telefoni come nell'app; con un campo attivo (tastiera aperta, `pointer: coarse`)
  disposizione compatta in alto (logo piccolo e titolo su una riga, gruppo Classeviva/Account BCW, campi, Accedi);
  il titolo sta sulla linea di base del logo, alzato perché il centro del testo visibile coincida con quello di "BCW"
  (metriche di Google Sans Flex nel commento del CSS; misurare con `measureText` e la linea di base, non con le scatole).
  Il gruppo ha `data-keep-focus` (toccarlo non toglie il fuoco: i campi dei due moduli hanno le stesse chiavi
  `f-user`/`f-pass`, quindi il cursore resta e cambia solo il valore); `data-blank-blur` chiude la tastiera toccando
  lo spazio vuoto; le note dei due moduli occupano sempre l'altezza delle più lunghe. Safari (e Chrome su Android) non
  rimpiccioliscono la pagina con la tastiera ma la fanno scorrere: ogni tocco su un campo dà il fuoco dall'app
  (`focus({ preventScroll })`, al primo dopo aver applicato la disposizione compatta), `fitKeyboard()` dà alla pagina
  l'altezza e la posizione di `visualViewport` (`--keyboard-viewport`, `--keyboard-top`) e `revealLoginField()` fa
  scorrere solo l'accesso, quanto basta per il campo attivo e il pulsante (registrazione su schermi bassi). Da 840 px un pannello in due
  colonne (logo, titolo e spiegazione a sinistra, modulo a destra) con note e server sotto.
- Settimana e mese di Dashboard e Orario: `calendarBar()` (`js/calendar-bar.js`), gruppo di pulsanti fermo sopra l'area che
  scorre (`page.fixed`; sugli schermi larghi nella colonna laterale). Il giorno scelto è pieno e più largo; il titolo
  del periodo apre il selettore della data (`ctx.openDatePicker`, `js/date-picker.js`). Vista Lista = settimana, vista
  Calendario della Dashboard = mese; l'Orario ha solo Lista e Giorno.
- Giorni e schede cambiano con la transizione ad asse condiviso: `axisPage(nome, verso, chiave, html)`; la pagina nuova
  entra con `.axis-in`, quella vecchia la ridisegna `animateAxisExits()` dopo il morph. Il giorno accanto si raggiunge
  scorrendo di lato (`data-day-swipe`). Il verso resta nello stato della vista, quindi `axis-in`/`slide-±1` tornano a
  ogni disegno: `settleNewSlides()` annulla l'animazione delle pagine in un contenitore appena creato (cambio di scheda,
  ritorno da un'altra pagina), così cambiando scheda tutto sale dal basso (`page-in`, anche la parte ferma
  `.page-fixed`) e non in diagonale. Un'animazione CSS annullata non riparte finché la classe non cambia.
- Componenti dell'app: `dayHero` (giorno in grande e chip), `statusChip`, `segmentedSection` + `segCell`, `listGroup`
  (anche con `background`), `dateBadge`, `connectedGroup`, `primaryTabs`, `statTile` con `corners`, menu del FAB
  (`page.fabMenu`, voci con un'azione) e barra degli strumenti flottante (`floatingToolbar`, vivace nella modifica
  dell'orario, che nasconde la barra di navigazione).
- Barra superiore colorata (`.app-bar.scrolled`) solo quando l'utente scorre il contenuto: gli scorrimenti fatti
  dall'app passano da `ctx.scrollQuietly(el, top)`, le aree con `data-bar-ignore` non contano (anche le pagine con una
  parte ferma in alto e la ricerca) e dopo ogni disegno il colore si toglie se il contenuto non è più scorso.
- Orario: logica in `js/timetable.js` (stesso JSON dell'app iOS: minuti dalla mezzanotte, giorni 1 = lunedì, UUID
  maiuscoli, date senza millisecondi, backup `com.bcw.timetable-backup`), viste in `views/timetable.js` e fogli in
  `views/timetable-sheets.js`. Un documento per account in `localStorage` (`bcw.timetable.<account>`), file in IndexedDB
  (`BlobStore`, spazio `ttfile-<account>`); la demo usa `demo` e si cancella uscendo.
  Giorno iniziale (`defaultTimetableDay(store)`, stessa regola dell'app iOS e dei widget): oggi se c'è ancora un evento
  non finito (fine > adesso), altrimenti il primo dei 7 giorni successivi con eventi, se no oggi; contano solo gli eventi
  dell'orario salvato (non intervalli, bozza o verifiche di Classeviva). Si sceglie alla prima apertura della scheda in
  una sessione; "Oggi" e un nuovo tocco sulla scheda portano a oggi.
- Cambi di sessione (account, demo) con `model.changeSession(fn)`: dissolvenza, cambio dei dati e ritorno quando ci
  sono (al massimo 3 s). La demo non è un account: si apre anche con un account collegato e uscendo si torna a quello.
- `dom.js`: i nodi con `data-key` scomparsi vanno tolti prima di quelli nuovi; spostare un nodo gli toglie il fuoco.
  Niente stato negli attributi aggiunti a mano (il morph li toglie), tranne `data-signature` dei grafici.
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
