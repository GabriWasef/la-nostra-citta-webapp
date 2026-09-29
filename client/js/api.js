// Unico punto di accesso all'API REST: le pagine non chiamano mai fetch direttamente.
const BASE = '/api/v1';

export class ApiError extends Error {
  constructor(status, code, message, details = []) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function costruisciUrl(percorso, query) {
  const url = new URL(BASE + percorso, window.location.origin);
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
  }
  return url;
}

async function leggiRisposta(status, testo) {
  const dati = testo ? JSON.parse(testo) : null;
  if (status >= 200 && status < 300) return dati;
  const e = dati?.error ?? {};
  throw new ApiError(status, e.code ?? 'ERRORE', e.message ?? 'Si è verificato un errore imprevisto.', e.details ?? []);
}

async function richiesta(metodo, percorso, { query, body } = {}) {
  const opzioni = { method: metodo, credentials: 'same-origin', headers: { Accept: 'application/json' } };
  if (body !== undefined) {
    opzioni.headers['Content-Type'] = 'application/json';
    opzioni.body = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(costruisciUrl(percorso, query), opzioni);
  } catch {
    throw new ApiError(0, 'RETE', 'Impossibile contattare il server. Controlla la connessione e riprova.');
  }
  return leggiRisposta(res.status, await res.text());
}

/** Invio multipart con avanzamento (fetch non espone il progresso dell'upload). */
function upload(percorso, formData, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', costruisciUrl(percorso));
    xhr.setRequestHeader('Accept', 'application/json');
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) onProgress?.(e.loaded / e.total);
    });
    xhr.addEventListener('load', () => leggiRisposta(xhr.status, xhr.responseText).then(resolve, reject));
    xhr.addEventListener('error', () =>
      reject(new ApiError(0, 'RETE', 'Caricamento interrotto. Controlla la connessione e riprova.')),
    );
    xhr.send(formData);
  });
}

export const api = {
  get: (percorso, query) => richiesta('GET', percorso, { query }),
  post: (percorso, body) => richiesta('POST', percorso, { body }),
  put: (percorso, body) => richiesta('PUT', percorso, { body }),
  patch: (percorso, body) => richiesta('PATCH', percorso, { body }),
  del: (percorso, body) => richiesta('DELETE', percorso, { body }),
  upload,
};

export const urlAllegato = (id) => `${BASE}/allegati/${id}`;
