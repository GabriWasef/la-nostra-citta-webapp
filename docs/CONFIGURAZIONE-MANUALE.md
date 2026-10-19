# Configurazione manuale

Questa guida raccoglie i passaggi che vanno fatti a mano da una persona: creare account, ottenere chiavi, configurare
Vercel, il database e lo storage, collegare il dominio, inizializzare il database e curare gli adempimenti privacy.
Chi la segue non deve conoscere il codice. I comandi si eseguono nella cartella del progetto, sul proprio computer,
con Node.js 22 installato.

Il documento contiene solo nomi di variabili, comandi e procedure, mai valori reali. I link sono stati verificati il
14/10/2026; quelli segnati "da verificare" non sono stati controllati e vanno cercati sul sito del fornitore.
La guida tecnica passo per passo del deploy è [`DEPLOY-VERCEL.md`](../DEPLOY-VERCEL.md); i dettagli su modelli, costi e
limiti sono in [`AI-PROVIDERS.md`](AI-PROVIDERS.md).

> **IA con Cloudflare, Groq e moderazione automatica (dal 19/10/2026):** la configurazione aggiornata dei fornitori,
> delle variabili e della migrazione 014 è in [`CONFIGURAZIONE-IA.md`](CONFIGURAZIONE-IA.md). Su Vercel le variabili
> segrete ora si creano con **Type: Secret** (la casella "Sensitive" non esiste più).

## 0. Prima di iniziare

**Account necessari.**
- GitHub, con accesso al repository.
- Vercel.
- Un fornitore di MySQL 8.
- Mistral AI, solo se si attiva il modello linguistico.
- Groq, solo se si attiva il fornitore di riserva.
- Un registrar per il dominio, se se ne vuole uno proprio.

**Costi previsti.**
- Vercel: piano Pro per un'organizzazione (vedi §4); Hobby è gratuito ma solo per uso personale non commerciale.
- Database: dipende dal fornitore.
- Mistral: pochi dollari al mese per un uso cittadino.
- Dominio: costo annuale del registrar.

Le stime sono in [`AI-PROVIDERS.md`](AI-PROVIDERS.md), §3.

**Tempo stimato.**

| Sezione | Tempo |
|---|---|
| Mistral e Groq (§1–2) | 15 minuti |
| Accordi e informativa (§3) | dipende dal comitato |
| Vercel (§4) | 15 minuti |
| Database (§5) | 30 minuti |
| Blob (§6) | 5 minuti |
| Segreti e variabili (§7–8) | 20 minuti |
| Dominio (§9) | 15 minuti, più la propagazione DNS |
| Primo deploy (§10) | 20 minuti |
| Verifiche (§11–12) | 20 minuti |

**Regola di sicurezza.** Le chiavi API, le password e i segreti non si incollano mai in chat, su GitHub, nei ticket o
nelle e-mail. Si inseriscono solo:
- nelle variabili d'ambiente di Vercel;
- nel file `.env.production` sul proprio computer, che git ignora;
- in un password manager.

Se una chiave viene esposta, anche solo per un momento, va revocata subito nella console del fornitore e sostituita
con una nuova.

## 1. Mistral AI

Serve solo con `AI_PROVIDER=mistral`.

1. Creare un account su Mistral AI: console <https://console.mistral.ai> (da verificare). La documentazione
   ufficiale non dice se serve verificare il numero di telefono; seguire le richieste della registrazione.
2. Attivare la Studio console. La modalità gratuita (Free mode) non richiede carta di credito e ha limiti bassi.
3. Andare in **API Keys → Create new key**.
4. Dare un nome che indichi progetto e ambiente, per esempio "la-nostra-citta produzione".
5. Impostare una data di scadenza: la documentazione la consiglia per ruotare le chiavi.
6. Copiare la chiave subito: compare una sola volta.
7. Salvare la chiave nel password manager. Più avanti andrà nella variabile `MISTRAL_API_KEY` su Vercel (§8).
8. Impostare un limite di spesa mensile per l'organizzazione (Admin panel, sezione spending limit), se si passa al
   pagamento a consumo. Raggiunto il limite, l'API si sospende fino al mese successivo.
9. Aprire **Admin panel → Privacy** e disattivare l'uso delle chiamate API per migliorare i servizi.
   **Va fatto prima di trattare segnalazioni reali**: in Free mode i dati possono essere usati per l'addestramento.
10. Scegliere il piano in base ai dati reali:
    - con segnalazioni di cittadini veri si consiglia il pagamento a consumo con Zero Data Retention (ZDR), che
      Mistral offre solo con il pagamento a consumo;
    - la modalità gratuita va bene per prove con dati inventati.
11. Controllare in **Admin panel → API → Limits** i limiti del proprio piano. Se sono più bassi di 20 richieste al
    minuto o di 500 al giorno, impostare `MISTRAL_MAX_RPM` e `MISTRAL_MAX_RPD` con valori un po' più bassi di quelli
    letti.
12. Verificare che il modello `mistral-small-latest` sia disponibile. Se Mistral ha pubblicato il nome datato di
    Small 4, usarlo in `MISTRAL_MODEL`.

## 2. Groq

Serve solo con `AI_FALLBACK_PROVIDER=groq`. Ricordare che Groq tratta i dati negli Stati Uniti (§3).

1. Creare un account sulla console di Groq: <https://console.groq.com>.
2. Creare una API key con un nome che indichi progetto e ambiente, e salvarla nel password manager. Andrà in
   `GROQ_API_KEY` (§8).
3. Nelle impostazioni dei dati attivare la conservazione zero (Zero Data Retention), se disponibile per il proprio
   account. La documentazione la descrive come attivabile dalla console.
4. Leggere in **Settings → Limits** i limiti del proprio piano. Con il piano Developer `qwen/qwen3.8-27b` ha
   8.000 token al minuto: impostare `GROQ_MAX_RPM=2`.
5. Verificare che `qwen/qwen3.8-27b` sia ancora nella pagina "Images and Vision"
   (<https://console.groq.com/docs/vision>) e non nella pagina delle dismissioni
   (<https://console.groq.com/docs/deprecations>). Se è cambiato, aggiornare `GROQ_MODEL`.

## 3. Accordi e informativa

Questi adempimenti spettano al comitato, che è il titolare del trattamento. **Questa guida non sostituisce un parere
legale.**

1. **Accordo sul trattamento dei dati (DPA) con Mistral.** Leggerlo e accettarlo nella console o sul sito legale
   (<https://legal.mistral.ai>, da verificare). Conservarne una copia.
2. **DPA con Groq**, solo se si attiva il fornitore di riserva: <https://console.groq.com/docs/legal/customer-data-processing-addendum>.
   Il DPA prevede il trasferimento e il trattamento dei dati negli Stati Uniti. Verificare con un professionista le
   garanzie per il trasferimento fuori dall'UE. Conservare una copia.
3. **Informativa privacy.** Rileggere `client/privacy.html`: sono da completare titolare, contatti e tempi di
   conservazione, e da confermare i fornitori effettivamente attivi. Se Groq resta disattivato, si può togliere il
   paragrafo che lo riguarda.
4. **Registro dei trattamenti.** Aggiungere l'analisi automatica delle segnalazioni, i fornitori come responsabili
   del trattamento, Vercel e il fornitore del database.
5. **Regione di Vercel.** Le funzioni girano per default negli Stati Uniti (§4, punto 5). Va considerata nella
   valutazione.

## 4. GitHub e Vercel

1. Su <https://vercel.com> scegliere **Add New → Project** e importare il repository `la-nostra-citta-webapp` da GitHub.
2. Nome del progetto: a scelta (diventa parte dell'indirizzo `*.vercel.app`).
3. Framework Preset: **Other**. Non cambiare Build Command e Output Directory: li definisce `vercel.json`.
4. Branch di produzione: `main`.
5. **Piano.**
   - Hobby è gratuito ma riservato all'uso personale e non commerciale.
   - Per un comitato o un ente valutare Pro: 20 USD al mese per membro a ottobre 2026; prezzo da verificare su
     <https://vercel.com/pricing>.
   - Su Hobby il cron di manutenzione può girare solo una volta al giorno.
6. **Regione delle funzioni.** Per default è `iad1` (Washington, USA). In **Settings → Functions → Function Region**
   scegliere una regione europea, per esempio Francoforte. Meglio se vicina al database. Verificare le opzioni
   attuali nel pannello.
7. **Protezione del branch.** Su GitHub, in **Settings → Branches**, proteggere `main`: modifiche solo tramite pull
   request revisionata e con i controlli superati.
8. **Non premere ancora Deploy**: prima servono database, Blob e variabili (§5–8).

## 5. Database MySQL 8

1. **Scegliere un fornitore di MySQL 8 gestito con sede nell'UE.** Requisiti:
   - MySQL 8.0.19 o superiore, non MariaDB e non servizi "compatibili";
   - collation `utf8mb4_0900_ai_ci`;
   - trigger consentiti, perché le migrazioni ne creano molti.
2. **Prima di scegliere, verificare i trigger.** Con il log binario attivo l'utente applicativo può crearli solo se
   `log_bin_trust_function_creators = 1`, di solito impostabile dal pannello del fornitore. Se il fornitore non lo
   permette e non offre un'alternativa equivalente, **il progetto non parte**: `npm run db:migrate:remoto` fallisce
   sui trigger. Va scelto un altro fornitore.
3. Creare il database `la_nostra_citta`.
4. Creare un utente applicativo con privilegi solo su quel database, compreso il permesso di creare trigger.
5. Annotare nel password manager i valori per `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`.
6. **Connessione cifrata.**
   - Quasi tutti i fornitori in cloud la richiedono, e il progetto la supporta: `DB_SSL=true`.
   - Se il fornitore usa un certificato di un'autorità non pubblica, salvarlo come file PEM in
     `server/certs/db-ca.pem` (è un certificato pubblico: si può versionare), oppure incollarlo in `DB_SSL_CA`, su
     una riga, con `\n` al posto degli a capo. Se il file esiste, ha la precedenza sulla variabile.
7. **Accesso dall'esterno.** Vercel non ha indirizzi IP fissi: l'accesso va aperto a internet e protetto da TLS e da
   una password lunga.
8. **Backup.** Annotare frequenza e durata di conservazione dei backup automatici offerti dal fornitore. In aggiunta,
   è consigliato un `mysqldump` periodico conservato altrove: comandi nel README, sezione "Backup e ripristino".
   Per ripristinare, usare il pannello del fornitore oppure `mysql ... < backup.sql` verso un database vuoto, poi
   `npm run db:migrate:remoto` per allinearlo.

## 6. Vercel Blob (foto e video)

1. Nel progetto Vercel aprire **Storage → Create Database → Blob**.
2. Scegliere l'accesso **Private**.
3. Collegare lo store al progetto per tutti gli ambienti.
4. Lasciare il prefisso predefinito delle variabili, `BLOB`.
5. Controllare le variabili create da Vercel: `BLOB_STORE_ID` e `BLOB_WEBHOOK_PUBLIC_KEY`, oppure
   `BLOB_READ_WRITE_TOKEN`. Con una di queste l'app usa Blob in automatico (`STORAGE_DRIVER` non serve). Con un
   prefisso diverso l'app non le riconosce e l'invio delle segnalazioni fallisce.
6. **Limiti e costi** (verificati su <https://vercel.com/pricing> il 14/10/2026):
   - Hobby: 1 GB di spazio, 10.000 operazioni semplici, 2.000 avanzate e 10 GB di trasferimento al mese;
   - Pro: 0,023 USD per GB al mese, oltre ai costi delle operazioni.

## 7. Segreti da generare

1. Servono due segreti diversi: `SESSION_SECRET` (almeno 32 caratteri) e `CRON_SECRET`.
2. Generarli sul proprio computer con il comando:

   ```bash
   node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
   ```

3. Usare valori diversi per ogni ambiente (Production, Preview, Development).
4. Salvarli nel password manager.

## 8. Variabili d'ambiente

Si inseriscono in Vercel (**Settings → Environment Variables**) per ciascun ambiente. Dopo ogni modifica serve un
nuovo deploy (**Deployments → Redeploy**). La tabella deriva da `server/src/config/env.js` e da `.env.example`.

Legenda: **P** = Production, **Pr** = Preview, **D** = Development (in locale nel file `.env`). "Sì" = da impostare,
"—" = non serve o si lascia il predefinito. Preview usa un database separato e `AI_PROVIDER=regole`, oppure chiavi
dedicate, per non consumare la quota di produzione. Development usa solo valori locali, mai quelli di produzione.

| Variabile | P | Pr | D | Descrizione | Obbligatoria |
|---|---|---|---|---|---|
| `NODE_ENV` | `production` | `production` | `development` | ambiente | sì |
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | sì | sì (database separato) | sì (locale) | connessione al database | `DB_USER` e `DB_NAME` sì |
| `DB_SSL` | `true` | `true` | — | connessione cifrata | in cloud sì |
| `DB_SSL_CA` | se serve | se serve | — | certificato del fornitore | no |
| `DB_CONNECTION_LIMIT` | `3` | `3` | — (10) | connessioni per istanza | no |
| `SESSION_SECRET` | sì | sì (diverso) | sì (diverso) | firma delle sessioni, almeno 32 caratteri | sì |
| `SESSION_MAX_AGE_HOURS` | — (8) | — | — | durata della sessione | no |
| `CRON_SECRET` | sì | — | — | chiave della manutenzione; senza, l'endpoint è disattivato | in produzione sì |
| `APP_ORIGIN` | dominio definitivo (§9) | — (automatico) | — (`http://localhost:3000`) | indirizzo del sito | con dominio proprio sì |
| `CORS_ORIGINS`, `TRUST_PROXY`, `HOST`, `PORT` | — | — | — | casi particolari (su Vercel `TRUST_PROXY` è automatico) | no |
| `BLOB_STORE_ID` + `BLOB_WEBHOOK_PUBLIC_KEY`, oppure `BLOB_READ_WRITE_TOKEN` | creati da Vercel (§6) | creati da Vercel | — | archivio delle foto | su Vercel sì |
| `STORAGE_DRIVER` | — (automatico) | — | — (`locale`) | `locale` o `blob` | no |
| `ALLEGATI_LINK_MINUTI` | — (15) | — | — | durata dei link alle foto | no |
| `UPLOAD_DIR`, `MAX_FILES`, `MAX_IMAGE_MB`, `MAX_VIDEO_MB` | — (`uploads`, 5, 10, 50) | — | — | limiti dei file | no |
| `RATE_LIMIT_ENABLED` | `true` | `true` | `true` | limiti anti-abuso | no |
| `RATE_LIMIT_STORE` | — (automatico: `mysql`) | — | — (`memoria`) | dove contare le richieste | no |
| `GEOCODING_ENABLED`, `GEOCODING_URL` | — (`true`, Nominatim) | — | — | ricerca indirizzi | no |
| `GEOCODING_EMAIL` | consigliata | — | — | contatto per Nominatim | no |
| `LOG_LEVEL` | — (`info`) | — | — | dettaglio dei log | no |
| `AI_PROVIDER` | `regole` o `mistral` | `regole` | `regole` | analisi automatiche | no (predefinito `regole`) |
| `AI_FALLBACK_PROVIDER` | `regole` o `groq` | `regole` | `regole` | fornitore di riserva | no |
| `MISTRAL_API_KEY` | sì se `mistral` | solo con chiave dedicata | — | chiave Mistral (§1) | con `mistral` sì |
| `MISTRAL_MODEL` | `mistral-small-latest` o nome datato | — | — | modello | no |
| `GROQ_API_KEY` | sì se `groq` | — | — | chiave Groq (§2) | con `groq` sì |
| `GROQ_MODEL` | — (`qwen/qwen3.8-27b`) | — | — | modello di riserva | no |
| `AI_TIMEOUT_MS`, `AI_MAX_RETRIES` | — (15000, 2) | — | — | attesa e nuovi tentativi | no |
| `AI_MAX_RPM`, `AI_MAX_RPD` | — (20, 500) o i valori della console | — | — | limiti per fornitore | no |
| `MISTRAL_MAX_RPM`, `MISTRAL_MAX_RPD`, `GROQ_MAX_RPM`, `GROQ_MAX_RPD` | se servono (`GROQ_MAX_RPM=2`) | — | — | limiti di un solo fornitore | no |
| `AI_JOB_PER_RUN` | — (5) | — | — | analisi per esecuzione | no |
| `AI_WORKER_INTERVAL_MS` | `0` | `0` | — (5000) | worker interno: su Vercel va a 0 | su Vercel sì |
| `EXIF_MAX_DISTANCE_M` | — (100) | — | — | distanza GPS ammessa | no |
| `SEED_DEMO_PASSWORD` | **mai** | — | solo per i dati dimostrativi | password degli utenti demo | no |
| `TEST_DB_NAME` | — | — | solo per `npm test` | database dei test | no |

## 9. Dominio

1. Acquistare il dominio da un registrar, oppure usarne uno esistente.
2. In Vercel aprire **Settings → Domains**, aggiungere il dominio e copiare i record DNS indicati.
3. Inserire quei record nel pannello del registrar. La propagazione può richiedere alcune ore.
4. HTTPS è gestito da Vercel, che emette e rinnova il certificato.
5. Impostare `APP_ORIGIN` con l'indirizzo definitivo, per esempio `https://` seguito dal dominio, senza barra
   finale, e fare un nuovo deploy. Se `APP_ORIGIN` non coincide con l'indirizzo usato nel browser, le richieste di
   invio vengono rifiutate con "origine non autorizzata".

## 10. Primo deploy e inizializzazione del database remoto

1. Sul proprio computer: `cp .env.production.example .env.production`.
2. Compilare `.env.production` con i valori reali del database e i segreti.
3. Controllare che `.env.production` non venga mai aggiunto a git. Il comando `git check-ignore .env.production`
   deve rispondere con il nome del file; `.gitignore` contiene `.env.*`.
4. Installare le dipendenze: `npm ci`.
5. Eseguire nell'ordine:

   ```bash
   npm run db:migrate:remoto
   npm run db:seed:remoto
   npm run admin:create:remoto
   ```

   - Il primo crea le tabelle: lo schema ufficiale e le migrazioni fino alla 013.
   - Il secondo carica categorie e quartieri. Si può ripetere senza creare doppioni.
   - Il terzo chiede e-mail, nome, cognome e password dell'amministratore.

   **Senza il secondo comando il sito parte senza categorie.**
6. In Vercel premere **Deploy**, oppure **Redeploy** se il progetto era già stato creato.
7. Controllare i log di build (**Deployments → il deploy → Build Logs**): devono terminare senza errori.
8. Controllare i log della funzione (**Logs**): non devono comparire "Configurazione non valida" né errori di
   connessione al database.
9. Aprire l'indirizzo del sito seguito da `/api/v1/health`: deve rispondere con `"stato":"ok"`.

## 11. Cron e manutenzione

1. In Vercel aprire **Settings → Cron Jobs**.
2. Controllare che compaia `/api/v1/interno/manutenzione` con la pianificazione `0 3 * * *`, una volta al giorno alle
   03:00 UTC. Su Hobby Vercel garantisce solo l'ora (tra le 03:00 e le 03:59).
3. Controllare che `CRON_SECRET` sia impostato in Production. Vercel lo invia da solo al cron.
4. Verificare la protezione: aprendo l'indirizzo della manutenzione senza intestazione `Authorization` la risposta
   deve essere 401. Senza `CRON_SECRET` sarebbe 404, cioè endpoint disattivato.
5. Dal pannello si può lanciare il cron a mano (**Run**). La risposta riporta i job ripresi e le analisi elaborate.

## 12. Checklist dopo il deploy

1. Accedere come amministratore e aprire **Amministrazione → Diagnostica → Esegui i controlli**. Devono essere tutti
   verdi: database con connessione cifrata, migrazioni tutte applicate, archivio, ricerca indirizzi, `CRON_SECRET`,
   indirizzo del sito.
2. **I fornitori IA non sono controllati dalla Diagnostica** (punto D3 di [`revisione-finale.md`](revisione-finale.md)).
   Per verificarli:
   - creare un account cittadino di prova e inviare una segnalazione con una foto;
   - entro un minuto, come moderatore, aprire la segnalazione: in "Analisi automatiche" devono comparire righe con
     modello `mistral:...` (moderazione, categorie suggerite, pertinenza);
   - se compaiono "servizio di analisi non disponibile", oppure nessuna riga del modello, controllare la chiave e i
     log della funzione.
3. Confermare o correggere un'analisi, poi approvare la segnalazione e controllare che risulti pubblicata.
4. Aprire i log della funzione e cercare le prime lettere delle chiavi e gli indirizzi e-mail di prova: non devono
   comparire. Le chiavi appaiono solo come `[chiave]`.
5. Cancellare l'account di prova dal profilo.

## 13. Operatività e sicurezza nel tempo

1. **Rotazione delle chiavi.** Ruotare le chiavi API e i segreti ogni 6 mesi, e subito in caso di esposizione:
   - creare la nuova chiave;
   - aggiornare la variabile in Vercel;
   - fare un nuovo deploy;
   - revocare la vecchia chiave.
   Cambiare `SESSION_SECRET` disconnette tutti gli utenti.
2. **Allarmi di spesa.**
   - Mistral: limite di spesa mensile (§1, punto 8).
   - Groq: da verificare nella console.
   - Vercel: limiti di spesa e notifiche in **Settings → Billing**.
3. **Backup.** Verificare ogni mese che i backup del database esistano e che un ripristino di prova funzioni
   (README, sezione "Backup e ripristino").
4. **Aggiornamento dei valori.** Ricontrollare modelli, prezzi e limiti prima di ogni rilascio e ogni 3 mesi
   ([`AI-PROVIDERS.md`](AI-PROVIDERS.md), §8).
5. **Errori e incidenti.** Il comitato deve indicare per iscritto:
   - chi riceve le notifiche di errore di Vercel (membri del team con notifiche attive);
   - chi controlla ogni settimana i log e i job in `ERRORE`;
   - a chi segnalare un incidente, come una chiave esposta o un accesso non autorizzato.
   In caso di violazione di dati personali valutare con il titolare la notifica al Garante entro 72 ore.

## 14. Problemi frequenti

| Sintomo | Causa | Rimedio |
|---|---|---|
| Il sito risponde "errore interno"; nei log "Configurazione non valida" con il nome di una variabile | variabile obbligatoria mancante o non valida (per esempio `MISTRAL_API_KEY` con `AI_PROVIDER=mistral`) | aggiungerla in Vercel e fare Redeploy |
| Le analisi del modello finiscono tutte "servizio di analisi non disponibile"; nei job `ultimo_errore` con "errore HTTP 401" | chiave errata, revocata o scaduta | creare una nuova chiave, aggiornare la variabile, Redeploy |
| Analisi ferme in coda con "Limite di richieste raggiunto" | limiti del progetto o del piano raggiunti | aspettare il minuto o il giorno successivo; confrontare `AI_MAX_RPM`/`AI_MAX_RPD` con la console del fornitore |
| "errore HTTP 404" o "model not found" nei job | modello dismesso o nome sbagliato | aggiornare `MISTRAL_MODEL` o `GROQ_MODEL` (§1, §2) |
| `db:migrate:remoto` si ferma con un errore sui trigger | il fornitore non consente i trigger (`log_bin_trust_function_creators`) | attivare l'opzione nel pannello o cambiare fornitore |
| `ECONNREFUSED` o `ETIMEDOUT` verso il database | il database non accetta connessioni da internet | aprire l'accesso esterno nel pannello del fornitore |
| `self-signed certificate` o `unable to verify` | certificato di un'autorità non pubblica | salvarlo in `server/certs/db-ca.pem` o incollarlo in `DB_SSL_CA` |
| Invio delle segnalazioni con "errore imprevisto" o caricamento delle foto fallito | Blob non collegato, non privato o con prefisso diverso da `BLOB` | §6; controllare "Diagnostica → Archivio" |
| Nessuna categoria tra cui scegliere | `db:seed:remoto` non eseguito | eseguirlo (§10) |
| Analisi rimaste in coda per giorni | cron non attivo o `CRON_SECRET` mancante; su Vercel il worker gira solo dopo un invio e una volta al giorno | §11; vedere il punto D2 di [`revisione-finale.md`](revisione-finale.md) |
| Le richieste di invio danno "origine non autorizzata" | `APP_ORIGIN` diverso dall'indirizzo usato | §9 |
