import { pino } from 'pino';

const isProduction = process.env.NODE_ENV === 'production';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  // Human-readable while developing; plain JSON in production so a log shipper can parse it.
  transport: isProduction ? undefined : { target: 'pino-pretty', options: { colorize: true } },
});
