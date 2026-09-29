// Carica i dati iniziali (categorie e quartieri).
// Con --demo crea anche utenti e segnalazioni dimostrative, passando dai
// servizi reali (validazione file, trigger, storico): solo per sviluppo.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import mysql from 'mysql2/promise';
import sharp from 'sharp';
import { env, ROOT_DIR } from '../src/config/env.js';
import { eseguiSqlFile } from './migrate.js';

const SEEDS_DIR = path.join(ROOT_DIR, 'database/seeds');

export async function seedBase(log = console.log) {
  const conn = await mysql.createConnection({
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    charset: 'utf8mb4_0900_ai_ci',
  });
  try {
    for (const file of (await fs.readdir(SEEDS_DIR)).filter((f) => f.endsWith('.sql')).sort()) {
      await eseguiSqlFile(conn, path.join(SEEDS_DIR, file));
      log(`Seed ${file} applicato.`);
    }
  } finally {
    await conn.end();
  }
}

const UTENTI_DEMO = [
  { nome: 'Alessandra', cognome: 'Ferri', email: 'admin@lanostracitta.demo', ruolo: 'AMMINISTRATORE', quartiere: 'Centro Storico' },
  { nome: 'Marco', cognome: 'Galli', email: 'moderatore@lanostracitta.demo', ruolo: 'MODERATORE', quartiere: 'Isola' },
  { nome: 'Giulia', cognome: 'Conti', email: 'giulia@lanostracitta.demo', ruolo: 'CITTADINO', quartiere: 'Lambrate' },
  { nome: 'Luca', cognome: 'Esposito', email: 'luca@lanostracitta.demo', ruolo: 'CITTADINO', quartiere: 'Navigli' },
  { nome: 'Sara', cognome: 'Bianchi', email: 'sara@lanostracitta.demo', ruolo: 'CITTADINO', quartiere: 'Bicocca' },
];

const SEGNALAZIONI_DEMO = [
  {
    autore: 2, titolo: 'Buca profonda all’incrocio di via Padova', quartiere: 'Lambrate', coord: [45.4952, 9.2268],
    descrizione: 'All’incrocio tra via Padova e via Arquà si è aperta una buca profonda circa 15 cm. Di sera non si vede e le biciclette rischiano di cadere.',
    categorie: ['Manutenzione stradale'], stati: ['APPROVATA'], sostenitori: [3, 4, 1], colore: ['#5b6770', '#2f3a40'],
  },
  {
    autore: 3, titolo: 'Lampioni spenti nel vialetto del parco', quartiere: 'Centro Storico', coord: [45.4726, 9.1766],
    descrizione: 'Da due settimane i lampioni del vialetto interno del parco sono spenti: la sera il passaggio è completamente buio e poco sicuro.',
    categorie: ['Illuminazione', 'Sicurezza'], stati: ['APPROVATA', 'PRESA_IN_CARICO'], sostenitori: [2, 4], colore: ['#1d2b53', '#0b1026'],
  },
  {
    autore: 4, titolo: 'Allagamenti ricorrenti nel sottopasso', quartiere: 'Navigli', coord: [45.4488, 9.1752],
    descrizione: 'A ogni temporale il sottopasso pedonale si allaga e resta impraticabile per giorni. I tombini sembrano ostruiti da foglie e detriti.',
    categorie: ['Rischio idrogeologico'], stati: ['APPROVATA', 'IN_VALUTAZIONE'], sostenitori: [2, 3, 1], colore: ['#2d6a8f', '#12344a'],
  },
  {
    autore: 2, titolo: 'Area giochi abbandonata dietro la scuola', quartiere: 'Isola', coord: [45.4879, 9.1886],
    descrizione: 'L’area giochi dietro la scuola media è chiusa da mesi: altalene rotte, erba alta e nessuna manutenzione. I ragazzi non hanno spazi per incontrarsi.',
    categorie: ['Verde pubblico', 'Politiche giovanili'], stati: ['APPROVATA'], sostenitori: [4], colore: ['#4f7d3a', '#223b17'],
  },
  {
    autore: 4, titolo: 'Pista ciclabile interrotta senza segnaletica', quartiere: 'Bicocca', coord: [45.5142, 9.2113],
    descrizione: 'La pista ciclabile di viale Sarca si interrompe all’improvviso senza alcun cartello: chi va in bici si ritrova in mezzo al traffico.',
    categorie: ['Mobilità urbana', 'Viabilità'], stati: ['APPROVATA', 'IN_VALUTAZIONE', 'DOCUMENTO_PROGRAMMATICO'], sostenitori: [2, 3], colore: ['#b0492f', '#5a1f12'],
  },
  {
    autore: 3, titolo: 'Rifiuti abbandonati dopo la movida', quartiere: 'Navigli', coord: [45.4521, 9.1772], visibilita: 'ANONIMA',
    descrizione: 'Ogni fine settimana, dopo la movida, l’alzaia resta piena di bottiglie e rifiuti fino a tarda mattina. Servono più cestini e controlli.',
    categorie: ['Decoro urbano'], stati: ['APPROVATA'], sostenitori: [2], colore: ['#7a5c2e', '#3a2a12'],
  },
  {
    autore: 2, titolo: 'Semaforo pedonale troppo breve', quartiere: 'San Siro', coord: [45.4781, 9.1238],
    descrizione: 'Il verde pedonale dura pochi secondi: le persone anziane non riescono ad attraversare in tempo le quattro corsie della strada.',
    categorie: [], stati: [], sostenitori: [], colore: ['#8a8f2b', '#3d4012'],
  },
];

function immagineDemo(titolo, [c1, c2]) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs>
    <rect width="1200" height="800" fill="url(#g)"/>
    <circle cx="980" cy="180" r="120" fill="#ffffff" opacity="0.08"/>
    <text x="80" y="690" font-family="sans-serif" font-size="46" fill="#ffffff" opacity="0.92">${titolo.replace(/[<&>]/g, '')}</text>
    <text x="80" y="740" font-family="sans-serif" font-size="26" fill="#ffffff" opacity="0.6">Immagine dimostrativa</text>
  </svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 85 }).toBuffer();
}

async function seedDemo(log) {
  if (env.isProduction) throw new Error('I dati dimostrativi non si caricano in produzione.');
  const password = process.env.SEED_DEMO_PASSWORD;
  if (!password) throw new Error('Imposta SEED_DEMO_PASSWORD nel file .env per creare gli utenti dimostrativi.');

  const { pool, closePool } = await import('../src/config/db.js');
  const catalogo = await import('../src/repositories/catalogo.repository.js');
  const utenti = await import('../src/repositories/utente.repository.js');
  const { hashPassword } = await import('../src/services/auth.service.js');
  const segnalazioni = await import('../src/services/segnalazione.service.js');

  try {
    const [[{ n }]] = await pool.query('SELECT COUNT(*) AS n FROM segnalazione');
    if (n > 0) {
      log('Il database contiene già segnalazioni: dati dimostrativi non caricati (usa npm run db:reset per ripartire).');
      return;
    }
    const quartieri = new Map((await catalogo.listQuartieri()).map((q) => [q.nome, q.id_quartiere]));
    const categorie = new Map((await catalogo.listCategorie()).map((c) => [c.nome, c.id_categoria]));

    const hash = await hashPassword(password);
    const ids = [];
    for (const u of UTENTI_DEMO) {
      const id = await utenti.create({ ...u, passwordHash: hash, idQuartiere: quartieri.get(u.quartiere) });
      ids.push({ ...(await utenti.findById(id)) });
    }
    const [admin, moderatore] = ids;

    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'lnc-seed-'));
    for (const d of SEGNALAZIONI_DEMO) {
      const file = path.join(tmp, `${ids.length}-${Date.now()}.jpg`);
      await fs.writeFile(file, await immagineDemo(d.titolo, d.colore));
      const { size } = await fs.stat(file);
      const { id_segnalazione: id } = await segnalazioni.crea(
        {
          titolo: d.titolo,
          descrizione: d.descrizione,
          id_quartiere: quartieri.get(d.quartiere),
          categorie: d.categorie.map((c) => categorie.get(c)),
          visibilita: d.visibilita ?? 'PUBBLICA',
          indirizzo: null,
          latitudine: d.coord[0],
          longitudine: d.coord[1],
          origine_coordinate: 'MAPPA',
          usa_posizione_foto: false,
        },
        [{ originalname: 'foto.jpg', path: file, size }],
        ids[d.autore],
      );
      for (const codice of d.stati) {
        await segnalazioni.cambiaStato(id, { codice, motivazione: 'Verificata dal comitato (dati dimostrativi).' }, moderatore);
      }
      for (const s of d.sostenitori) await segnalazioni.sostieni(id, ids[s]);
    }
    await fs.rm(tmp, { recursive: true, force: true });
    log(`Creati ${ids.length} utenti e ${SEGNALAZIONI_DEMO.length} segnalazioni dimostrative.`);
    log(`Accesso amministratore: ${admin.email} — moderatore: ${moderatore.email} — password: SEED_DEMO_PASSWORD`);
  } finally {
    await closePool();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  (async () => {
    await seedBase();
    if (process.argv.includes('--demo')) await seedDemo(console.log);
  })().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
