# CLAUDE.md — BCW web

Versione web di BCW (Better ClasseViVa, https://github.com/kubos5/BCW), client per il registro Classeviva.
Rispondi all'utente in **italiano**. Testi UI e commenti in italiano.

- HTML + JavaScript (moduli ES) senza dipendenze né build. Avvio: `node server.js` → http://localhost:8080.
- `server.js` serve i file pubblici e fa da proxy (`/api/v1/*` → `web.spaggiari.eu/rest/v1/*`,
  `/api/archive/YY/*` → `webYY.spaggiari.eu`), aggiungendo User-Agent e Z-Dev-Apikey. Variante: `proxy/cloudflare-worker.js`.
- Le viste (`js/views/*`) restituiscono un descrittore di pagina (`title`, `actions`, `body` o `split`, `search`, `refresh`);
  `js/app.js` costruisce la shell (iOS sotto 900 px, barra laterale stile macOS sopra) e applica l'HTML con `dom.js` (morph).
  Azioni delegate via `data-action` / `data-input` / `data-change` / `data-context`; ogni vista esporta `actions`.
- Stato locale delle viste con `ctx.state(key, init)`; operazioni asincrone una tantum con `ctx.task(key, fn)`.
- Proxy predefinito in `config.json` (`{"proxy": "https://…"}`); `Proxy.init()` all'avvio: indirizzo dell'utente
  (localStorage) > proxy del sito stesso (`/api/ping` con `X-BCW-Proxy`) > `config.json`.
- Su schermi larghi segue l'app Mac: ricerca generale nella barra (fuori dalla `.page`, così non perde il fuoco),
  niente sezione Cerca nella barra laterale, ricerche di pagina nel contenuto (`localSearchField`), titolo della
  Dashboard nel contenuto e menu della vista allineato al calendario (`navWidth`).
- `dom.js`: i nodi con `data-key` scomparsi vanno tolti prima di quelli nuovi; spostare un nodo gli toglie il fuoco.
  Niente stato negli attributi aggiunti a mano (il morph li toglie), tranne `data-signature` dei grafici.
- Aree scorrevoli: niente scorrimento orizzontale; nelle pagine a più aree (colonne, bacheca, barra laterale) le
  barre di scorrimento sono nascoste.
- Colori solo dalle variabili CSS (`--bg`, `--surface`, `--accent`, `--subject-N`…), mai nero/bianco puri come sfondo.
- Per provare usare "Prova la demo" (`js/demo.js`, dati deterministici generati nel browser).
