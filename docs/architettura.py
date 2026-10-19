#!/usr/bin/env python3
"""Diagramma dell'architettura di La Nostra Città.

Genera, dagli stessi dati:
  - docs/architettura.svg  (vista logica + vista fisica, frecce numerate e legende)
  - docs/architettura.md   (elenco di frecce, attori e punti incerti)

Uso:  python3 docs/architettura.py
Richiede solo la libreria standard di Python 3.

Per modificare il diagramma si cambiano i dati qui sotto (NODI_*, FRECCE_*): le coordinate dei
nodi sono fisse, il percorso delle frecce è calcolato in automatico (instradamento ortogonale
che evita i nodi e le altre frecce; gli incroci inevitabili sono disegnati con un "ponte").
"""
from __future__ import annotations

import heapq
from dataclasses import dataclass, field
from pathlib import Path
from xml.sax.saxutils import escape

CARTELLA = Path(__file__).resolve().parent
FILE_SVG = CARTELLA / 'architettura.svg'
FILE_MD = CARTELLA / 'architettura.md'

LARGHEZZA = 3000
FONT = "'DejaVu Sans', Verdana, Arial, sans-serif"

# ---------------------------------------------------------------------------------------------
# Stili
# ---------------------------------------------------------------------------------------------

TIPI = {
    'utente': dict(nome='Utente / ruolo', fill='#FFF3E0', stroke='#E8710A'),
    'software': dict(nome='Componente software', fill='#E3F2FD', stroke='#1565C0'),
    'database': dict(nome='Database / archivio dati', fill='#E8F5E9', stroke='#2E7D32'),
    'esterno': dict(nome='Servizio o sistema esterno', fill='#F3E5F5', stroke='#7B1FA2'),
    'archivio_esterno': dict(nome='Archivio dati esterno (servizio gestito)', fill='#F3E5F5', stroke='#7B1FA2'),
    'infra': dict(nome='Infrastruttura (dispositivo, server, container)', fill='#ECEFF1', stroke='#455A64'),
}

MECCANISMI = {
    'ui': ('Interazione dell\'utente (interfaccia, comandi)', '#E8710A'),
    'http': ('HTTP / HTTPS (REST, file, API esterne)', '#1565C0'),
    'call': ('Chiamata di funzione o modulo nello stesso processo', '#546E7A'),
    'sql': ('Protocollo MySQL (SQL su TCP 3306)', '#2E7D32'),
    'file': ('File system / volume', '#8D6E63'),
    'browser': ('API del browser', '#00897B'),
    'cicd': ('Git, build, deploy, Docker CLI', '#AD1457'),
}

# ---------------------------------------------------------------------------------------------
# Modello dei dati
# ---------------------------------------------------------------------------------------------


@dataclass
class Nodo:
    id: str
    tipo: str
    rect: tuple[int, int, int, int]
    titolo: str
    righe: list[str]
    descrizione: str
    dove: str = ''          # vista logica: dove viene eseguito / dove si trova
    incerto: str = ''       # motivo, se l'elemento è dedotto (titolo con *)

    @property
    def x1(self): return self.rect[0]

    @property
    def y1(self): return self.rect[1]

    @property
    def x2(self): return self.rect[2]

    @property
    def y2(self): return self.rect[3]

    @property
    def nome(self):
        return self.titolo + (' *' if self.incerto else '')

    @property
    def breve(self):
        """Nome senza dettagli tra parentesi o dopo il trattino, per legende e tabelle."""
        return self.titolo.split(' — ')[0].split(' (')[0] + (' *' if self.incerto else '')


@dataclass
class Freccia:
    origine: str
    destinazione: str
    meccanismo: str
    protocollo: str
    descrizione: str
    file: str
    opzionale: bool = False   # tratteggiata: dipende dalla configurazione o dalla variante di deploy
    incerto: str = ''         # motivo, se l'interazione è dedotta
    numero: int = 0
    punti: list = field(default_factory=list)
    etichetta: tuple = (0, 0)


@dataclass
class Gruppo:
    rect: tuple[int, int, int, int]
    titolo: str
    fill: str
    stroke: str


# ---------------------------------------------------------------------------------------------
# VISTA LOGICA
# ---------------------------------------------------------------------------------------------

LY = 250  # inizio della sezione

GRUPPI_LOGICI = [
    Gruppo((40, LY + 40, 2020, LY + 180), 'UTENTI E RUOLI', '#FFFBF5', '#F0C9A0'),
    Gruppo((400, LY + 200, 2140, LY + 480), 'CLIENT — browser (client/)', '#F7FBFF', '#B3D4F5'),
    Gruppo((400, LY + 510, 2140, LY + 1310), 'APPLICAZIONE — Node.js 22 / Express 5 (server/src)', '#F5F9FE', '#B3D4F5'),
    Gruppo((40, LY + 800, 340, LY + 1140), 'STRUMENTI', '#F5F9FE', '#B3D4F5'),
    Gruppo((400, LY + 1350, 2140, LY + 1520), 'DATI', '#F4FAF4', '#B9DDB9'),
    Gruppo((2380, LY + 200, 2880, LY + 1520), 'SERVIZI ESTERNI', '#FBF6FC', '#D9B8E3'),
]


def _y(v):
    return LY + v


NODI_LOGICI = [
    # Utenti e ruoli
    Nodo('gestore', 'utente', (60, _y(80), 320, _y(150)), 'Gestore tecnico', ['sviluppatore / sistemista'],
         'Chi installa, configura e pubblica la piattaforma; esegue gli script di manutenzione del database.',
         'PC del gestore'),
    Nodo('visitatore', 'utente', (420, _y(80), 640, _y(150)), 'Visitatore', ['non autenticato'],
         'Consulta segnalazioni pubbliche, mappa e classifica senza account.', 'Dispositivo dell\'utente'),
    Nodo('cittadino', 'utente', (680, _y(80), 900, _y(150)), 'Cittadino', ['ruolo CITTADINO'],
         'Utente registrato: invia segnalazioni con allegati, sostiene quelle degli altri, gestisce il profilo.',
         'Dispositivo dell\'utente'),
    Nodo('moderatore', 'utente', (940, _y(80), 1160, _y(150)), 'Moderatore', ['ruolo MODERATORE'],
         'Volontario del comitato: verifica le segnalazioni, cambia stato e categorie, rivede le analisi IA.',
         'Dispositivo dell\'utente'),
    Nodo('amministratore', 'utente', (1200, _y(80), 1440, _y(150)), 'Amministratore', ['ruolo AMMINISTRATORE'],
         'Gestisce utenti e ruoli, quartieri, categorie, stati, registro operazioni e diagnostica.',
         'Dispositivo dell\'utente'),

    # Client
    Nodo('frontend', 'software', (420, _y(250), 1280, _y(450)), 'Frontend web (client/)',
         ['13 pagine HTML + CSS + JavaScript ES modules, senza build',
          'api.js: unico punto di accesso a /api/v1 (fetch JSON, XHR multipart)',
          'layout.js, dom.js, catalogo.js, pages/*, components/*'],
         'Interfaccia della piattaforma: una pagina per funzione, controllo accessi lato client, '
         'tutte le chiamate all\'API passano da api.js.',
         'Browser dell\'utente (file serviti da Express o dalla CDN di Vercel)'),
    Nodo('mappa', 'software', (1400, _y(250), 1700, _y(320)), 'Mappa', ['mappa.js + Leaflet 1.9'],
         'Mappa delle segnalazioni e scelta del punto (Leaflet, servito da /vendor/leaflet).',
         'Browser dell\'utente'),
    Nodo('caricamento', 'software', (1400, _y(380), 1700, _y(450)), 'Caricamento diretto',
         ['caricamento.js + blob-client.js'],
         'Carica foto e video dal browser direttamente su Vercel Blob (le richieste a una funzione '
         'Vercel non possono superare 4,5 MB). blob-client.js è @vercel/blob/client impacchettato da esbuild.',
         'Browser dell\'utente (solo con archivio Vercel Blob)'),
    Nodo('geoloc', 'esterno', (1820, _y(250), 2080, _y(320)), 'Geolocalizzazione',
         ['API del browser (GPS)'],
         'navigator.geolocation: posizione del dispositivo per centrare la mappa e scegliere il punto.',
         'Dispositivo dell\'utente'),

    # Applicazione
    Nodo('app', 'software', (420, _y(560), 2080, _y(640)),
         'App Express — server.js / api/index.js → createApp() (app.js, middlewares/)',
         ['Helmet + CSP · CORS opzionale · express-session (cookie lnc.sid) · originCheck · rate limit · '
          'caricaUtente · requireAuth / requireRole · validate (Zod) · upload (Multer) · errorHandler · static client/'],
         'Processo Node che crea l\'app Express e applica i middleware di sicurezza; fuori da Vercel serve anche '
         'le pagine statiche e avvia il worker IA a intervalli.',
         'Container lnc-app / processo Node locale, oppure Vercel Function'),
    Nodo('logger', 'software', (420, _y(700), 640, _y(770)), 'Logger', ['pino → stdout'],
         'Log strutturati JSON (pino) su stdout; in sviluppo contiene il link di recupero password.',
         'Stesso processo dell\'app; i log finiscono nei log del container o di Vercel'),
    Nodo('router', 'software', (740, _y(700), 2080, _y(770)), 'Router /api/v1 + controller (routes/, controllers/)',
         ['auth · utenti · segnalazioni · allegati · catalogo · moderazione · admin · geocodifica · '
          'interno/manutenzione · health'],
         'Instradamento REST e controller: leggono la richiesta validata, chiamano i servizi, formattano la risposta.',
         'Come App Express'),
    Nodo('servizi', 'software', (420, _y(850), 1120, _y(940)), 'Servizi di dominio (services/)',
         ['auth (Argon2id) · utente · segnalazione + cicloVita · catalogo · diagnostica'],
         'Regole di business: registrazione e login, macchina a stati delle segnalazioni, sostegni, moderazione, '
         'catalogo, controlli di diagnostica.',
         'Come App Express'),
    Nodo('manutenzione', 'software', (1220, _y(850), 1520, _y(940)), 'Manutenzione',
         ['interno.controller.js', 'manutenzione.service.js'],
         'Pulizia periodica (sessioni, token, limiti, file temporanei) e ripresa delle analisi in coda.',
         'Vercel Function (invocata dal cron)'),
    Nodo('geocodifica', 'software', (1780, _y(850), 2080, _y(940)), 'Geocodifica',
         ['geocodifica.service.js', '1 richiesta/s, cache 24 h'],
         'Ricerca di indirizzi e geocodifica inversa tramite Nominatim, in coda e con cache in memoria.',
         'Come App Express'),
    Nodo('ia_regole', 'software', (1220, _y(1020), 1520, _y(1110)), 'IA a regole (ai/)',
         ['moderazione, classificazione,', 'visione, autenticità + pHash'],
         'Analisi deterministiche senza servizi esterni: parole vietate, parole chiave, controllo tecnico delle '
         'immagini, EXIF e foto già usate (hash percettivo).',
         'Come App Express'),
    Nodo('media', 'software', (820, _y(1020), 1120, _y(1110)), 'Servizio media',
         ['file-type · exifr · sharp', 'media.service.js'],
         'Verifica dei magic bytes, lettura EXIF/GPS, ricodifica delle immagini senza metadati, hash percettivo.',
         'Come App Express'),
    Nodo('storage', 'software', (1220, _y(1180), 1520, _y(1270)), 'Archiviazione allegati',
         ['storage/: locale | Vercel Blob'],
         'Interfaccia unica per gli allegati con due implementazioni: disco locale (uploads/) o Vercel Blob privato.',
         'Come App Express'),
    Nodo('worker', 'software', (1780, _y(1020), 2080, _y(1110)), 'Worker IA',
         ['ai/worker.js', 'coda job_elaborazione'],
         'Esegue le analisi lente fuori dalla richiesta: a intervalli nel server, come processo separato '
         'o dopo la risposta su Vercel (waitUntil). Non cambia mai lo stato delle segnalazioni.',
         'Container lnc-app / processo separato / Vercel Function'),
    Nodo('dati', 'software', (420, _y(1180), 1120, _y(1270)), 'Accesso ai dati',
         ['repositories/ (SQL parametrizzato) · pool mysql2 (config/db.js)',
          'MySqlSessionStore · MySqlRateLimitStore'],
         'Unico punto di accesso a MySQL: repository con query parametrizzate, store delle sessioni e dei '
         'contatori dei limiti di frequenza.',
         'Come App Express'),
    Nodo('llm', 'software', (1780, _y(1180), 2080, _y(1270)), 'Provider LLM',
         ['ai/providers/: client OpenAI-', 'compatibile, fallback, RPM/RPD'],
         'Client HTTP verso i modelli linguistici (formato OpenAI), con catena primario → fallback, '
         'nuovi tentativi e limiti di richieste condivisi nel database. Attivo solo con AI_PROVIDER=mistral.',
         'Come Worker IA'),
    Nodo('cli', 'software', (60, _y(850), 320, _y(1110)), 'Script CLI',
         ['server/scripts/', 'migrate.js', 'seed.js (--demo)', 'create-admin.js', 'svuota-segnalazioni.js',
          'worker.js', 'build-vercel.js'],
         'Comandi npm per migrazioni, dati iniziali e dimostrativi, primo amministratore, svuotamento, '
         'worker separato e generazione dei file statici per Vercel.',
         'PC del gestore, container lnc-app (docker compose exec) o Vercel Build (build-vercel.js)'),

    # Dati
    Nodo('database', 'database', (420, _y(1400), 1120, _y(1500)), 'Database MySQL 8',
         ['schema da 13 migrazioni: tabelle, trigger, viste',
          'sessione · job_elaborazione · analisi_ia · limite_richieste · log_operazione'],
         'MySQL ≥ 8.0.19 (InnoDB, utf8mb4): dati applicativi, sessioni, coda delle analisi, contatori dei limiti, '
         'registro delle operazioni.',
         'Container lnc-mysql, MySQL locale o MySQL 8 gestito in cloud'),
    Nodo('archivio', 'database', (1220, _y(1400), 1520, _y(1500)), 'Archivio locale', ['cartella uploads/'],
         'Allegati salvati su disco con nomi casuali AAAA/MM/uuid.ext.',
         'Volume uploads del container lnc-app o disco del server'),

    # Servizi esterni
    Nodo('tiles', 'esterno', (2420, _y(250), 2840, _y(320)), 'Tessere OpenStreetMap', ['tile.openstreetmap.org'],
         'Immagini della mappa caricate dal browser.', 'Internet'),
    Nodo('cron', 'esterno', (2420, _y(565), 2840, _y(635)), 'Vercel Cron', ['0 3 * * * (vercel.json)'],
         'Pianificatore di Vercel che invoca la manutenzione una volta al giorno.', 'Piattaforma Vercel'),
    Nodo('nominatim', 'esterno', (2420, _y(860), 2840, _y(930)), 'Nominatim (OpenStreetMap)',
         ['ricerca indirizzi e inversa'],
         'Servizio gratuito di geocodifica (nominatim.openstreetmap.org), chiamato solo dal server.', 'Internet'),
    Nodo('mistral', 'esterno', (2420, _y(1130), 2840, _y(1200)), 'Mistral AI', ['mistral-small-latest (primario)'],
         'Modello linguistico principale (API compatibile OpenAI), azienda con sede nell\'UE.', 'Internet'),
    Nodo('groq', 'esterno', (2420, _y(1250), 2840, _y(1320)), 'Groq', ['qwen/qwen3.8-27b (fallback)'],
         'Fornitore di riserva facoltativo (AI_FALLBACK_PROVIDER=groq); tratta i dati negli USA.', 'Internet'),
    Nodo('blob', 'archivio_esterno', (2420, _y(1400), 2840, _y(1500)), 'Vercel Blob (privato)',
         ['archivio allegati su Vercel'],
         'Object storage privato: file temporanei tmp/<id utente>/ e definitivi AAAA/MM/uuid.ext, '
         'letti dal browser con link firmati a scadenza.', 'Piattaforma Vercel'),
]

FRECCE_LOGICHE = [
    Freccia('visitatore', 'frontend', 'ui', 'Interfaccia web',
            'consulta elenco, dettaglio, mappa e classifica delle segnalazioni pubbliche',
            'client/index.html, mappa.html, classifica.html, segnalazione.html'),
    Freccia('cittadino', 'frontend', 'ui', 'Interfaccia web',
            'registrazione, login, nuova segnalazione con allegati, sostegno, profilo',
            'client/registrazione.html, login.html, nuova-segnalazione.html, profilo.html'),
    Freccia('moderatore', 'frontend', 'ui', 'Interfaccia web',
            'moderazione: stati, categorie, revisione delle analisi IA, nascondi/mostra',
            'client/moderazione.html, client/js/pages/moderazione.js'),
    Freccia('amministratore', 'frontend', 'ui', 'Interfaccia web',
            'utenti e ruoli, quartieri, categorie, stati, registro operazioni, diagnostica',
            'client/admin.html, client/js/pages/admin.js'),
    Freccia('gestore', 'cli', 'ui', 'Comandi npm (terminale)',
            'npm run db:migrate, db:seed, admin:create, db:svuota, worker, build:vercel (anche *:remoto)',
            'package.json (scripts), README.md'),
    Freccia('frontend', 'mappa', 'call', 'Import ES module',
            'crea la mappa, i marcatori e la scelta del punto',
            'client/js/pages/mappa.js, client/js/pages/nuova-segnalazione.js, client/js/mappa.js'),
    Freccia('frontend', 'caricamento', 'call', 'Import ES module',
            'caricaAllegatiDiretti(): invio dei file prima della segnalazione',
            'client/js/pages/nuova-segnalazione.js, client/js/caricamento.js', opzionale=True),
    Freccia('mappa', 'geoloc', 'browser', 'Geolocation API',
            'navigator.geolocation.getCurrentPosition (posizione del dispositivo)',
            'client/js/mappa.js'),
    Freccia('mappa', 'tiles', 'http', 'HTTPS GET',
            'tessere PNG {z}/{x}/{y} della mappa (Referer: solo origine)',
            'client/js/mappa.js, server/src/config/csp.js, server/src/app.js'),
    Freccia('frontend', 'app', 'http', 'HTTP(S) REST JSON, multipart',
            'chiamate a /api/v1 con cookie lnc.sid; invio segnalazioni (XHR multipart); pagine statiche',
            'client/js/api.js, server/src/app.js'),
    Freccia('caricamento', 'app', 'http', 'HTTPS POST JSON',
            'POST /api/v1/allegati/upload: autorizzazione per un file (token client o URL pre-firmato)',
            'client/js/caricamento.js, server/src/controllers/allegati.controller.js', opzionale=True),
    Freccia('caricamento', 'blob', 'http', 'HTTPS PUT',
            'caricamento diretto del file in tmp/<id utente>/ (anche multipart)',
            'client/js/caricamento.js, server/scripts/blob-client.entry.js', opzionale=True),
    Freccia('frontend', 'blob', 'http', 'HTTPS GET',
            'scarica l\'allegato con link firmato a scadenza (redirect 302 da GET /api/v1/allegati/:id)',
            'server/src/storage/blobStorage.js (send), server/src/config/csp.js', opzionale=True),
    Freccia('cron', 'app', 'http', 'HTTPS GET',
            'GET /api/v1/interno/manutenzione ogni giorno alle 03:00 UTC, Bearer CRON_SECRET',
            'vercel.json (crons), server/src/controllers/interno.controller.js', opzionale=True),
    Freccia('app', 'router', 'call', 'Middleware Express',
            'richiesta validata e autenticata (req.user, req.valid) passata alle rotte',
            'server/src/app.js, server/src/routes/index.js'),
    Freccia('app', 'dati', 'call', 'Chiamata di funzione',
            'legge e salva le sessioni, conta i limiti di frequenza, ricarica l\'utente e il ruolo',
            'server/src/config/sessionStore.js, server/src/middlewares/security.js, server/src/middlewares/auth.js'),
    Freccia('app', 'logger', 'call', 'Chiamata di funzione',
            'log degli errori (errorHandler) e degli eventi; in sviluppo il link di recupero password',
            'server/src/middlewares/errorHandler.js, server/src/controllers/auth.controller.js, server/src/utils/logger.js'),
    Freccia('app', 'worker', 'call', 'Chiamata di funzione',
            'avvio: a intervalli da server.js (AI_WORKER_INTERVAL_MS>0); su Vercel dopo l\'invio (waitUntil)',
            'server/src/server.js, server/src/controllers/segnalazione.controller.js, server/src/ai/worker.js'),
    Freccia('router', 'servizi', 'call', 'Chiamata di funzione',
            'i controller invocano i servizi (auth, utenti, segnalazioni, moderazione, admin, diagnostica)',
            'server/src/controllers/*.js'),
    Freccia('router', 'manutenzione', 'call', 'Chiamata di funzione',
            'interno.controller verifica CRON_SECRET e chiama eseguiManutenzione()',
            'server/src/routes/index.js, server/src/controllers/interno.controller.js'),
    Freccia('router', 'geocodifica', 'call', 'Chiamata di funzione',
            'GET /api/v1/geocodifica/cerca e /inversa (utenti autenticati)',
            'server/src/routes/geocodifica.routes.js'),
    Freccia('servizi', 'ia_regole', 'call', 'Chiamata di funzione',
            'moderazione e classificazione a regole nella richiesta di invio (testo bloccato → 422)',
            'server/src/services/segnalazione.service.js, server/src/ai/index.js'),
    Freccia('servizi', 'media', 'call', 'Chiamata di funzione',
            'elaboraFile (tipo reale, EXIF, ricodifica, pHash), scaricaAllegatiDiretti',
            'server/src/services/segnalazione.service.js, server/src/services/media.service.js'),
    Freccia('servizi', 'geocodifica', 'call', 'Chiamata di funzione',
            'diagnostica: ricerca di prova ("Piazza del Duomo")',
            'server/src/services/diagnostica.service.js'),
    Freccia('servizi', 'dati', 'call', 'Chiamata di funzione',
            'CRUD in transazione, accodamento in job_elaborazione, audit in log_operazione',
            'server/src/repositories/*.js, server/src/utils/audit.js'),
    Freccia('servizi', 'storage', 'call', 'Chiamata di funzione',
            'invio dell\'allegato (file o redirect firmato); prova scrittura/lettura in diagnostica',
            'server/src/services/segnalazione.service.js, server/src/services/diagnostica.service.js'),
    Freccia('media', 'storage', 'call', 'Chiamata di funzione',
            'saveBuffer / saveFile, scaricaTemporaneo, rimuoviTemporanei',
            'server/src/services/media.service.js'),
    Freccia('geocodifica', 'nominatim', 'http', 'HTTPS GET',
            '/search e /reverse (jsonv2), User-Agent identificativo, area di Milano',
            'server/src/services/geocodifica.service.js, .env.example (GEOCODING_*)'),
    Freccia('manutenzione', 'worker', 'call', 'Chiamata di funzione',
            'riprendiJobBloccati() ed elaboraTutti() entro i 60 s della funzione',
            'server/src/services/manutenzione.service.js'),
    Freccia('manutenzione', 'storage', 'call', 'Chiamata di funzione',
            'elenca e rimuove i file temporanei più vecchi di 24 ore',
            'server/src/services/manutenzione.service.js'),
    Freccia('manutenzione', 'dati', 'call', 'Chiamata di funzione (pool)',
            'elimina sessioni scadute, token di recupero e contatori dei limiti',
            'server/src/services/manutenzione.service.js, server/src/config/rateLimitStore.js'),
    Freccia('worker', 'ia_regole', 'call', 'Chiamata di funzione',
            'ANALISI_IMMAGINE (controllo tecnico) e VERIFICA_AUTENTICITA (EXIF, foto riusate)',
            'server/src/ai/worker.js, server/src/ai/visione.js, server/src/ai/autenticita.js'),
    Freccia('worker', 'storage', 'call', 'Chiamata di funzione',
            'storage.leggi(): immagine da analizzare',
            'server/src/ai/worker.js'),
    Freccia('worker', 'dati', 'call', 'Chiamata di funzione',
            'preleva i job IN_CODA, salva analisi_ia e l\'esito, rimanda o segna ERRORE',
            'server/src/ai/worker.js, server/src/repositories/analisi.repository.js'),
    Freccia('worker', 'llm', 'call', 'Chiamata di funzione',
            'analizzaTesto() e verificaPertinenza() (solo testo, categorie e foto ridotta, mai dati dell\'autore)',
            'server/src/ai/worker.js, server/src/ai/providers/index.js', opzionale=True),
    Freccia('llm', 'dati', 'call', 'Chiamata di funzione (pool)',
            'prenota le richieste nei contatori RPM/RPD della tabella limite_richieste',
            'server/src/ai/providers/limiti.js', opzionale=True),
    Freccia('llm', 'mistral', 'http', 'HTTPS POST JSON',
            '/v1/chat/completions con Bearer MISTRAL_API_KEY, risposta JSON validata con Zod',
            'server/src/ai/providers/openaiCompatibile.js, server/src/ai/providers/index.js', opzionale=True),
    Freccia('llm', 'groq', 'http', 'HTTPS POST JSON',
            'stessa chiamata verso /openai/v1 se Mistral non risponde (AI_FALLBACK_PROVIDER=groq)',
            'server/src/ai/providers/index.js, .env.example', opzionale=True),
    Freccia('storage', 'archivio', 'file', 'File system',
            'scrittura, lettura ed eliminazione dei file (STORAGE_DRIVER=locale)',
            'server/src/storage/localStorage.js', opzionale=True),
    Freccia('storage', 'blob', 'http', 'HTTPS (SDK @vercel/blob)',
            'put / get / del, token e link firmati (STORAGE_DRIVER=blob)',
            'server/src/storage/blobStorage.js', opzionale=True),
    Freccia('dati', 'database', 'sql', 'Protocollo MySQL, TCP 3306 (TLS se DB_SSL)',
            'query parametrizzate e transazioni tramite il pool mysql2, fuso orario UTC',
            'server/src/config/db.js, server/src/config/dbOptions.js'),
    Freccia('cli', 'database', 'sql', 'Protocollo MySQL, TCP 3306',
            'migrazioni e seed (connessione mysql2 diretta), svuotamento delle segnalazioni',
            'server/scripts/migrate.js, seed.js, svuota-segnalazioni.js'),
    Freccia('cli', 'servizi', 'call', 'Chiamata di funzione',
            'create-admin (hash Argon2id, promozione) e seed --demo (crea segnalazioni dimostrative)',
            'server/scripts/create-admin.js, server/scripts/seed.js'),
    Freccia('cli', 'worker', 'call', 'Chiamata di funzione',
            'npm run worker: worker come processo separato (--once svuota la coda)',
            'server/scripts/worker.js', opzionale=True),
]

# ---------------------------------------------------------------------------------------------
# VISTA FISICA
# ---------------------------------------------------------------------------------------------

PY = 0  # impostato più avanti, dopo la legenda della vista logica


def gruppi_fisici(py):
    return [
        Gruppo((40, py + 60, 460, py + 1420), 'DISPOSITIVI', '#FAFAFA', '#B0BEC5'),
        Gruppo((540, py + 60, 2020, py + 190), 'INTERNET — servizi usati dal browser', '#FBF6FC', '#D9B8E3'),
        Gruppo((540, py + 220, 2020, py + 650), 'VARIANTE A — server o PC con Docker Compose', '#F7F9FA', '#90A4AE'),
        Gruppo((540, py + 690, 2020, py + 1220), 'VARIANTE B — piattaforma Vercel', '#F7F9FA', '#90A4AE'),
        Gruppo((540, py + 1260, 2020, py + 1420), 'CI/CD — GitHub', '#F7F9FA', '#90A4AE'),
        Gruppo((2120, py + 220, 2880, py + 1220), 'INTERNET — servizi usati dal server', '#FBF6FC', '#D9B8E3'),
    ]


def nodi_fisici(py):
    def r(x1, y1, x2, y2):
        return (x1, py + y1, x2, py + y2)

    return [
        Nodo('dns', 'esterno', r(580, 100, 900, 170), 'DNS del dominio', ['dominio personalizzato'],
             'Record DNS del dominio proprio che puntano a Vercel; HTTPS gestito da Vercel.',
             incerto='Presente solo nella documentazione (CONFIGURAZIONE-MANUALE.md §9), opzionale: '
                     'senza dominio proprio si usa l\'indirizzo *.vercel.app.'),
        Nodo('tiles_f', 'esterno', r(1020, 100, 1520, 170), 'tile.openstreetmap.org', ['tessere della mappa'],
             'Server delle tessere di OpenStreetMap.'),
        Nodo('browser', 'infra', r(80, 240, 420, 960), 'Dispositivo dell\'utente',
             ['PC, tablet o smartphone', '', 'Browser web, esegue:', '· Frontend web', '· Mappa (Leaflet)',
              '· Caricamento diretto', '', 'GPS: Geolocation API', 'cookie di sessione lnc.sid'],
             'Dispositivo di visitatori, cittadini, moderatori e amministratori; il browser esegue il frontend.'),
        Nodo('pc', 'infra', r(80, 1060, 420, 1340), 'PC del gestore tecnico',
             ['Node.js 22, npm, git, Docker', 'esegue gli script CLI', '.env / .env.production',
              '(esclusi da git)', 'sviluppo: npm run dev', '+ MySQL locale o in Docker'],
             'Computer da cui si sviluppa, si avvia Docker Compose, si inizializza il database remoto e si '
             'pubblica il codice.'),
        Nodo('rproxy', 'infra', r(580, 280, 900, 380), 'Reverse proxy HTTPS',
             ['nginx, Traefik… (non nel repo)', 'TLS, X-Forwarded-*'],
             'Termina HTTPS davanti al container in produzione (cookie Secure, HSTS, TRUST_PROXY=true).',
             incerto='Raccomandato dal README (sezione Sicurezza e privacy) ma non configurato nel repository: '
                     'tipo e posizione sono ipotetici.'),
        Nodo('lncapp', 'infra', r(1020, 260, 1520, 460), 'Container lnc-app',
             ['immagine node:22-bookworm-slim, porta 3000', 'esegue: App Express (API + pagine),',
              'servizi, worker IA integrato, storage', 'locale; all\'avvio migrate.js + seed.js'],
             'Container costruito dal Dockerfile (utente node); esegue tutta l\'applicazione Node.'),
        Nodo('lncmysql', 'database', r(1020, 520, 1400, 620), 'Container lnc-mysql',
             ['mysql:8.4 · 127.0.0.1:3306', 'init: database/docker-init'],
             'MySQL 8.4 del docker-compose.yml; al primo avvio crea anche il database di test.'),
        Nodo('volmysql', 'database', r(580, 520, 900, 620), 'Volume mysql-data', ['/var/lib/mysql'],
             'Volume Docker con i file del database.'),
        Nodo('voluploads', 'database', r(1640, 500, 1960, 600), 'Volume uploads', ['/app/uploads'],
             'Volume Docker con gli allegati (archivio locale).'),
        Nodo('cron_f', 'infra', r(1020, 730, 1440, 800), 'Vercel Cron', ['0 3 * * * → /api/v1/interno/manutenzione'],
             'Pianificatore di Vercel definito in vercel.json.'),
        Nodo('blob_f', 'archivio_esterno', r(1640, 720, 1960, 840), 'Vercel Blob (privato)',
             ['*.blob.vercel-storage.com'],
             'Store Blob in modalità privata collegato al progetto (variabili BLOB_*).'),
        Nodo('cdn', 'infra', r(580, 860, 900, 1010), 'Vercel CDN / Edge',
             ['file statici di public/', 'header CSP, rewrite /api/*'],
             'Rete di distribuzione di Vercel: serve le pagine e applica headers e rewrites di vercel.json.'),
        Nodo('func', 'infra', r(1020, 860, 1520, 1060), 'Vercel Function api/index.js',
             ['Node.js, maxDuration 60 s, regione iad1', 'esegue: App Express (solo API), servizi,',
              'analisi dopo la risposta (waitUntil),', 'manutenzione'],
             'Funzione serverless che esegue la stessa app Express; regione predefinita iad1 (modificabile '
             'dal pannello Vercel).'),
        Nodo('build', 'infra', r(580, 1110, 1520, 1190), 'Vercel Build',
             ['npm ci + npm run build:vercel (esbuild): public/ e funzione'],
             'Fase di build di Vercel: installa le dipendenze e genera la cartella public/.'),
        Nodo('github', 'esterno', r(580, 1300, 900, 1380), 'Repository GitHub', ['GabriWasef/la-nostra-citta-webapp'],
             'Repository del codice sorgente.'),
        Nodo('actions', 'infra', r(1020, 1300, 1520, 1380), 'Runner GitHub Actions',
             ['ubuntu-latest, Node 22: test, build, audit'],
             'Job "Test" del workflow .github/workflows/test.yml.'),
        Nodo('mysqlci', 'database', r(1640, 1300, 1960, 1380), 'Service container MySQL',
             ['mysql:8.4, database di test'],
             'MySQL usa e getta del job CI.'),
        Nodo('nominatim_f', 'esterno', r(2220, 260, 2740, 340), 'nominatim.openstreetmap.org', ['geocodifica'],
             'Servizio Nominatim di OpenStreetMap.'),
        Nodo('mistral_f', 'esterno', r(2220, 400, 2740, 480), 'api.mistral.ai', ['modello linguistico (primario)'],
             'API di Mistral AI.'),
        Nodo('groq_f', 'esterno', r(2220, 540, 2740, 620), 'api.groq.com', ['modello di riserva (fuori UE)'],
             'API di Groq, compatibile OpenAI.'),
        Nodo('mysqlcloud', 'database', r(2220, 1000, 2740, 1140), 'MySQL 8 gestito',
             ['provider non definito (Aiven, RDS…)', 'connessione TLS (DB_SSL=true)'],
             'Database MySQL ≥ 8.0.19 raggiungibile da internet, usato dalla variante Vercel.',
             incerto='Il repository non indica il provider: DEPLOY-VERCEL.md elenca solo esempi (Aiven, '
                     'DigitalOcean, RDS, Cloud SQL, Azure).'),
    ]


FRECCE_FISICHE = [
    Freccia('browser', 'dns', 'http', 'DNS',
            'risoluzione del dominio personalizzato verso Vercel',
            'docs/CONFIGURAZIONE-MANUALE.md §9', opzionale=True,
            incerto='Solo nella documentazione; serve solo con un dominio proprio.'),
    Freccia('browser', 'tiles_f', 'http', 'HTTPS GET', 'tessere della mappa',
            'client/js/mappa.js, vercel.json (CSP img-src)'),
    Freccia('browser', 'rproxy', 'http', 'HTTPS 443', 'pagine e API in produzione con Docker',
            'README.md (Sicurezza e privacy, TRUST_PROXY)', opzionale=True,
            incerto='Il reverse proxy non è nel repository.'),
    Freccia('rproxy', 'lncapp', 'http', 'HTTP :3000',
            'inoltro con X-Forwarded-For/Proto (TRUST_PROXY=true)',
            'README.md, .env.example (TRUST_PROXY)', opzionale=True,
            incerto='Il reverse proxy non è nel repository.'),
    Freccia('browser', 'lncapp', 'http', 'HTTP :3000',
            'accesso diretto in sviluppo o in rete locale (http://localhost:3000)',
            'docker-compose.yml (ports), README.md'),
    Freccia('lncapp', 'lncmysql', 'sql', 'TCP 3306 (rete Compose)',
            'DB_HOST=mysql; l\'app parte solo quando MySQL è healthy',
            'docker-compose.yml'),
    Freccia('lncmysql', 'volmysql', 'file', 'Volume Docker', 'dati persistenti in /var/lib/mysql',
            'docker-compose.yml (volumes)'),
    Freccia('lncapp', 'voluploads', 'file', 'Volume Docker', 'allegati in /app/uploads',
            'docker-compose.yml, Dockerfile'),
    Freccia('lncapp', 'nominatim_f', 'http', 'HTTPS', 'geocodifica degli indirizzi',
            'server/src/services/geocodifica.service.js'),
    Freccia('lncapp', 'mistral_f', 'http', 'HTTPS', 'analisi con il modello linguistico (se AI_PROVIDER=mistral)',
            'server/src/ai/providers/index.js', opzionale=True),
    Freccia('lncapp', 'groq_f', 'http', 'HTTPS', 'fallback del modello linguistico (se AI_FALLBACK_PROVIDER=groq)',
            'server/src/ai/providers/index.js', opzionale=True),
    Freccia('pc', 'lncapp', 'cicd', 'Docker CLI',
            'docker compose up -d --build; exec create-admin.js, seed.js --demo; logs',
            'README.md (Opzione A), docker-compose.yml'),
    Freccia('browser', 'blob_f', 'http', 'HTTPS PUT / GET',
            'caricamento diretto dei file e download con link firmati',
            'client/js/caricamento.js, vercel.json (CSP connect-src, img-src)'),
    Freccia('browser', 'cdn', 'http', 'HTTPS',
            'pagine, CSS, JavaScript, Leaflet, blob-client.js e chiamate /api/*',
            'vercel.json, server/scripts/build-vercel.js'),
    Freccia('cdn', 'func', 'http', 'Rewrite interno',
            '/api/:path* → /api (api/index.js)', 'vercel.json (rewrites), api/index.js'),
    Freccia('cron_f', 'func', 'http', 'HTTPS GET + Bearer CRON_SECRET',
            'manutenzione giornaliera alle 03:00 UTC', 'vercel.json (crons)'),
    Freccia('func', 'blob_f', 'http', 'HTTPS (SDK @vercel/blob)',
            'put / get / del, token firmati; autenticazione OIDC o BLOB_READ_WRITE_TOKEN',
            'server/src/storage/blobStorage.js, server/tests/vercelOidc.test.js'),
    Freccia('func', 'mysqlcloud', 'sql', 'TCP 3306 + TLS',
            'pool mysql2 (DB_CONNECTION_LIMIT=3, DB_SSL=true)',
            '.env.production.example, server/src/config/dbOptions.js'),
    Freccia('func', 'nominatim_f', 'http', 'HTTPS', 'geocodifica degli indirizzi',
            'server/src/services/geocodifica.service.js'),
    Freccia('func', 'mistral_f', 'http', 'HTTPS', 'analisi con il modello linguistico (se AI_PROVIDER=mistral)',
            'server/src/ai/providers/index.js', opzionale=True),
    Freccia('func', 'groq_f', 'http', 'HTTPS', 'fallback del modello linguistico (se AI_FALLBACK_PROVIDER=groq)',
            'server/src/ai/providers/index.js', opzionale=True),
    Freccia('pc', 'mysqlcloud', 'sql', 'TCP 3306 + TLS',
            'npm run db:migrate:remoto, db:seed:remoto, admin:create:remoto, db:svuota:remoto',
            'package.json, .env.production.example, DEPLOY-VERCEL.md §3'),
    Freccia('pc', 'github', 'cicd', 'git (HTTPS/SSH)', 'push dei commit e pull request',
            'README.md, docs/CONFIGURAZIONE-MANUALE.md §4'),
    Freccia('github', 'actions', 'cicd', 'GitHub Actions',
            'workflow Test su push a main e su ogni pull request', '.github/workflows/test.yml'),
    Freccia('actions', 'mysqlci', 'sql', 'TCP 3306',
            'npm test su la_nostra_citta_test (database svuotato a ogni esecuzione)',
            '.github/workflows/test.yml'),
    Freccia('github', 'build', 'cicd', 'Integrazione Git di Vercel',
            'deploy automatico del branch di produzione main',
            'DEPLOY-VERCEL.md §4, docs/CONFIGURAZIONE-MANUALE.md §4',
            incerto='Collegamento configurato nel pannello di Vercel, descritto solo nella documentazione.'),
    Freccia('build', 'cdn', 'cicd', 'Deploy', 'pubblica la cartella public/ (outputDirectory)',
            'vercel.json, server/scripts/build-vercel.js'),
    Freccia('build', 'func', 'cicd', 'Deploy', 'pubblica api/index.js con node_modules (includeFiles)',
            'vercel.json (functions)'),
]

# ---------------------------------------------------------------------------------------------
# Instradamento ortogonale delle frecce (A* su griglia)
# ---------------------------------------------------------------------------------------------

G = 10                      # passo della griglia (px)
ALONE = 2                   # celle libere attorno ai nodi
COSTO_CURVA = 40
COSTO_INCROCIO = 450
COSTO_VICINO = (40, 10)     # linea parallela a 1 o 2 celle di distanza
DIREZIONI = [(1, 0), (-1, 0), (0, 1), (0, -1)]
USCITA = {'N': (0, -1), 'S': (0, 1), 'W': (-1, 0), 'E': (1, 0)}
ENTRATA = {k: (-v[0], -v[1]) for k, v in USCITA.items()}


class Instradatore:
    def __init__(self, area, nodi, ostacoli=()):
        self.x0, self.y0, self.x1, self.y1 = area
        self.nx = (self.x1 - self.x0) // G
        self.ny = (self.y1 - self.y0) // G
        self.nodi = {n.id: n for n in nodi}
        self.dentro = {}
        self.alone = {}
        self.occupato = {}
        for x1, y1, x2, y2 in ostacoli:
            i1, j1 = self.cella(x1, y1)
            i2, j2 = self.cella(x2, y2)
            for i in range(i1, i2 + 1):
                for j in range(j1, j2 + 1):
                    self.occupato[(i, j)] = {'b'}
        for n in nodi:
            i1, j1 = self.cella(n.x1, n.y1)
            i2, j2 = self.cella(n.x2, n.y2)
            for i in range(i1, i2 + 1):
                for j in range(j1, j2 + 1):
                    self.dentro[(i, j)] = n.id
            for k in range(1, ALONE + 1):
                for i in range(i1, i2 + 1):
                    self.alone.setdefault((i, j1 - k), (n.id, 'N'))
                    self.alone.setdefault((i, j2 + k), (n.id, 'S'))
                for j in range(j1, j2 + 1):
                    self.alone.setdefault((i1 - k, j), (n.id, 'W'))
                    self.alone.setdefault((i2 + k, j), (n.id, 'E'))
                for a in range(1, ALONE + 1):
                    for ci, cj in ((i1 - k, j1 - a), (i2 + k, j1 - a), (i1 - k, j2 + a), (i2 + k, j2 + a)):
                        self.alone.setdefault((ci, cj), (n.id, 'C'))

    def cella(self, x, y):
        return (round((x - self.x0) / G), round((y - self.y0) / G))

    def punto(self, c):
        return (self.x0 + c[0] * G, self.y0 + c[1] * G)

    def lato(self, n, c):
        """Lato del bordo di n su cui sta la cella c (None se angolo o interno)."""
        i1, j1 = self.cella(n.x1, n.y1)
        i2, j2 = self.cella(n.x2, n.y2)
        i, j = c
        margine = 2
        if j == j1 and i1 + margine <= i <= i2 - margine:
            return 'N'
        if j == j2 and i1 + margine <= i <= i2 - margine:
            return 'S'
        if i == i1 and j1 + margine <= j <= j2 - margine:
            return 'W'
        if i == i2 and j1 + margine <= j <= j2 - margine:
            return 'E'
        return None

    def porte(self, n):
        i1, j1 = self.cella(n.x1, n.y1)
        i2, j2 = self.cella(n.x2, n.y2)
        celle = [(i, j1) for i in range(i1, i2 + 1)] + [(i, j2) for i in range(i1, i2 + 1)]
        celle += [(i1, j) for j in range(j1, j2 + 1)] + [(i2, j) for j in range(j1, j2 + 1)]
        for c in celle:
            lato = self.lato(n, c)
            if lato and 'b' not in self.occupato.get(c, ()):
                yield c, lato

    def instrada(self, f: Freccia):
        S, T = self.nodi[f.origine], self.nodi[f.destinazione]
        for margine in (40, 400):
            percorso = self._astar(S, T, margine)
            if percorso:
                break
        else:
            raise RuntimeError(f'Nessun percorso per {f.origine} → {f.destinazione}')
        self._occupa(percorso)
        punti = [self.punto(percorso[0])]
        for k in range(1, len(percorso) - 1):
            a, b, c = percorso[k - 1], percorso[k], percorso[k + 1]
            if (b[0] - a[0], b[1] - a[1]) != (c[0] - b[0], c[1] - b[1]):
                punti.append(self.punto(b))
        punti.append(self.punto(percorso[-1]))
        return punti

    def _distanza(self, c, T):
        i1, j1 = self.cella(T.x1, T.y1)
        i2, j2 = self.cella(T.x2, T.y2)
        dx = max(i1 - c[0], 0, c[0] - i2)
        dy = max(j1 - c[1], 0, c[1] - j2)
        return (dx + dy) * G

    def _astar(self, S, T, margine):
        si1, sj1 = self.cella(min(S.x1, T.x1), min(S.y1, T.y1))
        si2, sj2 = self.cella(max(S.x2, T.x2), max(S.y2, T.y2))
        lim = (max(0, si1 - margine), max(0, sj1 - margine), min(self.nx, si2 + margine), min(self.ny, sj2 + margine))
        coda, costi, padre = [], {}, {}
        for c, lato in self.porte(S):
            stato = (c, USCITA[lato])
            # preferenza leggera per le porte vicine al centro del lato
            costi[stato] = 0
            padre[stato] = None
            heapq.heappush(coda, (self._distanza(c, T), 0, stato))
        while coda:
            _, g, stato = heapq.heappop(coda)
            if g > costi.get(stato, 1e18):
                continue
            c, d = stato
            for d2 in DIREZIONI:
                if d2 == (-d[0], -d[1]):
                    continue
                if d2 != d and padre[stato] is not None and self.occupato.get(c):
                    continue  # nessuna curva su una cella già usata da un'altra freccia
                if d2 != d and padre[stato] is None:
                    continue  # si esce perpendicolari al bordo
                n = (c[0] + d2[0], c[1] + d2[1])
                if not (lim[0] <= n[0] <= lim[2] and lim[1] <= n[1] <= lim[3]):
                    continue
                extra = self._costo(n, d2, S, T)
                if extra is None:
                    continue
                if extra == 'arrivo':
                    percorso = [n]
                    s = stato
                    while s is not None:
                        percorso.append(s[0])
                        s = padre[s]
                    return percorso[::-1]
                g2 = g + G + extra + (COSTO_CURVA if d2 != d else 0)
                s2 = (n, d2)
                if g2 < costi.get(s2, 1e18):
                    costi[s2] = g2
                    padre[s2] = stato
                    heapq.heappush(coda, (g2 + self._distanza(n, T), g2, s2))
        return None

    def _costo(self, n, d, S, T):
        nid = self.dentro.get(n)
        if nid is not None:
            if nid == T.id:
                lato = self.lato(T, n)
                if lato and d == ENTRATA[lato] and 'b' not in self.occupato.get(n, ()):
                    return 'arrivo'
            return None
        alone = self.alone.get(n)
        if alone:
            aid, lato = alone
            if lato == 'C':
                return None
            if aid == S.id:
                if d != USCITA[lato]:
                    return None
            elif aid == T.id:
                if d != ENTRATA[lato]:
                    return None
            else:
                return None
        asse = 'h' if d[1] == 0 else 'v'
        extra = 0
        occ = self.occupato.get(n)
        if occ:
            if 'b' in occ or asse in occ:
                return None
            extra += COSTO_INCROCIO
        for passo, costo in enumerate(COSTO_VICINO, start=1):
            for s in (passo, -passo):
                vicino = (n[0] + s, n[1]) if asse == 'v' else (n[0], n[1] + s)
                if asse in self.occupato.get(vicino, ()):
                    extra += costo
        return extra

    def _occupa(self, percorso):
        for k, c in enumerate(percorso):
            insieme = self.occupato.setdefault(c, set())
            if k == 0 or k == len(percorso) - 1:
                insieme.add('b')
                continue
            a, b = percorso[k - 1], percorso[k + 1]
            d1 = (c[0] - a[0], c[1] - a[1])
            d2 = (b[0] - c[0], b[1] - c[1])
            if d1 != d2:
                insieme.add('b')
            else:
                insieme.add('h' if d1[1] == 0 else 'v')


def segmenti(punti):
    return list(zip(punti, punti[1:]))


def posiziona_etichette(frecce, nodi, occupate):
    """Sceglie per ogni freccia un punto del percorso libero da nodi, altre frecce ed etichette."""
    tutte = [(f, s) for f in frecce for s in segmenti(f.punti)]

    def distanza_da_segmento(p, a, b):
        (px, py), (ax, ay), (bx, by) = p, a, b
        if ax == bx:
            t = min(max(py, min(ay, by)), max(ay, by))
            return abs(px - ax) + abs(py - t) if px != ax else abs(py - t)
        t = min(max(px, min(ax, bx)), max(ax, bx))
        return abs(py - ay) + abs(px - t) if py != ay else abs(px - t)

    for f in frecce:
        candidati = []
        for k, (a, b) in enumerate(segmenti(f.punti)):
            lung = abs(a[0] - b[0]) + abs(a[1] - b[1])
            if lung < 34:
                continue
            for t in (0.5, 0.35, 0.65, 0.2, 0.8, 0.1, 0.9):
                p = (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)
                # non troppo vicino agli estremi
                if min(abs(p[0] - a[0]) + abs(p[1] - a[1]), abs(p[0] - b[0]) + abs(p[1] - b[1])) < 16:
                    continue
                candidati.append((p, lung, t))
        migliore = None
        for p, lung, t in sorted(candidati, key=lambda c: (-min(c[1], 220), abs(c[2] - 0.5))):
            if any(n.x1 - 16 < p[0] < n.x2 + 16 and n.y1 - 16 < p[1] < n.y2 + 16 for n in nodi):
                continue
            if any(abs(p[0] - q[0]) < 34 and abs(p[1] - q[1]) < 30 for q in occupate):
                continue
            if any(g is not f and distanza_da_segmento(p, *s) < 16 for g, s in tutte):
                continue
            migliore = p
            break
        if migliore is None:
            a, b = max(segmenti(f.punti), key=lambda s: abs(s[0][0] - s[1][0]) + abs(s[0][1] - s[1][1]))
            migliore = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
            print(f'  avviso: etichetta {f.numero} posizionata senza spazio libero')
        f.etichetta = migliore
        occupate.append(migliore)


# ---------------------------------------------------------------------------------------------
# Disegno SVG
# ---------------------------------------------------------------------------------------------

def t(x, y, testo, size=13, weight='normal', fill='#263238', anchor='start', style=''):
    extra = f' font-style="{style}"' if style else ''
    return (f'<text x="{x:.0f}" y="{y:.0f}" font-size="{size}" font-weight="{weight}" fill="{fill}" '
            f'text-anchor="{anchor}"{extra}>{escape(testo)}</text>')


def disegna_gruppo(g: Gruppo):
    x1, y1, x2, y2 = g.rect
    return [
        f'<rect x="{x1}" y="{y1}" width="{x2 - x1}" height="{y2 - y1}" rx="14" fill="{g.fill}" '
        f'stroke="{g.stroke}" stroke-width="1.5" stroke-dasharray="6 4"/>',
        t(x1 + 14, y1 + 22, g.titolo, 14, 'bold', '#607D8B'),
    ]


def forma(tipo, x1, y1, x2, y2):
    st = TIPI[tipo]
    w, h = x2 - x1, y2 - y1
    out = []
    if tipo == 'utente':
        out.append(f'<rect x="{x1}" y="{y1}" width="{w}" height="{h}" rx="{h / 2:.0f}" fill="{st["fill"]}" '
                   f'stroke="{st["stroke"]}" stroke-width="2"/>')
        # piccola icona di persona
        cx, cy = x1 + 26, y1 + h / 2
        out.append(f'<circle cx="{cx}" cy="{cy - 8:.0f}" r="6" fill="{st["stroke"]}"/>')
        out.append(f'<path d="M{cx - 11},{cy + 12:.0f} Q{cx},{cy - 4:.0f} {cx + 11},{cy + 12:.0f} Z" fill="{st["stroke"]}"/>')
    elif tipo in ('database', 'archivio_esterno'):
        ry = 9
        tratt = ' stroke-dasharray="7 4"' if tipo == 'archivio_esterno' else ''
        out.append(f'<path d="M{x1},{y1 + ry} V{y2 - ry} A{w / 2},{ry} 0 0 0 {x2},{y2 - ry} V{y1 + ry} '
                   f'A{w / 2},{ry} 0 0 0 {x1},{y1 + ry} Z" fill="{st["fill"]}" stroke="{st["stroke"]}" '
                   f'stroke-width="2"{tratt}/>')
        out.append(f'<ellipse cx="{x1 + w / 2}" cy="{y1 + ry}" rx="{w / 2}" ry="{ry}" fill="{st["fill"]}" '
                   f'stroke="{st["stroke"]}" stroke-width="2"{tratt}/>')
    elif tipo == 'esterno':
        out.append(f'<rect x="{x1}" y="{y1}" width="{w}" height="{h}" rx="14" fill="{st["fill"]}" '
                   f'stroke="{st["stroke"]}" stroke-width="2" stroke-dasharray="7 4"/>')
    elif tipo == 'infra':
        out.append(f'<rect x="{x1 + 6}" y="{y1 + 6}" width="{w}" height="{h}" rx="4" fill="{st["stroke"]}" '
                   f'opacity="0.35"/>')
        out.append(f'<rect x="{x1}" y="{y1}" width="{w}" height="{h}" rx="4" fill="{st["fill"]}" '
                   f'stroke="{st["stroke"]}" stroke-width="2"/>')
    else:
        out.append(f'<rect x="{x1}" y="{y1}" width="{w}" height="{h}" rx="6" fill="{st["fill"]}" '
                   f'stroke="{st["stroke"]}" stroke-width="2"/>')
    return out


def disegna_nodo(n: Nodo):
    out = forma(n.tipo, n.x1, n.y1, n.x2, n.y2)
    cx = (n.x1 + n.x2) / 2
    if n.tipo == 'utente':
        cx += 12
    inizio = n.y1 + (24 if n.tipo not in ('database', 'archivio_esterno') else 34)
    altezza = 20 + 17 * len(n.righe)
    disponibile = n.y2 - n.y1 - (18 if n.tipo in ('database', 'archivio_esterno') else 0)
    if altezza < disponibile - 10:
        inizio = n.y1 + (disponibile - altezza) / 2 + 17 + (18 if n.tipo in ('database', 'archivio_esterno') else 0)
    out.append(t(cx, inizio, n.nome, 16, 'bold', '#102027', 'middle'))
    for k, riga in enumerate(n.righe):
        out.append(t(cx, inizio + 19 + 17 * k, riga, 13, 'normal', '#37474F', 'middle'))
    return out


def disegna_freccia(f: Freccia):
    colore = MECCANISMI[f.meccanismo][1]
    d = 'M' + ' L'.join(f'{x},{y}' for x, y in f.punti)
    tratt = ' stroke-dasharray="9 5"' if f.opzionale else ''
    return [
        f'<path d="{d}" fill="none" stroke="#FFFFFF" stroke-width="8" stroke-linejoin="round"/>',
        f'<path d="{d}" fill="none" stroke="{colore}" stroke-width="2.2" stroke-linejoin="round"{tratt} '
        f'marker-end="url(#punta-{f.meccanismo})"/>',
    ]


def disegna_etichetta(f: Freccia):
    colore = MECCANISMI[f.meccanismo][1]
    x, y = f.etichetta
    testo = f'{f.numero}' + ('*' if f.incerto else '')
    larghezza = max(26, 9 * len(testo) + 10)
    return [
        f'<rect x="{x - larghezza / 2:.0f}" y="{y - 13:.0f}" width="{larghezza}" height="26" rx="13" '
        f'fill="#FFFFFF" stroke="{colore}" stroke-width="2"/>',
        t(x, y + 5, testo, 14, 'bold', colore, 'middle'),
    ]


def a_capo(testo, max_car):
    parole, righe, riga = testo.split(), [], ''
    for p in parole:
        if len(riga) + len(p) + 1 > max_car and riga:
            righe.append(riga)
            riga = p
        else:
            riga = f'{riga} {p}'.strip()
    if riga:
        righe.append(riga)
    return righe


def voce_legenda(f: Freccia, nodi):
    o, d = nodi[f.origine].breve, nodi[f.destinazione].breve
    testo = f'{o} → {d}: {f.descrizione} [{f.protocollo}]'
    if f.incerto:
        testo += f' (* {f.incerto})'
    return testo


def disegna_legenda_frecce(titolo, frecce, nodi, x1, y, x2):
    """Due colonne con tutte le frecce. Restituisce (elementi, y finale)."""
    out = []
    larghezza_col = (x2 - x1 - 60) / 2
    max_car = int((larghezza_col - 50) / 6.9)
    voci = [(f, a_capo(voce_legenda(f, nodi), max_car)) for f in frecce]
    righe_tot = sum(len(r) for _, r in voci)
    meta, conta, divisione = righe_tot / 2, 0, len(voci)
    for k, (_, r) in enumerate(voci):
        if conta >= meta:
            divisione = k
            break
        conta += len(r)
    colonne = [voci[:divisione], voci[divisione:]]
    altezza = max(sum(len(r) * 18 + 8 for _, r in col) for col in colonne)
    out.append(f'<rect x="{x1}" y="{y}" width="{x2 - x1}" height="{altezza + 60}" rx="10" fill="#FFFFFF" '
               f'stroke="#90A4AE" stroke-width="1.5"/>')
    out.append(t(x1 + 20, y + 30, titolo, 17, 'bold', '#263238'))
    for ci, col in enumerate(colonne):
        cx = x1 + 20 + ci * (larghezza_col + 20)
        cy = y + 58
        for f, righe in col:
            colore = MECCANISMI[f.meccanismo][1]
            num = f'{f.numero}' + ('*' if f.incerto else '')
            out.append(f'<rect x="{cx}" y="{cy - 14}" width="38" height="20" rx="10" fill="#FFFFFF" '
                       f'stroke="{colore}" stroke-width="1.8"/>')
            out.append(t(cx + 19, cy + 1, num, 12, 'bold', colore, 'middle'))
            for k, riga in enumerate(righe):
                out.append(t(cx + 48, cy + 18 * k, riga, 13))
            cy += 18 * len(righe) + 8
    return out, y + altezza + 60


def disegna_intestazione():
    out = [t(40, 52, 'La Nostra Città, Il Nostro Futuro — Architettura del sistema', 30, 'bold', '#102027'),
           t(40, 82, 'Piattaforma di segnalazioni del comitato Insieme per Milano · diagramma ricavato dal '
                     'codice e dalla configurazione del repository (sorgente: docs/architettura.py, '
                     'dettagli: docs/architettura.md)', 15, 'normal', '#455A64')]
    # Legenda delle forme
    x, y = 40, 110
    out.append(f'<rect x="{x}" y="{y}" width="{LARGHEZZA - 80}" height="120" rx="10" fill="#FFFFFF" '
               f'stroke="#90A4AE" stroke-width="1.5"/>')
    out.append(t(x + 20, y + 26, 'LEGENDA DELLE FORME', 14, 'bold', '#607D8B'))
    cx = x + 20
    for tipo in ('utente', 'software', 'database', 'esterno', 'archivio_esterno', 'infra'):
        out += forma(tipo, cx, y + 40, cx + 70, y + 74)
        nome = TIPI[tipo]['nome']
        righe = a_capo(nome, 30)
        for k, r in enumerate(righe):
            out.append(t(cx + 80, y + 54 + 16 * k, r, 13))
        cx += 80 + 8 * max(len(r) for r in righe) + 30
    out.append(t(cx, y + 54, '* = elemento dedotto,', 13, 'bold'))
    out.append(t(cx, y + 70, 'non certo (vedi legende)', 13, 'bold'))
    out.append(t(x + 20, y + 100, 'FRECCE:', 14, 'bold', '#607D8B'))
    cx = x + 100
    for chiave, (nome, colore) in MECCANISMI.items():
        out.append(f'<path d="M{cx},{y + 96} L{cx + 40},{y + 96}" stroke="{colore}" stroke-width="2.5" '
                   f'marker-end="url(#punta-{chiave})"/>')
        out.append(t(cx + 48, y + 101, nome, 13))
        cx += 60 + int(6.9 * len(nome)) + 18
    out.append(f'<path d="M{cx},{y + 96} L{cx + 40},{y + 96}" stroke="#546E7A" stroke-width="2.5" '
               f'stroke-dasharray="9 5"/>')
    out.append(t(cx + 48, y + 101, 'tratteggio = opzionale / dipende dalla configurazione', 13))
    return out


def marcatori():
    out = ['<defs>']
    for chiave, (_, colore) in MECCANISMI.items():
        out.append(f'<marker id="punta-{chiave}" viewBox="0 0 10 10" refX="9.5" refY="5" markerWidth="6" '
                   f'markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="{colore}"/>'
                   f'</marker>')
    out.append('</defs>')
    return out


def sezione(titolo, sottotitolo, rect):
    x1, y1, x2, y2 = rect
    return [
        f'<rect x="{x1}" y="{y1}" width="{x2 - x1}" height="{y2 - y1}" rx="16" fill="#FFFFFF" stroke="#263238" '
        f'stroke-width="2.5"/>',
        f'<rect x="{x1}" y="{y1}" width="{x2 - x1}" height="44" rx="16" fill="#263238"/>',
        f'<rect x="{x1}" y="{y1 + 28}" width="{x2 - x1}" height="16" fill="#263238"/>',
        t(x1 + 20, y1 + 30, titolo, 20, 'bold', '#FFFFFF'),
        t(x1 + 20 + 12.5 * len(titolo) + 30, y1 + 30, sottotitolo, 14, 'normal', '#CFD8DC'),
    ]


def ordina_per_instradamento(frecce, nodi):
    def lunghezza(f):
        a, b = nodi[f.origine], nodi[f.destinazione]
        return abs((a.x1 + a.x2) / 2 - (b.x1 + b.x2) / 2) + abs((a.y1 + a.y2) / 2 - (b.y1 + b.y2) / 2)
    return sorted(frecce, key=lunghezza)


def titoli(gruppi):
    return [(g.rect[0], g.rect[1], g.rect[0] + 28 + 9.5 * len(g.titolo), g.rect[1] + 30) for g in gruppi]


def instrada_vista(area, nodi, frecce, gruppi):
    r = Instradatore(area, nodi, titoli(gruppi))
    indice = {n.id: n for n in nodi}
    for f in ordina_per_instradamento(frecce, indice):
        f.punti = r.instrada(f)


def conta_incroci(frecce):
    seg = [(f.numero, s) for f in frecce for s in segmenti(f.punti)]
    incroci = 0
    for i, (na, (a1, a2)) in enumerate(seg):
        for nb, (b1, b2) in seg[i + 1:]:
            if na == nb:
                continue
            ah, bh = a1[1] == a2[1], b1[1] == b2[1]
            if ah == bh:
                continue
            h, v = ((a1, a2), (b1, b2)) if ah else ((b1, b2), (a1, a2))
            if min(h[0][0], h[1][0]) < v[0][0] < max(h[0][0], h[1][0]) and \
                    min(v[0][1], v[1][1]) < h[0][1] < max(v[0][1], v[1][1]):
                incroci += 1
    return incroci


# ---------------------------------------------------------------------------------------------
# Verifiche di coerenza
# ---------------------------------------------------------------------------------------------

def verifica(nodi_l, frecce_l, nodi_f, frecce_f):
    tutte = frecce_l + frecce_f
    numeri = [f.numero for f in tutte]
    assert numeri == list(range(1, len(tutte) + 1)), 'numerazione non progressiva'
    for nodi, frecce, vista in ((nodi_l, frecce_l, 'logica'), (nodi_f, frecce_f, 'fisica')):
        ids = {n.id for n in nodi}
        assert len(ids) == len(nodi), f'id duplicati nella vista {vista}'
        usati = set()
        for f in frecce:
            assert f.origine in ids and f.destinazione in ids, f'freccia {f.numero}: nodo inesistente'
            assert f.meccanismo in MECCANISMI, f'freccia {f.numero}: meccanismo sconosciuto'
            assert len(f.punti) >= 2 and f.etichetta != (0, 0), f'freccia {f.numero} non disegnata'
            usati |= {f.origine, f.destinazione}
        isolati = ids - usati
        assert not isolati, f'nodi senza frecce nella vista {vista}: {isolati}'


# ---------------------------------------------------------------------------------------------
# Documentazione Markdown
# ---------------------------------------------------------------------------------------------

def cella_md(testo):
    """Testo semplice per Markdown: niente tabelle spezzate, tag HTML o corsivi involontari."""
    return testo.replace('|', '\\|').replace('<', '&lt;').replace('*', '\\*')


def genera_md(nodi_l, frecce_l, nodi_f, frecce_f):
    il = {n.id: n for n in nodi_l}
    fi = {n.id: n for n in nodi_f}
    righe = [
        '# Architettura di La Nostra Città',
        '',
        '> File generato da [`architettura.py`](architettura.py) insieme a [`architettura.svg`](architettura.svg).',
        '> Per modificarlo cambia i dati nello script ed esegui `python3 docs/architettura.py`.',
        '',
        '![Diagramma dell\'architettura](architettura.svg)',
        '',
        'Il diagramma ha due sezioni:',
        '',
        f'- **Vista logica** (frecce 1–{len(frecce_l)}): componenti software, ruoli degli utenti e sistemi esterni.',
        f'- **Vista fisica** (frecce {len(frecce_l) + 1}–{len(frecce_l) + len(frecce_f)}): dispositivi, container, '
        'piattaforme e servizi su cui girano i componenti, nelle due varianti di pubblicazione '
        '(Docker Compose e Vercel) più la CI.',
        '',
        'Convenzioni: il colore di una freccia indica il meccanismo, il tratteggio indica un\'interazione '
        'opzionale o che dipende dalla configurazione (per esempio `STORAGE_DRIVER`, `AI_PROVIDER`, '
        'la variante di deploy). L\'asterisco `*` indica un elemento dedotto e non certo (vedi '
        '[Punti incerti](#punti-incerti)).',
        '',
        '| Colore | Meccanismo |',
        '|---|---|',
    ]
    for nome, colore in MECCANISMI.values():
        righe.append(f'| `{colore}` | {nome} |')

    def tabella_frecce(frecce, indice):
        out = ['| N. | Origine | Destinazione | Protocollo / meccanismo | Descrizione | File di riferimento |',
               '|---:|---|---|---|---|---|']
        for f in frecce:
            num = f'{f.numero}' + ('\\*' if f.incerto else '')
            desc = cella_md(f.descrizione) + (' *(opzionale / dipende dalla configurazione)*' if f.opzionale else '')
            file = ', '.join(f'`{x.strip()}`' for x in f.file.split(', ')).replace('|', '\\|')
            out.append(f'| {num} | {cella_md(indice[f.origine].breve)} | {cella_md(indice[f.destinazione].breve)} | '
                       f'{cella_md(f.protocollo)} | {desc} | {file} |')
        return out

    righe += ['', '## Frecce numerate', '', '### Vista logica', '']
    righe += tabella_frecce(frecce_l, il)
    righe += ['', '### Vista fisica', '']
    righe += tabella_frecce(frecce_f, fi)

    righe += ['', '## Attori', '', '### Attori logici', '',
              '| Attore | Tipo | Descrizione | Dove viene eseguito / si trova |', '|---|---|---|---|']
    for n in nodi_l:
        righe.append(f'| {cella_md(n.nome)} | {TIPI[n.tipo]["nome"]} | {cella_md(n.descrizione)} | {cella_md(n.dove)} |')
    righe += ['', '### Attori fisici', '', '| Attore | Tipo | Descrizione |', '|---|---|---|']
    for n in nodi_f:
        dettagli = ' · '.join(r for r in n.righe if r.strip())
        righe.append(f'| {cella_md(n.nome)} | {TIPI[n.tipo]["nome"]} | {cella_md(n.descrizione)} '
                     f'({cella_md(dettagli)}) |')

    righe += ['', '## Punti incerti', '',
              'Elementi marcati con `*` nel diagramma: risultano dalla documentazione del repository ma non dal '
              'codice o dalla configurazione, oppure dipendono da scelte fatte fuori dal repository.', '']
    for n in nodi_l + nodi_f:
        if n.incerto:
            righe.append(f'- **{cella_md(n.nome)}** (attore): {cella_md(n.incerto)}')
    for f in frecce_l + frecce_f:
        if f.incerto:
            indice = il if f in frecce_l else fi
            righe.append(f'- **Freccia {f.numero}\\*** ({cella_md(indice[f.origine].breve)} → '
                         f'{cella_md(indice[f.destinazione].breve)}): {cella_md(f.incerto)}')
    righe += [
        '',
        'Altre note, non marcate con `*` perché la parte certa è nel codice:',
        '',
        '- **Autenticazione OIDC verso Vercel Blob** (freccia '
        f'{next(f.numero for f in frecce_f if f.origine == "func" and f.destinazione == "blob_f")}): '
        'con uno store OIDC (`BLOB_STORE_ID`) lo scambio del token con l\'API di Vercel avviene dentro '
        'l\'SDK `@vercel/blob`/`@vercel/oidc`; il repository lo mostra solo nel test `server/tests/vercelOidc.test.js`.',
        '- **Regione della funzione Vercel**: `iad1` è il valore predefinito citato in `DEPLOY-VERCEL.md`; '
        'la regione reale si sceglie nel pannello di Vercel (consigliata una regione europea).',
        '- **Invio di e-mail**: non esiste un servizio SMTP. Il link di recupero password viene scritto nel log '
        'solo in sviluppo (`server/src/controllers/auth.controller.js`); in produzione non viene inviato.',
        '- **Antivirus**: `scansionaFile()` in `server/src/storage/index.js` è un punto di aggancio non collegato '
        'a nessun servizio, quindi non compare nel diagramma.',
        '- **Video**: non vengono ricodificati né analizzati dall\'IA (serve ffmpeg, non presente).',
        '- **Servizi esterni condizionali**: Mistral e Groq sono contattati solo con `AI_PROVIDER=mistral` '
        '(Groq solo con `AI_FALLBACK_PROVIDER=groq`); Vercel Blob solo con lo store collegato '
        '(`STORAGE_DRIVER=blob`); Nominatim si disattiva con `GEOCODING_ENABLED=false`.',
        '',
        '## Riepilogo',
        '',
        f'- Attori logici: {len(nodi_l)}',
        f'- Attori fisici: {len(nodi_f)}',
        f'- Frecce: {len(frecce_l) + len(frecce_f)} ({len(frecce_l)} nella vista logica, {len(frecce_f)} nella vista fisica)',
        '',
    ]
    return '\n'.join(righe)


# ---------------------------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------------------------

def main():
    numero = 1
    for f in FRECCE_LOGICHE + FRECCE_FISICHE:
        f.numero = numero
        numero += 1

    # Vista logica
    area_l = (30, LY, LARGHEZZA - 30, LY + 1560)
    instrada_vista(area_l, NODI_LOGICI, FRECCE_LOGICHE, GRUPPI_LOGICI)
    occupate = []
    posiziona_etichette(FRECCE_LOGICHE, NODI_LOGICI, occupate)
    il = {n.id: n for n in NODI_LOGICI}

    elementi_l = sezione('VISTA LOGICA', 'componenti software, ruoli e sistemi esterni (frecce 1–'
                         f'{len(FRECCE_LOGICHE)})', area_l)
    for g in GRUPPI_LOGICI:
        elementi_l += disegna_gruppo(g)
    for f in FRECCE_LOGICHE:
        elementi_l += disegna_freccia(f)
    for n in NODI_LOGICI:
        elementi_l += disegna_nodo(n)
    for f in FRECCE_LOGICHE:
        elementi_l += disegna_etichetta(f)
    legenda_l, y = disegna_legenda_frecce(
        f'LEGENDA DELLE FRECCE — VISTA LOGICA (1–{len(FRECCE_LOGICHE)})', FRECCE_LOGICHE, il,
        30, area_l[3] + 20, LARGHEZZA - 30)

    # Vista fisica
    py = y + 50
    nodi_f = nodi_fisici(py)
    gruppi_f = gruppi_fisici(py)
    area_f = (30, py, LARGHEZZA - 30, py + 1480)
    instrada_vista(area_f, nodi_f, FRECCE_FISICHE, gruppi_f)
    posiziona_etichette(FRECCE_FISICHE, nodi_f, [])
    ifi = {n.id: n for n in nodi_f}

    primo = len(FRECCE_LOGICHE) + 1
    elementi_f = sezione('VISTA FISICA', 'nodi, infrastruttura e servizi su cui gira il sistema (frecce '
                         f'{primo}–{primo + len(FRECCE_FISICHE) - 1})', area_f)
    for g in gruppi_f:
        elementi_f += disegna_gruppo(g)
    for f in FRECCE_FISICHE:
        elementi_f += disegna_freccia(f)
    for n in nodi_f:
        elementi_f += disegna_nodo(n)
    for f in FRECCE_FISICHE:
        elementi_f += disegna_etichetta(f)
    legenda_f, y = disegna_legenda_frecce(
        f'LEGENDA DELLE FRECCE — VISTA FISICA ({primo}–{primo + len(FRECCE_FISICHE) - 1})', FRECCE_FISICHE, ifi,
        30, area_f[3] + 20, LARGHEZZA - 30)

    verifica(NODI_LOGICI, FRECCE_LOGICHE, nodi_f, FRECCE_FISICHE)

    altezza = y + 40
    svg = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{LARGHEZZA}" height="{altezza}" '
           f'viewBox="0 0 {LARGHEZZA} {altezza}" font-family="{FONT}">',
           '<title>La Nostra Città — Architettura del sistema</title>',
           f'<rect width="{LARGHEZZA}" height="{altezza}" fill="#FFFFFF"/>']
    svg += marcatori()
    svg += disegna_intestazione()
    svg += elementi_l + legenda_l + elementi_f + legenda_f
    svg.append('</svg>')
    FILE_SVG.write_text('\n'.join(svg) + '\n', encoding='utf-8')
    FILE_MD.write_text(genera_md(NODI_LOGICI, FRECCE_LOGICHE, nodi_f, FRECCE_FISICHE), encoding='utf-8')

    print(f'{FILE_SVG.name}: {LARGHEZZA}×{altezza} px')
    print(f'attori logici {len(NODI_LOGICI)}, attori fisici {len(nodi_f)}, '
          f'frecce {len(FRECCE_LOGICHE) + len(FRECCE_FISICHE)}')
    print(f'incroci: vista logica {conta_incroci(FRECCE_LOGICHE)}, vista fisica {conta_incroci(FRECCE_FISICHE)}')


if __name__ == '__main__':
    main()
