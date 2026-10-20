# BCW: Better ClasseViVa per il web

La versione web di [BCW](https://github.com/kubos5/BCW), il client per il registro elettronico [Classeviva](https://web.spaggiari.eu) di Gruppo Spaggiari Parma. Stesse funzioni e stesso design dell'app per iPhone e iPad, in Material 3 Expressive, in HTML e JavaScript senza dipendenze né passaggi di compilazione.

> BCW non è affiliato a Gruppo Spaggiari Parma S.p.A.

---

## Avvio

Serve [Node.js](https://nodejs.org) 18 o successivo, nient'altro.

```
git clone https://github.com/kubos5/BCW-web
cd BCW-web
node server.js
```

Poi apri http://localhost:8080. Per usare un'altra porta: `PORT=3000 node server.js`.

Per provare l'app senza un account usa "Prova la demo": i dati di esempio sono generati nel browser, quindi la demo funziona anche aprendo l'app da un qualsiasi hosting statico.

### Perché serve un server

Il browser non può contattare direttamente Classeviva: il server di Spaggiari non accetta richieste da altri siti (CORS) e l'API vuole lo User-Agent dell'app ufficiale, che il browser non permette di impostare. `server.js` pubblica l'app e fa da proxy, inoltrando le richieste solo verso `web.spaggiari.eu` e gli archivi `webYY.spaggiari.eu`. Non salva nulla: credenziali e token passano e basta.

### Hosting statico (GitHub Pages, Netlify…)

GitHub Pages pubblica solo file statici: l'app si apre, la demo funziona, ma l'accesso con un account reale fallisce (Pages risponde `405` alle richieste di login) perché manca il proxy. In questo caso BCW lo segnala nella schermata di accesso. Il proxy può girare gratis come Cloudflare Worker:

1. su [dash.cloudflare.com](https://dash.cloudflare.com) apri Workers e Pages › Crea, scegli "Inizia con Hello World", dagli un nome (es. `bcw-proxy`) e premi Distribuisci
2. premi Modifica codice, sostituisci tutto il contenuto con quello di `proxy/cloudflare-worker.js` e premi Distribuisci
3. in Impostazioni › Variabili e segreti aggiungi la variabile `ALLOWED_ORIGINS` con l'origine del sito, senza percorso finale: per GitHub Pages `https://tuonome.github.io`
4. scrivi l'indirizzo del Worker in `config.json`, nella radice del repository (vedi sotto)

Per controllare che il Worker funzioni apri `https://bcw-proxy.tuonome.workers.dev/ping` nel browser: deve rispondere `{"ok":true}`.

Quando `proxy/cloudflare-worker.js` cambia, ripeti il punto 2 per aggiornare il Worker. Ad esempio, dalla versione che segue i reindirizzamenti di Classeviva si scaricano gli allegati della Bacheca serviti da un altro indirizzo.

### Proxy predefinito

Il proxy che BCW usa di base si imposta in `config.json`, così chi apre il sito non deve configurarlo:

```
{
  "proxy": "https://bcw-proxy.tuonome.workers.dev",
  "api": "https://bcw-api.tuonome.workers.dev"
}
```

`api` è l'indirizzo del server per gli account BCW (vedi sotto); senza, l'accesso con un account BCW chiede di impostarlo.

All'avvio BCW sceglie, in ordine: l'indirizzo inserito a mano dall'utente (Modifica accanto a "Server" nella schermata di accesso, oppure Impostazioni › Server), il proxy del sito stesso se c'è (con `node server.js`), poi quello di `config.json`. Lasciando vuoto il campo si torna al predefinito.

Anche `server.js` accetta richieste da altri siti se imposti `ALLOWED_ORIGINS`.

### Account BCW

Con un account BCW (nome utente e password) si abbinano uno o più account Classeviva e si entra in tutti con un solo accesso, su ogni dispositivo e anche nell'app per iPhone e iPad. Si sincronizzano le impostazioni (tranne blocco, promemoria e notifiche, legati al browser), l'aspetto e l'orario di ogni account abbinato con i file allegati. Nella schermata di accesso (sui computer un pannello in due colonne, sui telefoni come nell'app, compatta con la tastiera aperta) un gruppo di pulsanti sceglie tra Classeviva e Account BCW; da Impostazioni › Account si accede o si crea un account anche con un account Classeviva già aperto, e gli account salvati nel browser si possono abbinare subito.

Chi entra con un account Classeviva vede in Impostazioni › Account a quali account BCW è abbinato e può scollegarsi da ognuno: basta l'accesso a Classeviva.

Il server è [BCW-api](https://github.com/kubos5/BCW-api), un Cloudflare Worker con un database D1. Il suo indirizzo predefinito si imposta in `config.json`, alla voce `api`; ognuno può cambiarlo da Impostazioni › Account › Server BCW (o da "Modifica" accanto a "Server BCW" nella schermata di accesso). BCW-api fa anche da proxy per Classeviva, quindi può stare anche nella voce `proxy`.

### Installazione come app

BCW è una Progressive Web App: in Safari su iPhone e iPad usa Condividi › Aggiungi alla schermata Home, in Chrome ed Edge il pulsante Installa nella barra degli indirizzi. Installata, si apre a tutto schermo e funziona anche offline con gli ultimi dati scaricati.

---

## Funzioni

Le stesse dell'app nativa:

- Dashboard con la settimana (vista Lista) o il mese (vista Calendario) come fila di pulsanti, aperta di default sul giorno dopo; il giorno in grande con i chip di stato e, sotto, compiti, verifiche, eventi, presenze e, per i giorni passati, le lezioni, ognuno in una sezione segmentata comprimibile
- toccando il periodo sopra la settimana si sceglie una data qualsiasi dal selettore della data; frecce e scorrimento di lato sulla settimana cambiano settimana (o mese), scorrendo di lato sul giorno si passa al giorno prima o dopo, con la transizione ad asse condiviso
- "Nei prossimi giorni" come la vista Programma di Google Calendar: la data in un riquadro (solo toccando quella si va al giorno), il nome del giorno che comprime gli elementi e gli elementi in una lista segmentata, con le stesse azioni del giorno scelto
- ricerca dalla barra in cima alla Dashboard, con la vista e l'avatar dell'account (che apre gli account): toccandola diventa il campo e i risultati prendono il posto della pagina
- toccando di nuovo la scheda Dashboard si torna in cima alla pagina e, se si è già in cima, alla giornata di domani
- puoi segnare i compiti come fatti e, opzionalmente, nasconderli
- Voti con la media in primo piano e i periodi in un gruppo di pulsanti collegati, grafico dell'andamento, schede Ultimi voti (divisi per mese, espandibili e filtrabili per materia) e Materie
- effetto di ogni voto sulla media della materia (▲/▼) e grafico dei voti di ogni materia
- dato un obiettivo di media, il voto necessario nelle prossime 1-5 prove
- media di tutti i voti o media delle medie, con o senza pesi
- Tu con il profilo al centro (Gestisci account, Cambia o Aggiungi), statistiche collegate, "Da vedere" (comunicazioni e note da leggere, assenze da giustificare) e tutte le altre sezioni in liste segmentate; le Impostazioni si aprono dall'ingranaggio
- bacheca con filtri e ricerca, adesione, firma e risposta alle comunicazioni e anteprima degli allegati: immagini da ingrandire (pulsanti, pizzico, doppio tocco, Ctrl + rotellina, tasti + − 0) e scorrere, adatte alla finestra o alla larghezza, anteprima a schermo intero con i controlli in alto, apertura in una nuova scheda senza scaricare e Scarica
- note disciplinari e annotazioni, assenze e ritardi con quelli da giustificare
- scrutini e pagelle con riepilogo per periodo e insufficienze
- anni precedenti: pagelle dall'archivio di Classeviva e accesso al sito per il resto
- materiale didattico per docente e cartella, registro delle lezioni per giorno o per materia, agenda completa, materie e docenti, libri di testo, calendario scolastico con il conto alla rovescia alle prossime vacanze
- ricerca globale su compiti, voti, comunicazioni, materiale e note
- promemoria la sera prima di compiti e verifiche, all'orario scelto
- aggiunta al Calendario di compiti, verifiche ed eventi (file .ics), anche di tutta l'agenda con gli avvisi già impostati
- blocco dell'app con una passkey (Face ID, Touch ID, Windows Hello o lo sblocco del dispositivo), oppure con un codice
- consultazione offline con i dati dell'ultima volta
- account genitore con più figli, più account salvati e passaggio dall'uno all'altro (anche tenendo premuta la scheda Tu), con una dissolvenza tra i dati di un account e quelli dell'altro
- account BCW: account Classeviva abbinati con un solo accesso, impostazioni e orario sincronizzati tra i dispositivi, scollegamento dagli account BCW anche dal lato Classeviva
- modalità demo con dati di esempio, anche con un account già collegato (uscendo si torna all'account)
- notifiche per nuovi voti, comunicazioni, note, assenze e compiti, da attivare in Impostazioni › Notifiche
- impostazioni divise in Generale, Aspetto, Voti, Dashboard, Orario, Notifiche e Account
- aspetto personalizzabile (Impostazioni › Aspetto): tema chiaro, scuro o automatico, colore d'accento (campioni o un colore qualsiasi) da cui si generano tutti i colori del sito, stile dei colori (Tonale, Vivace, Espressivo, Fedele, Neutro, Arcobaleno, Macedonia), contrasto, angoli più o meno arrotondati, animazioni espressive, standard o ridotte, caratteri arrotondati

### Orario

La scheda Orario contiene l'orario settimanale, che si compila a mano o si genera dalle lezioni registrate:

- due viste: Lista (la settimana in alto e il giorno in grande con le lezioni in una lista segmentata) e Giorno (le ore della giornata, a blocchi pieni nella tinta; su schermi larghi l'intera settimana)
- in cima la settimana è una fila di pulsanti, come nella Dashboard; scorrendo di lato si passa al giorno prima o dopo
- si apre su oggi finché c'è un evento da finire, altrimenti sul primo giorno successivo con eventi (finite le lezioni di oggi, o nel fine settimana); il pulsante Oggi riporta a oggi
- oggi una scheda in cima mostra la lezione in corso (quanto manca, con l'avanzamento) e quella dopo, oppure la prossima lezione
- toccando un evento si vedono i dettagli e si aggiungono note, file e foto, per un solo giorno o per ogni settimana
- le verifiche segnate dai docenti su Classeviva compaiono da sole sulla lezione della materia e si possono nascondere; altre verifiche si segnano a mano, per un giorno o per ogni settimana
- Verifiche nascoste (dal menu dell'orario): l'elenco delle verifiche nascoste, con il motivo, da cui si possono mostrare di nuovo, e le regole per nasconderle in automatico (per docente, materia, giorno della settimana, periodo, parole nel testo o materie che quel giorno non sono in orario)
- modificando un evento si può applicare la modifica a tutti quelli con lo stesso nome
- gli eventi uguali di seguito (es. due ore di matematica) sono uniti in un gruppo, quelli contemporanei sono affiancati
- intervalli che nella vista Giorno stanno sopra le lezioni senza cambiarne la durata e nella vista Lista sono una pillola con l'orario tra due linee ondulate
- le verifiche nella vista Lista si mostrano solo attivando "Mostra le verifiche" (Impostazioni o menu dell'orario)
- il pulsante + apre un menu con nuovo evento, nuovo intervallo, Modifica orario e generazione dalle lezioni
- modalità Modifica orario, nella vista Giorno, con una barra degli strumenti flottante in basso (allineamento, intervalli, colori, Fine) al posto della barra di navigazione: gli eventi si spostano trascinandoli (sul telefono dopo averli tenuti premuti; su schermi larghi anche da un giorno all'altro), si allungano dal bordo inferiore, se ne crea uno nuovo con un doppio tocco su un'ora vuota e toccandoli si modificano gli orari a mano
- allineamento dell'orario: automatico (eventi da 30 minuti o un'ora, alla mezz'ora) o libero (qualsiasi orario e durata); passando all'automatico gli eventi non allineati vengono allineati dopo una conferma; gli intervalli si posizionano sempre liberamente
- colori: quelli delle lezioni, colori personalizzati salvati, colori presi dalle palette (anche personalizzate) oppure una palette a sfumatura applicata a una serie di eventi di una giornata
- generazione automatica di una bozza dell'orario dalle lezioni registrate, mostrata in anteprima con i bordi tratteggiati prima di applicarla
- backup dell'orario da esportare e reimportare dalle Impostazioni (con i file allegati), compatibile con l'app BCW per iPhone e iPad

L'orario è salvato nel browser, separato per ogni account (il documento in `localStorage`, i file in IndexedDB); con un account BCW si sincronizza anche con il server.

### Su schermi larghi

Il layout dell'app adattato a uno schermo largo, come le app Google sul web: in alto la barra con il logo, la barra di ricerca, Aggiorna, Impostazioni e l'avatar dell'account (che apre il menu degli account); a sinistra la barra di navigazione espansa con tutte le sezioni e i contatori delle cose da leggere o giustificare (si riduce alle sole icone con il pulsante in alto); la pagina in un pannello con gli angoli ampi. Pagine a due colonne (Dashboard con la settimana o il mese e i prossimi giorni accanto al giorno, Orario, Voti, dettaglio materia, Scrutini, Anni precedenti, Lezioni), bacheca e impostazioni con elenco e dettaglio affiancati, elenchi in più colonne. In Bacheca, Agenda e Materiale la ricerca della pagina sta nel contenuto. Nelle pagine a più colonne le barre di scorrimento non compaiono, così le colonne mantengono la loro larghezza.

Scorciatoie: ⌘F (Ctrl+F) per cercare; con Alt (⌥ su Mac) Alt+1…9 per le sezioni (1 Dashboard, 2 Orario, 3 Voti, 4 Tu, 5 Bacheca, 6 Note, 7 Assenze, 8 Agenda, 9 Materiale), Alt+R per aggiornare, Alt+Maiusc+T per andare a domani nella Dashboard, Alt+T per tornare a oggi e Alt+N per un nuovo evento nell'Orario, Invio per uscire da Modifica orario.

Sotto gli 840 pixel di larghezza l'app usa il layout dei telefoni, uguale a quello dell'app per iPhone, con la barra di navigazione in basso e quattro schede (tra 600 e 840 pixel le schede stanno in una barra laterale).

### Differenze dovute al web

- le credenziali sono salvate nel browser (`localStorage`) invece che nel Portachiavi, e inviate solo ai server di Classeviva tramite il proxy (con un account BCW anche al server di BCW, che le conserva cifrate)
- le notifiche arrivano mentre BCW è aperta, anche in una scheda in secondo piano o installata come app; per avvisi sempre affidabili conviene esportare l'agenda nel Calendario
- su iPhone e iPad le notifiche web funzionano solo con BCW aggiunta alla schermata Home

### Design

Il sito segue [Material 3 Expressive](https://m3.material.io/):

- colori generati con material-color-utilities (schema Tonal Spot) dal rosso mattone di BCW `#A23E2F`, con tema chiaro e scuro; materie e stati (bene, sufficiente, insufficiente) hanno le loro palette tonali. Scegliendo un altro colore d'accento lo schema viene rigenerato nel browser (`js/theme.js`) e salvato, così all'apertura si applica subito
- font Google Sans Flex (incluso nel sito), con l'asse ROND per titoli e numeri arrotondati; anche il logo è scritto con questo font
- favicon con la linea di BCW nel colore del tema scelto nell'app (chiaro, scuro e colore d'accento)
- icone Material Symbols Rounded
- angoli ampi, liste segmentate, sezioni segmentate comprimibili, chip di stato, gruppi di pulsanti collegati, schede, barra di ricerca in alto, menu del pulsante d'azione flottante, barra degli strumenti flottante, selettore della data, barra di navigazione corta e barra di navigazione laterale, fogli dal basso e dialoghi
- transizioni di Material 3: asse condiviso tra i giorni e tra le schede dei Voti, dissolvenza incrociata verso la ricerca
- forme espressive (MaterialShapes): i voti in un "biscotto" a nove lobi, l'indicatore di caricamento che cambia forma ruotando, avatar e stati vuoti nelle forme di Material
- medie in anelli con la parte piena ondulata e barre di avanzamento ondulate
- animazioni a molla (pulsanti che stringono gli angoli alla pressione, selezioni che diventano pillole)

---

## Struttura del codice

```
index.html            Pagina dell'app
css/bcw.css           Design system Material 3 Expressive: colori, tipografia, forme, componenti, layout
fonts/                Google Sans Flex (licenza OFL)
js/
├── app.js            Shell: navigazione, barre, menu, fogli, dialoghi, scorciatoie
├── api.js            Client Classeviva, proxy, cache offline (IndexedDB)
├── cloud.js          Account BCW: server, richieste a BCW-api, sincronizzazione di impostazioni, orario e file
├── models.js         Modelli decodificati in modo tollerante
├── store.js          Stato dell'app, account, caricamento dei dati, archivi
├── timetable.js      Orario: modello, salvataggio, gruppi, verifiche, colori, generatore, backup
├── news.js           Notifiche delle novità
├── gradebook.js      Medie, andamento, voto necessario
├── prefs.js          Preferenze
├── reminders.js      Promemoria
├── calendar-export.js Esportazione .ics
├── lock.js           Blocco con passkey o codice
├── theme.js          Aspetto: colori dal colore d'accento, angoli, animazioni, caratteri
├── theme-boot.js     Applica l'aspetto salvato prima del primo disegno
├── vendor/           material-color-utilities (licenza Apache 2.0), raccolta in un file
├── demo.js, pdf.js   Server demo e PDF di esempio
├── components.js     Componenti (liste e sezioni segmentate, chip, badge voto, anelli ondulati, righe agenda…)
├── calendar-bar.js   Settimana e mese come gruppo di pulsanti
├── date-picker.js    Selettore della data di Material 3
├── icons.js, shapes.js, logo.js  Icone Material Symbols, forme di M3 Expressive, logo (testo e linea)
├── viewer.js         Anteprima dei file con zoom e schermo intero
├── charts.js         Grafici SVG
├── dom.js            Aggiornamento del DOM per confronto
└── views/            Dashboard, Orario, Voti, Tu e sottosezioni, Bacheca, Cerca, Impostazioni, Accesso
config.json           Proxy e server BCW predefiniti
server.js             Server statico e proxy (Node, senza dipendenze)
proxy/                Proxy come Cloudflare Worker
sw.js                 Service worker per l'uso offline
logo/                 Logo (BCW con la linea) e linea da sola, in SVG
```

Le viste producono HTML a partire dallo stato; `dom.js` applica al documento solo le differenze, così restano intatti fuoco, scorrimento e animazioni.

---

## Licenza

Distribuito con licenza MIT. Vedi [LICENSE](LICENSE).
