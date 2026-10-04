# BCW: Better ClasseViVa per il web

La versione web di [BCW](https://github.com/kubos5/BCW), il client per il registro elettronico [Classeviva](https://web.spaggiari.eu) di Gruppo Spaggiari Parma. Stesse funzioni, stessi colori e stesso design dell'app per iPhone, iPad e Mac, in HTML e JavaScript senza dipendenze né passaggi di compilazione.

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

Se pubblichi solo i file statici, il proxy può girare come Cloudflare Worker gratuito:

1. crea un Worker su dash.cloudflare.com e incolla `proxy/cloudflare-worker.js`
2. nelle variabili del Worker imposta `ALLOWED_ORIGINS` con l'indirizzo dell'app (es. `https://tuonome.github.io`)
3. in BCW tocca "Modifica" accanto a "Server" nella schermata di accesso (oppure Impostazioni › Server) e inserisci l'indirizzo del Worker

Anche `server.js` accetta richieste da altri siti se imposti `ALLOWED_ORIGINS`.

### Installazione come app

BCW è una Progressive Web App: in Safari su iPhone e iPad usa Condividi › Aggiungi alla schermata Home, in Chrome ed Edge il pulsante Installa nella barra degli indirizzi. Installata, si apre a tutto schermo e funziona anche offline con gli ultimi dati scaricati.

---

## Funzioni

Le stesse dell'app nativa:

- Dashboard con lista settimanale o calendario mensile, aperta di default sul giorno dopo; per ogni giorno compiti, verifiche, eventi, presenze e, per i giorni passati, le lezioni in una sezione separata; prossimi giorni e sezioni comprimibili
- puoi segnare i compiti come fatti e, opzionalmente, nasconderli
- Voti con media generale e medie dei periodi, grafico dell'andamento, ultimi voti espandibili e filtrabili per materia e periodo, elenco delle materie
- effetto di ogni voto sulla media della materia (▲/▼) e grafico dei voti di ogni materia
- dato un obiettivo di media, il voto necessario nelle prossime 1-5 prove
- media di tutti i voti o media delle medie, con o senza pesi
- Tu con profilo, statistiche e tutte le altre sezioni
- bacheca con filtri e ricerca, adesione, firma e risposta alle comunicazioni e anteprima degli allegati
- note disciplinari e annotazioni, assenze e ritardi con quelli da giustificare
- scrutini e pagelle con riepilogo per periodo e insufficienze
- anni precedenti: pagelle dall'archivio di Classeviva e accesso al sito per il resto
- materiale didattico per docente e cartella, registro delle lezioni per giorno o per materia, agenda completa, materie e docenti, libri di testo, calendario scolastico con il conto alla rovescia alle prossime vacanze
- ricerca globale su compiti, voti, comunicazioni, materiale e note
- promemoria la sera prima di compiti e verifiche, all'orario scelto
- aggiunta al Calendario di compiti, verifiche ed eventi (file .ics), anche di tutta l'agenda con gli avvisi già impostati
- blocco dell'app con Face ID, Touch ID o Windows Hello (passkey del dispositivo), oppure con un codice
- consultazione offline con i dati dell'ultima volta
- account genitore con più figli, più account salvati e passaggio dall'uno all'altro
- modalità demo con dati di esempio
- tema chiaro, scuro o automatico

### Su schermi larghi

Come su Mac: barra laterale con tutte le sezioni e i contatori delle cose da leggere o giustificare, account in fondo alla barra, pagine a due colonne (Dashboard, Voti, dettaglio materia, Scrutini, Anni precedenti, Lezioni), bacheca con elenco e comunicazione affiancati, griglie di card, impostazioni a schede. Le scorciatoie usano Alt (⌥ su Mac): Alt+1…9 per le sezioni, Alt+R per aggiornare, Alt+← Alt+→ Alt+T per spostarsi tra i giorni nella Dashboard.

Sotto i 900 pixel di larghezza l'app usa il layout di iPhone, con la barra delle schede in basso.

### Differenze dovute al web

- le credenziali sono salvate nel browser (`localStorage`) invece che nel Portachiavi, e inviate solo ai server di Classeviva tramite il proxy
- le notifiche arrivano mentre BCW è aperta, anche in una scheda in secondo piano o installata come app; per avvisi sempre affidabili conviene esportare l'agenda nel Calendario
- su iPhone e iPad le notifiche web funzionano solo con BCW aggiunta alla schermata Home

### Design

Stessa palette dell'app: `#F7F2E8` per lo sfondo chiaro, `#1E1D1C` per lo sfondo scuro, accento rosso mattone `#A23E2F`. Il font è New York sui dispositivi Apple (tramite `ui-serif`); altrove, dove New York non è disponibile, si usa Source Serif 4, una serif dalle proporzioni simili. Barre, pulsanti e tab bar riprendono l'effetto vetro di iOS 26.

---

## Struttura del codice

```
index.html            Pagina dell'app
css/bcw.css           Design system: colori, font, componenti, layout iOS e Mac
js/
├── app.js            Shell: navigazione, barre, menu, fogli, dialoghi, scorciatoie
├── api.js            Client Classeviva, proxy, cache offline (IndexedDB)
├── models.js         Modelli decodificati in modo tollerante
├── store.js          Stato dell'app, account, caricamento dei dati, archivi
├── gradebook.js      Medie, andamento, voto necessario
├── prefs.js          Preferenze
├── reminders.js      Promemoria
├── calendar-export.js Esportazione .ics
├── lock.js           Blocco con passkey o codice
├── demo.js, pdf.js   Server demo e PDF di esempio
├── components.js     Componenti (card, badge voto, anelli, righe agenda…)
├── charts.js         Grafici SVG
├── dom.js            Aggiornamento del DOM per confronto
└── views/            Dashboard, Voti, Tu e sottosezioni, Bacheca, Cerca, Impostazioni, Accesso
server.js             Server statico e proxy (Node, senza dipendenze)
proxy/                Proxy come Cloudflare Worker
sw.js                 Service worker per l'uso offline
```

Le viste producono HTML a partire dallo stato; `dom.js` applica al documento solo le differenze, così restano intatti fuoco, scorrimento e animazioni.

---

## Licenza

Distribuito con licenza MIT. Vedi [LICENSE](LICENSE).
