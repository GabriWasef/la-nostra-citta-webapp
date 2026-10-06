# La Nostra Città, Il Nostro Futuro — Analisi tecnica

Documento prodotto nella **Fase B (analisi)**, prima di qualsiasi implementazione. I §1–§8 descrivono la situazione
iniziale e il piano; lo stato dopo l'implementazione è riassunto nel **§9**.

Materiale analizzato:

| Documento | Contenuto |
|---|---|
| `test_dingresso.docx` | Traccia d'esame del comitato "Insieme per Milano" |
| `analisi_requisiti_esercizio_1.md` | Analisi dei requisiti (esercizio 1): attori, RF01–RF14, requisiti non funzionali, vincoli, schema logico |
| `database_la_nostra_citta_mysql.sql` | Script MySQL 8 con schema, trigger, viste e dati iniziali |
| Repository `GabriWasef/la-nostra-citta-webapp` | Codice della webapp |

> **Nota sul nome del repository.** La richiesta cita `la-nostra-citta-futuro`, ma l'unico repository accessibile è
> `GabriWasef/la-nostra-citta-webapp`. Questa analisi si riferisce a quest'ultimo.

---

## 1. Stato attuale del progetto

### 1.1 Struttura delle cartelle

Il repository `la-nostra-citta-webapp` è **vuoto**: nessun commit, nessun branch remoto, nessun file.

```text
la-nostra-citta-webapp/
└── .git/            (repository inizializzato, nessun commit)
```

Di conseguenza:

| Aspetto | Stato rilevato |
|---|---|
| File principali | Nessuno |
| Tecnologie attuali | Nessuna (nessun `package.json`, HTML, CSS o JS) |
| Modalità di avvio | Non definita |
| Dipendenze | Nessuna |
| Gestione del database | Solo lo script SQL fornito fuori dal repository (non versionato) |
| `.gitignore` / `.env` / `.env.example` | Assenti |
| Test | Assenti |
| Credenziali o segreti committati | **Nessuno** (repository vuoto; lo script SQL non contiene password) |
| File caricati (`uploads/`) | Assenti |

### 1.2 Funzionalità già implementate

- **Applicazione (frontend e backend):** nessuna.
- **Database:** lo script SQL implementa lo schema completo delle 10 entità, i vincoli di dominio, 5 trigger, 2 viste,
  gli indici principali e i dati iniziali (9 stati, 10 categorie, 6 quartieri).

Lo script è stato **eseguito realmente su MySQL 8.0.46** durante l'analisi: si importa senza errori e crea
10 tabelle, 2 viste e 5 trigger.

### 1.3 Funzionalità mancanti

Manca l'intera applicazione: API, autenticazione, gestione ruoli, upload, interfaccia web, mappa, moderazione,
amministrazione, predisposizione IA, test, documentazione di avvio.

### 1.4 Problemi individuati

Problemi verificati eseguendo lo script e casi di prova su MySQL 8.0.46:

| # | Problema | Verifica | Gravità |
|---|---|---|---|
| P1 | Una segnalazione può essere **inserita direttamente in stato "Approvata"** senza allegati né categorie: il controllo `trg_verifica_pubblicazione` esiste solo `BEFORE UPDATE` | `INSERT … id_stato_corrente=3` accettato con 0 allegati | Critica |
| P2 | Dopo la pubblicazione si possono **eliminare tutti gli allegati e tutte le categorie**: nessun controllo su `DELETE` | Segnalazione "Approvata" rimasta con 0 allegati | Alta |
| P3 | Si può **sostenere una segnalazione non moderata** ("Inserita") o **PRIVATA** | `INSERT INTO sostegno` accettato | Alta |
| P4 | `v_classifica_segnalazioni` mostra segnalazioni **PRIVATE** e **non ancora moderate**; `v_segnalazioni_pubbliche` mostra anche "Inserita" e "In verifica" | Segnalazione PRIVATA in stato "Inserita" presente in classifica | Alta (privacy e moderazione) |
| P5 | Lo storico registra sempre `id_utente_operatore = NULL` e motivazione fissa ("Cambio automatico dello stato"): RF10 chiede operatore e motivazione | Righe dello storico con operatore NULL | Alta |
| P6 | **Transizioni di stato libere** (es. "Chiusa" → "Inserita") | `UPDATE` accettato | Media |
| P7 | I trigger confrontano gli stati **per nome** (`'Approvata'`, …): se l'amministratore rinomina uno stato le regole smettono di funzionare | Analisi del codice | Media |
| P8 | `allegato.tipo_media` dipende da `tipo_mime` (dipendenza transitiva, vedi §3.6) e non è controllata: si può salvare `IMMAGINE` con `video/mp4` | Analisi del codice | Bassa |
| P9 | `allegato.risultato_analisi` duplica le informazioni di `analisi_ia` | Analisi del codice | Bassa |
| P10 | Mancano tabelle per: recupero password (RF02), log delle operazioni (sicurezza/admin), consenso privacy | Confronto con requisiti | Media |
| P11 | `analisi_ia` non prevede l'analisi video, lo stato dell'elaborazione asincrona e l'esito della revisione del moderatore | Confronto con RF11–RF13 | Media |
| P12 | Lo script inizia con `DROP TABLE` e mescola schema e dati: non è adatto a evolvere un database esistente | Analisi del codice | Media |
| P13 | `analisi_requisiti_esercizio_1.md` §11 afferma che "lo script è scritto per **PostgreSQL**", ma lo script è MySQL | Confronto documenti | Alta (coerenza documentale) |
| P14 | `DELIMITER` è un comando del client `mysql`, non del server: il driver Node (`mysql2`) non può eseguire lo script così com'è | Analisi | Media (tooling) |
| P15 | Messaggio del trigger `'L autore deve…'` senza apostrofo | Analisi | Bassa |

Comportamenti **corretti** verificati:

- sostegno duplicato rifiutato (`Duplicate entry '2-2' for key 'sostegno.PRIMARY'`);
- l'autore non può sostenere la propria segnalazione (`SIGNAL 45000`);
- e-mail univoca senza distinzione maiuscole/minuscole (`M@X.IT` rifiutata se esiste `m@x.it`, grazie alla collation `utf8mb4_0900_ai_ci`);
- la pubblicazione tramite `UPDATE` senza allegato o categoria viene bloccata;
- lo storico viene creato all'inserimento e a ogni cambio di stato.

---

## 2. Conformità ai requisiti

Legenda: ✅ = sì. "Parziale" indica in genere che il vincolo esiste nel database ma manca l'applicazione.
Dato che il repository è vuoto, **nessun requisito applicativo è presente**.

| ID | Requisito | Presente | Parziale | Assente | File coinvolti | Problema | Soluzione proposta | Priorità |
|---|---|:-:|:-:|:-:|---|---|---|---|
| R01 | Descrizione generale e obiettivi | | ✅ | | `analisi_requisiti_esercizio_1.md` | Documento corretto ma non versionato nel repository | Importarlo in `docs/` | Media |
| R02 | Attori (non registrato, cittadino, moderatore, admin, IA) | | ✅ | | analisi requisiti | Definiti solo su carta | Middleware `requireAuth` / `requireRole` | Critica |
| R03 | Ruoli e permessi (RF03) | | ✅ | | SQL `utente.ruolo` + CHECK | Nessun controllo applicativo | Matrice permessi in §5.4, controllo per route | Critica |
| RF01 | Registrazione (e-mail unica, hash password) | | ✅ | | SQL `utente` | Manca endpoint e form | `POST /api/v1/auth/register`, Argon2id, Zod | Critica |
| RF02 | Login, logout | | | ✅ | — | Nessuna autenticazione | Sessioni con cookie `HttpOnly` salvate in MySQL | Critica |
| RF02b | Recupero password | | | ✅ | — | Nessuna tabella token | Tabella `token_recupero_password` (hash del token, scadenza) | Media |
| RF04 | Gestione quartieri | | ✅ | | SQL `quartiere` | Solo dati iniziali | API elenco pubblica, CRUD admin | Alta |
| RF05 | Inserimento segnalazione | | ✅ | | SQL `segnalazione` | Manca API e form | `POST /api/v1/segnalazioni` multipart in un'unica transazione | Critica |
| RF06 | Allegato obbligatorio (JPG/PNG/WEBP, MP4/MOV/WEBM) | | ✅ | | SQL `allegato`, trigger | P1, P2; nessuna validazione file | Multer + controllo magic bytes + trigger su INSERT/DELETE | Critica |
| RF07 | Categorie (almeno una se pubblica, N:M) | | ✅ | | SQL `categoria`, `segnalazione_categoria` | P2 | Selezione multipla nel form, trigger su DELETE | Alta |
| RF08 | Visualizzazione, filtri, ordinamento, paginazione | | ✅ | | SQL viste | P4 | `GET /api/v1/segnalazioni?quartiere&categoria&stato&ordina&pagina` | Alta |
| RF08b | Mappa delle segnalazioni | | | ✅ | — | — | Leaflet + OpenStreetMap | Media |
| RF09 | Sostegno (no duplicati, no autore, conteggio reale) | | ✅ | | SQL `sostegno`, trigger | P3 | `POST/DELETE /segnalazioni/:id/sostegno`, trigger esteso | Alta |
| RF09b | Revoca del sostegno | | | ✅ | — | — | `DELETE /segnalazioni/:id/sostegno` | Alta |
| RF09c | Classifica priorità | | ✅ | | `v_classifica_segnalazioni` | P4 | Vista corretta + endpoint `/classifica` | Alta |
| RF10 | Ciclo di vita a 9 stati | | ✅ | | `stato_segnalazione`, trigger | P6, P7 | Macchina a stati nel service, codice stabile per stato | Alta |
| RF10b | Storico con data, stato, operatore, motivazione | | ✅ | | `storico_stato`, trigger | P5 | Variabili di sessione `@lnc_id_operatore`, `@lnc_motivazione` lette dal trigger | Alta |
| MOD | Moderazione umana (approva/rifiuta/correggi categorie) | | | ✅ | — | — | Area moderatore + API `/moderazione` | Alta |
| ADM | Amministrazione (utenti, sospensione, ruoli, quartieri, categorie, stati) | | ✅ | | SQL `stato_account` | Manca applicazione | Area admin + API `/admin` | Media |
| RF11 | Moderazione automatica IA del testo | | ✅ | | `analisi_ia` | Solo tabella | Interfaccia `ModerationProvider` + stub; elaborazione asincrona | Bassa (predisposizione) |
| RF12 | Classificazione automatica categorie | | ✅ | | `segnalazione_categoria.origine_assegnazione/affidabilita_ia` | Solo struttura | Interfaccia `ClassificationProvider` + conferma moderatore | Bassa (predisposizione) |
| RF13 | Analisi immagini/video | | ✅ | | `analisi_ia` | P11 (manca video e stato job) | Estensione `analisi_ia`, coda job | Bassa (predisposizione) |
| RF13b | Estrazione EXIF | | ✅ | | `allegato.latitudine_exif/longitudine_exif` | Nessuna estrazione | `exifr` all'upload (sincrono, leggero) | Media |
| RF14 | Localizzazione (utente, geocoding, EXIF, mappa) | | ✅ | | `segnalazione.latitudine/longitudine` | Origine delle coordinate non tracciata | Selezione su mappa + EXIF; colonna `origine_coordinate` | Media |
| SEC1 | HTTPS | | | ✅ | — | — | Reverse proxy TLS in produzione, cookie `Secure`, HSTS via Helmet | Alta |
| SEC2 | Hash password sicuro | | ✅ | | `utente.password_hash` | Nessun codice | Argon2id | Critica |
| SEC3 | Validazione input, query parametrizzate, no SQL injection | | | ✅ | — | — | Zod su ogni route, solo query `?` con `mysql2` | Critica |
| SEC4 | Controllo MIME ed estensione dei file | | | ✅ | — | — | Whitelist estensione + magic bytes (`file-type`) + limiti dimensione | Critica |
| SEC5 | Permessi per ruolo, no accessi non autorizzati | | | ✅ | — | — | `requireRole`, verifica proprietà risorsa | Critica |
| SEC6 | Registro delle operazioni importanti | | | ✅ | — | Nessuna tabella | Tabella `log_operazione` | Media |
| SEC7 | Rate limiting, CORS, header di sicurezza, CSRF | | | ✅ | — | — | `express-rate-limit`, `helmet`, `SameSite=Lax` + controllo `Origin` | Alta |
| PRV1 | Informativa e consenso | | | ✅ | — | — | Pagina `privacy.html`, checkbox obbligatoria, `data_consenso_privacy` | Media |
| PRV2 | Cancellazione/disattivazione account | | ✅ | | `stato_account='ELIMINATO'` | Nessuna anonimizzazione | Endpoint di disattivazione + anonimizzazione dati personali | Media |
| PRV3 | Dati pubblici/privati, autore anonimo | | ✅ | | `visibilita`, vista pubblica | P4 | Filtri corretti in viste e API | Alta |
| PRV4 | Protezione EXIF (posizione precisa) | | | ✅ | — | — | Coordinate EXIF mai esposte; immagini pubblicate ricodificate senza EXIF (`sharp`) | Alta |
| UX1 | Responsive, smartphone, accessibile | | | ✅ | — | — | CSS mobile-first, HTML semantico, etichette, contrasto WCAG AA | Alta |
| UX2 | Messaggi di errore chiari, istruzioni upload | | | ✅ | — | — | Formato errore JSON unico, testi in italiano | Alta |
| PERF1 | Paginazione | | | ✅ | — | — | `LIMIT/OFFSET` con massimo 50 per pagina | Alta |
| PERF2 | Indici | ✅ | | | SQL | Mancano indici composti e ricerca testuale | Indice `(id_stato_corrente, data_inserimento)`, `FULLTEXT(titolo, descrizione)` | Media |
| PERF3 | Compressione file | | | ✅ | — | — | `sharp` per le immagini; video solo limiti di dimensione | Media |
| PERF4 | Elaborazioni IA asincrone | | | ✅ | — | — | Tabella `job_elaborazione` + worker separato | Bassa |
| PERF5 | Cache classifiche | | | ✅ | — | — | Cache in memoria con TTL breve (fase successiva) | Bassa |
| AFF1 | Transazioni atomiche | | | ✅ | — | — | Transazione unica segnalazione+allegati+categorie; eliminazione file se rollback | Critica |
| AFF2 | Backup e ripristino | | | ✅ | — | — | Procedura `mysqldump` documentata nel README | Bassa |
| AFF3 | No sostegni duplicati | ✅ | | | PK `sostegno` | — | Tradurre l'errore 1062 in HTTP 409 | Alta |
| AFF4 | Allegato prima della pubblicazione | | ✅ | | trigger | P1, P2 | Trigger su INSERT e DELETE | Critica |
| SCAL | Separazione frontend/backend/DB/file/IA/code | | | ✅ | — | — | API REST, astrazione `storage`, worker IA separato | Media |
| INT1 | Vincoli di entità | ✅ | | | SQL | — | — | — |
| INT2 | Vincoli referenziali | ✅ | | | SQL | — | — | — |
| INT3 | Vincoli di dominio | ✅ | | | SQL | P8 | CHECK di coerenza `tipo_media`/`tipo_mime` | Bassa |
| INT4 | Vincoli di cardinalità | | ✅ | | SQL | P1, P2 | Trigger aggiuntivi | Critica |
| DOC | Coerenza documentazione (MySQL) | | ✅ | | analisi requisiti §11 | P13 | Correggere "PostgreSQL" in "MySQL 8.0+" | Alta |

---

## 3. Analisi del database

### 3.1 Compatibilità MySQL 8

| Elemento | Esito |
|---|---|
| `AUTO_INCREMENT` su tutte le PK surrogate | ✅ |
| `ENGINE=InnoDB` su tutte le tabelle (FK e transazioni) | ✅ |
| `utf8mb4` + `utf8mb4_0900_ai_ci` (solo MySQL ≥ 8.0) | ✅ |
| `TIMESTAMP … DEFAULT CURRENT_TIMESTAMP` | ✅ (limite anno 2038: accettabile, da annotare) |
| `DECIMAL(9,6)` per le coordinate (precisione ~11 cm) e `DECIMAL(5,4)` per i punteggi | ✅ |
| `JSON` in `analisi_ia.risultato` | ✅ |
| `CHECK` (applicati da MySQL ≥ 8.0.16) | ✅ |
| Trigger con `DECLARE`, `SELECT … INTO`, `SIGNAL SQLSTATE '45000'` | ✅ |
| `DELIMITER $$` | ✅ con il client `mysql`; ❌ con `mysql2` (P14) |
| Viste con `GROUP BY` compatibile con `ONLY_FULL_GROUP_BY` | ✅ |
| Nessun costrutto PostgreSQL (`SERIAL`, `BOOLEAN` nativo, funzioni plpgsql, `ENUM TYPE`) | ✅ |

### 3.2 Tabelle, chiavi e relazioni

| Tabella | PK | FK | UNIQUE | CHECK principali |
|---|---|---|---|---|
| `quartiere` | `id_quartiere` | — | `nome` | municipio 1–9 |
| `utente` | `id_utente` | `id_quartiere_residenza → quartiere` (SET NULL) | `email` | nome/cognome ≥ 2, email con `@`, ruolo, stato account |
| `stato_segnalazione` | `id_stato` | — | `nome`, `ordine` | ordine > 0 |
| `categoria` | `id_categoria` | — | `nome` | — |
| `segnalazione` | `id_segnalazione` | `id_autore → utente` (RESTRICT), `id_quartiere → quartiere` (RESTRICT), `id_stato_corrente → stato_segnalazione` (RESTRICT) | — | titolo 5–150, descrizione 20–5000, lat/lon nei limiti ed entrambe presenti o assenti, visibilità |
| `allegato` | `id_allegato` | `id_segnalazione → segnalazione` (CASCADE) | — | tipo media, dimensione > 0, coordinate EXIF in coppia |
| `segnalazione_categoria` | (`id_segnalazione`, `id_categoria`) | → segnalazione (CASCADE), → categoria (RESTRICT) | — | origine, affidabilità 0–1, affidabilità obbligatoria se origine IA |
| `sostegno` | (`id_utente`, `id_segnalazione`) | → utente (CASCADE), → segnalazione (CASCADE) | implicito nella PK | — |
| `storico_stato` | `id_storico` | → segnalazione (CASCADE), → stato (RESTRICT), → operatore (SET NULL) | — | — |
| `analisi_ia` | `id_analisi` | → segnalazione (CASCADE), → allegato (CASCADE) | — | tipo analisi, punteggio 0–1, almeno un target |

### 3.3 Cardinalità

| Relazione | Cardinalità | Implementazione | Esito |
|---|---|---|---|
| Utente — Segnalazione (autore) | 1:N, obbligatoria lato segnalazione | `id_autore NOT NULL` | ✅ |
| Quartiere — Utente | 1:N, opzionale | `id_quartiere_residenza` nullable | ✅ |
| Quartiere — Segnalazione | 1:N, obbligatoria | `id_quartiere NOT NULL` | ✅ |
| Segnalazione — Allegato | 1:N, min 1 se pubblicata | FK + trigger | ⚠️ P1, P2 |
| Segnalazione — Categoria | N:M, min 1 se pubblicata | tabella associativa + trigger | ⚠️ P2 |
| Utente — Segnalazione (sostegno) | N:M, senza duplicati | PK composta | ✅ (⚠️ P3) |
| Stato — Segnalazione | 1:N | `id_stato_corrente NOT NULL` | ✅ |
| Segnalazione — Storico | 1:N | FK | ✅ (⚠️ P5) |
| Segnalazione/Allegato — Analisi IA | 1:N | due FK nullable + CHECK almeno uno | ✅ |

**Nota sul cascade:** in MySQL le cancellazioni propagate da `ON DELETE CASCADE` **non attivano i trigger**.
I nuovi trigger su `DELETE` di `allegato` e `segnalazione_categoria` (vedi §3.7) blocceranno quindi solo le
cancellazioni dirette, non l'eliminazione dell'intera segnalazione.

### 3.4 Indici

Esistenti: tutte le PK, gli UNIQUE, gli indici espliciti su FK e `idx_seg_data`, `idx_storico_seg_data`.
InnoDB crea in automatico gli indici per `segnalazione_categoria.id_categoria`, `storico_stato.id_stato` e
`storico_stato.id_utente_operatore`.

Mancanti per le ricerche di RF08:

- `segnalazione(id_stato_corrente, data_inserimento)`: elenco pubblico filtrato per stato e ordinato per data;
- `segnalazione(id_quartiere, id_stato_corrente)`: filtro per quartiere;
- `FULLTEXT(titolo, descrizione)`: ricerca testuale;
- `allegato(percorso_file)` UNIQUE (dopo conversione a `VARCHAR(500)`).

### 3.5 Vincoli

Correttamente presenti: `NOT NULL`, `UNIQUE`, `CHECK` di dominio, integrità referenziale con azioni esplicite,
blocco dei sostegni duplicati e dell'autosostegno, account attivo per inserire e sostenere.

Mancanti o incompleti: P1, P2, P3, P5, P6, P8 (vedi §1.4).

### 3.6 Normalizzazione

- **1NF:** rispettata. Attributi atomici; categorie e sostegni in tabelle associative.
- **2NF:** rispettata. In `sostegno` e `segnalazione_categoria` gli attributi non chiave dipendono dall'intera chiave composta.
- **3NF:** rispettata con due eccezioni da documentare:
  - `allegato.tipo_mime → tipo_media` è una **dipendenza transitiva**. La si può mantenere come denormalizzazione
    controllata (semplifica filtri e viste), ma va resa coerente con un `CHECK`;
  - `allegato.risultato_analisi` duplica `analisi_ia` e va deprecato.
- `segnalazione.id_quartiere` e le coordinate **non** sono in dipendenza funzionale: l'utente sceglie il quartiere,
  che il sistema può solo suggerire dalle coordinate.

### 3.7 Modifiche proposte al database

Lo script ufficiale resta **invariato** in `database/schema/` come riferimento d'esame. Le correzioni diventano
**migrazioni numerate**, eseguibili su un database esistente senza `DROP`.

| Migrazione | Contenuto | Risolve | Priorità |
|---|---|---|---|
| `001_schema_iniziale.sql` | DDL dello script ufficiale senza `DROP` e senza dati | P12 | Critica |
| `002_codici_stato.sql` | `stato_segnalazione.codice` (es. `APPROVATA`) UNIQUE e `pubblica BOOLEAN`; trigger che usano il flag invece del nome | P7 | Alta |
| `003_integrita_pubblicazione.sql` | Controllo pubblicazione anche `BEFORE INSERT`; trigger `BEFORE DELETE` su `allegato` e `segnalazione_categoria` | P1, P2 | Critica |
| `004_sostegno_e_viste.sql` | Sostegno ammesso solo su segnalazioni pubbliche e non PRIVATE; viste filtrate su stati pubblici e visibilità | P3, P4 | Alta |
| `005_storico_operatore.sql` | Trigger dello storico che leggono `@lnc_id_operatore` e `@lnc_motivazione` impostati dall'applicazione nella stessa transazione | P5 | Alta |
| `006_sicurezza_privacy.sql` | `token_recupero_password`, `log_operazione`, `utente.data_consenso_privacy`, `password_hash VARCHAR(255)`, tabella sessioni | P10 | Media |
| `007_indici.sql` | Indici composti e `FULLTEXT` | PERF2 | Media |
| `008_allegati.sql` | CHECK `tipo_media`/`tipo_mime`, `hash_sha256`, `percorso_file VARCHAR(500) UNIQUE`, `segnalazione.origine_coordinate` | P8, RF14 | Bassa |
| `009_predisposizione_ia.sql` | `ANALISI_VIDEO` nel CHECK, `analisi_ia.esito_revisione/id_revisore/data_revisione`, tabella `job_elaborazione` | P11 | Bassa |

La **macchina a stati** (P6) è gestita nel service applicativo con un'unica mappa delle transizioni ammesse.
Una tabella `transizione_stato` configurabile dall'amministratore potrà sostituirla in seguito.

L'**esecutore delle migrazioni** (`server/scripts/migrate.js`) gestisce `DELIMITER` (P14), registra le migrazioni
applicate in `schema_migrazioni` e imposta la connessione a `time_zone = '+00:00'`.

---

## 4. Stack consigliato

### 4.1 Backend: Express 5

| Criterio | Express 5 | Fastify 5 | NestJS |
|---|---|---|---|
| Semplicità e curva di apprendimento | Molto alta, standard didattico | Alta | Bassa (DI, decorator, TypeScript) |
| Struttura | Da definire (la definiamo a livelli) | Plugin | Imposta dal framework |
| API REST, auth, upload | Ecosistema maturo (session, multer, helmet) | Buono, plugin dedicati | Buono ma più verboso |
| Tempi di sviluppo per questo progetto | Brevi | Brevi | Lunghi |
| Riutilizzo futuro (mobile/desktop) | Uguale per tutti: dipende dall'API REST, non dal framework | | |

**Scelta: Express 5.** È il più semplice da mantenere e spiegare, e dalla versione 5 propaga da solo gli errori
delle funzioni `async`. La separazione `routes → controllers → services → repositories` garantisce la struttura
che NestJS imporrebbe, senza il suo peso. Fastify sarebbe più veloce, ma per questo carico il guadagno è trascurabile.

### 4.2 Frontend: HTML + CSS + JavaScript (ES modules), senza framework e senza build

Il repository non contiene frontend, quindi non c'è codice esistente da rispettare. Valutazione:

- **React / Vue / framework full-stack:** aggiungono build (Vite), gestione dello stato e routing client. È
  giustificato per interfacce molto dinamiche; qui le pagine sono circa dieci ed essenzialmente form, elenchi e una mappa.
- **HTML/CSS/JS moderno:** nessuna toolchain, comprensibile a livello scolastico e servito direttamente da Express.
  La logica resta fuori dalle pagine: ogni pagina importa un modulo `js/pages/*.js` e passa **solo** dal client
  `js/api.js`, che parla JSON con il backend.

**Scelta: HTML/CSS/JS con ES modules**, CSS mobile-first, **Leaflet** con OpenStreetMap per la mappa.
Se l'interfaccia crescerà molto, si potrà migrare a Vue + Vite pagina per pagina, senza toccare il backend.

### 4.3 Database e accesso ai dati: MySQL 8 + `mysql2/promise`, senza ORM

| Opzione | Valutazione |
|---|---|
| **mysql2** | Driver ufficiale di fatto, pool, prepared statement `?`, transazioni esplicite. Lo schema resta l'SQL ufficiale. |
| Prisma | Non gestisce nativamente trigger, viste e alcuni CHECK: lo schema reale diverge dal `schema.prisma`, con rischio di drift. |
| Sequelize | Pesante; i modelli duplicano lo schema SQL. |
| Knex | Buono, ma aggiunge un livello non necessario per query leggibili. |

**Scelta: `mysql2/promise`** con repository che contengono query SQL parametrizzate e leggibili, e migrazioni in
SQL puro. Lo schema resta controllabile riga per riga e coincide con la progettazione logica.

### 4.4 Autenticazione: sessioni server-side con cookie `HttpOnly`

Frontend e backend sono serviti **dalla stessa origine**. Per questo le sessioni sono la soluzione più sicura e semplice:

- `express-session` con uno store MySQL scritto nel progetto (`config/sessionStore.js`, tabella `sessione`): sessioni
  revocabili subito (logout, sospensione). Il pacchetto `express-mysql-session` è stato scartato perché include una
  versione vulnerabile di `mysql2`;
- cookie `HttpOnly`, `SameSite=Lax`, `Secure` in produzione, durata limitata, rigenerazione dell'ID al login;
- difesa CSRF: `SameSite=Lax` più verifica dell'header `Origin` sui metodi che modificano dati;
- password con **Argon2id** (pacchetto `argon2`);
- `express-rate-limit` su login, registrazione, recupero password e upload;
- CORS **disattivato** di default (stessa origine), con allowlist configurabile da `.env` per client futuri;
- ruolo e stato dell'account riletti dal DB a ogni richiesta: un utente sospeso perde subito l'accesso.

JWT è stato scartato per ora: con access e refresh token servirebbero rotazione, revoca e storage sicuro sul client,
senza vantaggi per una webapp same-origin. **Futuro mobile:** il middleware di autenticazione si limita a
popolare `req.user`, quindi si potrà aggiungere un token `Bearer` opaco (salvato come hash in MySQL) senza toccare
controller e service.

### 4.5 Validazione: Zod

Schemi Zod per `body`, `query` e `params` di ogni route, tramite un middleware `validate(schema)`. Il server è
l'autorità finale. Sul client si usano la validazione nativa HTML5 (`required`, `minlength`, `accept`) e controlli
JS leggeri con gli stessi limiti (titolo 5–150, descrizione 20–5000).

### 4.6 Upload: Multer + verifica del contenuto + astrazione storage

- **Multer** con storage su disco temporaneo e limiti: numero file (es. 5), dimensione (immagini 10 MB, video 50 MB);
- whitelist di estensioni (`jpg jpeg png webp mp4 mov webm`) **e** MIME reale letto dai magic bytes (`file-type`),
  che devono essere coerenti fra loro;
- nome di archiviazione casuale (UUID), percorso fuori da `client/`; il nome originale viene sanificato e salvato solo come metadato;
- immagini: estrazione GPS con `exifr`, poi ricodifica con `sharp` (compressione e **rimozione EXIF**);
- video: solo limiti di dimensione e tipo (durata e transcodifica con ffmpeg in una fase futura);
- modulo `storage/` con interfaccia `save/read/delete`: `LocalStorage` in sviluppo, S3-compatibile in produzione;
- file serviti da `GET /api/v1/allegati/:id`, che verifica la visibilità della segnalazione (niente cartella pubblica);
- **compensazione:** se la transazione DB fallisce, i file già salvati vengono eliminati;
- scansione antivirus: hook `scanFile()` predisposto (ClamAV in produzione), no-op in sviluppo.

### 4.7 Altre scelte

| Ambito | Scelta | Motivazione |
|---|---|---|
| Configurazione | `node --env-file=.env` (nativo in Node 22) + validazione Zod in `config/env.js` | Nessuna dipendenza `dotenv`; avvio bloccato se manca una variabile |
| Sicurezza HTTP | `helmet` (CSP, HSTS, noSniff) | Header sicuri con una riga |
| Log | `pino` + tabella `log_operazione` per l'audit | Log strutturati; audit interrogabile dall'admin |
| Test | `node:test` (integrato) + `supertest`, DB MySQL di test | Nessun framework in più; test API realistici |
| Runtime | Node.js 22 LTS | Già disponibile; ES modules nativi |
| Futura applicazione | Stessa API REST `/api/v1` in JSON, documentata in `docs/api.md` | Un client mobile o desktop la userà senza modifiche al backend |

---

## 5. Architettura proposta

### 5.1 Flusso delle richieste

```text
Browser
  ↓
Frontend web (client/: HTML + CSS + ES modules, servito da Express)
  ↓  fetch JSON / multipart, cookie di sessione
API REST Node.js (Express 5, /api/v1)
  ↓
Middleware: helmet → rate limit → sessione → requireAuth/requireRole → validate(Zod) → upload
  ↓
Controller      (legge la richiesta, chiama il service, formatta la risposta)
  ↓
Service         (regole di business, permessi sulla risorsa, macchina a stati, transazioni)
  ↓
Repository      (SQL parametrizzato con mysql2)
  ↓
MySQL 8 (vincoli, trigger, viste: ultima linea di difesa)
```

Gli errori (`AppError`, errori Zod, errori MySQL 1062/1644/3819) vengono tradotti da un unico `errorHandler` nel formato:

```json
{ "error": { "code": "SOSTEGNO_DUPLICATO", "message": "Hai già sostenuto questa segnalazione.", "details": [] } }
```

### 5.2 Flusso degli allegati

```text
Browser (form multipart: dati segnalazione + 1..5 file)
  ↓
Upload API (POST /api/v1/segnalazioni)
  ↓
Validazione file: limiti Multer → estensione → magic bytes → coerenza MIME
  ↓
Elaborazione: EXIF GPS (exifr) → ricodifica senza EXIF (sharp, solo immagini)
  ↓
Storage locale (uploads/) o object storage
  ↓
Transazione MySQL: segnalazione + allegato (metadati) + segnalazione_categoria
  ↳ se fallisce: rollback + eliminazione dei file salvati
```

### 5.3 Flusso delle analisi future (IA)

```text
Segnalazione inviata (stato "Inserita")
  ↓
Coda di elaborazione (tabella job_elaborazione; in futuro BullMQ/Redis)
  ↓
Worker separato: moderazione testo / classificazione / EXIF / computer vision
  ↓
Risultati in analisi_ia (+ categorie con origine 'IA' e affidabilità)
  ↓
Revisione del moderatore (conferma/corregge → esito_revisione, cambio di stato)
```

Il backend espone interfacce (`ModerationProvider`, `ClassificationProvider`, `VisionProvider`) con
un'implementazione "nulla" o a regole semplici. Il servizio IA reale potrà essere collegato in seguito
(API esterna o microservizio Python) senza modificare controller e route.

### 5.4 Matrice dei permessi

| Azione | Anonimo | Cittadino | Moderatore | Admin |
|---|:-:|:-:|:-:|:-:|
| Vedere segnalazioni pubbliche, classifica, mappa | ✅ | ✅ | ✅ | ✅ |
| Registrarsi / login | ✅ | — | — | — |
| Modificare il proprio profilo, disattivare l'account | | ✅ | ✅ | ✅ |
| Inserire segnalazione con allegati | | ✅ | ✅ | ✅ |
| Vedere le proprie segnalazioni (anche private o non moderate) | | ✅ | ✅ | ✅ |
| Sostenere / revocare il sostegno | | ✅ | ✅ | ✅ |
| Vedere la coda di moderazione, approvare, rifiutare, cambiare stato, correggere categorie | | | ✅ | ✅ |
| Vedere i risultati IA | | | ✅ | ✅ |
| Gestire utenti, ruoli, sospensioni | | | | ✅ |
| Gestire quartieri, categorie, stati; consultare i log | | | | ✅ |

### 5.5 Endpoint principali (bozza)

```text
POST   /api/v1/auth/register          POST /api/v1/auth/login        POST /api/v1/auth/logout
GET    /api/v1/auth/me                POST /api/v1/auth/password/recupero
PATCH  /api/v1/utenti/me              DELETE /api/v1/utenti/me (disattivazione)
GET    /api/v1/quartieri              GET  /api/v1/categorie         GET  /api/v1/stati
GET    /api/v1/segnalazioni?quartiere=&categoria=&stato=&q=&ordina=data|sostegni&pagina=&perPagina=
GET    /api/v1/segnalazioni/mappa     GET  /api/v1/segnalazioni/:id  GET  /api/v1/segnalazioni/:id/storico
POST   /api/v1/segnalazioni (multipart)
POST   /api/v1/segnalazioni/:id/sostegno      DELETE /api/v1/segnalazioni/:id/sostegno
GET    /api/v1/classifica
GET    /api/v1/allegati/:id
GET    /api/v1/moderazione/segnalazioni       PATCH /api/v1/moderazione/segnalazioni/:id/stato
PUT    /api/v1/moderazione/segnalazioni/:id/categorie
GET    /api/v1/admin/utenti           PATCH /api/v1/admin/utenti/:id (ruolo, stato_account)
POST|PATCH|DELETE /api/v1/admin/quartieri|categorie
GET    /api/v1/admin/log
GET    /api/v1/health
```

---

## 6. Struttura di cartelle consigliata

Struttura adattata a un progetto piccolo: un solo `package.json` alla radice (il frontend non ha dipendenze
né build) e nessuna cartella vuota.

```text
la-nostra-citta-webapp/
├── client/                         # frontend statico servito da Express
│   ├── index.html                  # elenco segnalazioni + filtri
│   ├── segnalazione.html           # dettaglio, allegati, storico, sostegno
│   ├── nuova-segnalazione.html
│   ├── classifica.html
│   ├── mappa.html
│   ├── login.html
│   ├── registrazione.html
│   ├── profilo.html
│   ├── moderazione.html
│   ├── admin.html
│   ├── privacy.html
│   ├── css/
│   │   └── style.css
│   └── js/
│       ├── api.js                  # unico punto di accesso all'API
│       ├── auth.js                 # stato utente, navbar per ruolo
│       ├── ui.js                   # messaggi, errori, componenti
│       └── pages/                  # un modulo per pagina
├── server/
│   ├── src/
│   │   ├── config/                 # env.js (Zod), db.js (pool mysql2)
│   │   ├── middlewares/            # auth, requireRole, validate, upload, originCheck, errorHandler
│   │   ├── routes/
│   │   ├── controllers/
│   │   ├── services/
│   │   ├── repositories/
│   │   ├── validators/             # schemi Zod
│   │   ├── storage/                # LocalStorage (+ futuro S3)
│   │   ├── ai/                     # interfacce provider + stub (fase 15)
│   │   ├── utils/                  # AppError, logger, audit
│   │   ├── app.js                  # crea l'app Express (usata anche dai test)
│   │   └── server.js               # avvio HTTP
│   ├── scripts/                    # migrate.js, seed.js, create-admin.js
│   └── tests/
├── database/
│   ├── schema/
│   │   └── database_la_nostra_citta_mysql.sql   # script ufficiale, invariato
│   ├── migrations/                 # 001_… 009_…
│   └── seeds/                      # stati, categorie, quartieri
├── docs/
│   ├── analisi_requisiti_esercizio_1.md
│   ├── analisi-tecnica.md
│   └── api.md
├── uploads/                        # ignorata da git (resta solo .gitkeep)
├── docker-compose.yml              # opzionale: MySQL 8 locale
├── .env.example
├── .gitignore
├── package.json
└── README.md
```

---

## 7. Piano di implementazione

Ogni fase lascia il progetto avviabile.

| # | Fase | File da creare/modificare | Funzionalità | Dipendenze | Rischi | Criterio di completamento |
|---|---|---|---|---|---|---|
| 1 | Struttura e analisi | `docs/*`, `database/schema/*`, `.gitignore`, `README.md` | Import dei documenti; correzione di "PostgreSQL" | — | Nessuno | Documenti versionati; `.env` e `uploads/*` ignorati |
| 2 | Configurazione Node.js | `package.json`, `server/src/app.js`, `server.js`, `config/env.js`, `.env.example`, `utils/*`, `middlewares/errorHandler.js` | Server Express, helmet, file statici, `/api/v1/health`, formato errori | express, helmet, zod, pino | Variabili mancanti | `npm run dev` avvia; health risponde 200 |
| 3 | Collegamento MySQL | `config/db.js`, `scripts/migrate.js`, `scripts/seed.js`, `database/migrations/001–007`, `database/seeds/*`, `docker-compose.yml` | Pool, migrazioni con `DELIMITER`, correzioni P1–P7 e P10–P12 | mysql2 | Sintassi trigger, ordine migrazioni | `npm run db:migrate && npm run db:seed` su DB vuoto; health verifica il DB; test SQL dei trigger superati |
| 4 | Autenticazione | `routes/auth.js`, `controllers/auth…`, `services/authService.js`, `repositories/utenteRepository.js`, `validators/auth.js`, `middlewares/auth.js`, `originCheck.js` | Registrazione, login, logout, `me`, sessioni MySQL, rate limit | argon2, express-session, express-rate-limit | Configurazione cookie, CSRF | Test: registrazione, e-mail duplicata → 409, login errato → 401, logout invalida la sessione |
| 5 | Utenti e ruoli | `middlewares/requireRole.js`, `routes/utenti.js`, `routes/admin/utenti.js`, `scripts/create-admin.js` | Profilo, disattivazione, gestione ruoli e sospensioni | — | Escalation di privilegi | Test: il cittadino riceve 403 su `/admin`; l'utente sospeso perde la sessione |
| 6 | Quartieri e categorie | `routes/quartieri.js`, `routes/categorie.js`, `routes/stati.js`, service e repository | Elenchi pubblici; CRUD admin | — | Eliminazione di voci in uso (FK RESTRICT) | Elenchi funzionanti; eliminazione in uso → 409 |
| 7 | Segnalazioni | `routes/segnalazioni.js`, `services/segnalazioneService.js`, `repositories/segnalazioneRepository.js`, `validators/segnalazione.js` | Creazione transazionale, elenco, dettaglio, le mie segnalazioni | — | Visibilità PRIVATA/ANONIMA | Una segnalazione senza allegato viene rifiutata; l'autore anonimo non è esposto |
| 8 | Upload allegati | `middlewares/upload.js`, `storage/localStorage.js`, `services/mediaService.js`, `routes/allegati.js` | Validazione, EXIF, ricodifica, download controllato, compensazione | multer, file-type, exifr, sharp | File malevoli, disco pieno, file orfani | Test: estensione falsificata → 400; file oltre il limite → 413; rollback senza file orfani |
| 9 | Sostegni | route/service/repository sostegno | Sostegno e revoca, conteggio reale | — | Concorrenza (gestita dalla PK) | Duplicato → 409; autore → 403; su segnalazione non pubblica → 403 |
| 10 | Storico e stati | `services/statoService.js`, `routes/moderazione.js`, migrazione 005 | Macchina a stati, cambio stato con operatore e motivazione | — | Transizioni errate | Storico con operatore e motivazione; transizione non ammessa → 422 |
| 11 | Dashboard e filtri (frontend) | tutte le pagine `client/*`, `css/style.css`, `js/*` | Elenco con filtri e paginazione, dettaglio, nuova segnalazione, classifica, mappa, profilo, moderazione, admin | leaflet | Accessibilità, resa su mobile | Tutte le pagine usabili a 360 px; navigazione da tastiera; nessun errore in console |
| 12 | Validazione e sicurezza | revisione dei middleware, `log_operazione`, CSP | Audit, rate limit, controllo `Origin`, privacy e consenso | — | Regressioni | Checklist OWASP di base superata; nessun segreto nel repository |
| 13 | Test | `server/tests/*` | Test API e DB con `node:test` + supertest | supertest | DB di test da preparare | `npm test` verde |
| 14 | Documentazione | `README.md`, `docs/api.md` | Installazione, avvio, backup, endpoint | — | — | Un nuovo sviluppatore avvia il progetto seguendo il README |
| 15 | Predisposizione IA | `server/src/ai/*`, migrazione 009, `scripts/worker.js` | Interfacce provider, coda job, stub moderazione e classificazione, EXIF come analisi | — | Complessità eccessiva | Una segnalazione crea un job; il worker scrive in `analisi_ia`; il moderatore vede i risultati |
| 16 | Adattamento mobile (futuro) | — | **Non in questa fase.** Resta disponibile l'API `/api/v1` documentata; token Bearer aggiungibile | — | — | Solo documentato |

---

## 8. Decisioni prese

Alla conferma di procedere sono state adottate le scelte proposte:

1. i documenti forniti sono stati importati in `docs/` e `database/schema/`;
2. il §11 dei requisiti ora indica MySQL 8.0+ al posto di PostgreSQL;
3. le correzioni al database sono migrazioni separate e lo script ufficiale resta invariato;
4. `docker-compose.yml` è disponibile come opzione per MySQL in sviluppo.

---

## 9. Stato dopo l'implementazione

### 9.1 Conformità ai requisiti

| Area | Stato | Dove |
|---|---|---|
| RF01 Registrazione (e-mail unica, Argon2id, consenso) | ✅ | `services/auth.service.js`, `registrazione.html` |
| RF02 Login, logout, recupero password | ✅ (l'invio e-mail non è configurato: il link finisce nel log) | `auth.*`, `recupero-password.html` |
| RF03 Ruoli e permessi | ✅ riletti a ogni richiesta | `middlewares/auth.js`, §5.4 |
| RF04 Quartieri | ✅ elenco pubblico e CRUD admin | `catalogo.*`, `admin.html` |
| RF05 Inserimento segnalazione | ✅ transazione unica con compensazione dei file | `services/segnalazione.service.js` |
| RF06 Allegato obbligatorio e sicuro | ✅ applicazione + trigger (P1, P2 risolti) | `media.service.js`, migrazione 003 |
| RF07 Categorie N:M | ✅ almeno una per pubblicare | migrazione 003, moderazione |
| RF08 Consultazione, filtri, ricerca, mappa | ✅ FULLTEXT, paginazione, Leaflet | `segnalazione.repository.js`, `index.html`, `mappa.html` |
| RF09 Sostegno e classifica | ✅ niente duplicati né autosostegno, conteggio reale (P3, P4 risolti) | migrazione 004, `classifica.html` |
| RF10 Ciclo di vita e storico | ✅ macchina a stati, operatore e motivazione (P5, P6, P7 risolti) | `cicloVita.js`, migrazioni 002 e 005 |
| RF11 Moderazione automatica | ✅ a regole, in tempo reale: blocca o segnala per revisione | `ai/moderazione.js` |
| RF12 Classificazione | ✅ a regole, con affidabilità e conferma del moderatore | `ai/classificazione.js` |
| RF13 Immagini/video ed EXIF | ✅ EXIF e controllo tecnico asincrono delle immagini; pertinenza e video da collegare a un modello | `ai/visione.js`, `ai/worker.js` |
| RF14 Localizzazione | ✅ mappa OpenStreetMap, ricerca indirizzi e indirizzo del punto (Nominatim, via server con limite di frequenza e cache), segnaposto trascinabile, geolocalizzazione, GPS della foto con consenso | migrazione 008, `services/geocodifica.service.js`, `nuova-segnalazione.html` |
| Sicurezza | ✅ Helmet/CSP, rate limit, controllo Origin, query parametrizzate, audit log | `middlewares/security.js`, migrazione 006 |
| Privacy | ✅ informativa, anonimato, account anonimizzato, EXIF rimosso | `privacy.html`, `utente.service.js` |
| Usabilità e accessibilità | ✅ mobile-first, tema scuro, errori per campo, tastiera, alternativa testuale alla mappa | `client/` |
| Prestazioni | ✅ paginazione, indici, compressione immagini, coda asincrona; ⏳ cache della classifica | migrazione 007 |
| Test | ✅ 104 test automatici su API e database | `server/tests/` |

### 9.2 Verifiche eseguite

- Migrazioni applicate su un database vuoto e su un database creato con lo script ufficiale (con dati).
- `npm test`: 104 test superati su MySQL 8.0.46.
- Percorso completo nel browser (Chromium) su desktop e mobile per cittadino, moderatore e amministratore:
  nessun errore JavaScript né violazione della Content Security Policy.
- `npm audit`: nessuna vulnerabilità nota.

### 9.3 Pubblicazione su Vercel

Vedi [`DEPLOY-VERCEL.md`](../DEPLOY-VERCEL.md). Scelte principali:

- **Un solo codice, due modi di esecuzione:** `server/src/server.js` (server Node/Docker) e `api/index.js` (funzione serverless che esporta la stessa app Express). I file statici sono generati in `public/` da `npm run build:vercel`; `vercel.json` definisce rewrite `/api/*`, header di sicurezza (CSP identica a quella di Helmet), cron e funzione.
- **Allegati:** su Vercel una richiesta non può superare 4,5 MB, quindi il browser carica foto e video direttamente su **Vercel Blob in modalità privata** con token a scadenza breve (`POST /api/v1/allegati/upload`), poi invia la segnalazione in JSON con `allegati_blob`. Il server scarica i file, ne verifica il contenuto, ricodifica le immagini (via EXIF) e li salva con chiavi proprie; la lettura avviene con link firmati a scadenza breve (`ALLEGATI_LINK_MINUTI`) dopo il controllo dei permessi. L'interfaccia `storage` resta la stessa (locale o blob).
- **Senza processi persistenti:** le analisi IA partono dopo la risposta (`waitUntil`) e un cron giornaliero recupera quelle rimaste indietro e pulisce sessioni, limiti di richieste, token e file temporanei.
- **Rate limiting condiviso:** su Vercel i contatori sono in MySQL (migrazione `010_limiti_richieste.sql`), perché la memoria delle funzioni non è condivisa.
- **Database:** MySQL 8 esterno con TLS (`DB_SSL`, `DB_SSL_CA`), pool piccolo e connessioni inattive chiuse presto. Servono trigger e collation `utf8mb4_0900_ai_ci`: non sono adatti MariaDB né i servizi senza trigger.
- **Verifica:** i test usano simulatori (SDK Blob finto, Nominatim finto); la scheda **Diagnostica** dell'amministrazione controlla database, migrazioni, archivio e configurazione sull'ambiente reale.

### 9.4 Limiti e passi successivi

- Invio e-mail (SMTP) per il recupero password.
- Ricodifica e rimozione dei metadati dei video (ffmpeg).
- Modelli IA reali al posto dei provider a regole, per esempio un microservizio che implementi le stesse interfacce.
- Object storage e antivirus: le interfacce (`storage`, `scansionaFile`) sono pronte.
- Cache della classifica e delle statistiche, se il traffico lo richiederà.
- Client mobile o desktop: si appoggerà alla stessa API aggiungendo un'autenticazione a token.
