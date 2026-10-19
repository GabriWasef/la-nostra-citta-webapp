#!/usr/bin/env python3
"""Diagramma dell'architettura di La Nostra Città.

Genera dagli stessi dati (NODI e FRECCE) sia l'immagine sia la documentazione testuale:
  - docs/architettura.jpg  (vista logica + vista fisica + legenda)
  - docs/architettura.md   (attori, frecce numerate, punti incerti)

Uso:   python3 docs/architettura.py
Serve: Python 3.9+ e Pillow (pip install pillow). Usa i font Inter se presenti, altrimenti DejaVu.

Per modificare il diagramma: cambiare nodi e frecce qui sotto e rieseguire lo script.
Le frecce sono numerate nell'ordine in cui compaiono in FRECCE.
"""
from __future__ import annotations

import os
import re
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

DOCS = Path(__file__).resolve().parent
LARGHEZZA = 3600  # px dell'immagine finale
S = 2  # sovracampionamento: si disegna a S volte la dimensione e si riduce (bordi più puliti)

# --------------------------------------------------------------------------------------
# Stili
# --------------------------------------------------------------------------------------

TIPI = {
    # tipo: (riempimento, bordo, descrizione per la legenda delle forme)
    "utente": ("#FFF1D6", "#D98200", "Utente o ruolo (persona)"),
    "software": ("#E3EEFC", "#2F6FD6", "Componente software / modulo"),
    "dati": ("#E2F4E6", "#2E8B4F", "Database o archivio di dati"),
    "esterno": ("#F2E8FB", "#8A4FCF", "Servizio o sistema esterno (bordo tratteggiato)"),
    "infra": ("#ECEFF1", "#546E7A", "Nodo fisico / infrastruttura (scatola 3D)"),
}

PROTOCOLLI = {
    # chiave: (colore, etichetta per la legenda)
    "ui": ("#D98200", "Interazione dell'utente con l'interfaccia"),
    "https": ("#1E5BC6", "HTTP / HTTPS (REST, API esterne, contenuti statici)"),
    "sql": ("#2E8B4F", "Protocollo MySQL (TCP 3306, SQL)"),
    "chiamata": ("#5F6B73", "Chiamata in-process (funzioni, moduli ES)"),
    "file": ("#9C5A1E", "Lettura / scrittura di file"),
    "ops": ("#C2185B", "Operazioni di sviluppo e deploy (terminale, git, CI, build)"),
}

BANDA_COLORE = "#F7F9FB"
BANDA_BORDO = "#D5DCE3"
TESTO = "#1D232A"
TESTO_TENUE = "#55606B"


def _font(nomi, dimensione):
    cartelle = ["/usr/share/fonts/opentype/inter", "/usr/share/fonts/truetype/dejavu", "/usr/share/fonts/truetype"]
    for nome in nomi:
        for c in cartelle:
            p = os.path.join(c, nome)
            if os.path.exists(p):
                return ImageFont.truetype(p, dimensione * S)
    return ImageFont.load_default()


def F(dimensione, peso="regular"):
    nomi = {
        "regular": ["Inter-Regular.otf", "DejaVuSans.ttf"],
        "medium": ["Inter-Medium.otf", "DejaVuSans.ttf"],
        "semibold": ["Inter-SemiBold.otf", "DejaVuSans-Bold.ttf"],
        "bold": ["Inter-Bold.otf", "DejaVuSans-Bold.ttf"],
    }[peso]
    return _font(nomi, dimensione)


# --------------------------------------------------------------------------------------
# Dati: nodi (attori)
# --------------------------------------------------------------------------------------
# vista: "logica" | "fisica"; box = (x, y, larghezza, altezza) in px dell'immagine finale.
# incerto=True: elemento dedotto, mostrato con l'asterisco e spiegato in "Punti incerti".

# Nei testi, {id} diventa il codice dell'attore (es. {f_app} -> F04) e {a,b,c} un intervallo di codici.

NODI = {}
ORDINE_CODICI = {"logica": 0, "fisica": 0}


def nodo(id_, vista, tipo, box, nome, righe="", descr="", dove="", file="", incerto=False, livello="", motivo=""):
    NODI[id_] = dict(
        id=id_, vista=vista, tipo=tipo, box=box, nome=nome + ("*" if incerto else ""), righe=righe,
        descr=descr, dove=dove, file=file, incerto=incerto, codice="", livello=livello, motivo=motivo,
    )


def assegna_codici(ordine_logico):
    """L01, L02... nell'ordine indicato; F01, F02... nell'ordine di definizione. Le cornici non sono attori."""
    logici = ordine_logico + [k for k, n in NODI.items() if n["vista"] == "logica" and k not in ordine_logico]
    fisici = [k for k, n in NODI.items() if n["vista"] == "fisica" and n["tipo"] != "cornice"]
    for prefisso, ids in (("L", logici), ("F", fisici)):
        for i, k in enumerate(ids, start=1):
            NODI[k]["codice"] = f"{prefisso}{i:02d}"
    ORDINE_CODICI.update(logica=len(logici), fisica=len(fisici))


def risolvi(testo):
    """Sostituisce {id} e {id1,id2,...} con i codici degli attori, compattando gli intervalli (L12–L24)."""
    def codici(m):
        ids = m.group(1).split(",")
        if not all(i in NODI for i in ids):
            return m.group(0)  # non è un segnaposto (es. {z}/{x}/{y} delle tessere)
        cod = sorted(NODI[i]["codice"] for i in ids)
        pref, num = cod[0][0], [int(c[1:]) for c in cod]
        parti, inizio = [], num[0]
        for a, b in zip(num, num[1:] + [None]):
            if b != a + 1:
                parti.append(f"{pref}{inizio:02d}" + (f"–{pref}{a:02d}" if a != inizio else ""))
                inizio = b
        return ", ".join(parti)
    return re.sub(r"\{([a-z_]+(?:,[a-z_]+)*)\}", codici, testo)


# ---- Vista logica: utenti e ruoli
nodo("op", "logica", "utente", (90, 300, 320, 120), "Operatore tecnico",
     "sviluppatore / gestore del deploy", livello="Utenti e ruoli",
     descr="Chi installa, configura e aggiorna la piattaforma: esegue gli script npm e il deploy.",
     dove="PC dell'operatore ({f_pc})", file="package.json, README.md, DEPLOY-VERCEL.md")
nodo("vis", "logica", "utente", (520, 300, 310, 120), "Visitatore", "non autenticato", livello="Utenti e ruoli",
     descr="Chiunque apra il sito: consulta segnalazioni pubbliche, mappa e classifica.",
     dove="Dispositivo dell'utente ({f_dev})", file="client/index.html, server/src/routes/segnalazioni.routes.js")
nodo("cit", "logica", "utente", (880, 300, 310, 120), "Cittadino", "ruolo CITTADINO", livello="Utenti e ruoli",
     descr="Utente registrato: crea segnalazioni con allegati, sostiene quelle altrui, gestisce il profilo.",
     dove="Dispositivo dell'utente ({f_dev})", file="server/src/middlewares/auth.js (RUOLI)")
nodo("mod", "logica", "utente", (1240, 300, 310, 120), "Moderatore", "ruolo MODERATORE", livello="Utenti e ruoli",
     descr="Membro del comitato: approva, rifiuta, nasconde o elimina segnalazioni e revisiona le analisi IA.",
     dove="Dispositivo dell'utente ({f_dev})", file="server/src/routes/moderazione.routes.js")
nodo("adm", "logica", "utente", (1600, 300, 330, 120), "Amministratore", "ruolo AMMINISTRATORE", livello="Utenti e ruoli",
     descr="Gestisce utenti, quartieri, categorie e stati; consulta registro operazioni e diagnostica.",
     dove="Dispositivo dell'utente ({f_dev})", file="server/src/routes/admin.routes.js")

# ---- Vista logica: client (browser)
nodo("pag", "logica", "software", (520, 530, 1360, 110), "Pagine web e moduli JS",
     "client/*.html, js/pages/*, layout.js, dom.js, components/ — HTML/CSS/JS senza build", livello="Client",
     descr="Frontend multipagina: una pagina HTML e un modulo ES per funzione, header e controllo accessi lato client.",
     dove="Browser ({f_dev})", file="client/*.html, client/js/pages/*.js, client/js/layout.js")
nodo("api", "logica", "software", (520, 735, 330, 120), "Client API", "js/api.js — fetch / XHR", livello="Client",
     descr="Unico punto di accesso all'API REST dal browser (fetch JSON, XHR multipart con avanzamento).",
     dove="Browser ({f_dev})", file="client/js/api.js")
nodo("map", "logica", "software", (990, 735, 340, 120), "Mappa", "js/mappa.js + Leaflet 1.9", livello="Client",
     descr="Mappe interattive Leaflet con tessere OpenStreetMap, marker e scelta del punto.",
     dove="Browser ({f_dev})", file="client/js/mappa.js, client/js/pages/mappa.js")
nodo("car", "logica", "software", (1470, 735, 410, 120), "Caricamento diretto",
     "js/caricamento.js + blob-client.js", livello="Client",
     descr="Carica foto e video direttamente su Vercel Blob (le funzioni Vercel accettano al massimo 4,5 MB).",
     dove="Browser ({f_dev})", file="client/js/caricamento.js, server/scripts/blob-client.entry.js")
nodo("geo", "logica", "esterno", (2010, 735, 420, 120), "API Geolocation",
     "del browser: navigator.geolocation (GPS)", livello="Client",
     descr="API del browser che fornisce la posizione del dispositivo per compilare la segnalazione.",
     dove="Browser e sensori di posizione del dispositivo ({f_dev})", file="client/js/pages/nuova-segnalazione.js, client/js/mappa.js")

# ---- Vista logica: applicazione (backend Node.js / Express 5)
nodo("cli", "logica", "software", (90, 2070, 310, 180), "Script CLI",
     "server/scripts: migrate, seed, create-admin, svuota-segnalazioni, worker, build-vercel", livello="Applicazione",
     descr="Comandi npm per database, utenti amministratori, worker separato e build statica per Vercel.",
     dove="PC dell'operatore ({f_pc}), container lnc-app ({f_app}) con docker compose exec, Vercel Build ({f_bld}), runner CI ({f_ci})",
     file="server/scripts/*.js, package.json")
nodo("sta", "logica", "software", (760, 1055, 320, 100), "File statici",
     "client/ (o public/), /vendor/leaflet", livello="Applicazione",
     descr="Pagine, CSS, JS e Leaflet serviti da express.static oppure, su Vercel, dalla CDN (cartella public/).",
     dove="lnc-app ({f_app}) oppure CDN Vercel ({f_cdn})", file="server/src/app.js, vercel.json, server/scripts/build-vercel.js")
nodo("avv", "logica", "software", (130, 1235, 270, 130), "Avvio",
     "server.js (Node) / api/index.js (Vercel)", livello="Applicazione",
     descr="Punto d'ingresso: verifica database e migrazioni, crea l'app Express, avvia il worker integrato.",
     dove="lnc-app ({f_app}) oppure Funzione Vercel ({f_fn})", file="server/src/server.js, api/index.js")
nodo("mw", "logica", "software", (520, 1200, 1360, 110), "Pipeline middleware (app.js)",
     "Helmet/CSP, sessione lnc.sid, controllo Origin, rate limit, utente e ruoli, Zod, Multer, errori",
     livello="Applicazione",
     descr="Sicurezza e preparazione di ogni richiesta /api: intestazioni, sessione, CSRF, limiti, autenticazione, validazione, upload.",
     dove="lnc-app ({f_app}) oppure Funzione Vercel ({f_fn})", file="server/src/app.js, server/src/middlewares/*.js")
nodo("rot", "logica", "software", (520, 1400, 1360, 110), "Router e controller REST /api/v1",
     "auth, utenti, segnalazioni, allegati, catalogo, geocodifica, moderazione, admin, interno/manutenzione, health",
     livello="Applicazione",
     descr="Instradamento delle richieste e controller che chiamano i servizi, registrano l'audit e rispondono in JSON.",
     dove="lnc-app ({f_app}) oppure Funzione Vercel ({f_fn})", file="server/src/routes/*.js, server/src/controllers/*.js")
nodo("srv", "logica", "software", (520, 1610, 400, 150), "Servizi di dominio",
     "auth (Argon2id), utente, segnalazione + ciclo di vita, catalogo, media (sharp, EXIF, pHash)",
     livello="Applicazione",
     descr="Regole di business: registrazione e accesso, segnalazioni, sostegni, moderazione, elaborazione degli allegati.",
     dove="lnc-app ({f_app}) oppure Funzione Vercel ({f_fn})", file="server/src/services/*.service.js, server/src/services/cicloVita.js")
nodo("gcd", "logica", "software", (1000, 1610, 300, 150), "Geocodifica",
     "geocodifica.service.js — coda 1 req/s, cache 24 h", livello="Applicazione",
     descr="Ricerca indirizzi e indirizzo di un punto tramite Nominatim, con abbinamento ai quartieri.",
     dove="lnc-app ({f_app}) oppure Funzione Vercel ({f_fn})", file="server/src/services/geocodifica.service.js")
nodo("man", "logica", "software", (1380, 1610, 400, 150), "Manutenzione e diagnostica",
     "pulizie periodiche, ripresa della coda IA, controlli di configurazione", livello="Applicazione",
     descr="Pulizia di sessioni, limiti, token e file temporanei; ripresa dei job IA; diagnostica per l'amministratore.",
     dove="lnc-app ({f_app}) oppure Funzione Vercel ({f_fn})",
     file="server/src/services/manutenzione.service.js, server/src/services/diagnostica.service.js")
nodo("wrk", "logica", "software", (1960, 1610, 420, 150), "Worker IA",
     "coda job_elaborazione: integrato, processo separato o waitUntil su Vercel", livello="Applicazione",
     descr="Esegue le analisi lente fuori dalla richiesta, con tentativi e rinvii; non cambia mai lo stato delle segnalazioni.",
     dove="lnc-app ({f_app}), processo npm run worker, Funzione Vercel ({f_fn})", file="server/src/ai/worker.js, server/scripts/worker.js")
nodo("reg", "logica", "software", (1960, 1890, 420, 130), "IA a regole",
     "moderazione, classificazione, visione tecnica, autenticità (EXIF, pHash)", livello="Applicazione",
     descr="Analisi deterministiche incluse nel progetto, senza servizi esterni (AI_PROVIDER=regole).",
     dove="lnc-app ({f_app}) oppure Funzione Vercel ({f_fn})",
     file="server/src/ai/moderazione.js, classificazione.js, visione.js, autenticita.js, phash.js")
nodo("llm", "logica", "software", (2460, 1610, 390, 150), "Adapter LLM",
     "API compatibile OpenAI, fallback, limiti RPM/RPD, schemi Zod", livello="Applicazione",
     descr="Chiama il modello linguistico (Mistral, fallback Groq) con timeout, tentativi e risposta JSON validata.",
     dove="lnc-app ({f_app}) oppure Funzione Vercel ({f_fn})",
     file="server/src/ai/providers/index.js, openaiCompatibile.js, limiti.js, server/src/ai/prompt.js, schemi.js")
nodo("dat", "logica", "software", (520, 1890, 780, 110), "Accesso ai dati",
     "pool mysql2 (config/db.js), repositories/, store sessioni e limiti di frequenza", livello="Applicazione",
     descr="Query parametrizzate, transazioni, store delle sessioni express-session e dei contatori di rate limit.",
     dove="lnc-app ({f_app}) oppure Funzione Vercel ({f_fn})",
     file="server/src/config/db.js, server/src/repositories/*.js, server/src/config/sessionStore.js, server/src/config/rateLimitStore.js")
nodo("arc", "logica", "software", (1460, 1890, 320, 110), "Archivio allegati",
     "storage/: driver locale | blob (stessa interfaccia)", livello="Applicazione",
     descr="Salva, legge, elimina e serve gli allegati; sceglie il driver da STORAGE_DRIVER o dalle variabili BLOB_*.",
     dove="lnc-app ({f_app}) oppure Funzione Vercel ({f_fn})", file="server/src/storage/index.js, localStorage.js, blobStorage.js")
nodo("log", "logica", "software", (130, 1050, 270, 110), "Logger", "pino → stdout", livello="Applicazione",
     descr="Log strutturati JSON su standard output (log del container o di Vercel).",
     dove="lnc-app ({f_app}) oppure Funzione Vercel ({f_fn})", file="server/src/utils/logger.js")

# ---- Vista logica: dati
nodo("db", "logica", "dati", (520, 2370, 780, 170), "Database MySQL 8",
     "utente, segnalazione, allegato, analisi_ia, job_elaborazione, sessione, limite_richieste, log_operazione…",
     livello="Dati",
     descr="Schema da 13 migrazioni: 15 tabelle, viste e trigger (storico stati, vincoli di pubblicazione).",
     dove="lnc-mysql ({f_my}) oppure MySQL gestito ({f_dbx}); in CI: service container ({f_cim})",
     file="database/migrations/*.sql, database/seeds/*.sql")
nodo("upl", "logica", "dati", (1460, 2370, 320, 170), "Cartella uploads/", "allegati su disco (driver locale)",
     livello="Dati", descr="File degli allegati ricodificati, organizzati per anno/mese/uuid.",
     dove="volume Docker uploads ({f_vu}) o disco del server", file="server/src/storage/localStorage.js, docker-compose.yml")

# ---- Vista logica: servizi esterni
nodo("osm", "logica", "esterno", (2975, 870, 565, 110), "OpenStreetMap — tessere",
     "tile.openstreetmap.org", livello="Servizi esterni",
     descr="Server delle tessere della mappa, chiamato direttamente dal browser.",
     dove="Internet ({f_til})", file="client/js/mappa.js, vercel.json (CSP img-src)")
nodo("blb", "logica", "dati", (2975, 540, 565, 250), "Vercel Blob (privato)",
     "store gestito da Vercel: file definitivi e tmp/<id_utente>/; link firmati a scadenza", livello="Servizi esterni",
     descr="Object storage privato per gli allegati quando l'app gira su Vercel.",
     dove="Piattaforma Vercel ({f_blb})", file="server/src/storage/blobStorage.js, DEPLOY-VERCEL.md")
nodo("crn", "logica", "esterno", (2975, 1090, 565, 110), "Vercel Cron", "schedule 0 3 * * * (03:00 UTC)",
     livello="Servizi esterni", descr="Pianificatore di Vercel che invoca la manutenzione giornaliera.",
     dove="Piattaforma Vercel ({f_crn})", file="vercel.json (crons)")
nodo("nom", "logica", "esterno", (2975, 1400, 565, 110), "Nominatim (OpenStreetMap)",
     "GEOCODING_URL, /search e /reverse", livello="Servizi esterni",
     descr="Servizio gratuito di geocodifica, chiamato solo dal server.",
     dove="Internet ({f_nom})", file="server/src/services/geocodifica.service.js, .env.example")
nodo("mis", "logica", "esterno", (2975, 1640, 565, 110), "Mistral AI API",
     "modello mistral-small-latest (UE)", livello="Servizi esterni",
     descr="Modello linguistico principale per testo e immagini (solo con AI_PROVIDER=mistral).",
     dove="Internet ({f_mis})", file="server/src/ai/providers/index.js, docs/AI-PROVIDERS.md")
nodo("grq", "logica", "esterno", (2975, 1830, 565, 110), "Groq API",
     "fallback facoltativo, qwen/qwen3.8-27b (USA)", livello="Servizi esterni",
     descr="Secondo fornitore del modello linguistico (AI_FALLBACK_PROVIDER=groq).",
     dove="Internet ({f_grq})", file="server/src/ai/providers/index.js, .env.example")

# ---- Vista fisica
Y0 = 2760  # inizio della vista fisica
# Cornici: raggruppano nodi fisici e possono essere origine o destinazione di una freccia.
nodo("c_dock", "fisica", "cornice", (700, Y0 + 50, 1180, 720),
     "Server self-hosted — Docker Compose (Opzione A)")
nodo("c_ver", "fisica", "cornice", (700, Y0 + 900, 1560, 650), "Piattaforma Vercel (Opzione B)")
nodo("c_net", "fisica", "cornice", (2660, Y0 + 50, 890, 1050), "Internet — servizi di terze parti")
nodo("c_api", "fisica", "cornice", (2690, Y0 + 260, 830, 420), "API chiamate dal backend")
nodo("c_reg", "fisica", "cornice", (2690, Y0 + 730, 830, 330), "Registri di pacchetti e immagini")
nodo("c_gh", "fisica", "cornice", (60, Y0 + 900, 530, 680), "GitHub")

nodo("f_dev", "fisica", "infra", (90, Y0 + 120, 470, 190), "Dispositivo dell'utente",
     "PC o smartphone con browser web e sensore di posizione. Esegue {pag,api,map,car,geo}", livello="Client",
     descr="Computer o smartphone di visitatori, cittadini e comitato: esegue il frontend nel browser.",
     dove="—", file="client/")
nodo("f_pc", "fisica", "infra", (90, Y0 + 560, 470, 180), "PC dell'operatore",
     "Node 22 + npm, git, Docker CLI, .env / .env.production. Esegue {cli}", livello="Client",
     descr="Postazione da cui si eseguono script npm, migrazioni remote, docker compose e git push.",
     dove="—", file="package.json (script *:remoto), .env.production.example")
nodo("f_rp", "fisica", "infra", (740, Y0 + 130, 340, 150), "Reverse proxy HTTPS", "es. nginx o Traefik, porta 443",
     incerto=True, livello="Applicazione",
     descr="Terminazione TLS davanti al container: consigliata da README e .env.example (TRUST_PROXY), ma non configurata nel repository.",
     motivo="Il README chiede di servire l'app dietro un reverse proxy HTTPS in produzione e .env.example prevede TRUST_PROXY, "
            "ma nel repository non c'è alcuna configurazione di nginx, Traefik o simili: tipo e presenza dipendono da chi installa.",
     dove="Server self-hosted", file="README.md (Sicurezza e privacy), .env.example (TRUST_PROXY)")
nodo("f_app", "fisica", "infra", (1230, Y0 + 110, 600, 200), "Container lnc-app",
     "immagine node:22-bookworm-slim, porta 3000, utente node. Esegue {sta,avv,mw,rot,srv,gcd,man,wrk,reg,llm,dat,arc,log} (worker integrato)",
     livello="Applicazione", descr="Webapp Node.js costruita dal Dockerfile; all'avvio applica migrazioni e seed, poi avvia il server.",
     dove="Server self-hosted (Docker Compose)", file="Dockerfile, docker-compose.yml (servizio app)")
nodo("f_my", "fisica", "infra", (1230, Y0 + 470, 600, 170), "Container lnc-mysql",
     "immagine mysql:8.4, porta 127.0.0.1:3306. Ospita {db}", livello="Dati",
     descr="Database MySQL 8.4; al primo avvio crea anche il database di test.",
     dove="Server self-hosted (Docker Compose)", file="docker-compose.yml (servizio mysql), database/docker-init/01-database-test.sh")
nodo("f_vu", "fisica", "dati", (740, Y0 + 380, 340, 130), "Volume uploads", "/app/uploads — {upl}",
     livello="Dati", descr="Volume Docker con gli allegati (driver locale).",
     dove="Server self-hosted (Docker Compose)", file="docker-compose.yml (volumes), Dockerfile")
nodo("f_vm", "fisica", "dati", (740, Y0 + 580, 340, 130), "Volume mysql-data", "/var/lib/mysql",
     livello="Dati", descr="Volume Docker con i file del database.",
     dove="Server self-hosted (Docker Compose)", file="docker-compose.yml (volumes)")
nodo("f_cdn", "fisica", "infra", (740, Y0 + 980, 470, 170), "CDN / Edge Vercel",
     "serve public/ ({sta}), header CSP, rewrite /api/* verso la funzione", livello="Applicazione",
     descr="Rete di distribuzione di Vercel per i file statici e l'instradamento verso la funzione.",
     dove="Vercel", file="vercel.json (outputDirectory, rewrites, headers)")
nodo("f_fn", "fisica", "infra", (1310, Y0 + 980, 520, 170), "Funzione Vercel (Node 22)",
     "api/index.js, maxDuration 60 s, regione iad1 predefinita. Esegue {avv,mw,rot,srv,gcd,man,wrk,reg,llm,dat,arc,log}", livello="Applicazione",
     descr="Funzione serverless che esegue l'app Express; le analisi IA partono con waitUntil dopo la risposta.",
     dove="Vercel", file="api/index.js, vercel.json (functions), DEPLOY-VERCEL.md")
nodo("f_crn", "fisica", "esterno", (1990, Y0 + 990, 240, 150), "Vercel Cron", "03:00 UTC — {crn}",
     livello="Servizi esterni", descr="Scheduler della piattaforma Vercel.", dove="Vercel", file="vercel.json (crons)")
nodo("f_bld", "fisica", "infra", (740, Y0 + 1300, 470, 170), "Vercel Build",
     "npm ci + npm run build:vercel ({cli}) → public/ e funzione", livello="Applicazione",
     descr="Ambiente di build di Vercel, avviato a ogni push sul branch di produzione.",
     dove="Vercel", file="vercel.json (installCommand, buildCommand), server/scripts/build-vercel.js")
nodo("f_blb", "fisica", "dati", (1310, Y0 + 1300, 520, 170), "Vercel Blob store privato",
     "BLOB_STORE_ID + OIDC oppure BLOB_READ_WRITE_TOKEN — {blb}", livello="Dati",
     descr="Object storage gestito da Vercel, collegato al progetto.", dove="Vercel",
     file="DEPLOY-VERCEL.md §5, server/src/config/env.js")
nodo("f_dbx", "fisica", "dati", (2310, Y0 + 1290, 310, 200), "MySQL 8 gestito",
     "provider esterno a scelta, TLS (DB_SSL=true) — {db}", incerto=True, livello="Dati",
     descr="Database remoto usato in produzione con Vercel: il provider non è indicato nel repository.",
     motivo="DEPLOY-VERCEL.md richiede un MySQL 8 esterno con TLS ed elenca solo esempi (Aiven, DigitalOcean, AWS RDS, "
            "Cloud SQL, Azure): quale servizio venga usato davvero non risulta dal codice né dalla configurazione.",
     dove="Cloud del provider", file="DEPLOY-VERCEL.md §1, .env.production.example")
nodo("f_til", "fisica", "esterno", (3100, Y0 + 110, 400, 100), "tile.openstreetmap.org", "HTTPS 443 — {osm}",
     livello="Servizi esterni", descr="Server delle tessere OSM.", dove="Internet", file="client/js/mappa.js")
nodo("f_nom", "fisica", "esterno", (2720, Y0 + 330, 380, 110), "nominatim.openstreetmap.org", "HTTPS 443 — {nom}",
     livello="Servizi esterni", descr="Server di geocodifica OSM.", dove="Internet", file=".env.example (GEOCODING_URL)")
nodo("f_mis", "fisica", "esterno", (3120, Y0 + 330, 380, 110), "api.mistral.ai", "HTTPS 443, UE — {mis}",
     livello="Servizi esterni", descr="Endpoint del fornitore Mistral.", dove="Internet", file="server/src/ai/providers/index.js")
nodo("f_grq", "fisica", "esterno", (2720, Y0 + 510, 380, 110), "api.groq.com", "HTTPS 443, USA — {grq}",
     livello="Servizi esterni", descr="Endpoint del fornitore Groq (facoltativo).", dove="Internet",
     file="server/src/ai/providers/index.js")
nodo("f_npm", "fisica", "esterno", (2720, Y0 + 810, 380, 110), "registry.npmjs.org", "pacchetti npm (package-lock.json)",
     livello="Servizi esterni", descr="Registro da cui npm ci scarica le dipendenze.", dove="Internet", file="package-lock.json")
nodo("f_hub", "fisica", "esterno", (3120, Y0 + 810, 380, 110), "Docker Hub", "node:22-bookworm-slim, mysql:8.4",
     incerto=True, livello="Servizi esterni",
     descr="Registro predefinito da cui Docker scarica le immagini base (non indicato esplicitamente).",
     motivo="Dockerfile, docker-compose.yml e il workflow usano node:22-bookworm-slim e mysql:8.4 senza indicare un registro: "
            "Docker Hub è il registro predefinito, ma potrebbe essere sostituito da un mirror o da un registro privato.",
     dove="Internet", file="Dockerfile, docker-compose.yml, .github/workflows/test.yml")
nodo("f_gh", "fisica", "esterno", (90, Y0 + 960, 470, 110), "Repository GitHub", "GabriWasef/la-nostra-citta-webapp",
     livello="Servizi esterni", descr="Repository del codice; sorgente per la CI e per i deploy Vercel.", dove="GitHub",
     file="README.md, DEPLOY-VERCEL.md §4")
nodo("f_ci", "fisica", "infra", (90, Y0 + 1170, 470, 140), "Runner GitHub Actions",
     "ubuntu-latest, Node 22: npm ci, test, build:vercel, npm audit", livello="Applicazione",
     descr="Esegue il workflow Test a ogni push su main e a ogni pull request.", dove="GitHub",
     file=".github/workflows/test.yml")
nodo("f_cim", "fisica", "dati", (90, Y0 + 1420, 470, 130), "Service container mysql:8.4", "database di test della CI — {db}",
     livello="Dati", descr="Database usa e getta per i test automatici.", dove="GitHub Actions",
     file=".github/workflows/test.yml (services)")

# --------------------------------------------------------------------------------------
# Dati: frecce (interazioni)
# --------------------------------------------------------------------------------------
# percorso: punti di ancoraggio e piegature.
#   ("T"|"B"|"L"|"R", id_nodo, frazione)  punto sul lato del nodo (frazione 0..1 lungo il lato)
#   ("H", x) / ("V", y)                   piegatura orizzontale / verticale fino a x / y
#   (x, y)                                punto assoluto
# etichetta: (indice del segmento, frazione) dove mettere il numero; predefinito: segmento più lungo.

FRECCE = []


def freccia(da, a, proto, protocollo, descr, file, percorso, etichetta=None, incerto=False, vista="logica", motivo=""):
    FRECCE.append(dict(da=da, a=a, proto=proto, protocollo=protocollo, descr=descr, file=file,
                       percorso=percorso, etichetta=etichetta, incerto=incerto, vista=vista, motivo=motivo))


# ---- Vista logica
freccia("vis", "pag", "ui", "Interfaccia web",
        "Consulta elenco, mappa, classifica e dettaglio delle segnalazioni pubbliche",
        "client/index.html, mappa.html, classifica.html, segnalazione.html",
        [("B", "vis", 0.5), ("T", "pag", 0.11)])
freccia("cit", "pag", "ui", "Interfaccia web",
        "Registrazione, accesso, nuova segnalazione con foto o video, sostegno, profilo",
        "client/registrazione.html, login.html, nuova-segnalazione.html, profilo.html",
        [("B", "cit", 0.5), ("T", "pag", 0.38)])
freccia("mod", "pag", "ui", "Interfaccia web",
        "Coda di moderazione, cambi di stato, nascondi/elimina, revisione delle analisi IA",
        "client/moderazione.html, client/js/pages/moderazione.js, segnalazione.js",
        [("B", "mod", 0.5), ("T", "pag", 0.64)])
freccia("adm", "pag", "ui", "Interfaccia web",
        "Utenti, quartieri, categorie, stati, registro delle operazioni, diagnostica",
        "client/admin.html, client/js/pages/admin.js",
        [("B", "adm", 0.5), ("T", "pag", 0.9)])
freccia("op", "cli", "ops", "Terminale (npm run …)",
        "Esegue db:migrate, db:seed, admin:create, db:svuota, worker, build:vercel (anche le varianti :remoto)",
        "package.json (scripts)",
        [("B", "op", 0.5), ("V", 465), ("H", 105), ("T", "cli", 0.05)], etichetta=(2, 0.33))
freccia("pag", "api", "chiamata", "Import di modulo ES",
        "Le pagine chiamano l'API solo tramite api.js", "client/js/pages/*.js, client/js/api.js",
        [("B", "pag", 0.06), ("T", "api", 0.5)])
freccia("pag", "map", "chiamata", "Import di modulo ES",
        "Crea mappe, marker e scelta del punto", "client/js/pages/mappa.js, nuova-segnalazione.js, client/js/mappa.js",
        [("B", "pag", 0.47), ("T", "map", 0.5)])
freccia("pag", "car", "chiamata", "Import dinamico",
        "Caricamento diretto se /api/v1/config indica l'archivio blob",
        "client/js/pages/nuova-segnalazione.js, client/js/caricamento.js, server/src/routes/catalogo.routes.js",
        [("B", "pag", 0.82), ("T", "car", 0.5)])
freccia("pag", "geo", "chiamata", "API JavaScript del browser",
        "getCurrentPosition: posizione attuale per la segnalazione e per la mappa",
        "client/js/pages/nuova-segnalazione.js, client/js/mappa.js",
        [("R", "pag", 0.7), ("H", 2220), ("T", "geo", 0.5)], etichetta=(1, 0.5))
freccia("pag", "sta", "https", "HTTP(S) GET",
        "Scarica pagine HTML, CSS, JS, Leaflet (/vendor/leaflet) e blob-client.js",
        "server/src/app.js (express.static), vercel.json, server/scripts/build-vercel.js",
        [("B", "pag", 0.29), ("T", "sta", 0.5)])
freccia("api", "mw", "https", "HTTP(S) REST/JSON",
        "Richieste /api/v1 (fetch; XHR multipart per gli allegati) con il cookie di sessione lnc.sid",
        "client/js/api.js, server/src/app.js",
        [("B", "api", 0.37), ("T", "mw", 0.1)], etichetta=(0, 0.75))
freccia("car", "mw", "https", "HTTP(S) POST JSON",
        "POST /api/v1/allegati/upload: chiede un token client o un URL pre-firmato per un file",
        "client/js/caricamento.js, server/src/routes/segnalazioni.routes.js",
        [("B", "car", 0.17), ("T", "mw", 0.75)], etichetta=(0, 0.75))
freccia("car", "blb", "https", "HTTPS PUT (SDK @vercel/blob/client)",
        "Carica i file in tmp/<id_utente>/ (multipart oltre 10 MB)",
        "client/js/caricamento.js, server/scripts/blob-client.entry.js",
        [("B", "car", 0.9), ("V", 890), ("H", 2885), ("V", 660), ("L", "blb", 0)], etichetta=(1, 0.62))
freccia("pag", "blb", "https", "HTTPS GET (link firmato)",
        "Scarica l'allegato dal link firmato a scadenza ricevuto con il redirect 302 di /api/v1/allegati/:id",
        "server/src/storage/blobStorage.js (send), vercel.json (CSP img-src, media-src)",
        [("R", "pag", 0.3), ("L", "blb", 0)], etichetta=(0, 0.62))
freccia("map", "osm", "https", "HTTPS GET",
        "Tessere PNG {z}/{x}/{y} della mappa", "client/js/mappa.js (URL_TESSERE)",
        [("B", "map", 0.76), ("V", 930), ("L", "osm", 0)], etichetta=(1, 0.55))
freccia("crn", "mw", "https", "HTTPS GET + Bearer",
        "GET /api/v1/interno/manutenzione ogni giorno, con Authorization: Bearer CRON_SECRET",
        "vercel.json (crons), server/src/controllers/interno.controller.js",
        [("L", "crn", 0.5), ("H", 1850), ("T", "mw", 0)], etichetta=(0, 0.45))
freccia("avv", "mw", "chiamata", "Chiamata di funzione",
        "createApp(): monta middleware, router e file statici",
        "server/src/server.js, api/index.js, server/src/app.js",
        [("R", "avv", 0.35), ("L", "mw", 0)])
freccia("avv", "dat", "chiamata", "Chiamata di funzione (SQL)",
        "All'avvio verifica la versione di MySQL e le migrazioni in sospeso",
        "server/src/server.js, server/src/config/migrazioni.js",
        [("B", "avv", 0.5), ("V", 1980), ("L", "dat", 0)], etichetta=(0, 0.35))
freccia("avv", "wrk", "chiamata", "Timer (setTimeout)",
        "avviaWorker(AI_WORKER_INTERVAL_MS) se l'intervallo è maggiore di 0",
        "server/src/server.js, server/src/ai/worker.js",
        [("R", "avv", 0.85), ("H", 1930), ("V", 1580), ("H", 2000), ("T", "wrk", 0)], etichetta=(0, 0.88))
freccia("mw", "rot", "chiamata", "Catena Express",
        "Passa la richiesta autenticata e validata (req.user, req.valid, req.files)",
        "server/src/app.js, server/src/routes/index.js",
        [("B", "mw", 0.5), ("T", "rot", 0.5)])
freccia("mw", "dat", "chiamata", "Chiamata di funzione (SQL)",
        "Sessioni (MySqlSessionStore), utente e ruolo riletti a ogni richiesta, contatori dei limiti",
        "server/src/config/sessionStore.js, server/src/config/rateLimitStore.js, server/src/middlewares/auth.js, server/src/middlewares/security.js",
        [("L", "mw", 0.9), ("H", 460), ("V", 1930), ("L", "dat", 0)], etichetta=(1, 0.15))
freccia("rot", "srv", "chiamata", "Chiamata di funzione",
        "Autenticazione, utenti, segnalazioni, sostegni, moderazione, catalogo, audit",
        "server/src/controllers/*.js",
        [("B", "rot", 0.147), ("T", "srv", 0.5)])
freccia("rot", "gcd", "chiamata", "Chiamata di funzione",
        "GET /geocodifica/cerca e /geocodifica/inversa", "server/src/routes/geocodifica.routes.js",
        [("B", "rot", 0.44), ("T", "gcd", 0.5)])
freccia("rot", "man", "chiamata", "Chiamata di funzione",
        "/interno/manutenzione e /admin/diagnostica",
        "server/src/controllers/interno.controller.js, server/src/routes/admin.routes.js",
        [("B", "rot", 0.78), ("T", "man", 0.5)])
freccia("rot", "wrk", "chiamata", "waitUntil (@vercel/functions)",
        "Dopo l'invio di una segnalazione avvia le analisi in coda (solo su Vercel)",
        "server/src/controllers/segnalazione.controller.js, server/src/ai/worker.js",
        [("R", "rot", 0.82), ("H", 2050), ("T", "wrk", 0)], etichetta=(1, 0.55))
freccia("rot", "blb", "https", "SDK @vercel/blob (HTTPS)",
        "Autorizza il caricamento diretto: handleUpload / issueSignedToken per un solo file in tmp/",
        "server/src/controllers/allegati.controller.js",
        [("R", "rot", 0.36), ("H", 2910), ("V", 745), ("L", "blb", 0)], etichetta=(0, 0.72), incerto=True,
        motivo="La rotta usa l'SDK @vercel/blob (handleUpload con BLOB_READ_WRITE_TOKEN, handleUploadPresigned e "
               "issueSignedToken con OIDC). Dal solo codice del progetto non si vede se l'SDK contatti il servizio "
               "per emettere il token o lo firmi in locale: le dipendenze non sono incluse nel repository.")
freccia("mw", "log", "chiamata", "Chiamata di funzione",
        "Errori ed eventi in JSON; in sviluppo anche il link di recupero password (nessun invio e-mail)",
        "server/src/middlewares/errorHandler.js, server/src/controllers/auth.controller.js, server/src/utils/logger.js",
        [("L", "mw", 0.13), ("H", 265), ("B", "log", 0.5)], etichetta=(0, 0.45))
freccia("srv", "reg", "chiamata", "Chiamata di funzione",
        "Moderazione e classificazione a regole durante l'invio (testo BLOCCATO: errore 422)",
        "server/src/services/segnalazione.service.js, server/src/ai/index.js",
        [("B", "srv", 0.95), ("V", 1790), ("H", 2090), ("T", "reg", 0)], etichetta=(1, 0.08))
freccia("srv", "dat", "chiamata", "Chiamata di funzione (SQL)",
        "CRUD, transazioni, accodamento dei job IA, registro log_operazione",
        "server/src/services/*.service.js, server/src/repositories/*.js, server/src/utils/audit.js",
        [("B", "srv", 0.3), ("T", "dat", 0)])
freccia("srv", "arc", "chiamata", "Chiamata di funzione",
        "Salva gli allegati ricodificati (sharp, EXIF, pHash), li elimina, li serve, scarica i temporanei",
        "server/src/services/media.service.js, server/src/services/segnalazione.service.js",
        [("B", "srv", 0.8), ("V", 1845), ("H", 1500), ("T", "arc", 0)], etichetta=(1, 0.3))
freccia("gcd", "nom", "https", "HTTPS GET (fetch)",
        "/search e /reverse in jsonv2: User-Agent, 1 richiesta al secondo, cache 24 ore",
        "server/src/services/geocodifica.service.js",
        [("T", "gcd", 0.87), ("V", 1560), ("H", 2860), ("V", 1455), ("L", "nom", 0)], etichetta=(1, 0.62))
freccia("gcd", "dat", "chiamata", "Chiamata di funzione (SQL)",
        "Elenco dei quartieri per abbinare l'indirizzo trovato", "server/src/services/geocodifica.service.js",
        [("B", "gcd", 0.5), ("T", "dat", 0)])
freccia("man", "wrk", "chiamata", "Chiamata di funzione",
        "Rimette in coda i job interrotti ed elabora la coda", "server/src/services/manutenzione.service.js",
        [("R", "man", 0.47), ("L", "wrk", 0)])
freccia("man", "dat", "chiamata", "Chiamata di funzione (SQL)",
        "Elimina sessioni, limiti e token scaduti; diagnostica di database e migrazioni",
        "server/src/services/manutenzione.service.js, server/src/services/diagnostica.service.js",
        [("B", "man", 0.05), ("V", 1868), ("H", 1265), ("T", "dat", 0)], etichetta=(0, 0.5))
freccia("man", "arc", "chiamata", "Chiamata di funzione (+ HTTPS GET)",
        "Elimina i temporanei più vecchi di 24 ore; diagnostica: scrive, legge e scarica dal link firmato",
        "server/src/services/manutenzione.service.js, server/src/services/diagnostica.service.js",
        [("B", "man", 0.6), ("T", "arc", 0)], etichetta=(0, 0.25))
freccia("man", "gcd", "chiamata", "Chiamata di funzione",
        "Diagnostica: ricerca di prova \"Piazza del Duomo\"", "server/src/services/diagnostica.service.js",
        [("L", "man", 0.65), ("R", "gcd", 0)])
freccia("wrk", "dat", "chiamata", "Chiamata di funzione (SQL)",
        "Prende un job (FOR UPDATE SKIP LOCKED), salva analisi_ia, completa, rimanda o fa fallire il job",
        "server/src/ai/worker.js, server/src/repositories/analisi.repository.js",
        [("L", "wrk", 0.93), ("H", 1880), ("V", 2045), ("H", 1000), ("B", "dat", 0)], etichetta=(2, 0.12))
freccia("wrk", "reg", "chiamata", "Chiamata di funzione",
        "Analisi tecnica delle immagini e verifica di autenticità (EXIF, foto riusate)",
        "server/src/ai/worker.js, server/src/ai/visione.js, server/src/ai/autenticita.js",
        [("B", "wrk", 0.5), ("T", "reg", 0)])
freccia("wrk", "llm", "chiamata", "Chiamata di funzione",
        "analizzaTesto (moderazione + classificazione) e verificaPertinenza dell'immagine",
        "server/src/ai/worker.js, server/src/ai/providers/index.js",
        [("R", "wrk", 0.4), ("L", "llm", 0)])
freccia("wrk", "arc", "chiamata", "Chiamata di funzione",
        "Legge l'immagine da analizzare dall'archivio", "server/src/ai/worker.js",
        [("B", "wrk", 0.07), ("V", 1860), ("H", 1820), ("V", 1960), ("R", "arc", 0)], etichetta=(0, 0.75))
freccia("llm", "mis", "https", "HTTPS POST JSON + Bearer",
        "POST /v1/chat/completions: testo, categorie e foto ridotta senza metadati; risposta JSON",
        "server/src/ai/providers/index.js, server/src/ai/providers/openaiCompatibile.js",
        [("R", "llm", 0.5), ("L", "mis", 0)])
freccia("llm", "grq", "https", "HTTPS POST JSON + Bearer",
        "POST /openai/v1/chat/completions, solo come fallback (dati elaborati fuori dall'UE)",
        "server/src/ai/providers/index.js",
        [("B", "llm", 0.8), ("V", 1885), ("L", "grq", 0)], etichetta=(1, 0.45))
freccia("llm", "dat", "chiamata", "Chiamata di funzione (SQL)",
        "Prenota le richieste al minuto e al giorno in limite_richieste (AI_MAX_RPM/RPD)",
        "server/src/ai/providers/limiti.js, server/src/config/rateLimitStore.js",
        [("B", "llm", 0.2), ("V", 2090), ("H", 1100), ("B", "dat", 0)], etichetta=(1, 0.08))
freccia("dat", "db", "sql", "Protocollo MySQL (mysql2), TLS facoltativo",
        "Query parametrizzate e transazioni; fuso orario UTC; DB_SSL per i database in cloud",
        "server/src/config/db.js, server/src/config/dbOptions.js",
        [("B", "dat", 0.25), ("T", "db", 0)], etichetta=(0, 0.35))
freccia("arc", "upl", "file", "File system",
        "Driver \"locale\": scrive e legge anno/mese/uuid.ext", "server/src/storage/localStorage.js",
        [("B", "arc", 0.5), ("T", "upl", 0)], etichetta=(0, 0.35))
freccia("arc", "blb", "https", "HTTPS (SDK @vercel/blob)",
        "Driver \"blob\": put, get, del, list; firma dei link di lettura",
        "server/src/storage/blobStorage.js",
        [("B", "arc", 0.85), ("V", 2135), ("H", 2935), ("V", 775), ("L", "blb", 0)], etichetta=(1, 0.75))
freccia("cli", "db", "sql", "Protocollo MySQL (connessione mysql2)",
        "Migrazioni, dati di base, creazione dell'amministratore, svuotamento",
        "server/scripts/migrate.js, seed.js, create-admin.js, svuota-segnalazioni.js",
        [("B", "cli", 0.5), ("V", 2455), ("L", "db", 0)], etichetta=(1, 0.5))
freccia("cli", "srv", "chiamata", "Import di moduli",
        "Seed dimostrativo: crea segnalazioni tramite il servizio, con immagini generate da sharp",
        "server/scripts/seed.js",
        [("R", "cli", 0.1), ("H", 430), ("V", 1700), ("L", "srv", 0)], etichetta=(1, 0.2))
freccia("cli", "wrk", "chiamata", "Import di moduli",
        "npm run worker [-- --once]: worker IA come processo separato",
        "server/scripts/worker.js",
        [("R", "cli", 0.9), ("H", 1850), ("V", 1745), ("L", "wrk", 0)], etichetta=(0, 0.14))

# ---- Vista fisica
Yf = Y0
freccia("f_dev", "f_rp", "https", "HTTPS 443", "Pagine e API /api/v1 (senza proxy, in sviluppo: direttamente sulla porta 3000)",
        "README.md, docker-compose.yml (ports)", [("R", "f_dev", 0.4), ("L", "f_rp", 0)],
        vista="fisica", incerto=True, etichetta=(0, 0.45),
        motivo="Dipende dal reverse proxy dedotto: senza proxy il browser raggiunge direttamente la porta 3000 del container.")
freccia("f_rp", "f_app", "https", "HTTP :3000 + X-Forwarded-*", "Inoltro al container (TRUST_PROXY=true)",
        ".env.example, docker-compose.yml", [("R", "f_rp", 0.5), ("L", "f_app", 0)], vista="fisica", incerto=True,
        motivo="Dipende dal reverse proxy dedotto; la porta 3000 e TRUST_PROXY sono invece nella configurazione.")
freccia("f_app", "f_my", "sql", "TCP 3306 (rete interna di Compose)", "DB_HOST=mysql; l'app parte solo dopo l'healthcheck del database",
        "docker-compose.yml (depends_on, environment)", [("B", "f_app", 0.5), ("T", "f_my", 0)], vista="fisica")
freccia("f_app", "f_vu", "file", "Volume Docker", "Allegati scritti e letti in /app/uploads",
        "docker-compose.yml (volumes), Dockerfile", [("B", "f_app", 0.08), ("V", Yf + 445), ("R", "f_vu", 0)],
        vista="fisica", etichetta=(1, 0.5))
freccia("f_my", "f_vm", "file", "Volume Docker", "File del database in /var/lib/mysql",
        "docker-compose.yml (volumes)", [("L", "f_my", 0.85), ("R", "f_vm", 0)], vista="fisica")
freccia("f_dev", "f_cdn", "https", "HTTPS 443", "Pagine statiche e chiamate /api/* del sito pubblicato",
        "vercel.json", [("R", "f_dev", 0.75), ("H", 670), ("V", Yf + 1065), ("L", "f_cdn", 0)],
        vista="fisica", etichetta=(1, 0.62))
freccia("f_dev", "f_blb", "https", "HTTPS PUT / GET", "Caricamento diretto in tmp/ e download degli allegati con link firmato",
        "client/js/caricamento.js, server/src/storage/blobStorage.js",
        [("R", "f_dev", 0.95), ("H", 640), ("V", Yf + 1515), ("H", 1570), ("B", "f_blb", 0)],
        vista="fisica", etichetta=(2, 0.6))
freccia("f_cdn", "f_fn", "https", "Rewrite interno", "/api/:path* inoltrato alla funzione /api",
        "vercel.json (rewrites)", [("R", "f_cdn", 0.4), ("L", "f_fn", 0)], vista="fisica")
freccia("f_crn", "f_fn", "https", "HTTPS GET + Bearer", "Manutenzione giornaliera /api/v1/interno/manutenzione",
        "vercel.json (crons)", [("L", "f_crn", 0.3), ("R", "f_fn", 0)], vista="fisica")
freccia("f_fn", "f_blb", "https", "HTTPS (SDK, OIDC o token)", "Salva, legge, elimina, elenca gli allegati; firma i link",
        "server/src/storage/blobStorage.js", [("B", "f_fn", 0.5), ("T", "f_blb", 0)], vista="fisica")
freccia("f_fn", "f_dbx", "sql", "TCP 3306 + TLS", "Accesso al database remoto (DB_SSL=true, DB_CONNECTION_LIMIT=3)",
        ".env.production.example, server/src/config/dbOptions.js",
        [("R", "f_fn", 0.8), ("H", 1900), ("V", Yf + 1385), ("L", "f_dbx", 0)], vista="fisica",
        etichetta=(2, 0.5))
freccia("f_dev", "f_til", "https", "HTTPS 443", "Tessere della mappa scaricate dal browser",
        "client/js/mappa.js", [("T", "f_dev", 0.5), ("V", Yf + 20), ("H", 3300), ("T", "f_til", 0)],
        vista="fisica", etichetta=(1, 0.5))
freccia("f_app", "c_api", "https", "HTTPS 443 in uscita", "Verso Nominatim, Mistral e Groq (questi ultimi se configurati)",
        "server/src/services/geocodifica.service.js, server/src/ai/providers/index.js",
        [("R", "f_app", 0.85), ("L", "c_api", 0)], vista="fisica", etichetta=(0, 0.55))
freccia("f_fn", "c_api", "https", "HTTPS 443 in uscita", "Verso Nominatim, Mistral e Groq (questi ultimi se configurati)",
        "server/src/services/geocodifica.service.js, server/src/ai/providers/index.js",
        [("T", "f_fn", 0.75), ("V", Yf + 860), ("H", 2620), ("V", Yf + 600), ("L", "c_api", 0)],
        vista="fisica", etichetta=(1, 0.82))
freccia("f_pc", "c_dock", "ops", "Docker CLI / npm", "docker compose up --build e exec (create-admin, seed); npm run db:* su 127.0.0.1:3306",
        "README.md (Opzione A e B), docker-compose.yml", [("R", "f_pc", 0.3), ("L", "c_dock", 0)],
        vista="fisica", etichetta=(0, 0.25))
freccia("f_pc", "f_dbx", "sql", "TCP 3306 + TLS", "npm run db:migrate:remoto, db:seed:remoto, admin:create:remoto, db:svuota:remoto",
        "package.json, .env.production.example",
        [("R", "f_pc", 0.92), ("H", 605), ("V", Yf + 820), ("H", 2400), ("T", "f_dbx", 0)],
        vista="fisica", etichetta=(2, 0.82))
freccia("f_pc", "f_gh", "ops", "git push (HTTPS o SSH)", "Pubblica il codice sul repository",
        "README.md, docs/CONFIGURAZIONE-MANUALE.md §4", [("B", "f_pc", 0.4), ("T", "f_gh", 0)], vista="fisica")
freccia("f_gh", "f_ci", "ops", "Evento GitHub Actions", "Push su main e pull request avviano il workflow Test",
        ".github/workflows/test.yml (on)", [("B", "f_gh", 0.5), ("T", "f_ci", 0)], vista="fisica")
freccia("f_ci", "f_cim", "sql", "TCP 3306", "npm test su un database usa e getta",
        ".github/workflows/test.yml (services, env)", [("B", "f_ci", 0.5), ("T", "f_cim", 0)], vista="fisica")
freccia("f_gh", "f_bld", "ops", "Integrazione Git di Vercel", "Deploy a ogni push sul branch di produzione (main)",
        "DEPLOY-VERCEL.md §4", [("R", "f_gh", 0.5), ("H", 615), ("V", Yf + 1385), ("L", "f_bld", 0)],
        vista="fisica", etichetta=(1, 0.75))
freccia("f_bld", "f_cdn", "ops", "Pubblicazione del deploy", "Pubblica la cartella public/ sulla CDN",
        "vercel.json (outputDirectory), server/scripts/build-vercel.js", [("T", "f_bld", 0.5), ("B", "f_cdn", 0)],
        vista="fisica")
freccia("f_bld", "f_fn", "ops", "Pubblicazione del deploy", "Crea la funzione da api/index.js (con node_modules)",
        "vercel.json (functions.includeFiles)",
        [("R", "f_bld", 0.15), ("H", 1260), ("V", Yf + 1225), ("H", 1450), ("B", "f_fn", 0)],
        vista="fisica", etichetta=(2, 0.5))
freccia("c_dock", "c_reg", "https", "HTTPS (docker pull, npm ci)",
        "Scarica le immagini node:22-bookworm-slim e mysql:8.4 e, nella build dell'immagine, le dipendenze npm",
        "Dockerfile, docker-compose.yml", [("R", "c_dock", 0.9), ("H", 2640), ("V", Yf + 790), ("L", "c_reg", 0)],
        vista="fisica", incerto=True, etichetta=(0, 0.55),
        motivo="Le immagini base arrivano dal registro predefinito di Docker (Docker Hub, dedotto); npm ci nella build "
               "dell'immagine scarica invece da registry.npmjs.org, come indicato in package-lock.json.")
freccia("f_bld", "c_reg", "https", "HTTPS (npm ci)", "Scarica le dipendenze per la build",
        "vercel.json (installCommand), package-lock.json",
        [("B", "f_bld", 0.3), ("V", Yf + 1580), ("H", 2655), ("V", Yf + 930), ("L", "c_reg", 0)],
        vista="fisica", etichetta=(1, 0.8))
freccia("f_ci", "c_reg", "https", "HTTPS (npm ci, immagine del servizio)", "Scarica le dipendenze e l'immagine mysql:8.4 della CI",
        ".github/workflows/test.yml",
        [("R", "f_ci", 0.5), ("H", 590), ("V", Yf + 1620), ("H", 2670), ("V", Yf + 1010), ("L", "c_reg", 0)],
        vista="fisica", etichetta=(2, 0.9))

for i, f in enumerate(FRECCE, start=1):
    f["n"] = i

assegna_codici(["vis", "cit", "mod", "adm", "op", "pag", "api", "map", "car", "geo",
                "sta", "avv", "mw", "rot", "srv", "gcd", "man", "wrk", "reg", "llm", "dat", "arc", "log", "cli",
                "db", "upl", "blb", "osm", "crn", "nom", "mis", "grq"])


# --------------------------------------------------------------------------------------
# Disegno
# --------------------------------------------------------------------------------------

def sc(v):
    return int(round(v * S))


PROFONDITA_3D = 16  # spessore delle facce superiore e destra delle scatole 3D


def ancora(lato, id_, frazione):
    x, y, w, h = NODI[id_]["box"]
    if NODI[id_]["tipo"] == "infra":
        # le frecce arrivano oltre le facce 3D, altrimenti la punta resterebbe coperta
        y, w, h = y - PROFONDITA_3D, w + PROFONDITA_3D, h + PROFONDITA_3D
    return {
        "T": (x + w * frazione, y),
        "B": (x + w * frazione, y + h),
        "L": (x, y + h * frazione),
        "R": (x + w, y + h * frazione),
    }[lato]


def _allinea(nuovo, lato, id_, prec):
    """Sposta il punto d'ancoraggio sul lato del nodo per allinearlo al punto precedente (segmenti ortogonali)."""
    x, y, w, h = NODI[id_]["box"]
    if lato in "TB" and x + 4 <= prec[0] <= x + w - 4:
        return (prec[0], nuovo[1])
    if lato in "LR" and y + 4 <= prec[1] <= y + h - 4:
        return (nuovo[0], prec[1])
    return nuovo


def punti_percorso(percorso):
    punti = []
    for p in percorso:
        if isinstance(p[0], str) and p[0] in "TBLR" and len(p) == 3:
            nuovo = ancora(*p)
            if punti:
                nuovo = _allinea(nuovo, p[0], p[1], punti[-1])
                px, py = punti[-1]
                if px != nuovo[0] and py != nuovo[1]:
                    # ancora non allineata: gomito a metà strada
                    if p[0] in "TB":
                        ym = (py + nuovo[1]) / 2
                        punti += [(px, ym), (nuovo[0], ym)]
                    else:
                        xm = (px + nuovo[0]) / 2
                        punti += [(xm, py), (xm, nuovo[1])]
            punti.append(nuovo)
        elif p[0] == "H":
            punti.append((p[1], punti[-1][1]))
        elif p[0] == "V":
            punti.append((punti[-1][0], p[1]))
        else:
            punti.append(tuple(p))
    return punti


def avvolgi(testo, font, larghezza):
    parole, righe, riga = testo.split(), [], ""
    for p in parole:
        prova = f"{riga} {p}".strip()
        if font.getlength(prova) <= larghezza * S:
            riga = prova
        else:
            if riga:
                righe.append(riga)
            riga = p
    if riga:
        righe.append(riga)
    return righe


def tratteggio(d, punti, colore, spessore, trattino=14, vuoto=9):
    for (x1, y1), (x2, y2) in zip(punti, punti[1:]):
        lung = ((x2 - x1) ** 2 + (y2 - y1) ** 2) ** 0.5
        if lung == 0:
            continue
        dx, dy = (x2 - x1) / lung, (y2 - y1) / lung
        t = 0
        while t < lung:
            t2 = min(t + trattino * S, lung)
            d.line([(x1 + dx * t, y1 + dy * t), (x1 + dx * t2, y1 + dy * t2)], fill=colore, width=spessore)
            t = t2 + vuoto * S


def disegna_nodo(d, n):
    x, y, w, h = n["box"]
    X, Y, W, H = sc(x), sc(y), sc(w), sc(h)
    riemp, bordo, _ = TIPI[n["tipo"]]
    sp = sc(2.5)
    area_testo = (x + 14, y, w - 28, h)
    if n["tipo"] == "utente":
        d.rounded_rectangle([X, Y, X + W, Y + H], radius=sc(h / 2), fill=riemp, outline=bordo, width=sp)
        # icona della persona
        cx, cy = X + sc(46), Y + H // 2
        d.ellipse([cx - sc(13), cy - sc(32), cx + sc(13), cy - sc(6)], fill=bordo)
        d.pieslice([cx - sc(24), cy - sc(2), cx + sc(24), cy + sc(44)], 180, 360, fill=bordo)
        area_testo = (x + 80, y, w - 100, h)
    elif n["tipo"] == "software":
        d.rounded_rectangle([X, Y, X + W, Y + H], radius=sc(14), fill=riemp, outline=bordo, width=sp)
    elif n["tipo"] == "dati":
        e = sc(26)
        d.rectangle([X, Y + e // 2, X + W, Y + H - e // 2], fill=riemp)
        d.ellipse([X, Y + H - e, X + W, Y + H], fill=riemp, outline=bordo, width=sp)
        d.rectangle([X + sp, Y + e // 2, X + W - sp, Y + H - e // 2], fill=riemp)
        d.line([X, Y + e // 2, X, Y + H - e // 2], fill=bordo, width=sp)
        d.line([X + W, Y + e // 2, X + W, Y + H - e // 2], fill=bordo, width=sp)
        d.ellipse([X, Y, X + W, Y + e], fill=riemp, outline=bordo, width=sp)
        area_testo = (x + 14, y + 26, w - 28, h - 34)
    elif n["tipo"] == "esterno":
        d.rectangle([X, Y, X + W, Y + H], fill=riemp)
        tratteggio(d, [(X, Y), (X + W, Y), (X + W, Y + H), (X, Y + H), (X, Y)], bordo, sp)
    elif n["tipo"] == "infra":
        p = sc(PROFONDITA_3D)
        d.polygon([(X, Y), (X + p, Y - p), (X + W + p, Y - p), (X + W, Y)], fill="#D5DCE1", outline=bordo)
        d.polygon([(X + W, Y), (X + W + p, Y - p), (X + W + p, Y + H - p), (X + W, Y + H)], fill="#BFC8CF", outline=bordo)
        d.rectangle([X, Y, X + W, Y + H], fill=riemp, outline=bordo, width=sp)
    if n["incerto"]:
        # bordo rosso puntinato aggiuntivo per gli elementi dedotti
        tratteggio(d, [(X - sc(6), Y - sc(6)), (X + W + sc(6), Y - sc(6)), (X + W + sc(6), Y + H + sc(6)),
                       (X - sc(6), Y + H + sc(6)), (X - sc(6), Y - sc(6))], "#C62828", sc(2), 6, 6)

    # codice dell'attore in alto a sinistra
    fc = F(15, "semibold")
    pos_codice = {"utente": (X + sc(78), Y + sc(10)), "dati": (X + sc(10), Y + sc(30))}
    d.text(pos_codice.get(n["tipo"], (X + sc(8), Y + sc(5))), n["codice"], fill=bordo, font=fc)

    tx, ty, tw, th = area_testo
    ft, fr = F(23, "bold"), F(17)
    righe_t = avvolgi(n["nome"], ft, tw)
    righe_r = avvolgi(risolvi(n["righe"]), fr, tw) if n["righe"] else []
    alt = len(righe_t) * 29 + len(righe_r) * 22 + (4 if righe_r else 0)
    yy = ty + (th - alt) / 2 + 4
    for r in righe_t:
        lw = ft.getlength(r) / S
        d.text((sc(tx + (tw - lw) / 2), sc(yy)), r, fill=TESTO, font=ft)
        yy += 29
    yy += 4
    for r in righe_r:
        lw = fr.getlength(r) / S
        d.text((sc(tx + (tw - lw) / 2), sc(yy)), r, fill=TESTO_TENUE, font=fr)
        yy += 22


def disegna_frecce(d, frecce):
    # 1) alone bianco sotto tutte le linee: gli incroci restano leggibili
    for f in frecce:
        pts = [(sc(x), sc(y)) for x, y in punti_percorso(f["percorso"])]
        d.line(pts, fill="white", width=sc(9), joint="curve")
    # 2) linee e punte
    for f in frecce:
        colore = PROTOCOLLI[f["proto"]][0]
        pts = [(sc(x), sc(y)) for x, y in punti_percorso(f["percorso"])]
        if f["incerto"]:
            tratteggio(d, pts, colore, sc(3), 12, 7)
        else:
            d.line(pts, fill=colore, width=sc(3), joint="curve")
        (x1, y1), (x2, y2) = pts[-2], pts[-1]
        lung = max(((x2 - x1) ** 2 + (y2 - y1) ** 2) ** 0.5, 1)
        ux, uy = (x2 - x1) / lung, (y2 - y1) / lung
        L, Wd = sc(18), sc(8)
        bx, by = x2 - ux * L, y2 - uy * L
        d.polygon([(x2, y2), (bx - uy * Wd, by + ux * Wd), (bx + uy * Wd, by - ux * Wd)], fill=colore)


def posizione_etichetta(f):
    pts = punti_percorso(f["percorso"])
    segmenti = list(zip(pts, pts[1:]))
    if f["etichetta"]:
        i, t = f["etichetta"]
    else:
        lunghezze = [abs(b[0] - a[0]) + abs(b[1] - a[1]) for a, b in segmenti]
        i, t = lunghezze.index(max(lunghezze)), 0.5
    (x1, y1), (x2, y2) = segmenti[i]
    return x1 + (x2 - x1) * t, y1 + (y2 - y1) * t


def disegna_etichette(d, frecce):
    fn = F(17, "bold")
    for f in frecce:
        colore = PROTOCOLLI[f["proto"]][0]
        x, y = posizione_etichetta(f)
        testo = str(f["n"]) + ("*" if f["incerto"] else "")
        r = 17 if len(testo) < 3 else 21
        X, Y = sc(x), sc(y)
        d.ellipse([X - sc(r), Y - sc(r), X + sc(r), Y + sc(r)], fill="white", outline=colore, width=sc(3))
        lw = fn.getlength(testo)
        bb = fn.getbbox(testo)
        d.text((X - lw / 2, Y - (bb[1] + bb[3]) / 2), testo, fill=colore, font=fn)


def banda(d, box, titolo):
    x, y, w, h = box
    d.rounded_rectangle([sc(x), sc(y), sc(x + w), sc(y + h)], radius=sc(10), fill=BANDA_COLORE, outline=BANDA_BORDO, width=sc(2))
    d.text((sc(x + 60), sc(y + 8)), titolo.upper(), fill="#7A8794", font=F(17, "bold"))


def cornice(d, box, titolo):
    x, y, w, h = box
    tratteggio(d, [(sc(x), sc(y)), (sc(x + w), sc(y)), (sc(x + w), sc(y + h)), (sc(x), sc(y + h)), (sc(x), sc(y))],
               "#8796A3", sc(2), 10, 7)
    d.text((sc(x + 14), sc(y + 10)), titolo, fill="#455A64", font=F(19, "bold"))


def titolo_sezione(d, y, testo, sotto):
    d.rectangle([sc(40), sc(y), sc(LARGHEZZA - 40), sc(y + 56)], fill="#263238")
    d.text((sc(60), sc(y + 11)), testo, fill="white", font=F(28, "bold"))
    d.text((sc(60 + F(28, 'bold').getlength(testo) / S + 30), sc(y + 18)), sotto, fill="#CFD8DC", font=F(19))


def legenda(d, y0):
    """Legenda delle forme, dei colori e delle frecce. Restituisce l'altezza occupata."""
    titolo_sezione(d, y0, "LEGENDA", "forme, colori e significato di ogni freccia numerata")
    y = y0 + 90
    fb, fr = F(20, "bold"), F(18)
    # forme
    d.text((sc(60), sc(y)), "Forme degli attori", fill=TESTO, font=fb)
    yy = y + 40
    for i, (tipo, (_, _, descr)) in enumerate(TIPI.items()):
        bx = 60 + i * 700
        campione = dict(tipo=tipo, box=(bx, yy, 150, 70), nome="", righe="", incerto=False, codice="")
        disegna_nodo(d, campione)
        d.text((sc(bx + 170), sc(yy + 22)), descr, fill=TESTO, font=fr)
    yy += 110
    campione = dict(tipo="infra", box=(60, yy, 150, 70), nome="", righe="", incerto=True, codice="")
    disegna_nodo(d, campione)
    d.text((sc(230), sc(yy + 10)), "*  Elemento o freccia dedotti, non certi: bordo rosso puntinato o linea tratteggiata;",
           fill=TESTO, font=fr)
    d.text((sc(230), sc(yy + 36)), "   spiegazione nella sezione \"Punti incerti\" di docs/architettura.md.", fill=TESTO, font=fr)
    nl, nf = ORDINE_CODICI["logica"], ORDINE_CODICI["fisica"]
    d.text((sc(1400), sc(yy + 10)), f"L01…L{nl:02d}: codici degli attori logici;  F01…F{nf:02d}: codici degli attori fisici.",
           fill=TESTO, font=fr)
    d.text((sc(1400), sc(yy + 36)), "Nella vista fisica \"Esegue L..\" indica quali componenti logici girano su quel nodo.",
           fill=TESTO, font=fr)
    yy += 120
    # colori delle frecce
    d.text((sc(60), sc(yy)), "Colori delle frecce (meccanismo di comunicazione)", fill=TESTO, font=fb)
    yy += 42
    for i, (chiave, (colore, descr)) in enumerate(PROTOCOLLI.items()):
        bx = 60 + (i % 3) * 1160
        by = yy + (i // 3) * 40
        d.line([(sc(bx), sc(by + 12)), (sc(bx + 70), sc(by + 12))], fill=colore, width=sc(4))
        d.polygon([(sc(bx + 84), sc(by + 12)), (sc(bx + 66), sc(by + 4)), (sc(bx + 66), sc(by + 20))], fill=colore)
        d.text((sc(bx + 100), sc(by)), descr, fill=TESTO, font=fr)
    yy += 100
    # elenco delle frecce
    colonne = 3
    larg_col = (LARGHEZZA - 120) // colonne
    voci = []
    for f in FRECCE:
        da, a = NODI[f["da"]]["nome"], NODI[f["a"]]["nome"]
        voci.append((f, f"{da} → {a}: {f['descr']}  [{f['protocollo']}]"))
    fv, fn = F(17), F(17, "bold")
    righe_voci = [avvolgi(t, fv, larg_col - 80) for _, t in voci]
    altezze = [len(r) * 23 + 10 for r in righe_voci]
    # suddivisione in colonne bilanciate, con intestazioni delle due viste
    totale = sum(altezze) + 2 * 50
    obiettivo = totale / colonne
    col, cy, base = 0, yy, yy
    vista_corrente = None
    massimo = yy
    for (f, _), righe, h in zip(voci, righe_voci, altezze):
        intest = f["vista"] != vista_corrente
        richiesto = h + (50 if intest else 0)
        if cy - base + richiesto > obiettivo + 40 and col < colonne - 1:
            col += 1
            cy = base
        cx = 60 + col * larg_col
        if intest:
            vista_corrente = f["vista"]
            testo = "Frecce della vista logica" if vista_corrente == "logica" else "Frecce della vista fisica"
            d.text((sc(cx), sc(cy + 8)), testo, fill=TESTO, font=fb)
            cy += 50
        colore = PROTOCOLLI[f["proto"]][0]
        num = f"{f['n']}{'*' if f['incerto'] else ''}"
        d.ellipse([sc(cx), sc(cy - 2), sc(cx + 36), sc(cy + 34)], fill="white", outline=colore, width=sc(3))
        lw = fn.getlength(num)
        d.text((sc(cx + 18) - lw / 2, sc(cy + 6)), num, fill=colore, font=fn)
        for k, r in enumerate(righe):
            d.text((sc(cx + 50), sc(cy + 4 + k * 23)), r, fill=TESTO, font=fv)
        cy += h
        massimo = max(massimo, cy)
    return massimo - y0


def disegna(percorso_jpg):
    alt_stimata = 6400
    img = Image.new("RGB", (sc(LARGHEZZA), sc(alt_stimata)), "white")
    d = ImageDraw.Draw(img)

    # Titolo
    d.text((sc(40), sc(30)), "La Nostra Città, Il Nostro Futuro — architettura del sistema", fill=TESTO, font=F(44, "bold"))
    d.text((sc(40), sc(98)),
           "Piattaforma di segnalazioni del comitato Insieme per Milano. Frontend statico + API Express 5 su Node 22 + MySQL 8; "
           "deploy con Docker Compose oppure su Vercel. Generato da docs/architettura.py",
           fill=TESTO_TENUE, font=F(20))

    # ---- Vista logica
    titolo_sezione(d, 170, "VISTA LOGICA", "componenti software, utenti e ruoli, sistemi esterni consumati via API")
    banda(d, (60, 250, 2810, 200), "Utenti e ruoli")
    banda(d, (60, 480, 2810, 520), "Client — browser")
    banda(d, (60, 1020, 2810, 1260), "Applicazione — backend Node.js 22 / Express 5")
    banda(d, (60, 2310, 2810, 290), "Dati")
    banda(d, (2955, 250, 600, 2350), "Servizi esterni")

    logiche = [f for f in FRECCE if f["vista"] == "logica"]
    fisiche = [f for f in FRECCE if f["vista"] == "fisica"]
    disegna_frecce(d, logiche)
    for n in NODI.values():
        if n["vista"] == "logica":
            disegna_nodo(d, n)
    disegna_etichette(d, logiche)

    # ---- Vista fisica
    titolo_sezione(d, Y0 - 100, "VISTA FISICA", "nodi, container, servizi gestiti e dove viene eseguito ciascun componente")
    for n in NODI.values():
        if n["tipo"] == "cornice":
            cornice(d, n["box"], n["nome"])
    disegna_frecce(d, fisiche)
    for n in NODI.values():
        if n["vista"] == "fisica" and n["tipo"] != "cornice":
            disegna_nodo(d, n)
    disegna_etichette(d, fisiche)

    y_legenda = Y0 + 1720
    alt = legenda(d, y_legenda)
    altezza = y_legenda + alt + 50
    img = img.crop((0, 0, sc(LARGHEZZA), sc(altezza)))
    img = img.resize((LARGHEZZA, altezza), Image.LANCZOS)
    img.save(percorso_jpg, "JPEG", quality=92, optimize=True, subsampling=0)
    return img.size


# --------------------------------------------------------------------------------------
# Documentazione testuale
# --------------------------------------------------------------------------------------

ALTRI_DUBBI = [
    ("Notifiche di Vercel Blob verso /api/v1/allegati/upload",
     "Un commento in server/src/routes/segnalazioni.routes.js dice che la rotta riceve anche le notifiche firmate "
     "dell'archivio, ma il controller non definisce onUploadCompleted: la notifica non risulta configurata e non è disegnata."),
    ("Regione della funzione Vercel",
     "vercel.json non la fissa: DEPLOY-VERCEL.md indica iad1 (Stati Uniti) come predefinita e consiglia una regione europea. "
     "Quella effettiva si sceglie nel pannello di Vercel."),
    ("Worker IA come processo separato",
     "npm run worker può girare su qualunque macchina che raggiunga database e archivio; nel repository non c'è un "
     "servizio dedicato in docker-compose.yml, quindi nella vista fisica il worker compare dentro lnc-app e nella funzione Vercel."),
    ("Modelli IA",
     "Mistral e Groq sono usati solo con AI_PROVIDER=mistral (Groq anche con AI_FALLBACK_PROVIDER=groq); con il valore "
     "predefinito AI_PROVIDER=regole il backend non contatta alcun fornitore di modelli."),
    ("Archivio allegati effettivo",
     "Il driver si sceglie a runtime (STORAGE_DRIVER o presenza delle variabili BLOB_*): con Docker si usa di norma la "
     "cartella uploads, su Vercel obbligatoriamente Vercel Blob."),
]

NON_DISEGNATI = [
    ("Server SMTP / invio e-mail", "non implementato: il link di recupero password viene solo scritto nel log in sviluppo "
     "(server/src/controllers/auth.controller.js, README \"Limiti noti\")."),
    ("Antivirus (es. ClamAV)", "solo un punto di aggancio vuoto, scansionaFile() in server/src/storage/index.js."),
    ("Archivio S3", "citato come possibile estensione dell'interfaccia storage, non implementato."),
    ("DNS e dominio personalizzato", "nessuna configurazione nel repository; su Vercel l'indirizzo predefinito è *.vercel.app "
     "(server/src/config/env.js, VERCEL_PROJECT_PRODUCTION_URL)."),
    ("App mobile o desktop", "indicata come sviluppo futuro nel README."),
]


def _md_cella(testo):
    return risolvi(str(testo)).replace("*", "\\*").replace("|", "\\|").replace("\n", " ")


def _md_file(elenco):
    """File di riferimento in `codice`; un nome senza cartella eredita quella del file precedente."""
    radice = DOCS.parent
    voci, cartella = [], ""
    for x in (v.strip() for v in re.split(r", (?![^()]*\))", elenco) if v.strip()):
        nome = x.split(" ")[0]
        if "/" in nome:
            cartella = nome.rsplit("/", 1)[0] + "/"
        elif cartella and not (radice / nome).exists() and (radice / cartella / nome).exists():
            x = cartella + x
        voci.append(f"`{x}`")
    return ", ".join(voci)


def scrivi_md(percorso_md, dimensioni):
    nomi = {k: n["nome"] for k, n in NODI.items()}
    righe = []
    a = righe.append
    a("# Architettura di La Nostra Città")
    a("")
    a("> Documento generato da [`architettura.py`](architettura.py) insieme all'immagine "
      f"[`architettura.jpg`](architettura.jpg) ({dimensioni[0]}×{dimensioni[1]} px). "
      "Per modificarli entrambi, aggiornare nodi e frecce nello script ed eseguire `python3 docs/architettura.py`.")
    a("")
    a("![Architettura di La Nostra Città](architettura.jpg)")
    a("")
    a("La piattaforma è composta da un frontend statico (HTML, CSS e moduli JavaScript senza build), da un'API REST "
      "Express 5 su Node.js 22 e da un database MySQL 8. Gli allegati stanno su disco (cartella `uploads/`) oppure su "
      "Vercel Blob. Il sistema si può pubblicare in due modi alternativi: **Opzione A**, un server con Docker Compose "
      "(container `lnc-app` e `lnc-mysql`); **Opzione B**, Vercel (CDN per i file statici, una funzione serverless per "
      "l'API, Vercel Cron e Vercel Blob, con un MySQL gestito esterno). Le analisi IA girano in un worker che legge la "
      "coda `job_elaborazione`; il modello linguistico (Mistral, con Groq come riserva) è facoltativo.")
    a("")
    a("L'immagine ha due sezioni, **Vista logica** e **Vista fisica**, e una legenda con forme, colori e l'elenco "
      "completo delle frecce. I codici `Lxx` e `Fxx` identificano gli attori logici e fisici. Gli elementi "
      "contrassegnati con `*` sono dedotti e spiegati in [Punti incerti](#punti-incerti).")
    a("")
    a("| Forma | Tipo di attore |")
    a("|---|---|")
    forme = {"utente": "Rettangolo arrotondato arancione con icona", "software": "Rettangolo arrotondato blu",
             "dati": "Cilindro verde", "esterno": "Rettangolo viola con bordo tratteggiato",
             "infra": "Scatola 3D grigia"}
    for t, (_, _, descr) in TIPI.items():
        a(f"| {forme[t]} | {descr} |")
    a("| Cornice tratteggiata grigia | Raggruppamento di nodi fisici (host, piattaforma, Internet); può essere origine o destinazione di una freccia |")
    a("")
    a("| Colore della freccia | Meccanismo |")
    a("|---|---|")
    for chiave, (colore, descr) in PROTOCOLLI.items():
        a(f"| `{colore}` | {descr} |")
    a("")

    for vista, titolo in (("logica", "Frecce della vista logica"), ("fisica", "Frecce della vista fisica")):
        a(f"## {titolo}")
        a("")
        a("| N. | Origine | Destinazione | Protocollo / meccanismo | Descrizione | File di riferimento |")
        a("|---:|---|---|---|---|---|")
        for f in FRECCE:
            if f["vista"] != vista:
                continue
            da, ad = NODI[f["da"]], NODI[f["a"]]
            num = f"{f['n']}{'\\*' if f['incerto'] else ''}"
            orig = f"{da['nome']} ({da['codice']})" if da["codice"] else da["nome"]
            dest = f"{ad['nome']} ({ad['codice']})" if ad["codice"] else ad["nome"]
            file = _md_file(f["file"])
            a(f"| {num} | {_md_cella(orig)} | {_md_cella(dest)} | {_md_cella(f['protocollo'])} | "
              f"{_md_cella(f['descr'])} | {file} |")
        a("")

    a("## Attori logici")
    a("")
    a("Componenti software, utenti e ruoli, sistemi esterni consumati via API.")
    a("")
    a("| Codice | Attore | Livello | Descrizione | Dove viene eseguito | File |")
    a("|---|---|---|---|---|---|")
    for n in sorted((n for n in NODI.values() if n["vista"] == "logica"), key=lambda n: n["codice"]):
        file = _md_file(n["file"])
        a(f"| {n['codice']} | **{_md_cella(n['nome'])}** | {n['livello']} | {_md_cella(n['descr'])} | "
          f"{_md_cella(n['dove'])} | {file} |")
    a("")
    a("## Attori fisici")
    a("")
    a("Nodi, container, volumi, servizi gestiti e servizi in Internet.")
    a("")
    a("| Codice | Nodo | Livello | Descrizione | Dettagli e componenti eseguiti | File |")
    a("|---|---|---|---|---|---|")
    for n in sorted((n for n in NODI.values() if n["vista"] == "fisica" and n["tipo"] != "cornice"),
                    key=lambda n: n["codice"]):
        file = _md_file(n["file"])
        a(f"| {n['codice']} | **{_md_cella(n['nome'])}** | {n['livello']} | {_md_cella(n['descr'])} | "
          f"{_md_cella(n['righe'])} | {file} |")
    a("")
    a("Raggruppamenti della vista fisica (non sono attori, ma alcune frecce partono da essi o vi arrivano):")
    a("")
    for n in NODI.values():
        if n["tipo"] == "cornice":
            dentro = [m for m in NODI.values() if m["vista"] == "fisica" and m["tipo"] != "cornice"
                      and _contiene(n["box"], m["box"])]
            elenco = ", ".join(f"{_md_cella(m['nome'])} ({m['codice']})" for m in dentro)
            a(f"- **{n['nome']}**: {elenco}.")
    a("")
    a("## Punti incerti")
    a("")
    a("Elementi contrassegnati con `*` nell'immagine: sono dedotti dalla documentazione o dalle convenzioni degli "
      "strumenti, non certi dal codice o dalla configurazione.")
    a("")
    for n in NODI.values():
        if n["incerto"]:
            a(f"- **{_md_cella(n['nome'])} ({n['codice']})** — {_md_cella(n['motivo'])}")
    for f in FRECCE:
        if f["incerto"]:
            a(f"- **Freccia {f['n']}\\*** ({_md_cella(nomi[f['da']])} → {_md_cella(nomi[f['a']])}) — {_md_cella(f['motivo'])}")
    a("")
    a("Altri dubbi, senza asterisco perché l'elemento è certo ma il comportamento dipende dalla configurazione:")
    a("")
    for titolo, testo in ALTRI_DUBBI:
        a(f"- **{titolo}.** {testo}")
    a("")
    a("### Elementi non disegnati")
    a("")
    a("Citati nella documentazione ma assenti dal codice e dalla configurazione, quindi esclusi dal diagramma:")
    a("")
    for titolo, testo in NON_DISEGNATI:
        a(f"- **{titolo}**: {testo}")
    a("")
    a("## Riepilogo")
    a("")
    nl, nf = ORDINE_CODICI["logica"], ORDINE_CODICI["fisica"]
    fl = sum(f["vista"] == "logica" for f in FRECCE)
    a(f"- Attori logici: {nl} (L01–L{nl:02d}); attori fisici: {nf} (F01–F{nf:02d}).")
    a(f"- Frecce numerate: {len(FRECCE)} ({fl} nella vista logica, 1–{fl}; "
      f"{len(FRECCE) - fl} nella vista fisica, {fl + 1}–{len(FRECCE)}).")
    a(f"- Elementi incerti: {sum(n['incerto'] for n in NODI.values())} attori e {sum(f['incerto'] for f in FRECCE)} frecce.")
    a("")
    Path(percorso_md).write_text("\n".join(righe), encoding="utf-8")


def _contiene(esterno, interno):
    x, y, w, h = esterno
    a, b, c, d = interno
    return x <= a and y <= b and a + c <= x + w and b + d <= y + h


def verifica():
    """Controlli di coerenza: numerazione, riferimenti ai nodi, ogni attore collegato ad almeno una freccia."""
    numeri = [f["n"] for f in FRECCE]
    assert numeri == list(range(1, len(FRECCE) + 1)), "numerazione non progressiva"
    for f in FRECCE:
        assert f["da"] in NODI and f["a"] in NODI, f
        assert NODI[f["da"]]["vista"] == NODI[f["a"]]["vista"] == f["vista"], f
        if f["incerto"]:
            assert f["motivo"], f"freccia {f['n']} incerta senza motivo"
    collegati = {f["da"] for f in FRECCE} | {f["a"] for f in FRECCE}
    for k, n in NODI.items():
        if n["incerto"]:
            assert n["motivo"], f"{k} incerto senza motivo"
        if n["tipo"] != "cornice":
            dentro_cornice = any(c["tipo"] == "cornice" and c["id"] in collegati and _contiene(c["box"], n["box"])
                                 for c in NODI.values())
            assert k in collegati or dentro_cornice, f"attore {k} senza frecce"
    return True


if __name__ == "__main__":
    verifica()
    dimensioni = disegna(DOCS / "architettura.jpg")
    scrivi_md(DOCS / "architettura.md", dimensioni)
    print(f"Documento: {DOCS / 'architettura.md'}")
    print(f"Immagine: {DOCS / 'architettura.jpg'} {dimensioni[0]}x{dimensioni[1]} px")
    print(f"Attori logici: {ORDINE_CODICI['logica']}, fisici: {ORDINE_CODICI['fisica']}, frecce: {len(FRECCE)}")
