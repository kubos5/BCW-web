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
  Stato di una pagina aperta sopra un'altra con `ctx.pageState(nome, init)` (`{ key, state }`): si cancella quando la
  pagina esce dalla pila (`forgetPages` in `back`, nuovo tocco sulla scheda, `popstate`, `resetNavigation`), come lo
  `@State` di una pagina nell'app (es. i voti ipotetici di una materia).
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
  avvisa. Una chiave che l'ultima sincronizzazione non conosceva conta come cambiata solo se il server non ce l'ha (come
  nell'app: il valore predefinito di un browser appena aggiornato non cancella la scelta fatta su un altro dispositivo).
  Da sincronizzare (3.2.1, come nell'app): Impostazioni › Account › Da sincronizzare (`syncChoicesSection`, solo con
  l'account BCW) sceglie per questo browser le voci `SyncCategory` di `cloud.js`: Impostazioni, Aspetto (anche chiaro o
  scuro), Compiti fatti, Orario (niente "Icona dell'app": `appIconColor` resta sul server per gli altri dispositivi);
  `Preferences.unsyncedCategories` è locale, `syncCategoryOf(key)` dà la voce di ogni chiave (le nuove vanno in
  Impostazioni). `CloudSync` toglie le chiavi spente da ciò che invia e applica (`syncedKeys`) e non carica né scarica
  l'orario (`syncsTimetable`); `categoryChanged` toglie le chiavi spente dall'ultima sincronizzazione, così
  riaccendendole vince l'account BCW; riaccendendo l'orario si allinea come sempre. In Impostazioni › Orario ›
  Sincronizzazione lo stesso interruttore dell'orario ("Sincronizza l'orario", non nella demo).
  Per provarla in locale: BCW-api con `npm start` e il suo indirizzo in Server BCW (provata così la 3.2.1: voci spente,
  cambi dal server e riaccensione).
- Design dell'app iOS (3.3; Material 3 Expressive, senza Liquid Glass) e solo componenti di https://m3.material.io. Il Mac non
  c'è più: il layout degli schermi larghi è un adattamento libero di quello dell'app. Quello che il web non ha (widget,
  attività in diretta, Liquid Glass, icona dell'app) resta nell'app: i suoi valori salvati (es. `liveActivity` degli
  eventi, `appIconColor`) si conservano.
- Design Material 3 Expressive: colori come variabili CSS (`--primary`, `--surface-container…`, `--good/--fair/--poor/
  --neutral` con `-container`, `--subject-N`); alias brevi `--bg`, `--card`, `--ink`, `--ink2`, `--accent`. Font Google
  Sans Flex in `fonts/` (asse ROND per i titoli). Icone Material Symbols Rounded incorporate in `js/icons.js` (varianti
  `…Fill`; icone che non sono Material Symbols, come `github`, con il loro riquadro in `viewBoxes`); forme in
  `js/shapes.js` (`shape(name)` dentro un `.shaped`); logo come testo (`js/logo.js`: "BCW" in Google Sans Flex e la linea
  in `--brand`; `stacked` con la barra sotto, come nell'introduzione e nell'icona dell'app), così segue il tema scelto
  nell'app; il favicon si ridisegna con `--brand` (`Theme.updateFavicon()`). Icona dell'app installata (`icons/icon.svg`
  e i PNG): come l'icona dell'app per iPhone dalla 3.3, la scritta e la barra sotto nei ruoli del tema Mattone
  (sfondo `primary-container`, scritta `on-surface`, barra `brand`), dai tracciati di `AppIcon.icon` dell'app. Movimento con le molle `--spring`, `--spring-fast`, `--effects` (approssimate con `linear()`).
- Larghezze: sotto 600 px barra di navigazione flottante (3.3, come nell'app: `floatingNavBar` in `app.js`, una pillola
  di 56 px sospesa sul contenuto, 14 px sopra il bordo o 10 px dentro lo spazio sicuro, con i nomi delle quattro schede:
  Dashboard, Orario, Voti, Tu; tre con l'Orario nascosto, vedi Orario). La scheda aperta è una pillola piena nel primario
  con l'icona; cambiando scheda la pillola scivola con la molla (`captureNavTabs`/`animateNavTabs`, FLIP con le Web
  Animations; le altre schede stanno sopra la pillola, così i nomi restano leggibili). Le pagine lasciano libero
  `--nav-space` in fondo e il FAB sta sopra la barra. La ricerca è la
  barra in cima alla Dashboard (`page.searchBar`; `openSearch()` / `app.searching`: i risultati di `views/search.js`
  prendono il posto della pagina e la barra di navigazione si nasconde). 600–839 le stesse schede in una barra laterale.
  Le pagine principali delle schede hanno il titolo grande (34 px) nella riga dei pulsanti; quelle aperte da un'altra il
  titolo piccolo e la freccia. Le Impostazioni si aprono dall'ingranaggio di Tu.
  Nuovo tocco sulla scheda (o sulla sezione) aperta (`selectSection`, 3.3 come nell'app): il primo porta in cima la pagina
  in vista, anche una aperta dentro la scheda; il successivo, già in cima, torna alla pagina principale e poi fa
  `view.reselect` (Dashboard: domani; Orario: il giorno predefinito; Voti: la media dell'anno se era scelto un periodo).
  `reselectSkipsTop` salta il primo passo (vista Giorno dell'Orario, già scorsa all'ora; Voti sugli schermi larghi).
  Il popup degli account (`accountSwitcherSheet`) con l'account BCW ha anche "Esci da BCW".
- Da 840 px (come le app Google sul web): barra superiore con logo, ricerca generale (fuori dalla `.page`, così non perde il
  fuoco), Aggiorna, Impostazioni e avatar (menu degli account); barra di navigazione espansa con tutte le sezioni
  (riducibile; tra 840 e 1000 si apre sopra il contenuto); pagina in un pannello con angoli ampi; ricerche di pagina nel
  contenuto (`localSearchField`); Impostazioni e Bacheca con elenco e dettaglio affiancati.
- Accesso (`views/login.js`): sui telefoni come nell'app; con un campo attivo (tastiera aperta, `pointer: coarse`)
  disposizione compatta in alto (logo piccolo e titolo su una riga, gruppo Classeviva/Account BCW, campi, Accedi);
  il titolo sta sulla linea di base del logo, alzato perché il centro del testo visibile coincida con quello di "BCW"
  (metriche di Google Sans Flex nel commento del CSS; misurare con `measureText` e la linea di base, non con le scatole).
  Dalla 3.3 un'intestazione sola nelle due disposizioni (`loginHeader`): con la tastiera chiusa il logo ha la barra sotto
  (`stacked`, parte alta 0,31 sotto la linea di base) e tra la barra e le maiuscole del titolo lo stesso vuoto che tra la
  scritta e la barra (13,6 px); aperta, la barra va a destra. Scritta, barra e titolo hanno `data-flip`: `playFlips` in
  `app.js` li porta dalla posizione di prima a quella nuova con la molla (FLIP); un titolo che va a capo (`wraps`, da
  `fitLoginTitles`, al massimo tre righe: centrato sotto il logo, a sinistra accanto al logo piccolo) invece di scorrere
  sparisce e ricompare a movimento quasi finito. Note in basso ridotte: con un accesso già fatto (aggiunta di un account,
  primo account da abbinare, account BCW dalle Impostazioni) nessuna, altrimenti l'affiliazione e "Usa un altro server
  BCW" o, solo nel web, "Usa un altro proxy" (senza indirizzo); le spiegazioni restano nel pannello largo.
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
  `.page-fixed`, ma solo in una pagina nuova: chiudendo la ricerca non sale da sola) e non in diagonale. Un'animazione
  CSS annullata non riparte finché la classe non cambia. Con la stessa regola le caselle dei compiti fatti (`.check`)
  saltano solo se c'erano già (quando le si tocca) e il pulsante "Domani"/"Oggi" (`.day-jump`) spunta solo se compare
  cambiando giorno; la pagina che esce, rimessa nel documento da `animateAxisExits()`, ha le animazioni dei suoi
  elementi annullate (altrimenti ripartirebbero). Lista e Giorno dell'Orario sui telefoni hanno contenitori diversi
  (`.view-swap`, chiave per vista, assi `tt-day`/`tt-grid`) e si scambiano con la dissolvenza, non di lato; tornando
  alla Lista si riparte dall'alto (`tt-mode`).
- Componenti dell'app: `dayHero` (giorno in grande, pulsante del giorno predefinito e chip;
  il nome che non ci sta si rimpicciolisce fino al 70% con `fitDayTitles()` in `app.js`, come `minimumScaleFactor`
  nell'app, rimisurato a ogni disegno), `statusChip`, `segmentedSection` + `segCell`, `listGroup`
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
  una sessione. Dalla 3.2.1 (come l'app) è il giorno predefinito ovunque: il pulsante accanto al giorno in grande (nella
  modifica e nella vista Giorno degli schermi larghi nella barra; sui telefoni la vista Giorno non ce l'ha, come
  nell'app) si chiama come quel giorno ("Oggi", "Domani", "Lunedì", `jumpTitle`) e ci porta (`tt-jump`, anche Alt+T),
  come un nuovo tocco sulla scheda. Il giorno mostrato non cambia da solo quando finisce l'ultimo evento, il pulsante sì
  (ridisegno ogni 30 s). Il selettore della data ha ancora "Oggi".
  La barra di avanzamento della giornata della 3.2.1 non c'è più (tolta anche nell'app, 3.3): `showsDayProgress` si
  toglie dalle preferenze e non si sincronizza (sul server resta).
  Verifiche nella Lista accese di serie (3.3, `timetableShowsTests`): un browser che arriva dalla 3.2.1 (preferenze
  senza `timetableShowsNowCard`) con `false`, il vecchio valore di serie salvato con gli altri, passa ad accese.
  Card "Adesso" (`nowCard`): le ore uguali di seguito sono una lezione sola (`timetableLayout(…, { splitAtBreaks: true })`,
  blocchi), con una barra fino alla fine dell'ultima; toccandola si apre l'ora in corso. Si nasconde da Impostazioni ›
  Orario › Oggi (`timetableShowsNowCard`, sincronizzata come impostazione).
  Nella Lista le ore di un gruppo non hanno più la linea tratteggiata: la barretta arriva al bordo verso le ore accanto
  (`join-up`/`join-down`, margini negativi) e forma una barra a segmenti con 4 px di stacco.
  Anteprima della bozza (3.3, al posto del bordo tratteggiato): pillole più piene nella tinta (`.tt-run.draft`,
  `.tt-block.draft`, `.tt-seg.draft`), che compaiono a scaglioni (`draft-in`, `--draft-delay`), con un'onda al posto della
  barretta (maschera SVG ripetuta) e un'onda di luce (`draftSheen`: ritardo dall'ora di inizio, così sembra una sola onda
  che scende lungo la giornata). Applicando la classe `draft` sparisce dagli stessi elementi e angoli, spazi e barretta
  si assestano con la molla. In alto `draftHeader` (contenitore terziario, forma che ruota), in basso `draftToolbar`
  (barra vivace, modalità temporanea con `hidesNav`: Rigenera, Scarta, Applica). La bozza tiene gli orari esatti
  (`makeTimetableDraft` in `timetable-sheets.js`, comune al foglio e all'introduzione); con ore fuori dalle mezz'ore
  `applyDraft` passa all'allineamento libero (`draftNeedsFreeAlignment`, detto nell'intestazione e sotto le ore).
  Sposta gli orari (3.3, `shiftSheet`, dalla barra della modifica, dove non c'è più la palette, che resta nel menu
  dell'orario): minuti per tutti i giorni (scorciatoie ±5/10/15 o scritti; il segno si cambia toccandolo) e per ogni giorno
  (`minutes`, solo quelli cambiati a mano; cambiando il valore in cima si azzerano), eventi da togliere aprendo un giorno,
  interruttore per gli intervalli; `store.shift(minuti per id, { freeAlignment })` con `shiftedEntry` (stessa durata,
  dentro la giornata). Con l'allineamento automatico e una lezione che non cadrebbe più alla mezz'ora, un avviso e
  l'orario passa a quello libero.
  Attività in diretta per evento (3.3, `liveActivity`: `null` = segue l'impostazione dell'iPhone, `show`, `hide`;
  `LiveActivityChoice`): il web non ha attività in diretta ma conserva il campo (un valore sconosciuto vale `null`),
  lo mostra nell'editor ("Attività in diretta", con la spiegazione per l'app) e lo propaga agli eventi con lo stesso nome.
  Scheda Orario nascosta (`showsTimetableTab`, Impostazioni › Orario › Scheda, sincronizzata come impostazione):
  `visibleTabs()` in `app.js` per la barra di navigazione e la barra laterale; `leaveHiddenTimetable()` porta alla
  Dashboard se l'Orario è aperto (anche da `#/timetable` o dall'ultima sezione salvata) e `selectSection('timetable')`
  va alla Dashboard. Scorciatoie (`sectionShortcut`): le destinazioni principali numerate come compaiono (Alt+1–3 con
  l'Orario nascosto, come ⌘1–⌘3 nell'app), le altre sezioni tengono la loro.
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
- Voti (3.3): "E se prendessi…" (`gradeSimulator` in `views/grades.js`, come `GradeSimulator` nell'app): voti ipotetici
  (`newHypothetical`, `GradeBook.adding`: datati oggi, nel periodo scelto o nell'ultimo) sulla media della materia e su
  quella generale o del periodo. Nei Voti comprimibile, dopo l'andamento, con la materia di ogni voto tra tutte quelle
  dell'anno (`model.subjects`, più quelle dei soli voti); nella pagina della materia aperto, dopo l'obiettivo, con
  `ctx.pageState` (sparisce uscendo). Le azioni (`sim-…`) trovano lo stato con `data-sim`.
- Introduzione (3.3, `js/onboarding.js`, come nell'app): alla prima apertura (`isFirstRun`: niente
  `bcw.onboardingCompleted`, account, account BCW né demo; chi aggiorna non la vede) e da Impostazioni › Generale ›
  Rivedi l'introduzione. Sta in `app.onboarding` (non nello stato delle viste, che si azzera cambiando sessione) e copre
  tutto: sotto non si disegna altro, fogli e dialoghi le stanno sopra. Passaggi: accoglienza, colori, tema e contrasto,
  forme e movimento, vista della Dashboard, funzioni, Classeviva, account BCW, orario dalle lezioni (con la scheda Orario
  e un account; bozza tenuta nella pagina, `weekGlance`), fine con i coriandoli di forme. Bianco e nero: `data-mono` su
  `<html>` (blocchi `:root[data-mono]` in fondo al CSS, che battono anche il tema generato), messo già da
  `js/theme-boot.js` con la stessa regola; tocca solo i ruoli di M3. Cerchio dei colori: `revealTheme(punto, changes)` in
  `app.js` (`ctx.revealTheme`) con le View Transitions (la pagina nuova in un `circle()` che cresce, 1,15 s, curva
  "emphasized"; dissolvenza con le animazioni ridotte; senza View Transitions cambia e basta): scegliere un colore,
  chiaro o scuro, riaprire e finire l'introduzione. Forme che si trasformano (`animateMorphShapes`, dopo ogni disegno):
  180 punti per forma, ricavati a mano dai tracciati di `shapes.js` (`getPointAtLength` costava 0,2 s per forma),
  interpolati con una molla; gli SVG hanno `data-morph-skip`. Le pagine usano `axisPage` (asse condiviso) e
  `.stagger` (comparsa a scaglioni); gli interruttori riusano le azioni delle Impostazioni.
- Per provare usare "Prova la demo" (`js/demo.js`, dati deterministici generati nel browser); nell'Orario "Genera"
  crea la bozza dalle lezioni della demo. Per rivedere la prima apertura: cancellare `bcw.onboardingCompleted` (e gli
  account) dal `localStorage`; nelle prove automatiche impostarlo prima di aprire la pagina.
