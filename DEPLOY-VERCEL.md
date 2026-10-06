# Pubblicare La Nostra Città su Vercel

Guida passo per passo. Tempo stimato: 30–40 minuti la prima volta.

## Come funziona su Vercel

| Parte | Dove sta |
| --- | --- |
| Pagine, CSS, JavaScript del browser, Leaflet | File statici generati da `npm run build:vercel` nella cartella `public/` |
| API REST (`/api/v1/...`) | Una sola funzione serverless (`api/index.js`) che esegue la stessa app Express usata in locale |
| Database | **MySQL 8 esterno** (Vercel non offre MySQL) |
| Foto e video | **Vercel Blob in modalità privata**; il browser li carica direttamente (una richiesta a una funzione non può superare 4,5 MB) e li legge tramite link firmati a scadenza breve |
| Analisi IA a regole | Partono subito dopo ogni segnalazione; una manutenzione giornaliera (cron) recupera quelle rimaste indietro e pulisce sessioni e file temporanei scaduti |
| Limiti di richieste (anti-abuso) | Salvati in MySQL (la memoria di una funzione non è condivisa) |

## 1. Un database MySQL 8 raggiungibile da internet

Servono **MySQL ≥ 8.0.19 veri**: lo schema usa trigger, vincoli CHECK e il collation `utf8mb4_0900_ai_ci`.
Non vanno bene MariaDB e i servizi "compatibili MySQL" senza trigger (es. TiDB, PlanetScale/Vitess).
Scegli un provider di MySQL gestito (Aiven, DigitalOcean Managed MySQL, AWS RDS/Aurora MySQL, Google Cloud SQL, Azure Database for MySQL, o un tuo server) e verifica prima che:

- sia MySQL 8.0.19 o superiore;
- l'utente applicativo possa creare trigger (sui servizi gestiti con log binario attivo serve `log_bin_trust_function_creators = 1`, di solito impostabile dal pannello);
- accetti connessioni dall'esterno con TLS (Vercel non ha indirizzi IP fissi, quindi l'accesso va aperto a internet e protetto da password robusta + TLS).

Crea un database vuoto (es. `la_nostra_citta`) e un utente con tutti i privilegi su quel database.

## 2. Preparare le variabili dal tuo PC

```bash
cp .env.production.example .env.production      # (PowerShell: Copy-Item .env.production.example .env.production)
```

Compila `.env.production` (file ignorato da git). Genera i due segreti con:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Uno per `SESSION_SECRET`, uno per `CRON_SECRET`. Le variabili `BLOB_*` le crea Vercel (punto 5); `APP_ORIGIN` si completa al punto 4.

## 3. Creare le tabelle e il primo amministratore

Dal tuo PC, con `.env.production` compilato (DB_HOST, DB_USER, DB_PASSWORD, DB_NAME, DB_SSL=true):

```bash
npm ci
npm run db:migrate:remoto
npm run admin:create:remoto
```

Il primo comando applica le migrazioni (lo script SQL ufficiale più le correzioni numerate). Il secondo chiede e-mail, nome, cognome e password dell'amministratore.
Se `db:migrate:remoto` segnala un errore sui trigger, il database non è adatto (vedi punto 1).

## 4. Creare il progetto su Vercel

1. Su <https://vercel.com> → **Add New… → Project** → importa il repository GitHub `la-nostra-citta-webapp`.
2. Branch di produzione: `main`. **Non cambiare** Framework Preset, Build Command, Output Directory: sono già in `vercel.json` (Framework "Other", `npm run build:vercel`, output `public`).
3. Prima di premere Deploy, apri **Environment Variables** e inserisci (ambiente *Production*; per le anteprime vedi nota in fondo):

| Variabile | Valore |
| --- | --- |
| `NODE_ENV` | `production` |
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | quelli del tuo database |
| `DB_SSL` | `true` |
| `DB_SSL_CA` | solo se il provider richiede il suo certificato CA (in una riga, con `\n` al posto degli a capo) |
| `DB_CONNECTION_LIMIT` | `3` (ogni istanza della funzione ha il suo pool: tieni basso il numero) |
| `SESSION_SECRET` | il segreto generato |
| `CRON_SECRET` | il secondo segreto generato (Vercel lo invia da solo al cron) |
| `AI_WORKER_INTERVAL_MS` | `0` |
| `GEOCODING_EMAIL` | (facoltativa) la tua e-mail di contatto per Nominatim |

   `APP_ORIGIN` si ricava da solo dall'indirizzo del progetto (`VERCEL_PROJECT_PRODUCTION_URL`). Se usi un **dominio personalizzato**, aggiungi `APP_ORIGIN=https://tuo-dominio.it`.
4. Premi **Deploy**. Il primo deploy non è ancora completo: manca lo store dei file.

## 5. Archivio per foto e video (Vercel Blob)

1. Nel progetto Vercel → **Storage → Create Database → Blob**.
2. Scegli l'accesso **Private** (importante: le segnalazioni possono contenere foto non pubbliche).
3. Collegalo al progetto per tutti gli ambienti (Production, Preview, Development). Lascia **invariato il prefisso predefinito delle variabili (`BLOB`)**: Vercel crea `BLOB_STORE_ID` e `BLOB_WEBHOOK_PUBLIC_KEY` (store con autenticazione OIDC) oppure `BLOB_READ_WRITE_TOKEN` (store con token). L'app funziona in entrambi i casi, ma i nomi devono essere esattamente questi: con un prefisso diverso (per esempio `BLOB_READ_WRITE_TOKEN_STORE_ID`) l'app non li riconosce e salva i file su disco, che su Vercel è in sola lettura (errore "Si è verificato un errore imprevisto" all'invio di una segnalazione).
4. **Deployments → ⋯ → Redeploy** (le variabili nuove valgono solo per i deploy successivi).

## 6. Verificare che tutto funzioni

1. Apri `https://<tuo-progetto>.vercel.app/api/v1/health` → deve rispondere `{"stato":"ok",...}`.
2. Accedi con l'amministratore creato al punto 3 → **Amministrazione → Diagnostica** → **Esegui i controlli**. Verifica:
   - **Database**: versione e connessione cifrata;
   - **Migrazioni**: nessuna in sospeso;
   - **Archivio**: scrittura, lettura, link firmato ed eliminazione di un file di prova;
   - **Ricerca indirizzi**: Nominatim raggiungibile;
   - **CRON_SECRET** e **APP_ORIGIN** configurati.
3. Crea una segnalazione con una foto dalla pagina "Nuova segnalazione": la foto passa direttamente dal browser a Blob e compare nel dettaglio.
4. Nella mappa cerca un indirizzo e posiziona il segnaposto.

Se un controllo fallisce, il messaggio indica cosa correggere. Dopo ogni modifica alle variabili esegui un nuovo Redeploy.

## Aggiornamenti futuri

- Ogni push su `main` ripubblica automaticamente il sito.
- Se una versione aggiunge migrazioni (cartella `database/migrations/`), eseguile **prima** di pubblicare con `npm run db:migrate:remoto`: sono pensate per essere compatibili con la versione precedente.

## Limiti e costi da conoscere

- **Piano Hobby (gratuito)**: uso personale/non commerciale; il cron può girare una volta al giorno (è quello configurato: 03:00 UTC); funzioni fino a 60 s. Per un comitato con uso continuativo valuta il piano Pro: controlla condizioni e prezzi aggiornati sul sito di Vercel.
- **Blob**: ha quote di spazio e di trasferimento incluse; oltre si paga. I limiti dell'app (5 file, 10 MB per immagine, 50 MB per video) sono modificabili con `MAX_FILES`, `MAX_IMAGE_MB`, `MAX_VIDEO_MB`.
- **Avvio a freddo**: la prima richiesta dopo un periodo di inattività può richiedere qualche secondo (apertura della connessione al database).
- **Nominatim** (ricerca indirizzi) ha un limite di 1 richiesta al secondo: il server la rispetta e usa una cache di 24 ore. Per volumi alti usa un servizio di geocodifica a pagamento o un'istanza tua (`GEOCODING_URL`).
- Le analisi automatiche sono filtri a regole; non c'è un servizio IA esterno.

## Problemi frequenti

| Sintomo | Causa probabile |
| --- | --- |
| "Errore interno" subito dopo il deploy; nei log di Vercel `Variabili d'ambiente non valide` | Manca una variabile obbligatoria (`SESSION_SECRET`, `DB_*`). Aggiungila e fai Redeploy |
| `ECONNREFUSED` / `ETIMEDOUT` verso il database | Il database non accetta connessioni da internet (firewall/allowlist del provider) |
| `self-signed certificate` / `unable to verify` | Il provider usa una CA propria: incolla il certificato in `DB_SSL_CA` |
| `Too many connections` | Riduci `DB_CONNECTION_LIMIT` o aumenta il limite di connessioni del database |
| Il caricamento di foto/video fallisce, o l'invio di una segnalazione dà "errore imprevisto" | Mancano `BLOB_STORE_ID` + `BLOB_WEBHOOK_PUBLIC_KEY` (o `BLOB_READ_WRITE_TOKEN`), oppure hanno un prefisso diverso da `BLOB`, o lo store non è privato; guarda "Diagnostica → Archivio" |
| Le richieste POST danno "origine non autorizzata" | `APP_ORIGIN` non coincide con l'indirizzo con cui apri il sito (es. dominio personalizzato) |
| Troppe richieste (429) anche per pochi utenti | Il proxy non è riconosciuto e tutti hanno lo stesso IP: su Vercel `trust proxy` è automatico; non impostare `TRUST_PROXY=false` |

**Anteprime (Preview)**: per default ogni branch/PR ottiene un deploy di anteprima con un proprio indirizzo. Per usarle servono le stesse variabili anche nell'ambiente *Preview*, preferibilmente con un database separato. In caso contrario disattiva le anteprime o lasciale senza variabili (non funzioneranno, ma non toccano i dati di produzione).
