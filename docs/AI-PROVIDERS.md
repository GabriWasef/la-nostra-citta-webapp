# Modelli IA, costi e limiti

Questo documento spiega quali servizi di intelligenza artificiale usa il progetto, perché sono stati scelti, quanto
costano e quali limiti hanno. I valori dei fornitori sono stati verificati sulle pagine ufficiali il **14/10/2026**.
Dove una pagina ufficiale non riporta un valore è scritto "non documentato". Dove il valore viene da una fonte
secondaria, o da un calcolo, è indicato. I fornitori cambiano prezzi e limiti spesso: la procedura di aggiornamento
è al §8.

> **Aggiornamento del 19/10/2026.** Fornitore primario: **Cloudflare Workers AI** (`AI_PROVIDER=cloudflare`, modello
> `@cf/google/gemma-4-26b-a4b-it`), poi **Groq** (`AI_FALLBACK_PROVIDER=groq`), poi le regole. Mistral resta
> selezionabile. Gemini resta escluso. Quote giornaliere nella tabella `ai_quota` (§6), moderazione automatica al §1.
> Prezzi e limiti di Cloudflare **non** sono riportati qui: vanno letti nella console (vedi
> [`GUIDA-TEST-IA.md`](GUIDA-TEST-IA.md), §9). I valori di Mistral e Groq sotto sono quelli verificati il 14/10/2026.

## 1. Cosa fa l'IA nel progetto

L'IA aiuta il comitato a esaminare le segnalazioni. Ogni analisi produce un esito suggerito (`OK`, `DA_REVISIONARE`,
`BLOCCATO`) salvato in `analisi_ia`. Lo stato e le categorie di una segnalazione li cambiano solo i moderatori.
Unica eccezione, l'**auto-nascondi**: se la moderazione del testo fatta dal modello ha esito `BLOCCATO` (motivo grave,
oppure spam, testo privo di senso o non pertinente con confidenza ≥ `AI_SOGLIA_AUTO_NASCONDI`) e
`AI_AUTO_NASCONDI=true`, il worker nasconde la segnalazione (motivazione `AUTO_IA: <motivo>`). Il comitato la ripristina
o conferma dal pannello di moderazione. Regole e limiti: [`piano-ia-reale.md`](piano-ia-reale.md), §7.

L'invio di una segnalazione non dipende mai da un servizio esterno. Nella richiesta girano solo controlli a regole:
un filtro sul testo, che risponde 422 per minacce e linguaggio d'odio, le categorie suggerite per parole chiave e la
lettura dei metadati delle foto. Le analisi con il modello linguistico avvengono dopo, nel worker, leggendo la coda
`job_elaborazione`. Se il fornitore non risponde la segnalazione viene creata comunque, e le analisi restano in coda
o finiscono "da revisionare".

| Analisi | Dove | Servizio esterno | Chiamate al modello |
|---|---|---|---|
| Filtro del testo e categorie a regole | nella richiesta | no | 0 |
| Moderazione e classificazione del testo (`MODERAZIONE_TESTO`) | worker | sì | 1 per segnalazione (produce due righe) |
| Pertinenza dell'immagine con testo e categorie (`VERIFICA_PERTINENZA`) | worker | sì | 1 per immagine |
| Controllo tecnico dell'immagine (`ANALISI_IMMAGINE`) | worker | no | 0 |
| Autenticità: posizione GPS, foto già usate, segnale del modello (`VERIFICA_AUTENTICITA`) | worker | no | 0 |

Le regole di esito sono in `server/src/ai/esito.js`. `BLOCCATO` è riservato al testo grave (minacce, odio) e alle
immagini inappropriate. Il sospetto che una foto sia generata o ritoccata produce al massimo `DA_REVISIONARE`, perché
nessun modello può accertarlo.

## 2. Modelli scelti e perché

### Cloudflare Workers AI, fornitore principale (dal 19/10/2026)

Con `AI_PROVIDER=cloudflare` il worker usa il modello in `CLOUDFLARE_MODEL` (predefinito
`@cf/google/gemma-4-26b-a4b-it`) attraverso l'endpoint compatibile con OpenAI
`https://api.cloudflare.com/client/v4/accounts/{CLOUDFLARE_ACCOUNT_ID}/ai/v1`, con lo stesso adapter usato per gli altri
fornitori. Si autentica con `CLOUDFLARE_API_TOKEN` (intestazione `Authorization: Bearer`). A Cloudflare il progetto
chiede `response_format` di tipo `json_schema`, con lo schema Zod della risposta convertito in JSON Schema. Se il modello
non riesce a rispettarlo, Cloudflare risponde con l'errore "JSON Mode couldn't be met" e si passa al livello successivo.

Verificato nella documentazione ufficiale il 19/10/2026: l'indirizzo dell'endpoint, l'autenticazione Bearer e il fatto
che la pagina del modello indichi il supporto alla visione. **Non verificato:** che `/ai/v1/chat/completions` accetti le
immagini come parti `image_url` con Gemma 4 (in caso contrario si usa `/ai/run/{model}`), che `json_schema` sia
rispettato da questo modello (la pagina JSON Mode non lo elenca) e i limiti gratuiti. Le prove sono nella
[guida di test](GUIDA-TEST-IA.md), §4 e §9.

### Mistral AI, fornitore alternativo

Con `AI_PROVIDER=mistral` il worker usa il modello indicato in `MISTRAL_MODEL`, per default `mistral-small-latest`.
La documentazione ufficiale sulla visione usa proprio questo alias per gli esempi con immagini. L'alias punta
all'ultima versione di Mistral Small: oggi Mistral Small 4 (versione 26.03, licenza Apache 2.0). La versione 3.2
(`mistral-small-2506`) è stata ritirata il 31/07/2026. La pagina dei modelli non riporta ancora il nome datato di
Small 4. Quando comparirà conviene scriverlo in `MISTRAL_MODEL`, così il modello non cambia senza preavviso.

È stato scelto per quattro ragioni:
- un solo modello legge testo e immagini nella stessa chiamata e risponde in JSON, quindi la pertinenza della foto
  si valuta insieme al testo;
- Mistral AI ha sede in Francia, nell'Unione europea;
- c'è una modalità gratuita (Free mode) che non richiede carta di credito;
- l'API è compatibile con quella di OpenAI, quindi un solo adapter senza librerie esterne serve sia Mistral sia Groq.

Sull'uso dei dati per l'addestramento: secondo il centro assistenza, in Free mode i dati inviati possono essere usati
per addestrare i modelli. L'uso si disattiva in Admin panel → Privacy. Per i piani a pagamento la pagina dei prezzi
indica "Opt-out", ma non abbiamo trovato una fonte ufficiale che dica che l'addestramento è disattivato per
impostazione predefinita. Va quindi disattivato a mano in ogni caso. La conservazione zero dei dati (Zero Data
Retention) è disponibile solo con il pagamento a consumo.

### Groq, fornitore di riserva (facoltativo)

Al 19/10/2026 `qwen/qwen3.8-27b` compare nella pagina dei modelli di Groq tra i **Preview Models** ("intended for
evaluation purposes only"); i limiti del piano gratuito non sono pubblicati. Va ricontrollato prima del rilascio.

Con `AI_FALLBACK_PROVIDER=groq`, quando il fornitore principale non risponde dopo i tentativi o ha esaurito il limite, il worker
prova il modello in `GROQ_MODEL`, per default `qwen/qwen3.8-27b`. È l'unico modello con visione elencato nella pagina
"Images and Vision" di Groq. Il modello indicato all'inizio del progetto,
`meta-llama/llama-4-scout-17b-16e-instruct`, è stato spento il 17/07/2026 per i piani free e developer.

Groq è stato scelto perché risponde molto in fretta, ha un piano gratuito e usa la stessa API. Ha però un costo in
termini di privacy. Secondo la documentazione, i dati sono conservati in data center negli Stati Uniti; le richieste
non sono conservate per default, i log tecnici fino a 30 giorni. Usarlo significa trasferire testo e immagini fuori
dall'Unione europea. Il trasferimento si regge sulle garanzie contrattuali del fornitore, cioè sull'accordo sul
trattamento dei dati (DPA) che prevede il trasferimento negli Stati Uniti. Per questo il valore predefinito è
`AI_FALLBACK_PROVIDER=regole`, cioè nessun servizio di riserva. Il comitato può lasciare Groq disattivato in
produzione: le analisi aspettano che Mistral torni disponibile, senza perdere dati. L'informativa
(`client/privacy.html`) descrive entrambe le situazioni.

### Alternative scartate

L'unica alternativa valutata e scartata durante l'analisi è **Google Gemini**. I termini aggiuntivi dell'API Gemini
stabiliscono che chi offre servizi a utenti dello Spazio economico europeo, della Svizzera o del Regno Unito deve usare
solo i servizi a pagamento: la quota gratuita non è utilizzabile per questo progetto.

Non si usa un modello installato su server propri. È una scelta consapevole: un modello con visione richiede una GPU
sempre disponibile, che costa molto più del consumo previsto, va aggiornato e sorvegliato, e non gira sulle funzioni
di Vercel. Il codice resta comunque aperto a questa possibilità: un servizio compatibile con l'API di OpenAI si
collega cambiando indirizzo e modello.

## 3. Costi

### Prezzi dei fornitori

| | Mistral `mistral-small-latest` (Small 4) | Groq `qwen/qwen3.8-27b` |
|---|---|---|
| Piano gratuito | Free mode: senza carta di credito, quota mensile inclusa entro i limiti mostrati nella console; i dati possono servire per l'addestramento salvo disattivazione | piano Free: limiti non pubblicati (visibili nella console) |
| Verifica del numero di telefono | non documentato nelle pagine ufficiali (da verificare alla registrazione) | non documentato |
| Prezzo input, per milione di token | 0,15 USD (fonte secondaria: OpenRouter, BenchLM; la pagina ufficiale non lo mostra) | 0,80 USD (pagina del modello) |
| Prezzo output, per milione di token | 0,60 USD (fonte secondaria, come sopra) | 4,00 USD (pagina del modello) |
| Prezzo per immagine | nessun prezzo separato: le immagini contano come token di input; quanti token sia un'immagine non è documentato | nessun prezzo separato: ogni immagine conta 2.048 token di input |
| Limite di spesa | sì: limite mensile di spesa per organizzazione e per workspace; raggiunto il limite l'API si sospende fino al mese successivo | da verificare nella console |

Pagine ufficiali dei prezzi: <https://mistral.ai/pricing> e <https://groq.com/pricing> (al momento della verifica nessuna
delle due mostrava i prezzi di questi modelli; quello di Groq è nella pagina del modello).

### Quanto costa una segnalazione

I token sono stati misurati sui prompt reali del progetto (`server/src/ai/prompt.js`), con dieci categorie e un testo di
circa 300 caratteri.

| Chiamata | Token di input | Token di output |
|---|---|---|
| Testo: prompt di sistema, regole, categorie, testo | 500–650 | 150–250 |
| Immagine: come sopra più l'immagine a 1024 px | 650–800 + immagine (Groq: 2.048; Mistral: circa 3.100, stima) | 200–300 |

La stima dei token d'immagine di Mistral si basa sulla regola documentata per il modello Pixtral: un token ogni
16×16 pixel, cioè circa 3.100 token per 1024×768. Per Small 4 non è documentata.

Una segnalazione con una foto richiede **2 chiamate**: una per il testo, che produce sia la moderazione sia la
classificazione, e una per l'immagine. Ogni foto in più aggiunge una chiamata. Con i prezzi sopra:

| | Token per segnalazione (1 foto) | Costo per 1.000 segnalazioni con 1 foto | Con 3 foto |
|---|---|---|---|
| Mistral | circa 4.500 in + 450 out | circa 0,95 USD | circa 2,50 USD |
| Groq | circa 3.400 in + 450 out | circa 4,50 USD | circa 11 USD |

### Costi fissi dell'infrastruttura (verificati a ottobre 2026)

| Servizio | Gratuito | A pagamento |
|---|---|---|
| Vercel Hobby | 0 USD al mese, ma **solo per uso personale e non commerciale** | — |
| Vercel Pro | — | 20 USD al mese per membro, con 20 USD di credito d'uso incluso |
| Vercel Blob (archivio delle foto) | Hobby: 1 GB di spazio, 10.000 operazioni semplici, 2.000 operazioni avanzate e 10 GB di trasferimento al mese | Pro: 0,023 USD per GB al mese, 0,40 USD per milione di operazioni semplici, 5 USD per milione di operazioni avanzate |
| MySQL 8 | dipende dal fornitore scelto (da verificare) | dipende dal fornitore scelto (da verificare) |

Un comitato cittadino è un'organizzazione, non un uso personale: per la produzione va valutato il piano Pro di
Vercel. La decisione spetta al comitato, sulle condizioni aggiornate di Vercel.

### Scenari

| Scenario | Volume indicativo | Configurazione consigliata | Costo mensile stimato |
|---|---|---|---|
| Sviluppo e prove | poche segnalazioni di prova | `AI_PROVIDER=regole`, oppure Mistral in Free mode con dati fittizi; MySQL in Docker | 0 USD |
| Prototipo pubblico | circa 30 segnalazioni al giorno (900 al mese, 1–2 foto) | Mistral, Free mode se i limiti della console bastano, altrimenti pagamento a consumo; Groq disattivato | IA: meno di 2 USD; Vercel Pro 20 USD; Blob entro 1–2 USD; più il database |
| Uso intenso | circa 300 segnalazioni al giorno (9.000 al mese, 1–2 foto) | Mistral a consumo con ZDR, eventuale Groq di riserva con `GROQ_MAX_RPM=2` | IA: circa 10–20 USD; Vercel Pro 20 USD più eventuale consumo; Blob qualche USD (circa 0,4 MB per foto); più il database |

Le cifre dell'IA sono calcolate con i token misurati e i prezzi sopra. Sono una stima e vanno ricontrollate sulla
fattura dei primi mesi.

## 4. Limiti dei fornitori

| | Mistral `mistral-small-latest` | Groq `qwen/qwen3.8-27b` |
|---|---|---|
| Contesto massimo in input | non documentato nella pagina ufficiale (262.144 token secondo OpenRouter) | 131.072 token |
| Token massimi in output | non documentato | 16.384 |
| Valore usato dal progetto | 1.000 (`max_tokens`, fisso nell'adapter: non esiste una variabile `AI_MAX_OUTPUT_TOKENS`) | 1.000 (idem) |
| Immagini per richiesta | non documentato | 3 (il progetto ne invia 1) |
| Dimensione massima dell'immagine | non documentato | 20 MB (il progetto invia JPEG a 1024 px, circa 100–300 KB) |
| Tipi di limite | richieste al secondo, token al minuto, token al mese (per modello) | richieste al minuto e al giorno, token al minuto e al giorno |
| Valori del piano gratuito | non pubblicati: pagina Limits della console (Admin panel → API → Limits) | non pubblicati: pagina Limits della console |
| Valori del piano a pagamento | non pubblicati; crescono con la spesa; si chiedono al supporto | piano Developer: 30 RPM, 1.000 RPD, 8.000 TPM, 200.000 TPD |
| Richieste simultanee | il limite al secondo funziona come limite di concorrenza | non documentato |
| Ambito dei limiti | organizzazione | organizzazione |
| Quando si azzerano i limiti giornalieri o mensili | non documentato; il limite di spesa riparte con il mese successivo | non documentato (né fuso orario né finestra) |
| Al superamento | errore 429 | errore 429 con intestazione `retry-after` in secondi; intestazioni `x-ratelimit-*` su ogni risposta |

## 5. Limiti applicativi del progetto

I fornitori applicano i loro limiti, ma il progetto ne applica di propri: per non scoprirli con un errore e per
restare dentro i tempi di Vercel. Sono tutti variabili d'ambiente; i valori predefiniti sono quelli di
`server/src/config/env.js` e di `.env.example`.

| Limite | Variabile | Predefinito | Cosa succede |
|---|---|---|---|
| Richieste al minuto per fornitore | `AI_MAX_RPM` (o `MISTRAL_MAX_RPM`, `GROQ_MAX_RPM`) | 20 | la chiamata non parte: si passa al fornitore di riserva oppure il job si rimanda al minuto successivo, senza consumare tentativi |
| Richieste al giorno per fornitore | `AI_MAX_RPD` (o `MISTRAL_MAX_RPD`, `GROQ_MAX_RPD`) | 500 | come sopra, ma il job si rimanda alla mezzanotte UTC |
| Attesa massima di una risposta | `AI_TIMEOUT_MS` | 15.000 ms | la richiesta si interrompe e conta come errore ripetibile |
| Nuovi tentativi della stessa chiamata | `AI_MAX_RETRIES` | 2 | su 429, errori 5xx, timeout e rete; attesa di 1 s, poi 2 s (o il `retry-after` del fornitore) |
| Tentativi di un job | fisso | 3 | dopo ogni errore il job torna in coda con un'attesa di 1, poi 2 minuti; al terzo errore va in `ERRORE` e compare un'analisi `DA_REVISIONARE` "servizio di analisi non disponibile" |
| Job per invocazione del worker | `AI_JOB_PER_RUN` | 5 | gli altri restano in coda per l'invocazione successiva |
| Durata di un'invocazione | `maxDuration` in `vercel.json` | 60 s | il worker conta il tempo dall'inizio della richiesta e non avvia nulla se restano meno di 10 s; nessuna chiamata parte con meno di 2 s utili |
| Dimensione dei file caricati | `MAX_IMAGE_MB`, `MAX_VIDEO_MB`, `MAX_FILES` | 10 MB, 50 MB, 5 file | l'invio viene rifiutato con un messaggio |
| Immagine inviata al modello | fisso | lato lungo 1.024 px, JPEG, senza metadati | riduce token e costi; la foto archiviata resta a 2.048 px |
| Corpo della richiesta su Vercel | limite di Vercel | 4,5 MB | per questo le foto vanno dal browser a Vercel Blob e la funzione riceve solo i riferimenti |
| Manutenzione periodica | cron in `vercel.json` | una volta al giorno, 03:00 UTC | su Hobby è l'unica frequenza ammessa e Vercel garantisce solo l'ora (±59 minuti); su Pro si può arrivare a ogni minuto |
| Distanza GPS ammessa | `EXIF_MAX_DISTANCE_M` | 100 m | oltre, la verifica di autenticità è `DA_REVISIONARE` |

## 6. Ogni quanto si possono fare le richieste

**Le finestre.** I limiti al minuto si contano nella tabella `limite_richieste`; richieste e token del giorno nella
tabella `ai_quota` (una riga per fornitore e giorno UTC, aggiornata con `INSERT ... ON DUPLICATE KEY UPDATE`). I token
sono quelli del campo `usage.total_tokens` della risposta; il limite `AI_MAX_TPD` scatta quando il totale del giorno lo
ha raggiunto, quindi può essere superato di una risposta. Così tutte le istanze
di Vercel vedono gli stessi numeri. Il limite al minuto usa il minuto di calendario: una chiamata alle 10:20:59 e una
alle 10:21:00 cadono in finestre diverse. Il limite al giorno usa il giorno UTC e si azzera a mezzanotte UTC, cioè
all'1:00 o alle 2:00 in Italia secondo l'ora legale. I fornitori non documentano quando azzerano i loro limiti
giornalieri o mensili, quindi è prudente tenere i limiti del progetto sotto quelli della console.

**Quando un limite è superato.** Se è il progetto a fermare la chiamata, questa non parte. Se c'è Groq di riserva
si prova Groq, altrimenti il job torna in coda con `disponibile_dal` fissato al minuto successivo o alla mezzanotte
UTC, e il tentativo non conta. Se è il fornitore a rispondere 429, si riprova dopo il `retry-after` o con attesa
crescente, al massimo `AI_MAX_RETRIES` volte. Poi si passa a Groq, se c'è. Se tutti i fornitori sono al limite il job
si rimanda allo stesso modo. Una segnalazione non si perde mai per un limite: aspetta.

**Perché questi valori.** 20 richieste al minuto e 500 al giorno sono prudenti per un piano gratuito di cui non si
conoscono i numeri esatti. Ogni segnalazione ne consuma 2, quindi bastano per un uso cittadino. Per Groq il vincolo
vero sono gli 8.000 token al minuto del piano Developer: una chiamata con immagine ne usa circa 3.000, quindi si
consiglia `GROQ_MAX_RPM=2`.

**Esempio con i valori predefiniti** (segnalazioni con una foto, 2 chiamate ciascuna):

| Configurazione | Al minuto | Al giorno | Cosa limita |
|---|---|---|---|
| Solo Mistral | 10 segnalazioni | 250 segnalazioni | `AI_MAX_RPM=20` e `AI_MAX_RPD=500` del progetto, se la console di Mistral concede almeno tanto |
| Solo Groq (Developer, `GROQ_MAX_RPM=2`) | 1 segnalazione | circa 50 segnalazioni | i 200.000 token al giorno del piano (circa 3.900 token per segnalazione) |
| Mistral più Groq di riserva | circa 11 segnalazioni | circa 300 segnalazioni | la somma delle due capacità |

Le segnalazioni in più non si perdono: restano in coda e vengono analizzate quando si libera capacità, nel minuto
successivo o dopo la mezzanotte UTC.

**Perché la coda assorbe i picchi.** Dopo un evento in città possono arrivare decine di segnalazioni in pochi minuti.
Ognuna viene salvata subito: la richiesta non aspetta il modello. Le analisi si mettono in fila e il worker le esegue
al ritmo consentito. Su Vercel però il worker gira solo dopo un invio e con il cron giornaliero, e ogni volta elabora
al massimo 5 job. Una coda arretrata si smaltisce quindi con gli invii successivi o il giorno dopo (punto D2 di
[`revisione-finale.md`](revisione-finale.md)). Su un server sempre acceso il worker interno
(`AI_WORKER_INTERVAL_MS`) la riprende da solo ogni pochi secondi.

**Come controllare l'uso.** Le query seguenti si eseguono sul database:

```sql
-- Job in attesa per un limite (rimandati) e job in errore
SELECT tipo_analisi, stato, tentativi, disponibile_dal, ultimo_errore
  FROM job_elaborazione WHERE stato IN ('IN_CODA', 'ERRORE') ORDER BY id_job DESC LIMIT 50;

-- Richieste e token del giorno per fornitore
SELECT provider, giorno, richieste, token FROM ai_quota ORDER BY giorno DESC, provider;

-- Contatori del minuto (ai:<fornitore>:min:<minuto>)
SELECT chiave, conteggio, scadenza FROM limite_richieste WHERE chiave LIKE 'ai:%' ORDER BY chiave;

-- Analisi non riuscite perché il fornitore non rispondeva
SELECT id_analisi, tipo_analisi, modello, data_analisi FROM analisi_ia
 WHERE JSON_UNQUOTE(JSON_EXTRACT(risultato, '$.errore')) = 'PROVIDER_NON_DISPONIBILE' ORDER BY id_analisi DESC;

-- Quale fornitore ha risposto
SELECT modello, COUNT(*) FROM analisi_ia WHERE modello LIKE 'mistral:%' OR modello LIKE 'groq:%' GROUP BY modello;
```

Il segnale che un limite è stato raggiunto è un job `IN_CODA` con `disponibile_dal` nel futuro e `ultimo_errore` che
inizia con "Limite di richieste raggiunto". Una riga di `ai_quota` con `richieste` uguale a `AI_MAX_RPD` (o `token` oltre `AI_MAX_TPD`) dice lo stesso.
Righe `groq:...` in `analisi_ia` indicano che è intervenuto il fornitore di riserva. Nel pannello di moderazione lo
stesso si vede nel riepilogo ("analisi ancora in corso", "servizio di analisi non disponibile").

## 7. Privacy

Al modello vanno solo il titolo e la descrizione della segnalazione, i nomi delle categorie e l'immagine ridotta a
1.024 px, senza metadati. Non vanno mai nome, cognome, e-mail o identificativo dell'autore: lo verifica un test. Il
testo scritto dal cittadino può però contenere dati personali che non si possono filtrare con sicurezza. Per questo
l'informativa invita a non inserirne.

Le chiavi API stanno solo nelle variabili d'ambiente: pannello di Vercel o file `.env` non versionato. Gli errori dei
fornitori vengono ripuliti dalla chiave prima di essere registrati, e nei log al suo posto compare `[chiave]`.

Le funzioni di Vercel, per default, girano nella regione `iad1` (Stati Uniti). Per tenere il trattamento in Europa va
scelta una regione europea nel progetto Vercel (punto D5 di [`revisione-finale.md`](revisione-finale.md)).

## 8. Procedura di aggiornamento

I valori di questo documento vanno ricontrollati **prima di ogni rilascio e comunque ogni 3 mesi**, da chi gestisce il
deploy per il comitato. Si aggiornano la data in cima e le tabelle dei §3–§5.

| Valore | Dove controllarlo |
|---|---|
| Modelli con visione e nomi datati | [Mistral Vision](https://docs.mistral.ai/capabilities/vision/), [Mistral Models](https://docs.mistral.ai/getting-started/models/models_overview/), [Groq Vision](https://console.groq.com/docs/vision) |
| Modelli in dismissione | [Groq Deprecations](https://console.groq.com/docs/deprecations), sezione "Deprecated" di Mistral Models |
| Prezzi | [Mistral Pricing](https://mistral.ai/pricing), [pagina del modello Groq](https://console.groq.com/docs/model/qwen/qwen3.8-27b), [Groq Pricing](https://groq.com/pricing) |
| Limiti del proprio account | console Mistral: Admin panel → API → Limits; console Groq: Settings → Limits; [Groq Rate limits](https://console.groq.com/docs/rate-limits); [Mistral Usage and limits](https://docs.mistral.ai/admin/user-management-finops/tier) |
| Uso dei dati e conservazione | [Mistral: opt-out dall'addestramento](https://help.mistral.ai/en/articles/455207-can-i-opt-out-of-my-input-or-output-data-being-used-for-training), [Mistral ZDR](https://help.mistral.ai/en/articles/347612-can-i-activate-zero-data-retention-zdr), [Groq: i tuoi dati](https://console.groq.com/docs/your-data), [Groq DPA](https://console.groq.com/docs/legal/customer-data-processing-addendum) |
| Esclusione di Gemini | [Gemini API Additional Terms](https://ai.google.dev/gemini-api/terms) |
| Vercel | [Prezzi](https://vercel.com/pricing), [limiti delle funzioni](https://vercel.com/docs/functions/limitations), [cron](https://vercel.com/docs/cron-jobs/usage-and-pricing) |

**Cambiare fornitore o modello senza toccare il codice.** Per cambiare modello basta modificare `MISTRAL_MODEL` o
`GROQ_MODEL` nel pannello di Vercel e ripubblicare. Per attivare o disattivare il fornitore di riserva si usa
`AI_FALLBACK_PROVIDER` (`groq` oppure `regole`). Per spegnere il modello linguistico si torna a `AI_PROVIDER=regole`;
per spegnere tutte le analisi automatiche si usa `nessuno`. I limiti si regolano con `AI_MAX_RPM`, `AI_MAX_RPD` e le
varianti per fornitore. Un fornitore diverso, ma compatibile con l'API di OpenAI, richiede invece una piccola modifica
in `server/src/ai/providers/index.js`: il suo indirizzo e un nome.

## 9. Configurazione

| Variabile | Predefinito | Note |
|---|---|---|
| `AI_PROVIDER` | `regole` | `regole` \| `cloudflare` \| `mistral` \| `nessuno` |
| `AI_FALLBACK_PROVIDER` | `regole` | `groq` \| `cloudflare` \| `regole` \| `nessuno`; diverso da `AI_PROVIDER`; con `regole` o `nessuno` non c'è un secondo servizio |
| `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN` | — | obbligatorie se Cloudflare è primario o di riserva |
| `CLOUDFLARE_MODEL` | `@cf/google/gemma-4-26b-a4b-it` | |
| `AI_MAX_TPD` | `100000` | token al giorno per fornitore; varianti `CLOUDFLARE_MAX_TPD`, `GROQ_MAX_TPD`, `MISTRAL_MAX_TPD` |
| `CLOUDFLARE_MAX_RPM`, `CLOUDFLARE_MAX_RPD` | — | come le varianti per Mistral e Groq |
| `AI_AUTO_NASCONDI` | `true` | `false` = nessun nascondimento automatico, solo suggerimenti |
| `AI_SOGLIA_AUTO_NASCONDI` | `0.9` | confidenza minima per spam, testo privo di senso o non pertinente |
| `MISTRAL_API_KEY` | — | obbligatoria con `AI_PROVIDER=mistral` |
| `MISTRAL_MODEL` | `mistral-small-latest` | |
| `GROQ_API_KEY` | — | obbligatoria con `AI_FALLBACK_PROVIDER=groq` |
| `GROQ_MODEL` | `qwen/qwen3.8-27b` | |
| `AI_TIMEOUT_MS` | `15000` | da 1.000 a 55.000 |
| `AI_MAX_RETRIES` | `2` | da 0 a 5 |
| `AI_MAX_RPM`, `AI_MAX_RPD` | `20`, `500` | per fornitore; `0` = nessun limite |
| `MISTRAL_MAX_RPM`, `MISTRAL_MAX_RPD`, `GROQ_MAX_RPM`, `GROQ_MAX_RPD` | — | sostituiscono i valori comuni per un solo fornitore |
| `AI_JOB_PER_RUN` | `5` | da 1 a 100 |
| `AI_WORKER_INTERVAL_MS` | `5000` | worker interno al server; `0` su Vercel |
| `EXIF_MAX_DISTANCE_M` | `100` | |

I test con i servizi reali sono facoltativi e non girano mai in CI:
`AI_TEST_LIVE=1 MISTRAL_API_KEY=... GROQ_API_KEY=... npm test`.
