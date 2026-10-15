# Piano: integrazione IA reale

Stato: **scelte confermate** (tutte le opzioni consigliate del §4, S1–S7, e le proposte delle domande aperte).
Avanzamento: fase 1 ✅ · fase 2 ✅ · fase 3 ✅ · fase 4 ✅ · fase 5 ✅ · fase 6 ✅ · fase 7 ✅.
Data dell'analisi: 12/10/2026, sul branch `main` (commit `5506b09`).

## 1. Fasi

| Fase | Contenuto | Esito atteso |
|---|---|---|
| 1 | Migrazione 013 e `migrazioni.test.js` | Nuovi vincoli e colonne, test verdi |
| 2 | Regole di esito, worker con i nuovi esecutori (solo provider a regole), limite di job per invocazione, ripresa dei job bloccati | Flusso asincrono completo senza LLM |
| 3 | Adapter OpenAI-compatibile (Mistral, Groq), prompt, schema Zod, fallback, `mistral-finto.js` | Provider reali sostituibili e testati senza rete |
| 4 | `VERIFICA_AUTENTICITA`, pHash, data di scatto EXIF | Controlli deterministici |
| 5 | Rate limit dei provider su `limite_richieste` | RPM e RPD rispettati, job rimandati e non falliti |
| 6 | Pannello admin (dettaglio segnalazione) | Esito, modello, motivazioni, conferma/correzione |
| 7 | Documentazione e deploy | `AI-PROVIDERS.md`, analisi tecnica, README, Vercel, privacy |

Alla fine di ogni fase: `npm test` verde e progetto avviabile come da README (sezione Avvio).

## 2. File da creare

| File | Contenuto |
|---|---|
| `database/migrations/013_ia_reale.sql` | Vincoli `ck_ai_tipo` e `ck_job_tipo` con `VERIFICA_AUTENTICITA`; `allegato.hash_percettivo CHAR(16)` con indice; `allegato.data_scatto_exif TIMESTAMP`; colonna per rimandare i job (vedi scelta S6); commento di rollback |
| `server/src/ai/providers/openaiCompatibile.js` | Adapter unico: `fetch` iniettabile, `AbortController`, retry con backoff su 429/5xx/timeout, `response_format: json_object`, un solo nuovo tentativo se il JSON non è valido |
| `server/src/ai/providers/index.js` | Costruzione di provider primario e di fallback dalle variabili d'ambiente; nome del modello effettivo (`mistral:<modello>`, `groq:<modello>`) |
| `server/src/ai/providers/limiti.js` | Rate limit RPM/RPD per provider sulla tabella `limite_richieste` |
| `server/src/ai/prompt.js` | Prompt di sistema in italiano, costruzione dei messaggi (testo, elenco chiuso di categorie, immagine) |
| `server/src/ai/schemi.js` | Schema Zod della risposta del modello (quello del prompt di lavoro) |
| `server/src/ai/esito.js` | Regole di esito: funzione pura che riceve le analisi di una segnalazione e restituisce esito suggerito e motivi |
| `server/src/ai/autenticita.js` | Distanza EXIF (haversine), confronto pHash (distanza di Hamming), segnale LLM a peso basso |
| `server/src/ai/phash.js` | pHash a 64 bit (sharp 32×32 in scala di grigi + DCT 8×8), restituito in esadecimale (16 caratteri) |
| `server/src/ai/immagine.js` | Ridimensionamento a lato lungo 1024 px in JPEG e conversione in data URI |
| `server/tests/mistral-finto.js` | `fetch` finto: risposte valide, JSON non valido, 429, 5xx, attesa oltre il timeout |
| `server/tests/ia-provider.test.js` | Adapter, fallback, rate limit |
| `server/tests/ia-worker.test.js` | Esecutori, tentativi, job già completati, job bloccati, limite per invocazione |
| `server/tests/ia-autenticita.test.js` | EXIF oltre soglia, metadati assenti, pHash simile, tabella delle regole di esito |
| `server/tests/ia-live.test.js` | Test con chiavi reali: saltati senza `MISTRAL_API_KEY`/`GROQ_API_KEY`, esclusi in CI |
| `docs/AI-PROVIDERS.md` | Provider, motivazioni, limiti verificati con data, token stimati, capacità giornaliera, comportamento al 429, trasferimenti extra-UE |

## 3. File da modificare

| File | Modifica |
|---|---|
| `server/src/config/env.js` | `AI_PROVIDER` (`regole`/`mistral`/`nessuno`), `AI_FALLBACK_PROVIDER` (`groq`/`regole`/`nessuno`), chiavi e modelli, `AI_TIMEOUT_MS`, `AI_MAX_RETRIES`, `AI_MAX_RPM`, `AI_MAX_RPD`, `AI_JOB_PER_RUN`, `EXIF_MAX_DISTANCE_M`. Errore di configurazione se `AI_PROVIDER=mistral` senza `MISTRAL_API_KEY` |
| `server/src/ai/index.js` | Registro: `moderazione` a regole sempre attiva salvo `nessuno` (filtro sincrono); provider LLM separato (`provider.llm`) per gli esecutori del worker |
| `server/src/ai/worker.js` | Esecutori `MODERAZIONE_TESTO`, `CLASSIFICAZIONE_TESTO`, `VERIFICA_PERTINENZA`, `VERIFICA_AUTENTICITA`; massimo `AI_JOB_PER_RUN` job per invocazione e stop se restano meno di 10 s; rinvio dei job senza consumare tentativi quando il limite è raggiunto |
| `server/src/repositories/analisi.repository.js` | `rimandaJob`, `riprendiJobBloccati`, lettura delle analisi di pertinenza per l'autenticità |
| `server/src/repositories/allegato.repository.js` | `hash_percettivo`, `data_scatto_exif`; ricerca degli allegati simili di altre segnalazioni |
| `server/src/services/media.service.js` | Lettura di `DateTimeOriginal` (va letta prima della ricodifica, che rimuove i metadati) e, secondo la scelta S2, calcolo del pHash |
| `server/src/services/segnalazione.service.js` | Accodamento dei nuovi job nella transazione di creazione; filtro a regole invariato nella richiesta; riepilogo IA nella risposta delle analisi (scelta S5) |
| `server/src/services/manutenzione.service.js` | Rimessa in coda dei job `IN_CORSO` da più di 10 minuti (oggi `prendiJob` prende solo `IN_CODA`: un job interrotto resta bloccato per sempre) |
| `client/js/pages/segnalazione.js` (+ CSS) | Analisi leggibili: esito, modello, motivazioni e spiegazione invece del solo JSON (che resta in un `<details>`); pulsante "Correggi" oltre a Conferma/Respingi (l'API accetta già `CORRETTA`) |
| `client/privacy.html` | Analisi automatica, fornitori, trasferimento extra-UE con Groq |
| `server/tests/migrazioni.test.js` | Vincoli e colonne della 013 |
| `server/tests/ia.test.js` | Solo aggiunte (registro dei provider) |
| `.env.example`, `.env.production.example`, `DEPLOY-VERCEL.md` | Nuove variabili, senza valori |
| `docs/analisi-tecnica.md`, `README.md` | RF11–RF13, PERF4, §5.3, tabella migrazioni; riga "IA" dei limiti noti e link ad `AI-PROVIDERS.md` |
| `docs/api.md` | Solo se si sceglie l'opzione S5-a (campo aggiuntivo nella risposta delle analisi) |

Non si toccano: lo script ufficiale `database/schema/database_la_nostra_citta_mysql.sql`, le migrazioni 001–012,
controller e route, `vercel.json` (né frequenza del cron né chiavi).

## 4. Scelte con alternative (attendono conferma)

**S1. Segnalazioni con esito BLOCCATO**
- a) *Solo segnalarle* al comitato (badge e lista `da_revisionare_ia`); il comitato decide se nasconderle. **Consigliata**: coerente con "i volontari hanno l'ultima parola" e con le regole del §4 del prompt.
- b) Nasconderle automaticamente (migrazione 012) in attesa di revisione. Più protettiva verso il pubblico, ma un falso positivo dell'LLM nasconde una segnalazione legittima senza intervento umano; inoltre una segnalazione appena inserita non è comunque pubblica finché non viene approvata, quindi il beneficio è ridotto.

**S2. Dove calcolare pHash e data di scatto**
- a) *All'upload*, in `media.service.js`. **Consigliata**: l'immagine ricodificata è già in memoria, il pHash costa pochi millisecondi, non si riscarica il file dal Blob; la data di scatto va comunque letta lì perché la ricodifica elimina l'EXIF.
- b) Nel worker. Richiesta più leggera, ma un download in più da Vercel Blob per immagine e, finché il job non gira, nessun pHash con cui confrontare le segnalazioni successive.

**S3. Numero di chiamate all'LLM per segnalazione** (con N immagini)
- a) Una chiamata per job: moderazione, classificazione, pertinenza × N → 2 + N chiamate. Più semplice e leggibile.
- b) Moderazione e classificazione in un'unica chiamata di solo testo (due righe in `analisi_ia`) + pertinenza × N → 1 + N chiamate. **Consigliata** se i limiti gratuiti risultano stretti (da verificare in fase 3), altrimenti a).

**S4. Segnale LLM nella VERIFICA_AUTENTICITA**
- a) Il job di autenticità di un allegato viene accodato dopo quello di pertinenza e ne legge il segnale `sembra_generata_o_montata`; se la pertinenza non è ancora disponibile, lo indica nel risultato. **Consigliata**.
- b) L'autenticità resta solo deterministica; il segnale LLM rimane nella riga di pertinenza e lo combinano le regole di esito.

**S5. Dove mostrare l'esito complessivo (regole di esito)**
- a) Calcolato al volo e aggiunto come campo `riepilogo` nella risposta di `GET /moderazione/segnalazioni/:id/analisi` (campo aggiuntivo, compatibile). **Consigliata**: nessuna nuova tabella, sempre coerente con le revisioni.
- b) Solo nel client, partendo dalle singole analisi. Nessuna modifica all'API, ma la logica sta nel browser e non si testa con `node:test`.

**S6. Rinvio dei job quando il rate limit è raggiunto**
- a) Nuova colonna `job_elaborazione.disponibile_dal TIMESTAMP NULL` nella 013: il job torna `IN_CODA` con la data da cui riprenderlo e il tentativo non viene conteggiato. **Consigliata**: serve anche per il backoff tra un tentativo e l'altro.
- b) Nessuna colonna: il job torna `IN_CODA` e si decrementa `tentativi`. Funziona, ma il worker lo riprenderebbe subito nella stessa invocazione.

**S7. Con `AI_PROVIDER=regole`, eseguire anche la VERIFICA_AUTENTICITA (deterministica)?**
- a) Sì. **Consigliata**: non usa servizi esterni; le risposte HTTP restano identiche, cambiano solo le righe in `analisi_ia` visibili al comitato.
- b) No: con `regole` il comportamento del database resta identico a oggi, autenticità solo con `mistral`.

## 5. Differenze rispetto al prompt di lavoro

1. **Modello Groq.** `meta-llama/llama-4-scout-17b-16e-instruct` risulta nella pagina delle deprecazioni di Groq con spegnimento il 17/07/2026 per i piani free e developer. *Verificato il 14/10/2026:* la documentazione ufficiale "Images and Vision" di Groq elenca come unico modello con visione `qwen/qwen3.8-27b` (JSON mode supportato anche con immagini, massimo 3 immagini per richiesta): è il valore predefinito di `GROQ_MODEL`.
2. **Modello Mistral.** *Verificato il 14/10/2026:* la documentazione ufficiale sulla visione usa l'alias `mistral-small-latest`; `mistral-small-2506` (Small 3.2) è deprecato e ritirato dal 31/07/2026, sostituito da Mistral Small 4, il cui nome datato non è ancora riportato nella pagina dei modelli. Valore predefinito di `MISTRAL_MODEL`: `mistral-small-latest`; in produzione conviene fissare la versione datata appena documentata.
3. **Durata della funzione.** Con 15 s di timeout, 2 retry e il fallback, una sola chiamata può arrivare a ~90 s, oltre i 60 s di `maxDuration`. Ogni chiamata riceverà una scadenza (tempo residuo dell'invocazione − 10 s): se non basta per un altro tentativo, il job viene rimandato invece di fallire.
4. **Job bloccati in `IN_CORSO`.** Oggi nessuno li riprende (criterio di accettazione non soddisfatto dal codice attuale): la manutenzione li rimetterà in coda dopo 10 minuti, usando `data_aggiornamento`.
5. **`elaboraTutti()` non ha limite.** È usata da `avviaAnalisiDopoRisposta`, dal worker locale e dalla manutenzione: il limite `AI_JOB_PER_RUN` e il controllo del tempo residuo valgono per ogni invocazione; il worker locale riprende al ciclo successivo. La manutenzione notturna elaborerà anch'essa al massimo `AI_JOB_PER_RUN` job, il resto alla prossima segnalazione inserita.
6. **Data di scatto.** `DateTimeOriginal` va letta all'upload: la ricodifica con sharp elimina l'EXIF, quindi il worker non potrebbe più leggerla.
7. **Video.** Senza ffmpeg non si estraggono fotogrammi: `VERIFICA_PERTINENZA` e pHash solo per le immagini; per i video resta il solo controllo di tipo e dimensione (`ANALISI_VIDEO` non implementata).
8. **Controllo tecnico delle immagini** (`ANALISI_IMMAGINE`, risoluzione e luminosità): resta attivo anche con `mistral`, perché non dipende da servizi esterni.
9. **Rate limit e `rateLimitStore.js`.** La classe `MySqlRateLimitStore` è riusabile (prefisso `ai:mistral:min`, finestra 60 s); per il limite giornaliero uso una chiave con la data (`ai:mistral:day:2026-10-12`) così la finestra coincide con il giorno di calendario UTC.
10. **Privacy.** Oltre a Groq (extra-UE), il piano gratuito di Mistral potrebbe consentire l'uso dei dati per l'addestramento salvo disattivazione nella console: da verificare e indicare in `AI-PROVIDERS.md` e nell'informativa. Il testo della segnalazione può contenere dati personali scritti dall'autore: non è filtrabile in modo affidabile, va dichiarato.
11. **Ambiente dei test.** I test richiedono MySQL 8; nel container di sviluppo MySQL non è installato. Userò Docker (`docker-compose.yml` del progetto) se disponibile, altrimenti lo segnalerò per ogni fase.

12. **Soglia del pHash.** Con la soglia richiesta (distanza di Hamming ≤ 5) una foto ridimensionata e ricompressa in modo realistico (lato 560 px, qualità 80) resta a 0–2 bit; con ricompressioni molto forti (qualità 50–60) si arriva a 6 bit e il riuso sfugge. Tra foto diverse la distanza minima osservata è 14–22 bit. Alzare la soglia a 8 resterebbe lontano dai falsi positivi: da decidere.
13. **Immagini uniformi.** Un'immagine quasi priva di contrasto (cielo, muro, foto nera) non riceve il pHash: il suo hash sarebbe rumore e coinciderebbe per caso con altre immagini uniformi. Il confronto risulta "non verificabile".
14. **Data di scatto.** `data_scatto_exif` è salvata all'upload e mostrata nella verifica (giorni prima dell'invio), ma non cambia l'esito: una foto vecchia può documentare un problema che dura da tempo.

## 6. Domande aperte

1. Le scelte S1–S7 (le consigliate sono indicate).
2. Valori predefiniti di `AI_MAX_RPM` e `AI_MAX_RPD`: proposta di usarli per provider (`MISTRAL_MAX_RPM`, `GROQ_MAX_RPM`, …) invece di un valore unico, perché i limiti dei due fornitori sono diversi. Va bene la denominazione per provider, mantenendo `AI_MAX_RPM`/`AI_MAX_RPD` come valore comune predefinito?
3. Quando primario e fallback non sono disponibili (tentativi esauriti): il job va in `ERRORE` e si registra un'analisi `DA_REVISIONARE` con motivo "provider non disponibile", così il comitato lo vede nella lista. Confermi?
4. Il pannello mostra già tutte le righe `analisi_ia` con il campo `modello`; serve anche un filtro nella coda di moderazione per tipo di analisi, o basta il badge esistente `da_revisionare_ia`?
