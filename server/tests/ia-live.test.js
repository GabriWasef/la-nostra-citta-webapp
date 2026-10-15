// Test con i servizi reali: facoltativi, consumano richieste del piano del provider.
// Si eseguono solo con AI_TEST_LIVE=1 e le chiavi impostate, quindi mai in CI:
//   AI_TEST_LIVE=1 MISTRAL_API_KEY=... GROQ_API_KEY=... npm test
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import './setup-env.js';
import sharp from 'sharp';
import { creaLlm, PROVIDER } from '../src/ai/providers/index.js';
import { creaProviderOpenAI } from '../src/ai/providers/openaiCompatibile.js';

const LIVE = process.env.AI_TEST_LIVE === '1';
const CATEGORIE = ['Manutenzione stradale', 'Verde pubblico', 'Illuminazione', 'Decoro urbano'];

const servizi = [
  ['mistral', process.env.MISTRAL_API_KEY, process.env.MISTRAL_MODEL || 'mistral-small-latest'],
  ['groq', process.env.GROQ_API_KEY, process.env.GROQ_MODEL || 'qwen/qwen3.8-27b'],
];

for (const [nome, chiave, modello] of servizi) {
  describe(`Servizio reale: ${nome}`, { skip: !LIVE || !chiave ? 'imposta AI_TEST_LIVE=1 e la chiave per eseguirlo' : false }, () => {
    const llm = () => creaLlm([creaProviderOpenAI({ nome, ...PROVIDER[nome], apiKey: chiave, modello, timeoutMs: 30_000 })]);

    test('moderazione e classificazione del testo', async () => {
      const r = await llm().analizzaTesto({
        testo: 'Buca profonda in via Padova\nDavanti al civico 120 c’è una buca pericolosa per bici e pedoni.',
        categorie: CATEGORIE,
      });
      assert.equal(r.modello, `${nome}:${modello}`);
      assert.equal(r.risposta.testo.accettabile, true);
    });

    test('pertinenza di un’immagine', async () => {
      const immagine = await sharp({ create: { width: 640, height: 480, channels: 3, background: '#4f7f3a' } }).jpeg().toBuffer();
      const r = await llm().verificaPertinenza({
        testo: 'Buca profonda in via Padova',
        categorie: CATEGORIE,
        categorie_dichiarate: ['Manutenzione stradale'],
        immagine,
      });
      assert.ok(r.risposta.immagine.confidenza >= 0 && r.risposta.immagine.confidenza <= 1);
    });
  });
}
