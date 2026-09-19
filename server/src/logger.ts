import { pino } from 'pino';
import { config } from './config.js';

export const logger = pino({
  level: config.logLevel,
  // pino-pretty is a normal dependency rather than a dev one: this transport is
  // chosen whenever the environment is not production, which includes the case
  // where NODE_ENV was never set. Were it a dev package, a missing setting would
  // stop the app from starting at all on a host that installs only what it runs.
  transport:
    config.env === 'production'
      ? undefined
      : { target: 'pino-pretty', options: { colorize: true } },
});
