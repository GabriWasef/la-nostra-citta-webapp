// Finto server Nominatim per i test della geocodifica. Va importato PRIMA di
// setup-env.js: avvia il server e imposta GEOCODING_URL prima che venga letta la configurazione.
import http from 'node:http';

export const richieste = [];
export const stato = { errore: false, risposte429: 0 };

const RISULTATO_ISOLA = {
  lat: '45.4879123',
  lon: '9.1886456',
  name: 'Via Angelo della Pergola',
  display_name: '1, Via Angelo della Pergola, Isola, Municipio 9, Milano, Lombardia, 20159, Italia',
  address: { house_number: '1', road: 'Via Angelo della Pergola', quarter: 'Isola', suburb: 'Municipio 9', city: 'Milano' },
};

const RISULTATO_SAN_SIRO = {
  lat: '45.4781',
  lon: '9.1238',
  name: 'Piazzale Angelo Moratti',
  display_name: 'Piazzale Angelo Moratti, Municipio 7, Milano, Lombardia, Italia',
  address: { road: 'Piazzale Angelo Moratti', neighbourhood: 'San Siro', suburb: 'Municipio 7', city: 'Milano' },
};

export const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  richieste.push({ percorso: url.pathname, parametri: Object.fromEntries(url.searchParams), intestazioni: req.headers });
  if (stato.errore) {
    res.writeHead(500).end();
    return;
  }
  if (stato.risposte429 > 0) {
    stato.risposte429--;
    res.writeHead(429).end();
    return;
  }
  res.setHeader('Content-Type', 'application/json');
  if (url.pathname === '/search') {
    const q = url.searchParams.get('q');
    res.end(JSON.stringify(q.includes('inesistente') ? [] : [RISULTATO_ISOLA]));
  } else if (url.pathname === '/reverse') {
    res.end(JSON.stringify(Number(url.searchParams.get('lon')) < 9.15 ? RISULTATO_SAN_SIRO : RISULTATO_ISOLA));
  } else {
    res.writeHead(404).end();
  }
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
process.env.GEOCODING_URL = `http://127.0.0.1:${server.address().port}`;
process.env.GEOCODING_ENABLED = 'true';
