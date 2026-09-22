import app from './app.js';
import { config } from './config.js';
import { logger } from './logger.js';

// Config is read at boot, so a bad env var fails here rather than later.
app.listen(config.port, () => {
  logger.info({ port: config.port, env: config.env }, 'API listening');
});
