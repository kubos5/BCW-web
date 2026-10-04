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
- Colori solo dalle variabili CSS (`--bg`, `--surface`, `--accent`, `--subject-N`…), mai nero/bianco puri come sfondo.
- Per provare usare "Prova la demo" (`js/demo.js`, dati deterministici generati nel browser).
