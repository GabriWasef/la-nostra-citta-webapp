# Configurazione dell'IA: fornitori, chiavi, variabili e database

Guida passo passo per configurare la moderazione automatica con l'IA del progetto: Cloudflare Workers AI come fornitore
principale, Groq come livello di riserva, Mistral come alternativa facoltativa. Spiega dove si prende ogni valore da
mettere nell'`.env` o su Vercel, in che ordine si fanno le cose e come si controlla che funzionino.

- **Fonti.** Ogni indicazione sui fornitori viene dalle pagine ufficiali, consultate il **19/10/2026** (elenco al §11).
  Dove una pagina non riporta un dato è scritto "non documentato". I calcoli sono segnati come tali.
- **Dopo la configurazione** si fanno le prove della [guida di test](GUIDA-TEST-IA.md). La configurazione generale del
  sito (database, Blob, dominio) è in [`CONFIGURAZIONE-MANUALE.md`](CONFIGURAZIONE-MANUALE.md).
- **Regola di sicurezza.** Chiavi e token non si scrivono mai in chat, su GitHub, nei ticket o nelle e-mail. Vanno solo
  nel password manager, nelle variabili di Vercel (tipo **Secret**) e nei file `.env*` locali, che git ignora. Se una
  chiave viene esposta va revocata subito nella console del fornitore e sostituita.

---

## 0. Panoramica

### Cosa si configura

| Elemento | A cosa serve | Obbligatorio |
|---|---|---|
| Cloudflare Workers AI | modello principale (`@cf/google/gemma-4-26b-a4b-it`): moderazione del testo, categorie, pertinenza delle foto | sì, per l'IA |
| Groq | livello di riserva (`qwen/qwen3.8-27b`) quando Cloudflare non risponde o ha finito la quota | consigliato |
| Mistral | alternativa a Cloudflare come primario | no |
| Variabili su Vercel (Preview e Production) | chiavi, modelli, limiti, interruttore dell'auto-nascondi | sì |
| Migrazione 014 sul database | tabella `ai_quota` e colonna `segnalazione.data_conferma_nascondimento` | sì, **prima** del deploy del nuovo codice |

### Ordine consigliato e tempi

| Passo | Sezione | Tempo |
|---|---|---|
| 1. Account e chiave Cloudflare | §1 | 10 minuti |
| 2. Account e chiave Groq | §2 | 10 minuti |
| 3. (Facoltativo) Mistral | §3 | 10 minuti |
| 4. Scelta della configurazione | §4 | 5 minuti |
| 5. Prova delle chiavi da terminale | §5 | 10 minuti |
| 6. `.env` locale (facoltativo) | §6 | 5 minuti |
| 7. Variabili su Vercel, prima Preview | §7 | 15 minuti |
| 8. Migrazione 014 (Preview, poi Production) | §8 | 10 minuti |
| 9. Accesso all'anteprima protetta | §9 | 5 minuti |
| 10. Prove, poi produzione | [guida di test](GUIDA-TEST-IA.md) | 45–60 minuti |

### Come funzionano i livelli (in breve)

`AI_PROVIDER` (Cloudflare) → `AI_FALLBACK_PROVIDER` (Groq) → regole.

- Se un livello risponde con un errore, con un JSON non valido o ha finito la quota, si passa al successivo.
- Se falliscono tutti, restano le analisi a regole: la segnalazione resta visibile e finisce "Da revisionare".
- L'invio di una segnalazione non dipende mai dall'IA: il modello lavora dopo, nel worker.

---

## 1. Cloudflare Workers AI (fornitore principale)

### 1.1 Account

1. Registrati o accedi su <https://dash.cloudflare.com>. Per Workers AI non serve un dominio.
2. Il piano **Workers Free** basta per iniziare. Al 19/10/2026 la pagina dei prezzi indica **10.000 neuron al giorno
   gratuiti** sia per Workers Free sia per Workers Paid, con azzeramento **alle 00:00 UTC**.

### 1.2 Account ID → `CLOUDFLARE_ACCOUNT_ID`

Metodo indicato nella guida "REST API" di Workers AI:

1. Apri la pagina **Workers AI** della dashboard: <https://dash.cloudflare.com/?to=/:account/ai/workers-ai>
   (nel menu: *AI → Workers AI*).
2. Seleziona **Use REST API**.
3. Nella sezione **Get Account ID** copia il valore **Account ID**.

Metodi alternativi (pagina "Find account and zone IDs"):
- da **Account home** apri la ricerca (**Search**, oppure `CTRL + K`), scrivi "Copy account ID" e seleziona il
  risultato;
- in **Workers & Pages**, sezione **Account Details**, pulsante di copia accanto a **Account ID**.

È un codice di 32 cifre esadecimali. Non è segreto quanto il token, ma conservalo comunque insieme alle chiavi.

### 1.3 API token → `CLOUDFLARE_API_TOKEN`

1. Nella stessa pagina **Use REST API**, seleziona **Create a Workers AI API Token** (modello già compilato).
2. Controlla i dati precompilati e scegli un nome che indichi progetto e ambiente, per esempio
   "la-nostra-citta preview" e, a parte, "la-nostra-citta produzione": **un token per ambiente**, così puoi revocarne
   uno senza toccare l'altro.
3. Seleziona **Create API Token**.
4. Seleziona **Copy API Token** e salvalo subito nel password manager.

Se preferisci creare un token personalizzato invece del modello, servono i permessi **Workers AI - Read** e
**Workers AI - Edit**.

### 1.4 Modello → `CLOUDFLARE_MODEL`

- Predefinito del progetto: `@cf/google/gemma-4-26b-a4b-it`. Non serve impostarlo.
- La pagina del modello indica il supporto alla visione e un contesto di 256.000 token.

### 1.5 Limiti e costi (da annotare)

Valori ufficiali al 19/10/2026:

| Voce | Valore | Fonte |
|---|---|---|
| Neuron gratuiti al giorno | 10.000 (Free e Paid) | Workers AI → Platform → Pricing |
| Azzeramento | 00:00 UTC | idem |
| Oltre la soglia, piano Free | "further operations will fail with an error": le richieste falliscono | idem |
| Oltre la soglia, piano Paid | 0,011 USD ogni 1.000 neuron | idem |
| Gemma 4 26B, input | 9.091 neuron per milione di token (0,10 USD) | idem |
| Gemma 4 26B, output | 27.273 neuron per milione di token (0,30 USD) | idem |
| Richieste al minuto (Text Generation) | 300, salvo i modelli che richiedono Workers Paid | Workers AI → Platform → Limits |

Dove vedere l'uso: dashboard → *AI → Workers AI* (consumo di neuron dell'account).

**Calcolo per `CLOUDFLARE_MAX_TPD`.**
- Il progetto conta i **token** (`usage.total_tokens`), non i neuron.
- Nel caso peggiore, tutti token di output, 10.000 neuron corrispondono a circa 366.000 token (10.000 / 27.273 per
  milione).
- Con **`CLOUDFLARE_MAX_TPD=300000`** il progetto resta sotto la soglia gratuita qualunque sia il rapporto tra input e
  output (300.000 × 27.273 / 1.000.000 ≈ 8.200 neuron).

**Stima per segnalazione** (calcolo, da confermare con l'uso reale):
- Chiamata di testo: circa 750 token in input e 200 in output, cioè circa 12 neuron.
- Chiamata con foto: il numero di token di un'immagine per Gemma su Cloudflare non è documentato. Con circa
  1.000 token d'immagine si arriva a circa 23 neuron.
- Una segnalazione con una foto costa quindi circa **35 neuron**: circa 280 segnalazioni al giorno nella quota gratuita.

### 1.6 Dati e privacy

Dalla pagina "Privacy" di Workers AI:
- Cloudflare dichiara di non usare i contenuti elaborati da Workers AI per addestrare modelli.
- Per le richieste di inferenza normali, input e output non vengono conservati oltre il tempo necessario a
  rispondere. Restano metadati operativi: account, modello, orari, conteggi di token e neuron, codici di stato.
- La pagina **non** indica dove avviene il trattamento.
- Gli accordi a cui rimanda sono la Privacy Policy (<https://www.cloudflare.com/privacypolicy/>) e il Self-Serve
  Subscription Agreement (<https://www.cloudflare.com/terms/>).

Il comitato deve valutare il trasferimento fuori dall'UE. L'informativa del sito (`client/privacy.html`) già dice che
il trattamento può avvenire fuori dall'Unione europea.

---

## 2. Groq (livello di riserva)

### 2.1 Account e chiave → `GROQ_API_KEY`

1. Registrati o accedi su <https://console.groq.com>.
2. Apri la pagina **API Keys**: <https://console.groq.com/keys>. La guida "Quickstart" rimanda a questa pagina ma
   non riporta i nomi dei pulsanti.
3. Crea una nuova chiave con un nome che indichi progetto e ambiente (una per Preview, una per Production).
4. Copiala subito: va nel password manager.

### 2.2 Modello → `GROQ_MODEL`

- Predefinito: `qwen/qwen3.8-27b`. Non serve impostarlo.
- Al 19/10/2026 la pagina "Images and Vision" lo elenca come modello con visione, con massimo 3 immagini per
  richiesta e 20 MB per immagine via URL. **Ogni immagine conta 2.048 token di input** e il JSON mode è supportato
  anche con immagini.
- La pagina dei modelli lo elenca tra i **Preview Models** ("intended for evaluation purposes only"). Prima di ogni
  rilascio controlla che ci sia ancora: <https://console.groq.com/docs/models> e
  <https://console.groq.com/docs/deprecations>.

### 2.3 Limiti (da leggere nella console)

- I limiti del tuo account sono in **Settings → Limits**: <https://console.groq.com/settings/limits>. Passando il
  mouse sul valore TPM si vede la ripartizione tra input e output.
- La documentazione pubblica solo i limiti di base del **piano Developer**. Per `qwen/qwen3.8-27b`: 30 RPM, 1.000 RPD,
  8.000 TPM, 200.000 TPD.
- **I limiti del piano Free non sono pubblicati**: leggili nella console e annotali qui sotto.
- Superato un limite, Groq risponde `429` con l'intestazione `retry-after` (in secondi). Il progetto la rispetta e poi
  passa al livello successivo.

Valori consigliati per il progetto:
- `GROQ_MAX_RPM=2`: una chiamata con foto usa circa 3.000 token, e con 8.000 TPM ne passano al massimo 2 o 3 al minuto.
- `GROQ_MAX_TPD` un po' sotto il TPD letto nella console.

| Limite letto nella console (piano: ______) | RPM | RPD | TPM | TPD |
|---|---|---|---|---|
| `qwen/qwen3.8-27b` | ______ | ______ | ______ | ______ |

### 2.4 Dati e privacy

Dalla pagina "Your Data":
- per default Groq non conserva i dati delle richieste di inferenza, solo metadati d'uso;
- in caso di errori o sospetti abusi può tenere log temporanei fino a 30 giorni;
- i dati conservati stanno su Google Cloud Platform **negli Stati Uniti**.

Consigliato: attiva **Zero Data Retention** in **Settings → Data Controls**
(<https://console.groq.com/settings/data-controls>). Lo può fare l'amministratore dell'organizzazione.

---

## 3. Mistral (facoltativo, alternativa a Cloudflare)

Serve solo se scegli `AI_PROVIDER=mistral`. Passaggi dalla guida "Activate Studio in Free mode and generate your
first API key":

1. Apri <https://console.mistral.ai> e accedi. In Free mode l'accesso alle API è attivo per default, senza carta di
   credito, con limiti d'uso e di frequenza.
2. Nella barra laterale seleziona **API Keys** → **Create new key**.
3. Inserisci un **Name** (progetto e ambiente) e una data in **Expiration**. La guida consiglia di ruotare le chiavi.
4. In **Connector access scope** scegli **Shared connectors only**: al progetto non servono connector.
5. Premi di nuovo **Create new key** e copia subito la chiave: compare una sola volta. Va in `MISTRAL_API_KEY`.
6. Privacy e limiti: segui il §1 di [`CONFIGURAZIONE-MANUALE.md`](CONFIGURAZIONE-MANUALE.md), in particolare la
   disattivazione dell'uso dei dati per l'addestramento in **Admin panel → Privacy**.

---

## 4. Scegli la configurazione

| Profilo | Variabili principali | Quando |
|---|---|---|
| **A. Consigliato** | `AI_PROVIDER=cloudflare`, `AI_FALLBACK_PROVIDER=groq`, `AI_AUTO_NASCONDI=true` | uso normale |
| B. Solo Cloudflare | `AI_PROVIDER=cloudflare`, `AI_FALLBACK_PROVIDER=regole` | non vuoi dati negli Stati Uniti tramite Groq; se Cloudflare non risponde i job si ritentano più tardi |
| C. IA senza auto-nascondi | come A, ma `AI_AUTO_NASCONDI=false` | primo periodo di prova in produzione: l'IA suggerisce, il comitato decide sempre |
| D. Mistral primario | `AI_PROVIDER=mistral`, `AI_FALLBACK_PROVIDER=groq` (o `cloudflare`) | se preferisci un fornitore con sede nell'UE |
| E. Nessun modello | `AI_PROVIDER=regole` | rollback, sviluppo locale |

Vincoli controllati all'avvio (`server/src/config/env.js`); se non sono rispettati, il sito non parte e nei log compare
`Configurazione non valida`:
- `AI_FALLBACK_PROVIDER` deve essere diverso da `AI_PROVIDER`;
- se `cloudflare` è primario o di riserva, servono `CLOUDFLARE_ACCOUNT_ID` e `CLOUDFLARE_API_TOKEN`;
- se `groq` è di riserva, serve `GROQ_API_KEY`;
- se `mistral` è primario, serve `MISTRAL_API_KEY`.

---

## 5. Prova le chiavi da terminale (prima di Vercel)

Usa Git Bash. Con `read -rs` il valore non viene mostrato e non resta nella cronologia:

```bash
read -r CLOUDFLARE_ACCOUNT_ID && export CLOUDFLARE_ACCOUNT_ID
read -rs CLOUDFLARE_API_TOKEN && export CLOUDFLARE_API_TOKEN
read -rs GROQ_API_KEY && export GROQ_API_KEY
```

Cloudflare, endpoint compatibile OpenAI usato dal progetto
(`https://api.cloudflare.com/client/v4/accounts/{CLOUDFLARE_ACCOUNT_ID}/ai/v1`):

```bash
curl -s "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/ai/v1/chat/completions" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" -H "Content-Type: application/json" \
  -d '{"model":"@cf/google/gemma-4-26b-a4b-it","max_tokens":50,
       "messages":[{"role":"user","content":"Rispondi solo con il JSON {\"ok\": true}"}]}'
```

Groq:

```bash
curl -s https://api.groq.com/openai/v1/chat/completions \
  -H "Authorization: Bearer $GROQ_API_KEY" -H "Content-Type: application/json" \
  -d '{"model":"qwen/qwen3.8-27b","max_tokens":200,"response_format":{"type":"json_object"},
       "messages":[{"role":"user","content":"Rispondi solo con il JSON {\"ok\": true}"}]}'
```

Esito atteso per entrambi: un JSON con `choices[0].message.content` che contiene `{"ok": true}`.

| Errore | Causa probabile |
|---|---|
| `401` o `403` | token o chiave errati, oppure token Cloudflare senza permessi Workers AI |
| `404` | Account ID o nome del modello sbagliato |
| `429` | limite raggiunto |

Le prove sulle **immagini** e su **`json_schema`** con Cloudflare, che restano da verificare, sono nel §4.2–4.3 della
[guida di test](GUIDA-TEST-IA.md). Falle adesso: dicono se le foto saranno analizzate da Cloudflare o passeranno a Groq.

Alla fine: `unset CLOUDFLARE_API_TOKEN GROQ_API_KEY`, oppure chiudi il terminale.

---

## 6. File `.env` locale (facoltativo)

Serve solo se vuoi provare l'IA sul tuo computer.

> **Attenzione.** Al 19/10/2026 il file `.env` nella cartella del progetto punta al database **di produzione**
> (stesso host e stesso `DB_NAME` di `.env.production`). Prima di usare `npm run dev` o `npm test` cambia `DB_HOST` e
> `DB_NAME` con un database locale o di prova. Altrimenti le prove scrivono sui dati veri e i test svuotano il database
> `TEST_DB_NAME` su quel server.

Blocco da aggiungere o aggiornare nel `.env`, senza virgolette; i valori tra `< >` vanno sostituiti:

```dotenv
# Modello linguistico: cloudflare (primario) -> groq (riserva) -> regole
AI_PROVIDER=cloudflare
AI_FALLBACK_PROVIDER=groq
CLOUDFLARE_ACCOUNT_ID=<Account ID, §1.2>
CLOUDFLARE_API_TOKEN=<token di Cloudflare, §1.3>
GROQ_API_KEY=<chiave di Groq, §2.1>
# Moderazione automatica
AI_AUTO_NASCONDI=true
AI_SOGLIA_AUTO_NASCONDI=0.9
# Limiti del progetto (sotto quelli dei fornitori)
CLOUDFLARE_MAX_TPD=300000
GROQ_MAX_RPM=2
# GROQ_MAX_TPD=<un po' sotto il TPD letto in console, §2.3>
# In locale il worker gira dentro il server ogni 5 secondi
AI_WORKER_INTERVAL_MS=5000
```

Per tornare alle sole regole basta `AI_PROVIDER=regole`: le chiavi possono restare nel file.

---

## 7. Variabili su Vercel

### 7.1 Come si crea una variabile (interfaccia attuale)

Nell'interfaccia attuale (documentazione Vercel aggiornata al 28/08/2026) non c'è più la casella "Sensitive". Ogni
variabile ha un **Tipo**:
- **Config**: il valore resta leggibile dai membri del progetto;
- **Secret**: il valore non si può più leggere dopo il salvataggio, solo sostituire.

Le vecchie variabili "Sensitive" valgono come Secret. I Secret sono ammessi anche in Development.

1. Su <https://vercel.com> scegli il **team** che contiene il progetto, dal selettore in alto. Il progetto di questo sito
   è nell'account collegato al repository `GabriWasef/la-nostra-citta-webapp`.
2. Apri il progetto → **Environment Variables**, nella barra laterale o in *Settings*.
3. Per ogni variabile:
   - scegli il **Type** (Config o Secret);
   - scrivi **Key** e **Value**;
   - seleziona gli **Environments**: *Production*, *Preview* o *Development*.
   Per *Preview* puoi limitare il valore a un solo branch (per esempio `feat/moderazione-ia`): i valori per branch
   prevalgono su quelli generali di Preview.
4. Salva. Un Secret non si può trasformare in Config: va cancellato e ricreato.

### 7.2 Cosa impostare

Preview e Production hanno **chiavi diverse**, se possibile anche account diversi. Così le prove non consumano la quota
di produzione e una chiave di prova si revoca senza conseguenze.

| Variabile | Tipo | Preview | Production | Note |
|---|---|---|---|---|
| `AI_PROVIDER` | Config | `cloudflare` | `cloudflare` (o `regole` finché non hai finito le prove) | |
| `AI_FALLBACK_PROVIDER` | Config | `groq` | `groq` | `regole` per il profilo B |
| `CLOUDFLARE_ACCOUNT_ID` | Secret | Account ID | Account ID | §1.2 |
| `CLOUDFLARE_API_TOKEN` | Secret | token "preview" | token "produzione" | §1.3 |
| `GROQ_API_KEY` | Secret | chiave "preview" | chiave "produzione" | §2.1 |
| `AI_AUTO_NASCONDI` | Config | `true` | `false` per la prima settimana, poi `true` | profilo C come avvio prudente |
| `AI_SOGLIA_AUTO_NASCONDI` | Config | `0.9` | `0.9` | |
| `CLOUDFLARE_MAX_TPD` | Config | `300000` | `300000` | calcolo al §1.5 |
| `GROQ_MAX_RPM` | Config | `2` | `2` | §2.3 |
| `GROQ_MAX_TPD` | Config | dalla console | dalla console | §2.3 |
| `AI_WORKER_INTERVAL_MS` | Config | `0` | `0` | su Vercel deve restare 0 ([`CONFIGURAZIONE-MANUALE.md`](CONFIGURAZIONE-MANUALE.md), §8) |
| `CLOUDFLARE_MODEL`, `GROQ_MODEL`, `AI_MAX_RPM`, `AI_MAX_RPD`, `AI_MAX_TPD`, `AI_TIMEOUT_MS`, `AI_MAX_RETRIES` | — | non impostarle | non impostarle | valgono i predefiniti (`@cf/google/gemma-4-26b-a4b-it`, `qwen/qwen3.8-27b`, 20, 500, 100000, 15000, 2) |
| `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_SSL` | Secret (password), Config (resto) | database **di prova** | database di produzione | Preview non deve mai usare il database di produzione |

Solo con il profilo D (Mistral) servono anche:
- `MISTRAL_API_KEY` (Secret), in Preview e Production;
- facoltative: `MISTRAL_MODEL`, `MISTRAL_MAX_RPM`, `MISTRAL_MAX_RPD`, `MISTRAL_MAX_TPD`.

### 7.3 Applicare le modifiche: Redeploy

Dalla documentazione Vercel: le modifiche alle variabili **non si applicano ai deploy precedenti, solo ai nuovi**.
Dopo ogni modifica:

1. Apri il progetto → **Deployments** e filtra per branch o ambiente se serve.
2. Sul deploy da aggiornare (l'ultimo di Preview del branch, oppure quello di Production corrente) premi **⋯** →
   **Redeploy**.
3. Scegli se usare la Build Cache esistente (va bene) e conferma **Redeploy**.

In alternativa basta un nuovo push sul branch. Il nuovo valore vale da quando il nuovo deploy è pronto.

---

## 8. Migrazione 014 del database

Il nuovo codice legge la tabella `ai_quota` e la colonna `data_conferma_nascondimento`. Senza la migrazione 014 il
server rifiuta il database ("migrazioni da applicare") e il sito non funziona. Va applicata a ogni database **prima**
che ci arrivi il nuovo codice.

**Database dell'anteprima.**

1. Crea un file `.env.preview` nella cartella del progetto (git lo ignora già) con le sole variabili `DB_HOST`,
   `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_SSL` del database di Preview.
2. Esegui:
   ```bash
   node --env-file=.env.preview server/scripts/migrate.js
   ```
3. Esito atteso: `Applico 014_moderazione_ia.sql...` e poi `1 migrazioni applicate.`.

**Database di produzione**, solo dopo che le prove sull'anteprima sono superate e prima del merge su `main`:

```bash
npm run db:migrate:remoto
```

Lo script usa `.env.production`.

**Controlli.**
- Nel sito: *Amministrazione → Diagnostica*, nessuna migrazione in sospeso.
- Da un client MySQL: `SHOW TABLES LIKE 'ai_quota';` deve restituire una riga.
- La migrazione aggiunge solo una tabella e una colonna, e il codice precedente continua a funzionare. Il rollback
  manuale è nel commento di `database/migrations/014_moderazione_ia.sql`.

---

## 9. Accesso all'anteprima protetta

Le anteprime del progetto sono protette da **Vercel Authentication**: le apre solo chi è collegato a Vercel con accesso
al progetto. Per te basta essere loggato. Per strumenti automatici (test, script) serve un segreto di bypass:

1. Progetto → *Settings* → **Deployment Protection** → **Protection Bypass for Automation**: crea un segreto con un nome
   che ne indichi l'uso (per esempio "prove moderazione IA").
2. Vercel lo espone ai deploy come `VERCEL_AUTOMATION_BYPASS_SECRET`. Se rigeneri o cancelli il segreto, i deploy
   precedenti non lo accettano più: serve un Redeploy.
3. Per usarlo, aggiungi alle richieste l'intestazione `x-vercel-protection-bypass: <segreto>`. Con
   `x-vercel-set-bypass-cookie: true` viene impostato un cookie, utile nel browser.
4. È un segreto come gli altri: salvalo in un file `.env.*` locale, non incollarlo in chat. Revocalo alla fine delle
   prove.

---

## 10. Dopo la configurazione

1. Esegui le prove della [guida di test](GUIDA-TEST-IA.md), §5, solo sull'anteprima.
2. Annota nella guida di test, §9, i fatti da verificare:
   - immagini su `/ai/v1`;
   - `json_schema` con Gemma 4;
   - stato di `qwen/qwen3.8-27b`;
   - limiti delle console.
3. Produzione, in quest'ordine:
   - migrazione 014 (§8);
   - variabili Production (§7.2);
   - merge della pull request;
   - controllo della home e di *Amministrazione → Diagnostica*.
4. Rollback senza toccare il codice: `AI_AUTO_NASCONDI=false`, oppure `AI_PROVIDER=regole`, e poi un **Redeploy**
   (§7.3). Dettagli nella guida di test, §8.
5. Manutenzione, ogni 3 mesi e prima di ogni rilascio:
   - ricontrolla i valori del §1.5 e del §2.3;
   - controlla lo stato dei modelli (pagine delle dismissioni);
   - ruota le chiavi.
   Se un fornitore cambia nome del modello, aggiorna `CLOUDFLARE_MODEL` o `GROQ_MODEL` e fai il Redeploy.

### Checklist

- [ ] Account Cloudflare; Account ID e token (uno per ambiente) nel password manager
- [ ] Account Groq; chiavi (una per ambiente) nel password manager; Zero Data Retention attivata
- [ ] Limiti letti nelle console e annotati (§1.5, §2.3)
- [ ] Prove curl del §5 riuscite; prove immagini e `json_schema` fatte (guida di test §4.2–4.3)
- [ ] Preview con database **separato** da Production
- [ ] Variabili Preview create (chiavi come **Secret**) e Redeploy dell'anteprima
- [ ] Migrazione 014 applicata al database dell'anteprima
- [ ] Prove della guida di test superate
- [ ] Migrazione 014 applicata al database di produzione
- [ ] Variabili Production create e Redeploy (o merge)
- [ ] Segreto di bypass (se creato) revocato dopo le prove

---

## 11. Fonti (consultate il 19/10/2026)

**Cloudflare**
- Workers AI, REST API (Account ID, token): <https://developers.cloudflare.com/workers-ai/get-started/rest-api/>
- Trovare l'Account ID: <https://developers.cloudflare.com/fundamentals/account/find-account-and-zone-ids/>
- Endpoint compatibili OpenAI: <https://developers.cloudflare.com/workers-ai/configuration/open-ai-compatibility/>
- Modello Gemma 4 26B: <https://developers.cloudflare.com/workers-ai/models/gemma-4-26b-a4b-it/>
- Prezzi e neuron: <https://developers.cloudflare.com/workers-ai/platform/pricing/>
- Limiti: <https://developers.cloudflare.com/workers-ai/platform/limits/>
- JSON Mode: <https://developers.cloudflare.com/workers-ai/features/json-mode/>
- Privacy: <https://developers.cloudflare.com/workers-ai/platform/privacy/>

**Groq**
- Modelli: <https://console.groq.com/docs/models>
- Visione: <https://console.groq.com/docs/vision>
- Limiti: <https://console.groq.com/docs/rate-limits>
- Dati: <https://console.groq.com/docs/your-data>
- Quickstart: <https://console.groq.com/docs/quickstart>

**Mistral**
- Attivazione e chiave: <https://docs.mistral.ai/getting-started/quickstarts/studio/activate-and-generate-api-key>

**Vercel**
- Variabili d'ambiente: <https://vercel.com/docs/environment-variables>
- Config e Secret: <https://vercel.com/docs/environment-variables/sensitive-environment-variables>
- Redeploy: <https://vercel.com/docs/deployments/managing-deployments>
- Bypass per automazioni: <https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/protection-bypass-automation>
