# La Nostra Città, Il Nostro Futuro

Piattaforma web del comitato cittadino **Insieme per Milano** per raccogliere segnalazioni e proposte sui problemi dei quartieri, documentate con foto o video, e trasformarle in una **classifica delle priorità** da presentare ai candidati Sindaco.

I cittadini registrati inseriscono segnalazioni con almeno un allegato multimediale e sostengono quelle degli altri. Il comitato le verifica, le approva e ne segue il ciclo di vita fino all'invio ai candidati. Moduli automatici (moderazione del testo, classificazione, EXIF, controllo delle immagini) aiutano i volontari, che restano sempre l'ultima parola.

- Analisi dei requisiti: [`docs/analisi_requisiti_esercizio_1.md`](docs/analisi_requisiti_esercizio_1.md)
- Analisi tecnica e stato del progetto: [`docs/analisi-tecnica.md`](docs/analisi-tecnica.md)
- Riferimento delle API REST: [`docs/api.md`](docs/api.md)

## Stack

| Livello | Tecnologia |
|---|---|
| Frontend | HTML, CSS e JavaScript (ES modules) senza build; Leaflet + OpenStreetMap per le mappe |
| Backend | Node.js 22, Express 5, API REST JSON su `/api/v1` |
| Database | MySQL 8.0+ (InnoDB, utf8mb4) con `mysql2` e query parametrizzate, senza ORM |
| Sicurezza | Sessioni lato server in MySQL con cookie `HttpOnly`/`SameSite`, Argon2id, Helmet (CSP), rate limiting, controllo `Origin`, validazione Zod |
| Allegati | Multer, verifica dei magic bytes (`file-type`), EXIF (`exifr`), ricodifica senza metadati (`sharp`) |
| Test | `node:test` + `supertest` su un database MySQL di test |

## Requisiti

- **Docker** con Docker Compose, per l'avvio completo in container; oppure
- **Node.js 22.9** o superiore e **MySQL 8.0** o superiore (locale o nel container `mysql` del `docker-compose.yml`)

## Installazione

Ci sono due modi per avviare il progetto: **tutto in Docker** (non serve Node.js sul computer) oppure **Node.js in locale** con MySQL locale o in Docker.

### Opzione A — Tutto in Docker

```bash
git clone https://github.com/GabriWasef/la-nostra-citta-webapp.git
cd la-nostra-citta-webapp
cp .env.example .env          # imposta almeno DB_PASSWORD e SESSION_SECRET
docker compose up -d --build
```

Il servizio `app` costruisce l'immagine (con `npm ci` eseguito **dentro** il container), attende che MySQL sia pronto, applica migrazioni e dati di base e avvia il server su <http://localhost:3000>. Gli allegati sono conservati nel volume `uploads`.

Comandi di gestione, eseguiti nel container:

```bash
docker compose exec app node server/scripts/create-admin.js --email tu@esempio.it --nome Mario --cognome Rossi
docker compose exec app node server/scripts/seed.js --demo     # richiede SEED_DEMO_PASSWORD in .env
docker compose logs -f app
```

Nel container `DB_HOST` punta automaticamente al servizio `mysql`, quindi il valore in `.env` vale solo per l'avvio fuori da Docker.

### Opzione B — Node.js in locale

Servono Node.js 22.9 o superiore e **MySQL 8** (non MariaDB/XAMPP). Su Windows usa MySQL Community Server con MySQL Workbench, oppure solo il container `mysql` del `docker-compose.yml`.

```bash
git clone https://github.com/GabriWasef/la-nostra-citta-webapp.git
cd la-nostra-citta-webapp
npm install
cp .env.example .env
```

### Database

**MySQL in Docker** (i valori sono letti da `.env`):

```bash
docker compose up -d mysql
```

Il container crea il database, l'utente applicativo e il database di test.

**Con un MySQL installato in locale**, crea database e utente come root:

```sql
CREATE DATABASE la_nostra_citta CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE DATABASE la_nostra_citta_test CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE USER 'lnc_app'@'localhost' IDENTIFIED BY 'una-password-robusta';
GRANT ALL PRIVILEGES ON la_nostra_citta.* TO 'lnc_app'@'localhost';
GRANT ALL PRIVILEGES ON la_nostra_citta_test.* TO 'lnc_app'@'localhost';
-- Necessario per creare trigger con il log binario attivo (default di MySQL 8):
SET PERSIST log_bin_trust_function_creators = 1;
```

Poi applica lo schema e i dati iniziali:

```bash
npm run db:migrate      # crea tabelle, trigger, viste e stati
npm run db:seed         # categorie e quartieri iniziali
npm run admin:create -- --email tu@esempio.it --nome Mario --cognome Rossi
```

Per provare la piattaforma con dati dimostrativi (5 utenti, 7 segnalazioni con immagini generate), imposta `SEED_DEMO_PASSWORD` in `.env` ed esegui:

```bash
npm run db:seed:demo
```

Gli account dimostrativi sono `admin@lanostracitta.demo`, `moderatore@lanostracitta.demo`, `giulia@`, `luca@` e `sara@lanostracitta.demo`, tutti con la password `SEED_DEMO_PASSWORD`.

## Avvio

```bash
npm run dev     # sviluppo, con riavvio automatico
npm start       # produzione
```

La webapp è su <http://localhost:3000>. Il worker delle analisi IA gira dentro il server (`AI_WORKER_INTERVAL_MS`). In alternativa si avvia come processo separato con `npm run worker`, dopo aver impostato `AI_WORKER_INTERVAL_MS=0`.

## Comandi

| Comando | Descrizione |
|---|---|
| `npm run dev` | Avvia il server in sviluppo |
| `npm start` | Avvia il server |
| `npm run db:migrate` | Applica le migrazioni non ancora eseguite |
| `npm run db:reset` | **Svuota** il database e riapplica tutte le migrazioni (vietato in produzione) |
| `npm run db:seed` | Carica categorie e quartieri (idempotente) |
| `npm run db:seed:demo` | Dati di base + utenti e segnalazioni dimostrative |
| `npm run admin:create -- --email … --nome … --cognome …` | Crea un amministratore o promuove un utente esistente |
| `npm run worker` | Worker IA come processo separato (`-- --once` per svuotare la coda e uscire) |
| `npm test` | Esegue i test sul database `TEST_DB_NAME`, che viene **svuotato** |

## Struttura

```text
├── client/                    frontend statico servito da Express
│   ├── *.html                 una pagina per funzione
│   ├── css/style.css          stile unico, mobile-first, tema chiaro/scuro
│   └── js/
│       ├── api.js             unico punto di accesso all'API
│       ├── layout.js, dom.js  header, controllo accessi, utilità sicure (textContent)
│       ├── components/, catalogo.js, mappa.js
│       └── pages/             un modulo per pagina
├── server/
│   ├── src/
│   │   ├── app.js, server.js
│   │   ├── config/            env (validato con Zod), pool MySQL, store sessioni
│   │   ├── middlewares/       auth e ruoli, validazione, upload, sicurezza, errori
│   │   ├── routes/ → controllers/ → services/ → repositories/
│   │   ├── validators/        schemi Zod
│   │   ├── storage/           archivio file (locale; interfaccia pronta per S3)
│   │   ├── ai/                provider IA (regole) e worker della coda
│   │   └── utils/
│   ├── scripts/               migrate, seed, create-admin, worker
│   └── tests/
├── database/
│   ├── schema/                script SQL ufficiale dell'esercizio (riferimento, invariato)
│   ├── migrations/            001 schema iniziale + 002–009 correzioni ed estensioni
│   ├── seeds/                 dati iniziali
│   └── docker-init/
├── docs/                      requisiti, analisi tecnica, API
└── uploads/                   file caricati (ignorati da git)
```

## Database

Lo script ufficiale `database/schema/database_la_nostra_citta_mysql.sql` resta invariato come riferimento. Lo schema effettivo si ottiene applicando le migrazioni:

| Migrazione | Contenuto |
|---|---|
| 001 | Schema ufficiale (tabelle, indici, trigger, viste) senza `DROP` né dati |
| 002 | Codice stabile e flag `pubblica`/`finale` per gli stati |
| 003 | Una segnalazione non nasce già pubblicata; l'ultimo allegato e l'ultima categoria di una segnalazione pubblicata non si eliminano |
| 004 | Sostegno solo su segnalazioni pubblicate e non private; viste pubbliche filtrate |
| 005 | Storico con operatore e motivazione (variabili di sessione impostate dall'applicazione) |
| 006 | Sessioni, token di recupero password, registro delle operazioni, consenso privacy |
| 007 | Indici composti e `FULLTEXT` per la ricerca |
| 008 | Coerenza tipo media/MIME, hash dei file, origine delle coordinate |
| 009 | Analisi video, esito e revisione delle analisi IA, coda `job_elaborazione` |

Il motivo di ogni modifica è spiegato nel §3 di [`docs/analisi-tecnica.md`](docs/analisi-tecnica.md).

### Backup e ripristino

```bash
mysqldump --single-transaction --routines --triggers -u lnc_app -p la_nostra_citta > backup.sql
mysql -u lnc_app -p la_nostra_citta < backup.sql
```

Salvare anche la cartella `uploads/` (oppure il bucket, se si usa un object storage).

## Sicurezza e privacy

- Password salvate solo come hash **Argon2id**; confronto a tempo costante anche per e-mail inesistenti.
- Sessioni lato server, rigenerate al login e revocate a logout, sospensione, cambio o reset della password.
- Ogni input è validato con Zod sul server; le query sono sempre parametrizzate.
- Permessi verificati a ogni richiesta in base al ruolo (`CITTADINO`, `MODERATORE`, `AMMINISTRATORE`), riletto dal database.
- Allegati: whitelist di estensioni e verifica del tipo reale dai magic bytes; nomi casuali; file serviti solo tramite API con controllo di visibilità.
- Le immagini vengono ricodificate: si rimuovono tutti i metadati EXIF (compresa la posizione GPS). Le coordinate originali sono visibili solo al comitato.
- Segnalazioni anonime o riservate al comitato; disattivazione dell'account con anonimizzazione dei dati personali.
- Registro delle operazioni importanti consultabile dagli amministratori.
- In produzione: servire l'app dietro un reverse proxy HTTPS e impostare `NODE_ENV=production` e `TRUST_PROXY=true` (cookie `Secure`, HSTS).

## Risoluzione dei problemi

**`Error: …/node_modules/argon2/build/Release/argon2.node: invalid ELF header`** (oppure un errore simile su `sharp`)

`argon2` e `sharp` contengono moduli nativi compilati per il sistema su cui si esegue `npm install`. L'errore compare quando una cartella `node_modules` installata su macOS o Windows viene usata dentro un container o un server Linux.

- **Con Docker:** usa il `Dockerfile` e il `docker-compose.yml` del progetto (`docker compose up -d --build`). Il `.dockerignore` esclude `node_modules` e le dipendenze vengono installate nell'immagine. Se usi un tuo Dockerfile, non copiare `node_modules` ed esegui `npm ci` nel container.
- **Con la cartella del progetto montata nel container** (`volumes: - .:/app`): aggiungi anche un volume `- /app/node_modules`, così le dipendenze del container non vengono sostituite da quelle del computer, ed esegui `npm ci` nel container.
- **Su un server:** non copiare `node_modules`, ma esegui `npm ci --omit=dev` sul server stesso. In alternativa, dentro l'ambiente che dà l'errore: `rm -rf node_modules && npm ci`.

**`il database non è aggiornato … Esegui: npm run db:migrate && npm run db:seed`** all'avvio (nelle versioni precedenti: `Table '…' doesn't exist`): il database esiste ma lo schema non è stato creato. Esegui `npm run db:migrate` e `npm run db:seed`. Se il database era stato creato a mano con lo script ufficiale di `database/schema/`, `db:migrate` lo riconosce e applica solo le correzioni.

**`Il server del database è MariaDB`**: il progetto richiede **MySQL 8.0.19 o superiore**. XAMPP e altri pacchetti simili includono MariaDB, che non supporta la collation `utf8mb4_0900_ai_ci` usata dallo schema. Installa MySQL Community Server 8 oppure usa `docker compose up -d mysql`.

**Lettere accentate illeggibili nel terminale di Windows** (per esempio `Citt├á`): è solo la codifica della console. Esegui `chcp 65001` in PowerShell prima di `npm start`.

**`You do not have the SUPER privilege and binary logging is enabled`** durante `npm run db:migrate`: abilita `log_bin_trust_function_creators` (vedi la sezione Database). Con il `docker-compose.yml` del progetto è già attivo.

**Il login riesce ma la sessione non resta aperta:** con `NODE_ENV=production` il cookie è `Secure` e viaggia solo su HTTPS. In locale usa `NODE_ENV=development`; in produzione metti l'app dietro un reverse proxy HTTPS con `TRUST_PROXY=true`.

## Limiti noti e sviluppi futuri

- **E-mail di recupero password:** l'invio non è configurato; in sviluppo il link compare nel log del server. Serve un server SMTP (es. con nodemailer).
- **Video:** vengono verificati tipo e dimensione, ma non ricodificati. I metadati dei video, che possono includere la posizione, non vengono rimossi: serve ffmpeg.
- **IA:** i provider inclusi sono a regole (elenchi di parole, parole chiave, controlli tecnici sulle immagini). Servono a dimostrare il flusso. Si sostituiscono con modelli reali in `server/src/ai/` senza toccare API e database.
- **Antivirus e object storage:** i punti di aggancio (`scansionaFile`, interfaccia `storage`) sono predisposti ma non collegati.
- **App mobile o desktop:** non fa parte di questa fase. L'API REST è indipendente dal frontend; per un client nativo basterà aggiungere un'autenticazione a token in `middlewares/auth.js`.
