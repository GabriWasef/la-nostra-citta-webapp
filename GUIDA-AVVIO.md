# Guida all'avvio — La Nostra Città (Windows, senza Docker)

Questa guida spiega passo passo come avviare la webapp su un PC Windows usando **Node.js** e **MySQL** installati sul computer.
Tutti i comandi vanno scritti in **PowerShell**, dentro la cartella del progetto.

> Tempo richiesto: circa 10 minuti la prima volta, pochi secondi le volte successive.

---

## Passo 0 — Controlla di avere i programmi necessari

Apri **PowerShell** e scrivi:

```powershell
node -v
```

Deve comparire **v22.9** o un numero più alto (per esempio `v22.12.0` o `v24.1.0`).
Se compare un errore o un numero più basso, installa Node.js LTS da <https://nodejs.org>.

Ti serve anche **MySQL 8** (MySQL Community Server, con MySQL Workbench) e devi conoscere la **password dell'utente `root`** di MySQL.

> ⚠️ **XAMPP non va bene**: contiene MariaDB, non MySQL, e il progetto non funziona con MariaDB.
> Per verificarlo, in MySQL Workbench esegui `SELECT VERSION();`: deve comparire `8.0.19` o superiore, **senza** la parola `MariaDB`.

---

## Passo 1 — Apri la cartella del progetto e scarica l'ultima versione

```powershell
cd C:\Users\net.LABXX-XX.000\Downloads\la-nostra-citta-webapp
git checkout main
git pull
```

(Sostituisci il percorso con quello della tua cartella, se è diverso.)

Se non hai ancora il progetto, scaricalo così (poi entra nella cartella con `cd la-nostra-citta-webapp`):

```powershell
git clone https://github.com/GabriWasef/la-nostra-citta-webapp.git
```

---

## Passo 2 — Installa le librerie del progetto

```powershell
npm install
```

Attendi la fine (può volerci un minuto). Messaggi gialli `npm warn` sono normali.

---

## Passo 3 — Crea il file di configurazione `.env`

Copia il file di esempio e aprilo con il Blocco note:

```powershell
Copy-Item .env.example .env
notepad .env
```

Nel Blocco note **modifica solo queste righe** (lascia tutte le altre così come sono):

| Riga | Cosa scrivere |
|---|---|
| `DB_USER=` | `root` |
| `DB_PASSWORD=` | la password di `root` di MySQL |
| `SESSION_SECRET=` | una frase lunga a caso, **almeno 32 caratteri** (vedi sotto) |
| `SEED_DEMO_PASSWORD=` | `Demo12345` (serve solo per i dati di prova del passo 6) |

Per generare un `SESSION_SECRET` adatto, in PowerShell esegui il comando qui sotto e copia il risultato dopo `SESSION_SECRET=`:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Esempio di come devono apparire le righe (con i tuoi valori):

```text
DB_USER=root
DB_PASSWORD=LaMiaPasswordDiMySQL
SESSION_SECRET=q3Vb7kLx9...una-stringa-lunga-generata...Zt2
SEED_DEMO_PASSWORD=Demo12345
```

Salva (**Ctrl+S**) e chiudi il Blocco note.

> Non cambiare `NODE_ENV=development`: con `production` il login funziona solo con HTTPS.
> Il file `.env` contiene password: non va mai caricato su GitHub (è già escluso automaticamente).

---

## Passo 4 — Crea le tabelle del database

```powershell
npm run db:migrate
npm run db:seed
```

Risultato atteso:

```text
Applico 001_schema_iniziale.sql...
...
Applico 009_predisposizione_ia.sql...
9 migrazioni applicate.
Seed 001_categorie_quartieri.sql applicato.
```

Il database `la_nostra_citta` viene creato automaticamente se non esiste.
Se `db:migrate` scrive `Database già aggiornato.`, va bene lo stesso: le tabelle c'erano già.

---

## Passo 5 — Crea il tuo account di amministratore

```powershell
npm run admin:create
```

Il programma ti fa alcune domande: e-mail, nome, cognome e password (almeno 10 caratteri, con lettere e numeri).
**Mentre scrivi la password non compare nulla sullo schermo: è normale**, scrivila e premi Invio.

Risultato atteso: `Amministratore ... creato.`

---

## Passo 6 (facoltativo) — Carica i dati di prova

Aggiunge 5 utenti e 7 segnalazioni con immagini, utili per vedere subito mappa, classifica e moderazione:

```powershell
npm run db:seed:demo
```

Account di prova (password: quella scritta in `SEED_DEMO_PASSWORD`, cioè `Demo12345`):

| E-mail | Ruolo |
|---|---|
| `admin@lanostracitta.demo` | Amministratore |
| `moderatore@lanostracitta.demo` | Moderatore |
| `giulia@lanostracitta.demo`, `luca@lanostracitta.demo`, `sara@lanostracitta.demo` | Cittadini |

---

## Passo 7 — Avvia la webapp

```powershell
chcp 65001
npm start
```

(`chcp 65001` serve solo a mostrare bene le lettere accentate nel terminale.)

Quando compare il messaggio **`La Nostra Città in ascolto su http://localhost:3000`**, apri il browser all'indirizzo:

### 👉 <http://localhost:3000>

**Lascia aperta la finestra di PowerShell** finché usi il sito. Per fermare il server premi **Ctrl+C**.

---

## Le volte successive

Basta aprire PowerShell nella cartella del progetto e scrivere:

```powershell
npm start
```

Se nel frattempo hai scaricato una versione nuova del progetto (`git pull`), prima di `npm start` esegui anche:

```powershell
npm install
npm run db:migrate
```

---

## Cosa provare

1. **Accedi** con l'amministratore (o con `giulia@lanostracitta.demo` se hai caricato i dati di prova).
2. Clicca **"+ Segnala"**, compila titolo e descrizione, allega una foto e invia.
   La segnalazione è in stato *Inserita*: non è ancora pubblica.
3. Con un account **moderatore o amministratore** apri **Moderazione**, entra nella segnalazione, scegli una categoria e portala ad **Approvata**.
4. Con un altro utente apri la segnalazione e premi **"Sostengo questa segnalazione"**.
5. Guarda **Mappa** e **Classifica**. Da amministratore, in **Amministrazione** puoi gestire utenti, quartieri e categorie.

---

## Se qualcosa non funziona

| Messaggio | Cosa fare |
|---|---|
| `node` non è riconosciuto come comando | Node.js non è installato o va riaperto PowerShell dopo l'installazione. |
| `npm.ps1 ... l'esecuzione di script è disabilitata` | Scrivi `npm.cmd` al posto di `npm` (es. `npm.cmd start`), oppure esegui una volta `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`. |
| `Configurazione non valida. Controlla il file .env` | Leggi la riga indicata sotto il messaggio: di solito `SESSION_SECRET` è vuoto o troppo corto (passo 3). |
| `connect ECONNREFUSED 127.0.0.1:3306` | MySQL non è avviato. Premi **Win+R**, scrivi `services.msc`, cerca **MySQL80** e clicca **Avvia**. |
| `Access denied for user 'root'@'localhost'` | La password in `DB_PASSWORD` non è quella di `root`. Correggila nel file `.env`. |
| `Il server del database è MariaDB` | Stai usando XAMPP/MariaDB: installa MySQL 8 (Passo 0). |
| `il database non è aggiornato ... Esegui: npm run db:migrate && npm run db:seed` | Esegui i due comandi del passo 4, poi di nuovo `npm start`. |
| `Migrazione ... fallita: Table '...' already exists` oppure altri errori di `db:migrate` dopo tentativi precedenti | Il database è rimasto a metà. Esegui `npm run db:reset` (**cancella tutti i dati**), poi `npm run db:seed` e ripeti i passi 5–7. |
| `You do not have the SUPER privilege and binary logging is enabled` | Succede se in `DB_USER` non c'è `root`. Usa `root` (passo 3), oppure in MySQL Workbench, come root, esegui `SET PERSIST log_bin_trust_function_creators = 1;` e poi `npm run db:reset`. |
| `EADDRINUSE: address already in use :::3000` | La porta 3000 è occupata (forse il server è già aperto in un'altra finestra). Chiudi l'altra finestra, oppure nel `.env` metti `PORT=3001` e `APP_ORIGIN=http://localhost:3001` e apri <http://localhost:3001>. |
| Lettere strane come `Citt├á` nel terminale | Solo un problema di visualizzazione: esegui `chcp 65001` prima di `npm start`. |
| Il login riesce ma poi si torna "non collegati" | Nel `.env` deve esserci `NODE_ENV=development`. |
| Hai dimenticato la password di un utente | Da **Accedi → Hai dimenticato la password?**: il link di recupero compare nella finestra di PowerShell dove gira il server (l'invio di e-mail non è configurato). |

---

## Riepilogo veloce (prima volta)

```powershell
cd C:\percorso\la-nostra-citta-webapp
git pull
npm install
Copy-Item .env.example .env
notepad .env                 # DB_USER=root, DB_PASSWORD, SESSION_SECRET, SEED_DEMO_PASSWORD
npm run db:migrate
npm run db:seed
npm run admin:create
npm run db:seed:demo         # facoltativo
chcp 65001
npm start                    # poi apri http://localhost:3000
```

> Preferisci Docker? Le istruzioni sono nel [README](README.md), sezione "Opzione A — Tutto in Docker".
