# Revisione finale dell'integrazione IA

Revisione indipendente eseguita il **14/10/2026** sul branch `claude/eager-ramanujan-1z6mlq`
(fasi 1–7 di [`piano-ia-reale.md`](piano-ia-reale.md)), dopo averci unito `main`
(PR #13, README con i modelli ER). Ambiente di prova: Node.js 22, MySQL 8.4 in Docker.

## 1. Risultato dei test

| Momento | Comando | Risultato |
|---|---|---|
| Prima delle correzioni | `npm test` | **216 superati, 0 falliti** |
| Test nuovi, prima delle correzioni | `node --test server/tests/deployVercel.test.js server/tests/ia-worker.test.js` | **3 falliti** (2 in `deployVercel`, il file `ia-worker` non si caricava: `analisiDopoRisposta` non esisteva) |
| Dopo le correzioni | `npm test` | **221 superati, 0 falliti, 0 saltati** |
| Test live con chiavi reali | `AI_TEST_LIVE=1 ... npm test` | non eseguiti: nessuna chiave in questo ambiente (sono facoltativi ed esclusi dalla CI) |

## 2. Esito dei controlli

Legenda: **OK** = verificato, nessun intervento; **CORRETTO** = problema trovato e corretto in questa revisione;
**DA DECIDERE** = serve una scelta del comitato (vedi §4).

| # | Punto | Esito | Gravità | File coinvolti | Prova |
|---|---|---|---|---|---|
| 1.1 | `db:reset` su database vuoto: 13 migrazioni in ordine, poi `db:seed` | OK | — | `database/migrations/*` | `DB_NAME=lnc_verifica npm run db:reset && npm run db:seed` → "13 migrazioni applicate", seed applicato |
| 1.2 | 013 su un database alla 012 con dati | OK | — | `013_ia_reale.sql` | rollback della 013, inserimento di segnalazione, allegato (con `hash_sha256`), job e analisi, poi `npm run db:migrate` → "1 migrazioni applicate"; conteggi invariati (1/1/1/1), hash invariato, colonne nuove a NULL |
| 1.3 | Vincoli nuovi attivi | OK | — | `013_ia_reale.sql`, `migrazioni.test.js` | `INSERT ... 'TIPO_INESISTENTE'` → errore 3819 `ck_job_tipo`; `hash_percettivo = 'NON-ESADECIMALE!'` → 3819 `ck_all_hash_percettivo`; `VERIFICA_AUTENTICITA` accettato |
| 1.4 | Commento di rollback presente e corretto | OK | — | `013_ia_reale.sql` | eseguito il rollback estratto dal commento: colonne rimosse, migrazione deregistrata, nuova applicazione riuscita |
| 1.5 | Script ufficiale e migrazioni 001–012 invariati | OK | — | `database/schema/`, `001`–`012` | `git diff --stat origin/main -- database/schema database/migrations/00* 010* 011* 012*` → vuoto |
| 2.1 | Autenticità e segnale del modello mai `BLOCCATO` | OK | — | `ai/autenticita.js`, `ai/esito.js` | `ia-autenticita.test.js` "nessuna combinazione produce BLOCCATO"; `ia-esito.test.js` "il solo sospetto di falsità non produce mai BLOCCATO" |
| 2.2 | `BLOCCATO` solo per testo grave o immagine inappropriata | OK | — | `ai/esito.js` | tabelle in `ia-esito.test.js` (moderazione e pertinenza) |
| 2.3 | Incongruenza, EXIF lontano, duplicato, provider giù → `DA_REVISIONARE` | OK | — | `ai/esito.js`, `ai/autenticita.js`, `ai/worker.js` | `ia-esito.test.js`, `ia-autenticita.test.js`, `ia-worker.test.js` ("provider non raggiungibile") |
| 2.4 | Il sospetto di falsità non cambia lo stato | OK | — | `ai/worker.js` | il worker scrive solo in `analisi_ia`/`job_elaborazione`; nessuna chiamata a `updateStato`/`impostaNascosta` (`grep` sui moduli `ai/`) |
| 3.1 | Con `AI_PROVIDER=mistral` la creazione non chiama il modello | OK | — | `segnalazione.service.js` | `ia-worker.test.js` "nessuna chiamata al modello nella richiesta" |
| 3.2 | Provider irraggiungibile: segnalazione creata (201) | OK | — | idem | `ia-worker.test.js` (fetch che fallisce, adapter reale) |
| 3.3 | Filtro sincrono: 422 `CONTENUTO_NON_AMMESSO` | OK | — | idem | `ia-worker.test.js`, `segnalazioni.test.js` |
| 4.1 | `prendiJob`: `SKIP LOCKED` e tentativo incrementato nella stessa transazione | OK | — | `analisi.repository.js` | lettura del codice (`SELECT ... FOR UPDATE SKIP LOCKED` + `UPDATE ... tentativi + 1` prima del `COMMIT`) |
| 4.2 | Job fallito: `IN_CODA` fino a 3 tentativi, poi `ERRORE` | OK | — | `ai/worker.js` | `ia-worker.test.js` "job fallito" |
| 4.3 | Job `COMPLETATO` non rielaborato | OK | — | idem | `ia-worker.test.js` |
| 4.4 | Job bloccato `IN_CORSO` ripreso dalla manutenzione | OK | — | `manutenzione.service.js` | `ia-worker.test.js` "job bloccato IN_CORSO" |
| 4.5 | `AI_JOB_PER_RUN` e stop con meno di 10 s **rispetto a maxDuration** | **CORRETTO** | **alta** | `ai/worker.js`, `app.js`, `segnalazione.controller.js`, `interno.controller.js`, `manutenzione.service.js` | prima: la scadenza era "avvio delle analisi + 60 s", ma le analisi partono dopo download e ricodifica degli allegati → la funzione poteva superare i 60 s ed essere interrotta, lasciando job `IN_CORSO` fino al cron. Test nuovi: "analisi dopo la risposta: il tempo si conta dall'inizio della richiesta", "manutenzione: ... tempo già trascorso", "il worker IA usa la stessa durata massima della funzione" |
| 4.6 | Nessuna elaborazione doppia con invocazioni concorrenti | OK | — | `analisi.repository.js` | test nuovo "più invocazioni in parallelo: ogni job è elaborato una sola volta" (4 worker paralleli, 4 segnalazioni) |
| 4.7 | Smaltimento della coda arretrata su Vercel | DA DECIDERE | media | `manutenzione.service.js`, `vercel.json` | il cron giornaliero elabora al massimo `AI_JOB_PER_RUN` job; i job rimandati ripartono solo con un nuovo invio (§4, D2) |
| 5.1 | Timeout con `AbortController`; nuovi tentativi solo su 429, 5xx, timeout (e errori di rete) | OK | — | `providers/openaiCompatibile.js` | `ia-provider.test.js` (429, 503, 400 senza ripetizione, timeout, rete) |
| 5.2 | Fallback Groq dopo i tentativi su Mistral | OK | — | `providers/index.js` | `ia-provider.test.js` "primario giù, fallback Groq". Nota: si passa subito a Groq anche per errori non ripetibili (4xx) e per il limite locale, dove ritentare non servirebbe |
| 5.3 | Risposte validate con Zod; JSON non valido senza crash | OK | — | `ai/schemi.js`, adapter | `ia-provider.test.js` (una sola nuova richiesta, poi errore) |
| 5.4 | Nessuna chiave in log, errori, risposte | OK | — | adapter, `utils/logger.js` | `ia-provider.test.js` (chiave ripetuta dal provider nel corpo dell'errore); prova manuale con log attivi (`LOG_LEVEL=info`): 0 occorrenze, al loro posto `[chiave]`. Nei test i log sono `silent`, quindi la prova va fatta così |
| 5.5 | Provider effettivo in `analisi_ia.modello` | OK | — | adapter, worker | `ia-provider.test.js`, `ia-worker.test.js` (`groq:qwen/qwen3.8-27b` dopo il fallback) |
| 6.1 | RPM/RPD su `limite_richieste`, concorrenza | OK | — | `providers/limiti.js` | `ia-limiti.test.js` (mai oltre il limite in parallelo; le richieste rifiutate non contano) |
| 6.2 | `eliminaLimitiScaduti` rimuove le chiavi scadute | OK | — | `rateLimitStore.js` | `ia-limiti.test.js` |
| 6.3 | Rate limit HTTP invariato | OK | — | `middlewares/security.js` | `git diff --stat origin/main -- server/src/middlewares server/src/config/rateLimitStore.js` → vuoto |
| 6.4 | Nessun limite sui token al minuto (TPM) | DA DECIDERE | bassa | `providers/limiti.js` | Groq Developer: 8.000 TPM su `qwen/qwen3.8-27b`; oltre risponde 429, gestito con nuovi tentativi o rinvio (§4, D4) |
| 7.1 | Al modello solo testo, nomi delle categorie, immagine ridimensionata | OK | — | `ai/worker.js`, `ai/prompt.js`, `ai/immagine.js` | `ia-worker.test.js` "privacy"; `ia-provider.test.js` (1024 px, JPEG) |
| 7.2 | Coordinate EXIF (e data di scatto) solo al comitato; file pubblicato senza EXIF | OK | — | `segnalazione.service.js`, `media.service.js` | `segnalazioni.test.js` (GPS rimosso dal file pubblicato), `ia-autenticita.test.js` |
| 7.3 | Informativa su analisi automatica e fornitori | OK | — | `client/privacy.html` | lettura; `npm run build:vercel` la copia in `public/` |
| 7.4 | Funzioni Vercel nella regione predefinita `iad1` (Stati Uniti) | DA DECIDERE | media | `vercel.json` | documentazione Vercel "Functions limits" (regione predefinita `iad1`); `vercel.json` non imposta `regions` (§4, D5) |
| 8.1 | Route di moderazione/amministrazione con ruolo verificato sul server | OK | — | `routes/moderazione.routes.js`, `routes/admin.routes.js` | `requireRole` a livello di router; nessuna route modificata rispetto a `main` |
| 8.2 | Nessun nuovo endpoint pubblico | OK | — | `routes/` | `git diff --stat origin/main -- server/src/routes` → vuoto |
| 8.3 | Errori dei provider non esposti agli utenti | OK | — | worker | gli errori restano in `job_elaborazione.ultimo_errore` e in `analisi_ia.risultato.dettaglio`, visibili solo al comitato e senza chiavi |
| 9.1 | `sharp` nel bundle (`includeFiles`) | OK | — | `vercel.json` | `deployVercel.test.js` |
| 9.2 | Variabili nuove documentate | OK | — | `.env.example`, `.env.production.example`, `DEPLOY-VERCEL.md` | confronto automatico `env.js` ↔ `.env.example` |
| 9.3 | Variabili facoltative non in `.env.example` (`DB_SSL`, `DB_SSL_CA`, `STORAGE_DRIVER`, `ALLEGATI_LINK_MINUTI`, `RATE_LIMIT_STORE`, `CRON_SECRET`) | CORRETTO | bassa | `.env.example` | aggiunte come righe commentate (nessun effetto sul comportamento) |
| 9.4 | Cron documentato = `vercel.json` | OK | — | `vercel.json`, `DEPLOY-VERCEL.md` | `0 3 * * *` (03:00 UTC); su Hobby Vercel garantisce solo l'ora (±59 min) |
| 9.5 | Nessuna immagine nel body della funzione | OK | — | `media.service.js`, worker | gli allegati arrivano da Vercel Blob; il worker li legge con `storage.leggi` |
| 9.6 | Inizializzazione del database remoto senza categorie | **CORRETTO** | **alta** | `package.json`, `DEPLOY-VERCEL.md`, `README.md` | la guida eseguiva solo migrazioni e amministratore: in produzione mancavano le categorie (le carica `db:seed`, non le migrazioni). Aggiunto `npm run db:seed:remoto` e il passo nella guida. Test nuovo "database remoto: esiste db:seed:remoto e la guida lo esegue tra migrazioni e amministratore" |
| 10.1 | `npm test` interamente verde | OK | — | — | 221/221 |
| 10.2 | I test non usano API reali | OK | — | `mistral-finto.js` | solo `ia-live.test.js` usa la rete, ed è saltato senza `AI_TEST_LIVE=1` e chiavi |
| 10.3 | Lacune di copertura | DA DECIDERE | bassa | — | vedi §5 |
| 11.1 | Nomi e default delle variabili coerenti | OK | — | `env.js`, `.env.example`, README, `AI-PROVIDERS.md` | confronto automatico; tabelle rigenerate dal codice in `CONFIGURAZIONE-MANUALE.md` |
| 11.2 | Niente più "stub"/"predisposizione" per funzioni implementate | CORRETTO | bassa | `docs/analisi-tecnica.md`, `ai/moderazione.js`, `ai/classificazione.js` | struttura delle cartelle e commenti aggiornati; il piano storico (fase 15) resta con una nota |
| 12.1 | Regole: risposte HTTP identiche a prima | DA DECIDERE | media | `segnalazione.repository.js`, `segnalazione.service.js` | `da_revisionare_ia` ora considera anche le analisi degli allegati (§4, D1); `riepilogo`, `data_scatto_exif` e `job_ripresi` sono campi aggiunti, confermati nel piano (S5, S7) |
| 12.2 | Diagnostica senza controllo dell'IA | DA DECIDERE | media | `diagnostica.service.js` | la scheda non mostra provider, chiave né stato della coda (§4, D3) |
| 12.3 | `max_tokens` fisso a 1.000 | DA DECIDERE | bassa | adapter | non esiste `AI_MAX_OUTPUT_TOKENS` (§4, D6) |

## 3. Correzioni applicate

1. **Durata delle analisi su Vercel (alta).** Su Vercel una funzione dura al massimo `maxDuration` (60 s) dall'inizio
   della richiesta. Le analisi partivano dopo l'invio, che scarica e ricodifica gli allegati, ma calcolavano la scadenza
   da quel momento: potevano superare il limite. Vercel interrompe la funzione con un 504 e i job restano `IN_CORSO`
   fino alla manutenzione del giorno dopo, con un tentativo consumato. Ora un middleware registra `req.inizioRichiesta`.
   `avviaAnalisiDopoRisposta(inizio)` e `eseguiManutenzione({ inizio })` usano come scadenza `inizio + 60 s`, e il
   worker continua a fermarsi quando ne restano meno di 10. La durata è una costante esportata
   (`DURATA_INVOCAZIONE_MS`) e un test la confronta con `vercel.json`.
2. **Categorie mancanti nel database di produzione (alta).** Le categorie sono dati iniziali caricati da `db:seed`,
   non dalle migrazioni. La guida di Vercel non lo eseguiva, e non c'era un comando per il database remoto.
   Aggiunto `npm run db:seed:remoto` (stesso script di `db:seed`, con `.env.production`). È documentato nella guida
   tra migrazioni e amministratore, e nella tabella dei comandi del README.
3. **Coerenza della documentazione (bassa, senza effetti sul codice).** Variabili facoltative aggiunte come commenti
   in `.env.example`. Commenti dei filtri a regole e struttura delle cartelle aggiornati, nota sul piano storico.
   Il README di `main` (PR #13) è stato unito: tabella delle migrazioni con la 013, nota che i diagrammi ER si fermano
   alla 012.

È stato aggiunto anche un test di sola verifica, senza correzione: concorrenza tra worker (punto 4.6).

## 4. Punti da decidere

**D1. `da_revisionare_ia` e analisi degli allegati (media).** Dalla fase 6 la segnalazione compare "da revisionare"
anche quando l'analisi aperta riguarda un allegato: pertinenza, autenticità, controllo tecnico. Senza questo, i nuovi
controlli sulle foto non comparirebbero mai nella lista. Con `AI_PROVIDER=regole` però cambia una risposta HTTP: una
foto a bassa risoluzione, o con GPS lontano, ora attiva il flag.
- Opzione (a), consigliata: tenere com'è e accettare la differenza, già segnalata nella fase 6.
- Opzione (b): tornare al comportamento precedente. I controlli sulle foto restano visibili solo aprendo il dettaglio.
- Opzione (c): considerare solo `VERIFICA_PERTINENZA`, cioè solo con il modello attivo. Con le regole il
  comportamento torna identico, ma i controlli di autenticità non segnalano nulla in lista.

**D2. Coda arretrata su Vercel (media).** Su Vercel il worker gira solo dopo un invio (`waitUntil`) e con il cron delle
03:00 UTC. Ogni volta elabora al massimo `AI_JOB_PER_RUN` job (5): i job rimandati per un limite ripartono solo con
l'invio successivo, e il cron ne smaltisce 5 al giorno.
- Opzione (a): nella manutenzione, elaborare finché c'è tempo (per esempio fino a 50 job), restando nei 60 s.
  Piccola modifica.
- Opzione (b): sul piano Pro, cron orario o ogni 15 minuti in `vercel.json` (su Hobby il deploy fallirebbe).
- Opzione (c): lasciare com'è, con `AI_JOB_PER_RUN` alzato a mano (rischio: più tempo per invocazione).

**D3. Diagnostica dell'IA (media).** La scheda Diagnostica non controlla l'IA. Proposta: un controllo "Analisi IA" con
provider, modello, chiave presente sì/no e numero di job in coda, rimandati e in errore (dal database, gratis).
Facoltativamente, una chiamata a `GET /v1/models` del fornitore, che verifica la chiave senza consumare token.
È una funzione nuova, quindi non è stata implementata. Nel frattempo la guida spiega come controllare con un invio
di prova.

**D4. Limite sui token al minuto (bassa).** Il progetto limita le richieste, non i token. Su Groq (8.000 TPM) un picco di
immagini produce dei 429, gestiti con nuovi tentativi e rinvio senza perdita di dati. Si consiglia
`GROQ_MAX_RPM=2`; un limitatore sui token sarebbe una modifica più grande.

**D5. Regione delle funzioni Vercel (media).** Per default le funzioni girano a `iad1` (Washington, USA): i dati delle
segnalazioni transitano negli Stati Uniti anche senza Groq. Si consiglia di scegliere una regione europea
(es. Francoforte `fra1`) nel pannello di Vercel (Settings → Functions → Region) o con `"regions"` in `vercel.json`.
Va scelta insieme alla sede del database, perché la latenza conta. È un cambio di configurazione del deploy, da
confermare.

**D6. `max_tokens` configurabile (bassa).** Il valore è fisso a 1.000 nell'adapter, ampiamente sopra il consumo misurato
(150–300 token). Una variabile `AI_MAX_OUTPUT_TOKENS` sarebbe facile da aggiungere, ma non è necessaria.

**D7. Soglia del pHash (bassa).** Già indicata nel piano: con ricompressioni molto forti una foto riusata arriva a 6 bit,
oltre la soglia di 5. Proposta: 8.

## 5. Copertura dei moduli nuovi

| Modulo | Coperto | Lacune |
|---|---|---|
| `providers/openaiCompatibile.js` | JSON valido e non valido, recinti markdown, 429 con `Retry-After`, 5xx con attesa esponenziale, 4xx, timeout, rete, scadenza, chiave nei messaggi | corpo 200 non JSON (gestito come errore di rete ripetibile, non testato) |
| `providers/index.js` | fallback, tutti giù, tutti al limite, categoria fuori elenco | errore misto (Mistral al limite + Groq 500): finisce come errore, non come rinvio, non testato |
| `providers/limiti.js` | RPM, RPD, minuto e giorno successivi, concorrenza, provider indipendenti, pulizia | — |
| `ai/worker.js` | tutti gli esecutori, tentativi, rinvii, `AI_JOB_PER_RUN`, scadenza, concorrenza, ripresa | segnalazione eliminata mentre il job è in coda (ritorna `null`, non testato) |
| `ai/esito.js`, `ai/autenticita.js`, `ai/phash.js` | tabelle complete degli esiti, EXIF, duplicati, segnale | soglia del pHash solo su immagini sintetiche (D7) |
| Client (`segnalazione.js`) | verificato con uno screenshot in Chromium (fase 6) | nessun test automatico del pannello |

## 6. Verifica finale

| Controllo | Esito |
|---|---|
| `npm test` | 221 superati, 0 falliti |
| `npm run db:reset && npm run db:seed` su database vuoto (`lnc_finale`) | 13 migrazioni, 10 categorie, 139 quartieri |
| Script ufficiale e migrazioni 001–012 | invariati (`git diff --stat origin/main -- database/schema database/migrations/00* 01[0-2]*` vuoto) |
| Segreti nel diff rispetto a `main` | nessuna chiave con valore, nessuna stringa simile a un segreto (solo URL e codici dei motivi) |
| Variabili citate nei documenti | tutte presenti nel codice, tranne `AI_MAX_OUTPUT_TOKENS` (citata per dire che non esiste, D6) e `BLOB_READ_WRITE_TOKEN_STORE_ID` (esempio di prefisso sbagliato) |
| Documentazione | README (sezione "Modelli IA, costi e limiti"), [`AI-PROVIDERS.md`](AI-PROVIDERS.md) e [`CONFIGURAZIONE-MANUALE.md`](CONFIGURAZIONE-MANUALE.md) usano gli stessi nomi e valori predefiniti di `server/src/config/env.js` |
