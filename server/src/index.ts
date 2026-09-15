import app from './app.js';
import { config } from './config.js';
import { logger } from './logger.js';

app.listen(config.port, () => {
  logger.info({ port: config.port, env: config.env }, 'API listening');
});
