import express from 'express';
import { errorHandler, notFound } from './middleware/error.js';
import { requestLogger } from './middleware/requestLogger.js';

const app = express();

app.use(requestLogger);
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use(notFound);
app.use(errorHandler);

export default app;
