// Deve essere importato per primo: configura l'ambiente di test prima che
// venga letta la configurazione (src/config/env.js).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.NODE_ENV = 'test';
process.env.DB_NAME = process.env.TEST_DB_NAME || 'la_nostra_citta_test';
process.env.UPLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'lnc-test-uploads-'));
process.env.SESSION_SECRET ||= 'segreto-di-test-lungo-almeno-trentadue-caratteri';
process.env.APP_ORIGIN = 'http://localhost:3000';
process.env.RATE_LIMIT_ENABLED = 'false';
process.env.AI_PROVIDER = 'regole';
process.env.AI_WORKER_INTERVAL_MS = '0';
process.env.DB_USER ||= 'root';
