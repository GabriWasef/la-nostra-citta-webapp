# La Nostra Città, Il Nostro Futuro
## Analisi dei requisiti — Esercizio 1

## 1. Descrizione generale

Il comitato cittadino **Insieme per Milano** intende realizzare una piattaforma web chiamata **La Nostra Città, Il Nostro Futuro**.

Lo scopo della piattaforma è raccogliere direttamente dai cittadini proposte e segnalazioni relative ai problemi dei quartieri, trasformando le singole lamentele in priorità organizzate, verificabili e condivise.

Il sistema deve consentire di:

- registrare cittadini e membri del comitato;
- associare un utente a una zona o a un quartiere di residenza;
- inserire segnalazioni territoriali;
- obbligare l’utente ad allegare una fotografia o un breve video;
- classificare le segnalazioni per categoria;
- permettere agli altri utenti di esprimere sostegno;
- creare una classifica delle priorità cittadine;
- gestire il ciclo di vita di ogni segnalazione;
- predisporre l’integrazione futura con moduli di Intelligenza Artificiale.

## 2. Attori del sistema

### Utente non registrato

Può visitare la piattaforma e consultare eventualmente le informazioni pubbliche, ma non può inserire segnalazioni né esprimere sostegno.

### Cittadino registrato

Può:

- effettuare il login;
- modificare i propri dati, secondo i permessi previsti;
- inserire segnalazioni;
- allegare fotografie o video;
- visualizzare le segnalazioni pubbliche;
- esprimere o revocare il proprio sostegno;
- consultare la classifica delle priorità.

### Moderatore

È un membro del comitato e può:

- controllare le segnalazioni;
- verificare gli allegati;
- approvare o rifiutare contenuti;
- modificare lo stato delle segnalazioni;
- correggere le categorie proposte dall’IA;
- controllare i risultati delle analisi automatiche.

### Amministratore

Può inoltre:

- gestire gli utenti;
- sospendere o riattivare account;
- assegnare i ruoli;
- gestire quartieri, categorie e stati;
- configurare la piattaforma;
- controllare i dati e i log del sistema.

### Modulo di Intelligenza Artificiale

Può analizzare:

- il testo delle segnalazioni;
- fotografie e video;
- metadati EXIF;
- la coerenza fra descrizione e immagine;
- la categoria tematica;
- la presenza di linguaggio offensivo o d’odio.

L’IA fornisce suggerimenti e risultati automatici, ma il comitato deve poterli controllare e correggere.

## 3. Requisiti funzionali

### RF01 — Registrazione

Il sistema deve permettere a un cittadino di creare un account inserendo almeno:

- nome;
- cognome;
- indirizzo e-mail;
- password;
- quartiere o zona di residenza, se disponibile.

L’indirizzo e-mail deve essere unico.

La password deve essere memorizzata esclusivamente sotto forma di hash sicuro e mai in chiaro.

### RF02 — Autenticazione

Il sistema deve consentire all’utente di:

- effettuare il login;
- accedere alle funzioni riservate;
- effettuare il logout;
- recuperare eventualmente la password.

Solo gli utenti autenticati possono inserire segnalazioni o esprimere sostegno.

### RF03 — Gestione dei ruoli

Ogni utente deve possedere uno dei seguenti ruoli:

- `CITTADINO`;
- `MODERATORE`;
- `AMMINISTRATORE`.

I permessi devono essere controllati dall’applicazione in base al ruolo dell’utente.

### RF04 — Gestione dei quartieri

La piattaforma deve gestire i quartieri della città. Ogni quartiere può avere:

- identificativo;
- nome;
- descrizione;
- municipio di appartenenza.

Il quartiere di residenza può essere diverso dal quartiere interessato dalla segnalazione.

### RF05 — Inserimento di una segnalazione

Un cittadino autenticato deve poter inserire una segnalazione contenente:

- titolo;
- descrizione;
- data e ora di inserimento;
- autore;
- quartiere interessato;
- coordinate geografiche, se disponibili;
- indirizzo, se disponibile;
- categoria o categorie;
- stato;
- almeno un allegato multimediale.

Esempi di problemi segnalabili:

- buche stradali;
- illuminazione carente;
- aree verdi abbandonate;
- problemi di viabilità;
- criticità idrogeologiche;
- fenomeni di movida selvaggia;
- problemi di sicurezza o decoro urbano.

### RF06 — Allegato obbligatorio

Ogni segnalazione deve avere almeno una fotografia o un breve video che documenti il problema.

Sono ammessi, a titolo di esempio:

- immagini JPG, JPEG, PNG o WEBP;
- video MP4, MOV o WEBM.

Il sistema deve verificare tipo, dimensione, estensione e sicurezza del file.

Gli allegati dovrebbero essere memorizzati in un archivio esterno o in un object storage; nel database sono sufficienti il percorso, il tipo, la dimensione e i metadati.

### RF07 — Categorie

Ogni segnalazione deve avere almeno una categoria quando viene resa pubblica.

Esempi:

- Ambiente;
- Mobilità urbana;
- Politiche giovanili;
- Decoro urbano;
- Sicurezza;
- Illuminazione;
- Manutenzione stradale;
- Verde pubblico;
- Viabilità;
- Rischio idrogeologico.

Una segnalazione può appartenere a più categorie e una categoria può essere associata a molte segnalazioni.

### RF08 — Visualizzazione e ricerca

Gli utenti devono poter:

- consultare le segnalazioni pubblicate;
- leggere titolo e descrizione;
- visualizzare quartiere e categorie;
- vedere gli allegati;
- consultare lo stato;
- vedere il numero di sostegni;
- filtrare per quartiere, categoria e stato;
- ordinare per data o numero di sostegni;
- visualizzare le segnalazioni su una mappa, quando le coordinate sono disponibili.

### RF09 — Sostegno

Un utente autenticato può sostenere una segnalazione.

Il database deve impedire che la stessa persona sostenga due volte la stessa segnalazione.

Il sistema può anche vietare all’autore di sostenere la propria segnalazione; questa soluzione applica tale regola tramite trigger.

Il numero dei sostegni deve essere ricavato dai record effettivi della tabella `sostegno` e non da un contatore non controllato.

### RF10 — Ciclo di vita

Gli stati previsti sono:

1. Inserita;
2. In verifica;
3. Approvata;
4. Rifiutata;
5. Presa in carico;
6. In valutazione;
7. Inserita nel documento programmatico;
8. Inviata ai candidati;
9. Chiusa.

Il sistema deve mantenere uno storico dei cambiamenti di stato, indicando data, stato raggiunto, operatore e motivazione.

### RF11 — Moderazione automatica

L’IA deve analizzare il testo per individuare:

- linguaggio volgare;
- insulti;
- contenuti discriminatori;
- minacce;
- linguaggio d’odio;
- spam;
- contenuti non pertinenti.

In caso di rischio il sistema può bloccare il contenuto, porlo in revisione o contrassegnarlo per il comitato.

### RF12 — Classificazione automatica

Un modello NLP deve proporre una o più categorie sulla base della descrizione.

Il risultato deve poter contenere:

- categoria suggerita;
- punteggio di affidabilità;
- modello utilizzato;
- data dell’analisi.

Il moderatore deve poter confermare o modificare il risultato.

### RF13 — Analisi di immagini e video

Il modulo di visione artificiale deve poter:

- controllare la pertinenza dell’immagine;
- individuare file non coerenti con il testo;
- rilevare contenuti non accettabili;
- estrarre informazioni EXIF;
- salvare risultato e punteggio dell’analisi.

### RF14 — Localizzazione

La posizione può derivare da:

- coordinate inserite dall’utente;
- indirizzo geocodificato;
- metadati GPS dell’immagine;
- selezione manuale sulla mappa.

Le coordinate sono opzionali perché i metadati EXIF possono non essere presenti.

## 4. Requisiti non funzionali

### Sicurezza

Il sistema deve:

- utilizzare HTTPS;
- memorizzare password con hashing sicuro;
- validare i dati ricevuti;
- usare query parametrizzate;
- impedire SQL injection;
- controllare MIME type ed estensione dei file;
- applicare i permessi in base al ruolo;
- impedire accessi non autorizzati;
- registrare le operazioni importanti;
- proteggere i dati personali.

### Privacy

Sono dati personali almeno nome, cognome, e-mail, quartiere di residenza, contenuti e coordinate eventualmente associate.

Devono essere previste:

- informativa sul trattamento dei dati;
- consenso quando necessario;
- possibilità di cancellazione o disattivazione dell’account;
- distinzione tra dati pubblici e privati;
- eventuale visualizzazione anonima dell’autore;
- protezione dei dati EXIF che potrebbero rivelare una posizione precisa.

### Usabilità e accessibilità

La piattaforma deve essere:

- responsive;
- utilizzabile da smartphone;
- intuitiva;
- accessibile;
- dotata di messaggi di errore comprensibili;
- dotata di istruzioni chiare per il caricamento degli allegati.

### Prestazioni

Il sistema dovrebbe utilizzare:

- paginazione;
- indici sui campi più ricercati;
- compressione e ottimizzazione dei file;
- elaborazioni IA asincrone per le operazioni più lente;
- cache per le classifiche e le ricerche frequenti.

### Affidabilità

Devono essere garantiti:

- backup periodici;
- ripristino dei dati;
- transazioni atomiche;
- storico delle operazioni;
- gestione degli errori;
- assenza di sostegni duplicati;
- presenza dell’allegato prima della pubblicazione.

### Scalabilità

L’architettura deve poter crescere in numero di utenti, segnalazioni, allegati e analisi IA.

È opportuno separare:

- frontend web;
- backend applicativo;
- database relazionale;
- archivio dei file;
- servizi IA;
- sistema di code per le analisi asincrone.

## 5. Vincoli di integrità

### Vincoli di entità

- Ogni tabella deve avere una chiave primaria.
- Ogni utente deve avere un identificativo univoco.
- Ogni e-mail deve essere unica.
- Ogni quartiere e categoria devono avere un nome univoco.

### Vincoli referenziali

- Una segnalazione deve riferirsi a un autore esistente.
- Una segnalazione deve riferirsi a un quartiere esistente.
- Una segnalazione deve riferirsi a uno stato esistente.
- Un allegato deve riferirsi a una segnalazione esistente.
- Un sostegno deve riferirsi a utente e segnalazione esistenti.
- Una categoria assegnata deve esistere.
- Uno storico deve riferirsi a segnalazione e stato esistenti.

### Vincoli di dominio

- Il titolo deve avere lunghezza compresa tra 5 e 150 caratteri.
- La descrizione deve avere lunghezza compresa tra 20 e 5.000 caratteri.
- Il ruolo deve appartenere ai valori previsti.
- Il tipo di media deve essere immagine o video.
- La dimensione del file deve essere positiva.
- Le coordinate devono rispettare i limiti geografici.
- Il punteggio IA deve essere compreso tra 0 e 1.
- Il numero di sostegni non può essere negativo.

### Vincoli di cardinalità

- Ogni segnalazione ha un solo autore.
- Ogni segnalazione riguarda un solo quartiere.
- Ogni segnalazione pubblicabile deve avere almeno un allegato.
- Una segnalazione può avere più categorie.
- Un utente può sostenere molte segnalazioni.
- Una segnalazione può ricevere molti sostegni.
- Lo stesso utente non può sostenere due volte la stessa segnalazione.

## 6. Entità principali

### UTENTE

Rappresenta il cittadino o il membro del comitato.

Attributi principali:

- `id_utente`;
- `nome`;
- `cognome`;
- `email`;
- `password_hash`;
- `ruolo`;
- `data_registrazione`;
- `stato_account`;
- `id_quartiere_residenza`.

### QUARTIERE

Rappresenta una zona cittadina.

Attributi principali:

- `id_quartiere`;
- `nome`;
- `descrizione`;
- `municipio`.

### SEGNALAZIONE

Rappresenta una proposta o un problema urbano.

Attributi principali:

- `id_segnalazione`;
- `titolo`;
- `descrizione`;
- `data_inserimento`;
- `latitudine`;
- `longitudine`;
- `indirizzo`;
- `visibilita`;
- `id_autore`;
- `id_quartiere`;
- `id_stato_corrente`.

### ALLEGATO

Rappresenta una fotografia o un video.

Attributi principali:

- `id_allegato`;
- `nome_file`;
- `percorso_file`;
- `tipo_mime`;
- `tipo_media`;
- `dimensione_bytes`;
- `data_caricamento`;
- coordinate EXIF;
- `id_segnalazione`.

### CATEGORIA

Rappresenta l’argomento della segnalazione.

### STATO_SEGNALAZIONE

Rappresenta una fase del ciclo di vita.

### SOSTEGNO

È l’entità associativa tra utente e segnalazione e registra il sostegno espresso.

### SEGNALAZIONE_CATEGORIA

È l’entità associativa che risolve la relazione molti-a-molti tra segnalazioni e categorie.

### STORICO_STATO

Registra tutte le variazioni di stato.

### ANALISI_IA

Registra le analisi automatiche svolte sul testo o sugli allegati.

## 7. Relazioni e cardinalità

| Relazione | Cardinalità | Significato |
|---|---:|---|
| Utente — Segnalazione | 1:N | Un utente può inserire molte segnalazioni; ogni segnalazione ha un autore |
| Quartiere — Utente | 1:N | Un quartiere può essere residenza di molti utenti |
| Quartiere — Segnalazione | 1:N | Un quartiere può avere molte segnalazioni |
| Segnalazione — Allegato | 1:N | Ogni segnalazione pubblicabile deve avere almeno un allegato |
| Segnalazione — Categoria | N:M | Una segnalazione può avere più categorie |
| Utente — Segnalazione tramite Sostegno | N:M | Molti utenti possono sostenere molte segnalazioni |
| Stato — Segnalazione | 1:N | Uno stato può essere quello corrente di molte segnalazioni |
| Segnalazione — Storico stato | 1:N | Una segnalazione può cambiare stato molte volte |
| Segnalazione — Analisi IA | 1:N | Una segnalazione può essere analizzata più volte |
| Allegato — Analisi IA | 1:N | Un allegato può essere analizzato con più modelli |

## 8. Schema logico relazionale

```text
QUARTIERE(
    id_quartiere PK,
    nome UNIQUE NOT NULL,
    descrizione,
    municipio
)

UTENTE(
    id_utente PK,
    nome NOT NULL,
    cognome NOT NULL,
    email UNIQUE NOT NULL,
    password_hash NOT NULL,
    ruolo NOT NULL,
    data_registrazione NOT NULL,
    stato_account NOT NULL,
    id_quartiere_residenza FK -> QUARTIERE(id_quartiere)
)

STATO_SEGNALAZIONE(
    id_stato PK,
    nome UNIQUE NOT NULL,
    descrizione,
    ordine UNIQUE NOT NULL
)

CATEGORIA(
    id_categoria PK,
    nome UNIQUE NOT NULL,
    descrizione
)

SEGNALAZIONE(
    id_segnalazione PK,
    titolo NOT NULL,
    descrizione NOT NULL,
    data_inserimento NOT NULL,
    latitudine,
    longitudine,
    indirizzo,
    visibilita NOT NULL,
    id_autore FK -> UTENTE(id_utente),
    id_quartiere FK -> QUARTIERE(id_quartiere),
    id_stato_corrente FK -> STATO_SEGNALAZIONE(id_stato)
)

ALLEGATO(
    id_allegato PK,
    nome_file NOT NULL,
    percorso_file NOT NULL,
    tipo_mime NOT NULL,
    tipo_media NOT NULL,
    dimensione_bytes NOT NULL,
    data_caricamento NOT NULL,
    latitudine_exif,
    longitudine_exif,
    risultato_analisi,
    id_segnalazione FK -> SEGNALAZIONE(id_segnalazione)
)

SEGNALAZIONE_CATEGORIA(
    id_segnalazione PK/FK -> SEGNALAZIONE(id_segnalazione),
    id_categoria PK/FK -> CATEGORIA(id_categoria),
    origine_assegnazione,
    affidabilita_ia,
    data_assegnazione
)

SOSTEGNO(
    id_utente PK/FK -> UTENTE(id_utente),
    id_segnalazione PK/FK -> SEGNALAZIONE(id_segnalazione),
    data_sostegno
)

STORICO_STATO(
    id_storico PK,
    data_cambio,
    motivazione,
    id_segnalazione FK -> SEGNALAZIONE(id_segnalazione),
    id_stato FK -> STATO_SEGNALAZIONE(id_stato),
    id_utente_operatore FK -> UTENTE(id_utente)
)

ANALISI_IA(
    id_analisi PK,
    tipo_analisi,
    modello,
    risultato,
    punteggio,
    data_analisi,
    id_segnalazione FK -> SEGNALAZIONE(id_segnalazione),
    id_allegato FK -> ALLEGATO(id_allegato)
)
```

## 9. Normalizzazione

### Prima forma normale

Tutti gli attributi sono atomici. Non vengono memorizzate liste di categorie o di utenti in un unico campo.

Per esempio, le categorie sono gestite con la tabella associativa `segnalazione_categoria`.

### Seconda forma normale

Le tabelle con chiave composta sono `sostegno` e `segnalazione_categoria`.

Gli attributi non chiave dipendono dall’intera chiave composta:

- `data_sostegno` dipende dalla coppia utente-segnalazione;
- `origine_assegnazione`, `affidabilita_ia` e `data_assegnazione` dipendono dalla coppia segnalazione-categoria.

### Terza forma normale

Gli attributi non chiave non dipendono da altri attributi non chiave.

I nomi di quartieri, categorie e stati non vengono duplicati nella tabella delle segnalazioni: vengono utilizzate chiavi esterne.

## 10. Regole applicate nel database SQL

Lo script SQL allegato implementa:

- chiavi primarie e chiavi esterne;
- vincoli `NOT NULL`;
- vincoli `UNIQUE`;
- vincoli `CHECK` sui domini;
- controllo delle coordinate geografiche;
- gestione dei ruoli e degli stati account;
- gestione degli stati delle segnalazioni;
- impedimento dei sostegni duplicati;
- impedimento del sostegno alla propria segnalazione;
- controllo degli account attivi;
- obbligo di allegato prima della pubblicazione;
- obbligo di categoria prima della pubblicazione;
- storico automatico degli stati;
- viste per classifica e segnalazioni pubbliche;
- indici per migliorare le ricerche.

## 11. Nota tecnica

Lo script è scritto per **MySQL 8.0 o superiore** (motore InnoDB, set di caratteri `utf8mb4`) e deve essere eseguito con un utente autorizzato a creare tabelle, trigger e viste. Contiene comandi `DELIMITER`, quindi va eseguito con il client `mysql` (o con lo script `npm run db:migrate`, che applica le migrazioni in `database/migrations/`).

Il campo `password_hash` deve ricevere un hash prodotto dall’applicazione, ad esempio con Argon2id o bcrypt. Non bisogna inserire password in chiaro.

Il database controlla l’integrità dei dati, mentre l’applicazione deve occuparsi di autenticazione, autorizzazione, upload sicuro dei file, scansione antivirus, gestione delle code IA e interfaccia web.
