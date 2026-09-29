# API REST — riferimento

Base: `/api/v1`. Richieste e risposte in JSON (tranne l'invio delle segnalazioni, in `multipart/form-data`, e il download degli allegati).

## Convenzioni

**Autenticazione.** Sessione lato server con cookie `lnc.sid` (`HttpOnly`, `SameSite=Lax`). Si ottiene con `POST /auth/login` o `POST /auth/register`.

**Ruoli.** 🔓 pubblico · 👤 utente autenticato · 🛡 `MODERATORE` o `AMMINISTRATORE` · 👑 `AMMINISTRATORE`.

**Origine.** Le richieste che modificano dati da un browser devono provenire da `APP_ORIGIN` o da un'origine elencata in `CORS_ORIGINS`.

**Elenchi paginati.** Rispondono con:

```json
{ "dati": [ ... ], "paginazione": { "pagina": 1, "perPagina": 12, "totale": 40, "pagine": 4 } }
```

**Errori.** Hanno sempre questo formato:

```json
{ "error": { "code": "VALIDAZIONE_FALLITA", "message": "Alcuni dati non sono validi.",
             "details": [ { "campo": "titolo", "messaggio": "Il titolo deve avere almeno 5 caratteri." } ] } }
```

| HTTP | Quando |
|---|---|
| 400 | Dati non validi (`VALIDAZIONE_FALLITA`), file non valido (`FILE_NON_VALIDO`, `FILE_NON_AMMESSO`), allegato mancante (`ALLEGATO_OBBLIGATORIO`) |
| 401 | Non autenticato (`NON_AUTENTICATO`), credenziali errate (`CREDENZIALI_NON_VALIDE`) |
| 403 | Ruolo insufficiente (`VIETATO`), account sospeso, autosostegno, origine non consentita |
| 404 | Risorsa inesistente **o non visibile** a chi la chiede |
| 409 | Duplicati (`EMAIL_GIA_REGISTRATA`, `SOSTEGNO_DUPLICATO`, `NOME_GIA_USATO`), elemento in uso (`IN_USO`) |
| 413 | File troppo grande |
| 422 | Regola di business violata: transizione non ammessa, contenuto bloccato dal filtro, trigger del database (`REGOLA_VIOLATA`) |
| 429 | Troppe richieste |

## Autenticazione

| Metodo e percorso | | Corpo | Risposta |
|---|---|---|---|
| `POST /auth/register` | 🔓 | `nome`, `cognome`, `email`, `password` (≥ 10 caratteri, lettere e numeri), `id_quartiere_residenza?`, `consenso_privacy: true` | 201 `{ utente }` e sessione aperta |
| `POST /auth/login` | 🔓 | `email`, `password` | 200 `{ utente }` |
| `POST /auth/logout` | 👤 | — | 204 |
| `GET /auth/me` | 🔓 | — | `{ utente }`, oppure `{ utente: null }` se non autenticato |
| `POST /auth/password/recupero` | 🔓 | `email` | 202, stessa risposta anche se l'e-mail non esiste |
| `POST /auth/password/reimposta` | 🔓 | `token`, `password` | 200; il token vale un'ora ed è monouso; chiude tutte le sessioni |

## Profilo

| Metodo e percorso | | Corpo |
|---|---|---|
| `PATCH /utenti/me` | 👤 | `nome?`, `cognome?`, `id_quartiere_residenza?` |
| `PUT /utenti/me/password` | 👤 | `password_attuale`, `nuova_password`; chiude le altre sessioni |
| `DELETE /utenti/me` | 👤 | `password`; anonimizza i dati personali e disattiva l'account |

## Dati di riferimento

| Metodo e percorso | | Note |
|---|---|---|
| `GET /quartieri` | 🔓 | Con `numero_segnalazioni` |
| `GET /categorie` | 🔓 | Con `numero_segnalazioni` |
| `GET /stati` | 🔓 | `codice`, `nome`, `pubblica`, `finale`, `transizioni` ammesse |
| `GET /statistiche` | 🔓 | Totali pubblici, per stato e per categoria |
| `GET /health` | 🔓 | Stato del server e del database |

## Segnalazioni

| Metodo e percorso | | Note |
|---|---|---|
| `GET /segnalazioni` | 🔓 | Solo pubblicate e non private. Query: `quartiere`, `categoria`, `stato` (codice), `q` (testo), `ordina` = `recenti` \| `meno_recenti` \| `sostegni`, `pagina`, `perPagina` (≤ 50) |
| `GET /segnalazioni/mie` | 👤 | Tutte quelle dell'utente, in qualsiasi stato |
| `GET /segnalazioni/mappa` | 🔓 | Punti con coordinate (stessi filtri) |
| `GET /segnalazioni/:id` | 🔓 | Dettaglio con allegati e categorie. 404 se non visibile. Coordinate EXIF solo al comitato |
| `GET /segnalazioni/:id/storico` | 🔓 | Cambi di stato. L'operatore è indicato per nome solo al comitato |
| `POST /segnalazioni` | 👤 | `multipart/form-data`, vedi sotto |
| `POST /segnalazioni/:id/sostegno` | 👤 | 201 `{ sostenuta, numero_sostegni }` |
| `DELETE /segnalazioni/:id/sostegno` | 👤 | Revoca del sostegno |
| `GET /classifica` | 🔓 | Query: `quartiere`, `categoria`, `limite` (≤ 100) |
| `GET /allegati/:id` | 🔓 | Il file, con supporto `Range` per i video; solo se la segnalazione è visibile |

### `POST /segnalazioni`

| Campo | Obbligatorio | Note |
|---|---|---|
| `titolo` | sì | 5–150 caratteri |
| `descrizione` | sì | 20–5000 caratteri |
| `id_quartiere` | sì | |
| `allegati` | sì | Da 1 a `MAX_FILES` file: JPG/PNG/WEBP fino a `MAX_IMAGE_MB`, MP4/MOV/WEBM fino a `MAX_VIDEO_MB` |
| `categorie` | no | Ripetibile, al massimo 5. Se omesso si usano le categorie proposte dall'IA |
| `visibilita` | no | `PUBBLICA` (predefinita), `ANONIMA`, `PRIVATA` |
| `indirizzo` | no | |
| `latitudine`, `longitudine` | no | Da indicare insieme |
| `origine_coordinate` | no | `MAPPA` (predefinita) o `UTENTE` |
| `usa_posizione_foto` | no | `true` per usare il GPS EXIF della foto quando mancano le coordinate |

La segnalazione nasce nello stato `INSERITA`. Il testo passa subito dal filtro di moderazione: con minacce o linguaggio d'odio la risposta è 422 e non viene salvato nulla. Risposta: 201 `{ segnalazione, categorie_suggerite }`.

## Moderazione 🛡

| Metodo e percorso | Corpo / Query |
|---|---|
| `GET /moderazione/segnalazioni` | `stato`, `quartiere`, `q`, `ordina`, `pagina`, `perPagina`; qualsiasi visibilità, con `da_revisionare_ia` |
| `PATCH /moderazione/segnalazioni/:id/stato` | `codice`, `motivazione` (obbligatoria per `RIFIUTATA`) |
| `PUT /moderazione/segnalazioni/:id/categorie` | `categorie: [id, …]` (1–5) |
| `GET /moderazione/segnalazioni/:id/analisi` | Analisi IA del testo e degli allegati |
| `PATCH /moderazione/analisi/:id` | `esito_revisione`: `CONFERMATA` \| `CORRETTA` \| `RESPINTA` |
| `DELETE /moderazione/allegati/:id` | Non è ammesso se è l'unico allegato di una segnalazione pubblicata |

Transizioni di stato ammesse:

| Da | A |
|---|---|
| `INSERITA` | `IN_VERIFICA`, `APPROVATA`, `RIFIUTATA` |
| `IN_VERIFICA` | `APPROVATA`, `RIFIUTATA` |
| `APPROVATA` | `PRESA_IN_CARICO`, `IN_VALUTAZIONE`, `CHIUSA` |
| `RIFIUTATA` | `IN_VERIFICA` (riesame) |
| `PRESA_IN_CARICO` | `IN_VALUTAZIONE`, `CHIUSA` |
| `IN_VALUTAZIONE` | `DOCUMENTO_PROGRAMMATICO`, `CHIUSA` |
| `DOCUMENTO_PROGRAMMATICO` | `INVIATA_CANDIDATI`, `CHIUSA` |
| `INVIATA_CANDIDATI` | `CHIUSA` |
| `CHIUSA` | — |

Gli stati da `APPROVATA` in poi sono pubblici: il database impedisce di raggiungerli senza almeno un allegato e una categoria.

L'elenco esatto è restituito da `GET /stati` (campo `transizioni`) ed è definito in `server/src/services/cicloVita.js`.

## Amministrazione 👑

| Metodo e percorso | Corpo / Query |
|---|---|
| `GET /admin/utenti` | `q`, `ruolo`, `stato_account`, `pagina`, `perPagina` |
| `PATCH /admin/utenti/:id` | `ruolo?`, `stato_account?` (`ATTIVO` \| `SOSPESO`); non sul proprio account |
| `POST /admin/quartieri` · `PATCH /admin/quartieri/:id` · `DELETE /admin/quartieri/:id` | `nome`, `descrizione?`, `municipio?` (1–9) |
| `POST /admin/categorie` · `PATCH /admin/categorie/:id` · `DELETE /admin/categorie/:id` | `nome`, `descrizione?` |
| `PATCH /admin/stati/:id` | `nome?`, `descrizione?` (codici e regole sono fissi) |
| `GET /admin/log` | `pagina`, `perPagina` |
