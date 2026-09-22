import { pino } from 'pino';
import { config } from './config.js';

// Pretty logs everywhere except production, where plain JSON is expected.
export const logger = pino({
  level: config.logLevel,
  transport:
    config.env === 'production'
      ? undefined
      : { target: 'pino-pretty', options: { colorize: true } },
});
