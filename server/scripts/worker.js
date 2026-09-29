// Worker IA come processo separato. Uso: npm run worker [-- --once]
import { avviaWorker, elaboraTutti } from '../src/ai/worker.js';
import { closePool } from '../src/config/db.js';

if (process.argv.includes('--once')) {
  const n = await elaboraTutti();
  console.log(`${n} job elaborati.`);
  await closePool();
} else {
  const ferma = avviaWorker(2000);
  console.log('Worker IA avviato (Ctrl+C per fermarlo).');
  process.on('SIGINT', async () => {
    await ferma();
    await closePool();
    process.exit(0);
  });
  setInterval(() => {}, 1 << 30);
}
