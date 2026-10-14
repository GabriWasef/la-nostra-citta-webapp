# Provider IA

Come il progetto usa i modelli linguistici esterni, perché sono stati scelti questi fornitori e con quali limiti.
Verifiche sulla documentazione ufficiale eseguite il **14/10/2026**: i valori dei fornitori cambiano spesso,
vanno ricontrollati prima della messa in produzione.

## 1. Cosa fa l'IA (e cosa non fa)

| Analisi | Dove | Servizio esterno | Esito |
|---|---|---|---|
| Filtro del testo a regole | nella richiesta (sincrono) | no | `BLOCCATO` → risposta 422; altrimenti salvato |
| Categorie suggerite a regole | nella richiesta | no | usate se il cittadino non sceglie categorie |
| Moderazione e classificazione del testo con il modello | worker (`MODERAZIONE_TESTO`) | sì | una chiamata, due righe in `analisi_ia` |
| Pertinenza di ogni immagine (testo, categoria, contenuti inappropriati) | worker (`VERIFICA_PERTINENZA`) | sì | una chiamata per immagine |
| Controllo tecnico dell'immagine (risoluzione, luminosità) | worker (`ANALISI_IMMAGINE`) | no | |
| Autenticità: posizione EXIF, foto già usate (pHash), segnale del modello | worker (`VERIFICA_AUTENTICITA`) | no | mai `BLOCCATO` |

- La richiesta HTTP **non dipende mai** da un servizio esterno: con il provider irraggiungibile la segnalazione
  viene creata e le analisi restano in coda o finiscono `DA_REVISIONARE` ("provider non disponibile").
- Il worker **non cambia mai** lo stato o la visibilità di una segnalazione e non modifica le categorie:
  registra esiti e suggerimenti in `analisi_ia`. Le decisioni spettano al comitato
  (`PATCH /moderazione/analisi/:id`, cambio di stato, "Nascondi dal sito").
- Per la stessa segnalazione possono esserci due righe `MODERAZIONE_TESTO` (regole e modello), distinte dal campo
  `modello`: restano entrambe.
- Il campo `modello` riporta il provider che ha risposto davvero, per esempio `mistral:mistral-small-latest`
  oppure `groq:qwen/qwen3.8-27b` quando è intervenuto il fallback.

Regole di esito (`server/src/ai/esito.js`): `BLOCCATO` solo per testo grave (minacce, odio) o immagini inappropriate;
`DA_REVISIONARE` per incongruenze immagine/testo/categoria, posizione EXIF lontana, foto già usata, sospetto di
immagine generata, confidenza bassa (< 0,7), provider non disponibile; `OK` solo se tutti i controlli sono superati.
Il sospetto di falsità non produce mai `BLOCCATO`.

## 2. Fornitori scelti

| Ruolo | Fornitore | Endpoint | Modello predefinito | Sede del trattamento |
|---|---|---|---|---|
| Primario (`AI_PROVIDER=mistral`) | Mistral AI | `https://api.mistral.ai/v1` | `mistral-small-latest` | società con sede in Francia (UE); luogo dei server non verificato nelle pagine consultate |
| Fallback (`AI_FALLBACK_PROVIDER=groq`) | Groq | `https://api.groq.com/openai/v1` | `qwen/qwen3.8-27b` | **Stati Uniti** (vedi §5) |

Motivazioni:

- **Mistral**: fornitore europeo, piano gratuito per prototipi, modello con visione e risposta in JSON,
  API compatibile con quella di OpenAI (un solo adapter per entrambi i fornitori, senza SDK).
- **Groq**: piano gratuito, latenza bassa, stessa API; usato solo se configurato esplicitamente, perché tratta
  i dati fuori dall'UE.
- **Gemini escluso**: i termini aggiuntivi dell'API Gemini prevedono che chi rende disponibili client a utenti
  nello Spazio economico europeo, in Svizzera o nel Regno Unito usi solo i servizi a pagamento; la quota gratuita
  non è utilizzabile per questo progetto.

### Nomi dei modelli

- **Mistral**: la pagina ufficiale sulla visione usa l'alias `mistral-small-latest`. `mistral-small-2506`
  (Small 3.2) è deprecato e ritirato dal 31/07/2026, sostituito da Mistral Small 4, di cui la pagina dei modelli
  non riporta ancora il nome datato. In produzione conviene fissare in `MISTRAL_MODEL` la versione datata appena
  pubblicata, per risultati riproducibili.
- **Groq**: `meta-llama/llama-4-scout-17b-16e-instruct`, indicato inizialmente, è stato spento il 17/07/2026 per i
  piani free e developer (pagina delle deprecazioni). La pagina "Images and Vision" elenca come unico modello con
  visione `qwen/qwen3.8-27b`, che supporta il JSON mode anche con immagini, fino a 3 immagini per richiesta.

## 3. Limiti tecnici verificati

| | Mistral (piano gratuito) | Groq `qwen/qwen3.8-27b` |
|---|---|---|
| Tipi di limite | richieste al secondo, token al minuto, token al mese | richieste al minuto/giorno, token al minuto/giorno |
| Valori del piano gratuito | **non documentato** (solo nella pagina "Limits" della console) | **non documentato** nella pagina pubblica (scheda "Free Plan Limits" non leggibile) |
| Valori del piano Developer | — | 30 RPM, 1.000 RPD, 8.000 TPM, 200.000 TPD |
| Ambito | organizzazione | organizzazione |
| Token per immagine | **non documentato** per i modelli attuali (stima: ~3.100 per 1024×768, con patch 16×16 come Pixtral) | 2.048 token per immagine |
| Immagini per richiesta | non documentato | 3 |
| Risposta al superamento | `429` | `429` con intestazione `retry-after` (secondi) e intestazioni `x-ratelimit-*` |

## 4. Consumi e capacità

Misure del progetto (prompt in `server/src/ai/prompt.js`, 10 categorie, testo di circa 300 caratteri):

| Chiamata | Ingresso | Uscita (massimo 1.000) |
|---|---|---|
| Testo (moderazione + classificazione) | ~1.900 caratteri ≈ 500–650 token | ~150–250 token |
| Pertinenza di un'immagine | ~2.500 caratteri ≈ 650–800 token + immagine (Groq 2.048; Mistral ~3.100, stima) | ~200–300 token |

**Per una segnalazione con una foto**: 2 chiamate, circa 3.500 token con Groq e 4.500 con Mistral (stima).
Con N foto: 1 + N chiamate.

Capacità giornaliera:

- **Con i limiti predefiniti del progetto** (`AI_MAX_RPM=20`, `AI_MAX_RPD=500` per provider): circa 250 segnalazioni
  con una foto al giorno, se il piano di Mistral lo consente; il limite reale del piano gratuito va letto nella console.
- **Groq (piano Developer)**: il vincolo è il TPM: 8.000 token al minuto bastano per circa 2 chiamate con immagine.
  Conviene impostare `GROQ_MAX_RPM=2`; con 200.000 TPD il fallback copre circa 50 segnalazioni con una foto al giorno.

## 5. Comportamento ai limiti e agli errori

- **Limiti del progetto** (`AI_MAX_RPM`, `AI_MAX_RPD`, oppure `MISTRAL_MAX_RPM`, `GROQ_MAX_RPD`, ...): contati nella
  tabella `limite_richieste`, condivisa tra le istanze (chiavi `ai:<provider>:min:<minuto>` e `ai:<provider>:day:<data>`).
  Oltre il limite la chiamata non parte: si passa al fallback o il job si **rimanda** (minuto successivo o mezzanotte UTC)
  senza consumare tentativi.
- **429 del fornitore**: nuovo tentativo dopo il tempo indicato da `retry-after`, oppure con attesa esponenziale
  (1 s, 2 s, ...), al massimo `AI_MAX_RETRIES` volte; poi fallback; se tutti i fornitori sono al limite il job si rimanda.
- **5xx, timeout (`AI_TIMEOUT_MS`), errori di rete**: nuovi tentativi come sopra, poi fallback, poi il job torna in coda
  con un'attesa crescente; dopo 3 tentativi va in `ERRORE` e compare un'analisi `DA_REVISIONARE`
  ("servizio di analisi non disponibile").
- **Risposta non valida** (non JSON o fuori schema Zod): una sola nuova richiesta, poi errore.
- **Durata della funzione su Vercel** (60 s): al massimo `AI_JOB_PER_RUN` job per invocazione; nessuna chiamata parte se
  restano meno di 10 s (il job si rimanda). I job rimasti `IN_CORSO` per un'interruzione vengono ripresi dalla
  manutenzione giornaliera dopo 10 minuti.

## 6. Privacy

- Al modello vanno **solo** il testo della segnalazione (titolo e descrizione), i nomi delle categorie e l'immagine
  ridimensionata a 1024 px in JPEG, senza metadati. Mai nome, cognome, e-mail o id dell'autore. Il testo scritto dal
  cittadino può contenere dati personali che non è possibile filtrare in modo affidabile: l'informativa lo dichiara.
- **Mistral, piano gratuito**: secondo il centro assistenza i dati (ingresso e uscita) possono essere usati per
  addestrare i modelli; l'uso si disattiva in **Admin panel → Privacy** (interruttore per le chiamate API).
  **Va disattivato prima di usare dati reali.** La conservazione zero (ZDR) è disponibile solo con il pagamento a consumo.
- **Groq**: i dati sono conservati in data center negli **Stati Uniti** (GCP); le richieste di inferenza non sono
  conservate per impostazione predefinita, i log per problemi o abusi fino a 30 giorni; la conservazione zero si
  attiva nella console. Il trasferimento extra-UE è indicato nell'informativa (`client/privacy.html`): attivare Groq
  solo dopo averlo valutato con il titolare del trattamento.
- Le chiavi API stanno solo nelle variabili d'ambiente (pannello Vercel o file `.env` non versionato): mai nel codice,
  nei log o nelle risposte HTTP; gli errori dei fornitori vengono ripuliti dalla chiave prima di essere registrati.

## 7. Configurazione

| Variabile | Predefinito | Note |
|---|---|---|
| `AI_PROVIDER` | `regole` | `regole` \| `mistral` \| `nessuno` |
| `AI_FALLBACK_PROVIDER` | `regole` | `groq` \| `regole` \| `nessuno`; con `regole`/`nessuno` non c'è un secondo servizio e il job si ritenta più tardi |
| `MISTRAL_API_KEY` | — | obbligatoria con `AI_PROVIDER=mistral` |
| `MISTRAL_MODEL` | `mistral-small-latest` | |
| `GROQ_API_KEY` | — | obbligatoria con `AI_FALLBACK_PROVIDER=groq` |
| `GROQ_MODEL` | `qwen/qwen3.8-27b` | |
| `AI_TIMEOUT_MS` | `15000` | attesa massima di una risposta |
| `AI_MAX_RETRIES` | `2` | nuovi tentativi su 429, 5xx, timeout |
| `AI_MAX_RPM`, `AI_MAX_RPD` | `20`, `500` | per provider; `0` = nessun limite |
| `MISTRAL_MAX_RPM`, `MISTRAL_MAX_RPD`, `GROQ_MAX_RPM`, `GROQ_MAX_RPD` | — | sostituiscono i valori comuni |
| `AI_JOB_PER_RUN` | `5` | job per invocazione del worker |
| `EXIF_MAX_DISTANCE_M` | `100` | distanza oltre la quale la posizione GPS della foto è incoerente |

Test con i servizi reali (facoltativi, mai in CI): `AI_TEST_LIVE=1 MISTRAL_API_KEY=... GROQ_API_KEY=... npm test`.

## 8. Fonti

- Mistral: [Vision](https://docs.mistral.ai/capabilities/vision/), [Models overview](https://docs.mistral.ai/getting-started/models/models_overview/),
  [limiti di frequenza](https://help.mistral.ai/en/articles/698531-why-am-i-hitting-api-rate-limits-and-how-do-i-increase-them),
  [Usage and limits](https://docs.mistral.ai/admin/user-management-finops/tier),
  [uso dei dati per l'addestramento](https://help.mistral.ai/en/articles/455207-can-i-opt-out-of-my-input-or-output-data-being-used-for-training),
  [Zero Data Retention](https://help.mistral.ai/en/articles/347612-can-i-activate-zero-data-retention-zdr).
- Groq: [Images and Vision](https://console.groq.com/docs/vision), [Rate limits](https://console.groq.com/docs/rate-limits),
  [Deprecations](https://console.groq.com/docs/deprecations), [Your data in GroqCloud](https://console.groq.com/docs/your-data),
  [Data Processing Addendum](https://console.groq.com/docs/legal/customer-data-processing-addendum).
- Google: [Gemini API Additional Terms of Service](https://ai.google.dev/gemini-api/terms).
