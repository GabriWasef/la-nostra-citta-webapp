// SDK finto di Vercel Blob (stessa interfaccia delle funzioni usate dal progetto) con un piccolo
// server HTTP che serve i file dei "link firmati". Permette di provare la logica senza rete.
import http from 'node:http';
import { Readable } from 'node:stream';

async function inBuffer(corpo) {
  if (Buffer.isBuffer(corpo)) return corpo;
  const pezzi = [];
  for await (const p of Readable.from(corpo)) pezzi.push(Buffer.from(p));
  return Buffer.concat(pezzi);
}

export async function creaBlobFinto() {
  const archivio = new Map(); // pathname -> { buffer, contentType, uploadedAt }
  const chiamate = { put: [], del: [], get: [], issueSignedToken: [], presignUrl: [], list: [] };

  const server = http.createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname.replace(/^\/file\//, ''));
    const voce = archivio.get(pathname);
    if (!voce) return res.writeHead(404).end();
    res.writeHead(200, { 'Content-Type': voce.contentType ?? 'application/octet-stream' }).end(voce.buffer);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const porta = server.address().port;

  const sdk = {
    async put(pathname, corpo, opzioni) {
      chiamate.put.push({ pathname, opzioni });
      if (archivio.has(pathname) && !opzioni.allowOverwrite && opzioni.addRandomSuffix === false) throw new Error('esiste già');
      archivio.set(pathname, { buffer: await inBuffer(corpo), contentType: opzioni.contentType, uploadedAt: new Date() });
      return { pathname, url: `http://127.0.0.1:${porta}/file/${pathname}` };
    },
    async del(percorsi) {
      const lista = Array.isArray(percorsi) ? percorsi : [percorsi];
      chiamate.del.push(lista);
      for (const p of lista) archivio.delete(p);
    },
    async get(pathname, opzioni) {
      chiamate.get.push({ pathname, opzioni });
      const voce = archivio.get(pathname);
      if (!voce) return null;
      return {
        statusCode: 200,
        stream: new Response(voce.buffer).body,
        headers: new Headers(),
        blob: { pathname, size: voce.buffer.length, contentType: voce.contentType },
      };
    },
    async issueSignedToken(opzioni) {
      chiamate.issueSignedToken.push(opzioni);
      return { delegationToken: 'delega', clientSigningToken: 'firma', validUntil: opzioni.validUntil };
    },
    async presignUrl(token, opzioni) {
      chiamate.presignUrl.push({ token, opzioni });
      return { presignedUrl: `http://127.0.0.1:${porta}/file/${opzioni.pathname}?scadenza=${opzioni.validUntil}` };
    },
    async list({ prefix }) {
      chiamate.list.push({ prefix });
      return {
        blobs: [...archivio].filter(([p]) => p.startsWith(prefix)).map(([pathname, v]) => ({ pathname, uploadedAt: v.uploadedAt, size: v.buffer.length })),
        hasMore: false,
      };
    },
  };

  return { sdk, archivio, chiamate, porta, chiudi: () => new Promise((r) => server.close(r)) };
}
