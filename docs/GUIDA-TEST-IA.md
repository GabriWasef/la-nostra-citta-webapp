# Guida di test: moderazione automatica IA

Guida pratica per configurare e provare la moderazione automatica con Cloudflare Workers AI e Groq, prima
sull'**anteprima** (Preview) e poi in produzione. Tutti i nomi di variabili, tabelle, endpoint e pulsanti sono quelli
del codice sul branch `feat/moderazione-ia`.

Regole valide per tutta la guida:
- le prove si fanno **solo sull'anteprima**, mai in produzione: in produzione non si creano segnalazioni di prova;
- le chiavi non si scrivono mai in file versionati, in chat, nei ticket o in questa guida;
- le cifre di quota e i prezzi non sono riportati qui: si leggono nella console e si annotano negli spazi `______`.

---

## 1. Prerequisiti

| Cosa | Perché | Note |
|---|---|---|
| Account **Vercel** con accesso al progetto del sito | impostare le variabili e vedere anteprime e log | il progetto è collegato al repository `GabriWasef/la-nostra-citta-webapp` |
| Account **Cloudflare** (piano gratuito) | fornitore principale, Workers AI | serve l'**Account ID** e un **API token** |
| Account **Groq** (piano gratuito) | livello successivo (fallback) | serve una **API key** |
| Accesso al database **MySQL 8 usato dall'anteprima** | migrazione 014 e controlli sulle tabelle | **deve essere diverso da quello di produzione** (vedi §3, passo 1) |
| Un utente **amministratore** e uno **moderatore** sull'anteprima, più un utente **cittadino** | provare il pannello del comitato, il registro e la vista del cittadino | `npm run admin:create`, oppure gli utenti dimostrativi se il database di anteprima è stato creato con `db:seed:demo` |
| Git Bash (o un terminale con `curl`) e Node.js 22.9 o superiore | comandi di verifica e migrazione | già usati dal progetto |

Tempo indicativo: **1–2 ore** la prima volta (30 minuti per gli account e le chiavi, 15 per Vercel e la migrazione,
45–60 per gli scenari).

---

## 2. Chiavi e variabili

Su Vercel: *Project → Settings → Environment Variables → Add*. Le righe con **Sensitive = sì** vanno create con la
casella **Sensitive** attiva: il valore poi non si può più leggere dal pannello, solo sostituire. Vercel ammette le
variabili Sensitive solo negli ambienti Production e Preview.

Legenda ambienti: **Pr** = Preview, **P** = Production, **L** = `.env` locale.

| Variabile | Valore di esempio | Dove si ottiene | Ambienti | Sensitive |
|---|---|---|---|---|
| `AI_PROVIDER` | `cloudflare` | scelta del progetto | Pr, P (in L di solito `regole`) | no |
| `AI_FALLBACK_PROVIDER` | `groq` | scelta del progetto | Pr, P | no |
| `CLOUDFLARE_ACCOUNT_ID` | `0123456789abcdef0123456789abcdef` (32 cifre esadecimali) | dashboard Cloudflare → *AI* → *Workers AI* → *Use REST API*: l'Account ID è mostrato nella pagina (si trova anche nell'URL della dashboard, dopo `dash.cloudflare.com/`) | Pr, P, L se provi in locale | sì |
| `CLOUDFLARE_API_TOKEN` | `<token di Cloudflare>` | stessa pagina *Use REST API* → *Create a Workers AI API Token* (oppure *My Profile → API Tokens → Create Token* con il modello "Workers AI"). Copialo subito: non si rivede | Pr, P, L se provi in locale | sì |
| `CLOUDFLARE_MODEL` | `@cf/google/gemma-4-26b-a4b-it` | predefinito del progetto; non serve impostarlo | — | no |
| `GROQ_API_KEY` | `<chiave di Groq>` | console.groq.com → *API Keys* → *Create API Key*. Copiala subito | Pr, P, L se provi in locale | sì |
| `GROQ_MODEL` | `qwen/qwen3.8-27b` | predefinito del progetto; non serve impostarlo | — | no |
| `AI_AUTO_NASCONDI` | `true` | interruttore della moderazione automatica (`false` = solo suggerimenti) | Pr, P | no |
| `AI_SOGLIA_AUTO_NASCONDI` | `0.9` | confidenza minima per nascondere spam, testi privi di senso o non pertinenti | Pr, P | no |
| `AI_MAX_RPM` | `20` | richieste al minuto per fornitore (limite del progetto) | Pr, P | no |
| `AI_MAX_RPD` | `500` | richieste al giorno per fornitore (limite del progetto) | Pr, P | no |
| `AI_MAX_TPD` | `100000` | token al giorno per fornitore (limite del progetto) | Pr, P | no |
| `CLOUDFLARE_MAX_RPD`, `CLOUDFLARE_MAX_TPD`, `GROQ_MAX_RPM`, `GROQ_MAX_RPD`, `GROQ_MAX_TPD` | lasciale vuote, oppure **sotto** i limiti letti nella console | console di ciascun fornitore (§9) | Pr, P | no |
| `AI_TIMEOUT_MS`, `AI_MAX_RETRIES`, `AI_JOB_PER_RUN` | `15000`, `2`, `5` | predefiniti del progetto | — | no |

Il database dell'anteprima (`DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_SSL`) va impostato **solo** su Preview,
con valori diversi da Production: è la condizione per poter fare le prove senza toccare i dati veri.

Se `AI_PROVIDER=cloudflare` e manca `CLOUDFLARE_ACCOUNT_ID` o `CLOUDFLARE_API_TOKEN` (oppure, con
`AI_FALLBACK_PROVIDER=groq`, manca `GROQ_API_KEY`), la funzione non parte e nei log compare
`Configurazione non valida` con il nome della variabile. `AI_FALLBACK_PROVIDER` deve essere diverso da `AI_PROVIDER`.

Valori letti nelle console (da compilare):

| Fornitore | Valore | Letto dove | Data |
|---|---|---|---|
| Cloudflare, limite gratuito giornaliero (neuron) | ______ | ______ | ______ |
| Cloudflare, costo in neuron per milione di token del modello | ______ | ______ | ______ |
| Groq `qwen/qwen3.8-27b`, richieste al minuto / al giorno | ______ / ______ | ______ | ______ |
| Groq `qwen/qwen3.8-27b`, token al minuto / al giorno | ______ / ______ | ______ | ______ |

Con questi valori imposta `CLOUDFLARE_MAX_TPD`, `GROQ_MAX_RPD`, `GROQ_MAX_TPD` un po' sotto i limiti. Il progetto conta
i **token** (campo `usage` della risposta), non i neuron: la conversione si legge nella console Cloudflare.

---

## 3. Impostazione, in ordine

1. **Database dell'anteprima.** In Vercel apri *Settings → Environment Variables* e filtra per *Preview*. Controlla
   che `DB_HOST`/`DB_NAME` di Preview **non** siano quelli di Production. Se sono uguali, o se Preview non ha variabili
   proprie, fermati: crea un database separato per l'anteprima (vedi `DEPLOY-VERCEL.md`, sezione Anteprime) prima di
   proseguire. Altrimenti le segnalazioni di prova finiscono in produzione.
2. **Migrazione 014 sul database dell'anteprima.** Crea in locale un file `.env.preview` (è già escluso da git) con le
   stesse variabili `DB_*` di Preview, poi:
   ```bash
   node --env-file=.env.preview server/scripts/migrate.js
   ```
   Esito atteso: `Applico 014_moderazione_ia.sql...` e `1 migrazioni applicate.` (oppure "nessuna migrazione da
   applicare", se era già fatta). La migrazione aggiunge la tabella `ai_quota` e la colonna
   `segnalazione.data_conferma_nascondimento`, non tocca i dati esistenti, e il rollback è nel commento del file
   `database/migrations/014_moderazione_ia.sql`. Senza la migrazione il server rifiuta il database ("migrazioni da
   applicare") e il sito non funziona.
3. **Verifica preliminare delle chiavi** con i comandi del §4: se non rispondono come atteso, non andare avanti.
4. **Variabili su Vercel, ambiente Preview**: tutte quelle della tabella del §2 marcate Pr (le chiavi come Sensitive).
5. **Redeploy dell'anteprima.** Le modifiche alle variabili **non valgono per i deploy già esistenti**: valgono solo
   per i deploy creati dopo. In *Deployments* apri l'ultimo deploy di anteprima del branch `feat/moderazione-ia` →
   menu *⋯* → *Redeploy*. In alternativa fai un nuovo push sul branch.
6. **Controllo**: accedi all'anteprima come amministratore → *Amministrazione* → scheda **Diagnostica**. Il database
   deve risultare aggiornato, senza migrazioni in sospeso.
7. Esegui gli scenari del §5.
8. **Solo dopo che tutti gli scenari sono superati**: migrazione 014 sul database di **produzione**
   (`npm run db:migrate:remoto`, che usa `.env.production`), poi le variabili in Production, poi il merge della pull
   request (o un Redeploy di produzione). La migrazione va fatta **prima** del deploy del nuovo codice, perché il nuovo
   codice legge la colonna `data_conferma_nascondimento`.

---

## 4. Verifica preliminare (curl)

Inserisci le chiavi senza che finiscano nella cronologia del terminale (Git Bash):

```bash
read -rs CLOUDFLARE_API_TOKEN && export CLOUDFLARE_API_TOKEN   # incolla il token e premi Invio (non viene mostrato)
read -r CLOUDFLARE_ACCOUNT_ID && export CLOUDFLARE_ACCOUNT_ID
read -rs GROQ_API_KEY && export GROQ_API_KEY
```

### 4.1 Cloudflare: testo

```bash
curl -s "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/ai/v1/chat/completions" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" -H "Content-Type: application/json" \
  -d '{"model":"@cf/google/gemma-4-26b-a4b-it","max_tokens":50,
       "messages":[{"role":"user","content":"Rispondi solo con il JSON {\"ok\": true}"}]}'
```

Esito atteso: un JSON con `choices[0].message.content` che contiene `{"ok": true}` e un oggetto `usage` con
`total_tokens`. Se `usage` manca, il progetto funziona ma non conta i token (il limite `AI_MAX_TPD` non scatta):
annotalo. Errori tipici: `401`/`403` token sbagliato o senza permesso Workers AI; `404` Account ID o modello errato.

### 4.2 Cloudflare: immagine (fatto da verificare)

```bash
curl -s "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/ai/v1/chat/completions" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" -H "Content-Type: application/json" \
  -d '{"model":"@cf/google/gemma-4-26b-a4b-it","max_tokens":50,"messages":[{"role":"user","content":[
       {"type":"text","text":"Di che colore è questa immagine? Una parola."},
       {"type":"image_url","image_url":{"url":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="}}]}]}'
```

Esito atteso: una risposta con un colore. Se arriva un errore sul formato del contenuto, l'endpoint `/ai/v1` **non**
accetta immagini con questo modello: la verifica di pertinenza delle foto fallirà su Cloudflare e passerà a Groq.
In quel caso l'alternativa è l'endpoint nativo `/ai/run/@cf/google/gemma-4-26b-a4b-it` (richiede una modifica al
codice: segnalalo).

### 4.3 Cloudflare: `json_schema` (fatto da verificare)

```bash
curl -s "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/ai/v1/chat/completions" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" -H "Content-Type: application/json" \
  -d '{"model":"@cf/google/gemma-4-26b-a4b-it","max_tokens":100,
       "messages":[{"role":"user","content":"Valuta il testo: asdkj qwe zzz. È privo di senso?"}],
       "response_format":{"type":"json_schema","json_schema":{"name":"risposta","schema":{"type":"object",
         "properties":{"motivo":{"anyOf":[{"type":"string","enum":["NON_SENSATA","DUBBIO"]},{"type":"null"}]},
                       "confidenza":{"type":"number","minimum":0,"maximum":1}},
         "required":["motivo","confidenza"],"additionalProperties":false}}}}'
```

Esito atteso: `content` è un JSON con `motivo` e `confidenza`. Se compare l'errore `JSON Mode couldn't be met`, o un
errore su `response_format`, il modello non rispetta lo schema: ogni analisi passerà a Groq. Annotalo nel §9.

### 4.4 Groq

```bash
curl -s https://api.groq.com/openai/v1/models -H "Authorization: Bearer $GROQ_API_KEY" | grep -o '"qwen/qwen3.8-27b"'
curl -s https://api.groq.com/openai/v1/chat/completions \
  -H "Authorization: Bearer $GROQ_API_KEY" -H "Content-Type: application/json" \
  -d '{"model":"qwen/qwen3.8-27b","max_tokens":200,"response_format":{"type":"json_object"},
       "messages":[{"role":"user","content":"Rispondi solo con il JSON {\"ok\": true}"}]}'
```

Esito atteso: il primo comando stampa `"qwen/qwen3.8-27b"` (il modello esiste per il tuo account); il secondo un JSON
con `choices[0].message.content` uguale a `{"ok": true}` (eventualmente preceduto da un blocco `<think>`, che il
progetto toglie da solo). Se il primo comando non stampa nulla, il modello non è più disponibile: scegli un altro
modello con visione nella console e impostalo in `GROQ_MODEL`.

Alla fine chiudi il terminale (o `unset CLOUDFLARE_API_TOKEN GROQ_API_KEY`).

---

## 5. Scenari di test sull'anteprima

Prima di iniziare: accedi all'anteprima in due finestre, una come **cittadino** (per inviare) e una come
**moderatore** (pagina *Moderazione*). Su Vercel le analisi partono subito dopo l'invio (in background, entro il
tempo della funzione): dopo l'invio aspetta 20–30 secondi e ricarica il pannello.

Dove verificare:
- **pannello**: pagina *Moderazione*, sezioni "Nascoste automaticamente" e "Da revisionare", badge "IA: …" sulle schede;
  nel dettaglio della segnalazione, il blocco "Analisi automatiche" in cima al pannello di moderazione;
- **registro**: *Amministrazione → Registro operazioni* (le azioni automatiche hanno Utente "—");
- **database** (client MySQL sul database dell'anteprima):
  ```sql
  SELECT provider, giorno, richieste, token FROM ai_quota ORDER BY giorno DESC, provider;
  SELECT id_segnalazione, nascosta, motivo_nascondimento, data_conferma_nascondimento FROM segnalazione ORDER BY id_segnalazione DESC LIMIT 10;
  SELECT id_segnalazione, modello, esito, esito_revisione, JSON_EXTRACT(risultato, '$.motivo') AS motivo, JSON_EXTRACT(risultato, '$.confidenza') AS confidenza
    FROM analisi_ia WHERE tipo_analisi = 'MODERAZIONE_TESTO' ORDER BY id_analisi DESC LIMIT 10;
  SELECT tipo_analisi, stato, tentativi, disponibile_dal, ultimo_errore FROM job_elaborazione ORDER BY id_job DESC LIMIT 20;
  SELECT azione, id_utente, id_entita, dettagli FROM log_operazione ORDER BY id_log DESC LIMIT 20;
  ```

I giudizi sono di un modello reale: il motivo o la confidenza possono differire da quelli attesi. In quel caso annota
il risultato e controlla che **la regola** sia rispettata (vedi "Regola da verificare").

| # | Azione | Esito atteso | Dove verificarlo | Regola da verificare | Esito |
|---|---|---|---|---|---|
| 1 | Invia: titolo "Vigile di via Padova", descrizione "Il vigile di via Padova è un essere ripugnante, un parassita schifoso che fa schifo a tutto il quartiere." (insulto grave senza parole del filtro a regole) | Invio accettato (201). Dopo l'analisi: **nascosta**, compare in "Nascoste automaticamente" con motivo "insulto grave", confidenza, data e spiegazione | pannello; registro: `SEGNALAZIONE_NASCOSTA_AUTO`, Utente "—", dettagli con `automatica: true`, senza il testo; `segnalazione.motivo_nascondimento = 'AUTO_IA: INSULTO_GRAVE'` | motivo grave → nascosta a qualunque confidenza | ☐ |
| 2 | Come cittadino autore, apri la segnalazione del #1 | Messaggio "La segnalazione è in revisione: il comitato la verificherà." e badge "In revisione", **nessun motivo** | pagina della segnalazione e *Profilo* | il cittadino non vede il motivo | ☐ |
| 3 | Invia: titolo "asdkj qwe zzxq", descrizione "lkjh poiu mnbv asdf qwer tyui zxcv prova prova test" | Motivo "testo privo di senso" con confidenza **≥ 0,9** → nascosta | pannello "Nascoste automaticamente"; `analisi_ia.esito = 'BLOCCATO'` | NON_SENSATA ≥ `AI_SOGLIA_AUTO_NASCONDI` → nascosta | ☐ |
| 4 | Invia un testo sensato ma vago, per esempio titolo "Prova segnalazione comitato", descrizione "Scrivo per provare se il modulo funziona, non so bene cosa segnalare." | Motivo `NON_SENSATA`/`NON_PERTINENTE`/`DUBBIO` con confidenza **< 0,9** → **non** nascosta, in "Da revisionare" con motivo e spiegazione | pannello "Da revisionare"; nessuna riga `SEGNALAZIONE_NASCOSTA_AUTO` | sotto soglia o DUBBIO → mai nascosta. Se il modello dà comunque ≥ 0,9, ripeti dopo aver impostato `AI_SOGLIA_AUTO_NASCONDI=1` su Preview e fatto il Redeploy (e poi rimetti `0.9`) | ☐ |
| 5 | Invia una segnalazione normale ("Lampione spento in via Padova", "Il lampione davanti al civico 80 è spento da una settimana e la sera la strada è buia.") con una foto | **Visibile**, nessuna azione automatica; badge "IA: OK" o "IA: Da revisionare" solo per le categorie | pannello; registro senza `SEGNALAZIONE_NASCOSTA_AUTO`; `ai_quota` con una riga `cloudflare` (richieste e token cresciuti) | nessun motivo → nessuna azione | ☐ |
| 6 | Nella sezione "Da revisionare", su una segnalazione con categorie suggerite, premi **Applica le categorie suggerite** | Messaggio "Categorie suggerite applicate.", le categorie cambiano | dettaglio della segnalazione; registro: `CATEGORIE_MODIFICATE` | un clic, azione nel registro | ☐ |
| 7 | Sulla segnalazione del #3 premi **Ripristina** | Messaggio "Segnalazione ripristinata.", sparisce da "Nascoste automaticamente", torna visibile all'autore senza il messaggio di revisione | registro: `SEGNALAZIONE_RIPRISTINATA` con l'utente moderatore e `nascosta_da_ia: true`; `analisi_ia.esito_revisione = 'RESPINTA'` per la moderazione del modello | ripristino del comitato tracciato | ☐ |
| 8 | Sulla segnalazione del #1 premi **Conferma nascosta** | Messaggio "Confermato: resta nascosta.", sparisce dalla sezione ma resta nascosta | registro: `NASCONDIMENTO_IA_CONFERMATO`; `segnalazione.data_conferma_nascondimento` valorizzata; `esito_revisione = 'CONFERMATA'` | conferma esplicita tracciata | ☐ |
| 9 | Su Preview imposta `CLOUDFLARE_API_TOKEN` a un valore **volutamente sbagliato**, Redeploy, poi invia una segnalazione normale | Invio accettato; analisi fatta da **Groq**: in "Analisi automatiche" il modello è `groq:qwen/qwen3.8-27b` | `analisi_ia.modello`; `ai_quota` con una riga `groq`; log Vercel con `Job di analisi …` senza la chiave | primario giù → livello successivo | ☐ |
| 10 | Imposta anche `GROQ_API_KEY` sbagliata, Redeploy, invia una segnalazione | Invio accettato, **la segnalazione non sparisce**: resta visibile, con le analisi a regole; i job vanno in errore e vengono ritentati (attese di 1 e 2 minuti). Al terzo tentativo compare un'analisi "servizio di analisi non disponibile" (`DA_REVISIONARE`). Su Vercel i tentativi successivi partono con gli invii successivi o con il cron giornaliero | `job_elaborazione` (`tentativi`, `ultimo_errore` senza chiavi); pannello "Da revisionare" con "analisi ancora in corso" o "servizio di analisi non disponibile" | tutti giù → regole, mai nascosta | ☐ |
| 11 | Ripristina le chiavi corrette. Imposta `CLOUDFLARE_MAX_RPD=1` (Preview), Redeploy, invia **due** segnalazioni normali | La prima analizzata da Cloudflare, la seconda da Groq | `ai_quota`: `cloudflare` con `richieste = 1` nel giorno UTC, `groq` con le successive; `analisi_ia.modello` | quota superata → livello successivo | ☐ |
| 12 | Imposta anche `GROQ_MAX_RPD=1`, Redeploy, invia un'altra segnalazione | Nessuna chiamata ai modelli: il job si **rimanda** alla mezzanotte UTC, la segnalazione resta visibile con le sole analisi a regole | `job_elaborazione`: `stato = 'IN_CODA'`, `disponibile_dal` nel futuro, `ultimo_errore` che inizia con "Limite di richieste raggiunto" | tutti i livelli esterni al limite → rinvio, nessun dato perso | ☐ |
| 13 | Imposta `AI_AUTO_NASCONDI=false`, togli i limiti del #11–12, Redeploy, ripeti il #3 | Analisi `BLOCCATO` registrata ma la segnalazione **resta visibile**; compare in "Da revisionare" | pannello; registro senza `SEGNALAZIONE_NASCOSTA_AUTO` | interruttore spento → solo suggerimenti | ☐ |

Alla fine rimetti su Preview i valori del §2 (`AI_AUTO_NASCONDI=true`, limiti vuoti o prudenti) e fai il Redeploy.

---

## 6. Controlli nei log di Vercel

*Project → Logs* (oppure il deploy → *Logs*), filtrando per l'URL dell'anteprima.

Cosa cercare:
- `Segnalazione nascosta dalla moderazione automatica` con `segnalazione` (id), `motivo` e `confidenza`;
- `Job di analisi rimandato` con il motivo (limite raggiunto, tempo esaurito);
- `Job di analisi fallito` con il messaggio dell'errore del fornitore (codice HTTP, timeout);
- `Token non registrati nella quota` (non blocca l'analisi, ma i token non vengono contati);
- `Moderazione automatica non applicata` (la segnalazione non è stata nascosta per un errore: resta da revisionare);
- `Configurazione non valida` con il nome della variabile mancante.

Cosa **non** deve comparire:
- le chiavi: al loro posto compare `[chiave]`. Cerca nei log una parte iniziale del token o della chiave: non deve
  esserci nessun risultato;
- il titolo o la descrizione delle segnalazioni, e le immagini (nemmeno in base64): i messaggi riportano solo id,
  motivo, confidenza, modello ed errori tecnici.

Se compare una chiave: revocala subito nella console del fornitore, creane una nuova, aggiorna Vercel e segnala il
problema.

---

## 7. Risoluzione dei problemi

| Sintomo | Causa probabile | Cosa fare |
|---|---|---|
| Il sito risponde "errore interno"; nei log `Configurazione non valida` | variabile obbligatoria mancante (`CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, `GROQ_API_KEY`) o `AI_FALLBACK_PROVIDER` uguale ad `AI_PROVIDER` | correggi in Vercel e fai il Redeploy |
| Il sito non parte; nei log "migrazioni da applicare" | migrazione 014 non eseguita sul database di quell'ambiente | §3, passo 2 (o passo 8 per la produzione) |
| Ho cambiato una variabile ma non succede nulla | il deploy esistente usa i valori vecchi | Redeploy |
| Tutte le analisi risultano fatte da Groq | Cloudflare risponde con un errore: token sbagliato, Account ID errato, `json_schema` non supportato, immagini non accettate | prove del §4.1–4.3; log `Job di analisi fallito` |
| Le analisi delle foto le fa sempre Groq, quelle del testo Cloudflare | `/ai/v1` non accetta `image_url` con Gemma 4 | §4.2; annotalo nel §9 |
| Nessuna analisi del modello; solo regole | `AI_PROVIDER=regole`, oppure job rimandati per i limiti | controlla le variabili e `job_elaborazione.ultimo_errore` |
| Job fermi `IN_CODA` con `disponibile_dal` nel futuro | limite del progetto (`*_MAX_RPM`, `*_MAX_RPD`, `*_MAX_TPD`) o 429 del fornitore | aspetta il minuto o la mezzanotte UTC, oppure alza i limiti restando sotto quelli della console |
| `ai_quota.token` resta a 0 | il fornitore non restituisce `usage` | annotalo: il limite sui token non è applicabile, usa `*_MAX_RPD` |
| Una segnalazione legittima è stata nascosta | falso positivo del modello | **Ripristina** dal pannello; se capita spesso alza `AI_SOGLIA_AUTO_NASCONDI` o metti `AI_AUTO_NASCONDI=false` |
| Una segnalazione chiaramente inaccettabile non è stata nascosta | il modello ha dato `DUBBIO` o confidenza bassa, oppure il fornitore non ha risposto | è in "Da revisionare": il comitato la nasconde a mano |
| Il pulsante "Conferma nascosta" risponde "La decisione è già stata confermata" | conferma già fatta | nessuna azione |
| Le analisi su Vercel arrivano in ritardo | il worker gira solo dopo un invio e con il cron giornaliero, al massimo `AI_JOB_PER_RUN` job per volta | invia un'altra segnalazione di prova o attendi il cron |

---

## 8. Rollback

| Obiettivo | Variabile (Vercel, Production) | Effetto |
|---|---|---|
| Spegnere solo il nascondimento automatico | `AI_AUTO_NASCONDI=false` | le analisi IA continuano, ma restano suggerimenti in "Da revisionare" |
| Spegnere il modello linguistico | `AI_PROVIDER=regole` | nessuna chiamata a Cloudflare o Groq; restano i filtri a regole (422 per minacce e odio all'invio) |
| Togliere solo il livello Groq | `AI_FALLBACK_PROVIDER=regole` | se Cloudflare non risponde, i job si ritentano più tardi |

**Tempi di applicazione.** Su Vercel le variabili si leggono al deploy: non serve modificare il codice né fare un
commit, ma serve un **Redeploy** del deploy di produzione corrente (*Deployments → ⋯ → Redeploy*). Il nuovo valore vale
quando il Redeploy è pronto, di solito entro qualche minuto (la durata della build si vede nella pagina del deploy).
Fino ad allora resta attivo il valore precedente.

Le segnalazioni già nascoste in automatico **restano nascoste** dopo il rollback: si ripristinano dalla sezione
"Nascoste automaticamente". Per tornare al codice precedente: *Deployments* → deploy precedente → *Promote to
Production* (instant rollback). La migrazione 014 è compatibile con il codice precedente e non va annullata.

---

## 9. Fatti da verificare manualmente

| Fatto | Stato al 19/10/2026 | Come verificarlo | Esito |
|---|---|---|---|
| `/ai/v1/chat/completions` di Cloudflare accetta immagini come parti `image_url` con Gemma 4 | **da verificare**: la pagina del modello indica "Vision: Yes", ma la documentazione dell'endpoint compatibile OpenAI non parla di immagini | §4.2. Documentazione: developers.cloudflare.com → Workers AI → *Models* → `gemma-4-26b-a4b-it` e *Configuration → OpenAI compatible API endpoints*. Se non le accetta, l'alternativa è `/ai/run/{model}` | ☐ |
| `response_format` `json_schema` rispettato dal modello | **da verificare**: la pagina *Features → JSON Mode* non elenca Gemma 4; l'errore previsto è "JSON Mode couldn't be met" | §4.3 | ☐ |
| `qwen/qwen3.8-27b` disponibile su Groq nel piano gratuito | **da verificare**: la pagina dei modelli lo elenca tra i *Preview Models* ("intended for evaluation purposes only"); i limiti del piano gratuito non sono pubblicati | console.groq.com → *Docs → Models* e *Settings → Limits*; §4.4 | ☐ |
| Limiti gratuiti di Cloudflare (neuron al giorno, neuron per token del modello) | **da verificare** nella console | dashboard Cloudflare → *AI* → *Workers AI* (uso e limiti del piano) e pagina *Pricing* di Workers AI. Annota nel §2 | ☐ |
| Limiti gratuiti di Groq (RPM, RPD, TPM, TPD del modello) | **da verificare** nella console | console.groq.com → *Settings → Limits*. Annota nel §2 | ☐ |
| Il campo `usage.total_tokens` è presente nelle risposte di Cloudflare | **da verificare** | §4.1 | ☐ |
| Dove Cloudflare tratta i dati e accordo sul trattamento (DPA) | **da verificare** (l'informativa dice che il trattamento può avvenire fuori dall'UE) | dashboard Cloudflare → *Manage Account → Configurations → Data Processing Addendum* e la documentazione Workers AI sulla privacy | ☐ |
| Il database di Preview è diverso da quello di Production | **da verificare** | §3, passo 1 | ☐ |

I percorsi delle console sono indicativi: le interfacce dei fornitori cambiano spesso.

---

## 10. Checklist finale

- [ ] Account Vercel, Cloudflare e Groq pronti
- [ ] Preview usa un database **diverso** da Production
- [ ] Migrazione 014 applicata al database dell'anteprima (Diagnostica senza migrazioni in sospeso)
- [ ] Prove curl §4.1–4.4 eseguite ed esiti annotati nel §9
- [ ] Limiti letti nelle console e annotati nel §2; `*_MAX_*` impostati sotto quei valori
- [ ] Variabili Preview impostate, chiavi come Sensitive, Redeploy fatto
- [ ] Scenari 1–13 del §5 superati (o differenze annotate)
- [ ] Log Vercel controllati: nessuna chiave, nessun testo di segnalazione (§6)
- [ ] Variabili Preview riportate ai valori normali dopo le prove
- [ ] Migrazione 014 applicata al database di **produzione** prima del deploy
- [ ] Variabili Production impostate (chiavi Sensitive)
- [ ] Pull request unita, deploy di produzione pronto, home del sito funzionante
- [ ] Nessuna segnalazione di prova creata in produzione
- [ ] Procedura di rollback (§8) letta da chi gestisce il sito
