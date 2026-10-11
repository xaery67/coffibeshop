import pino from 'pino';
import { env } from './env.js';

/** Structured JSON logging (pino) — sesuai PRD-BACKEND §7 & DEVOPS §4. */
export const logger = pino({
  level: env.LOG_LEVEL,
  base: { service: 'coffibeshop-api', env: env.NODE_ENV },
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      '*.password',
      '*.password_hash',
      '*.token',
      '*.secret',
    ],
    censor: '[REDACTED]',
  },
  transport:
    env.NODE_ENV === 'development'
      ? { target: 'pino/file', options: { destination: 1 } }
      : undefined,
});
