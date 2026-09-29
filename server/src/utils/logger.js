import pino from 'pino';
import { env } from '../config/env.js';

export const logger = pino({
  level: env.isTest ? 'silent' : env.LOG_LEVEL,
  redact: ['req.headers.cookie', 'password', '*.password', '*.password_hash'],
});
