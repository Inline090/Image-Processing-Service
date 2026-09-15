import express from 'express';
import { errorHandler, notFound } from './middleware/error.js';
import { requestLogger } from './middleware/requestLogger.js';
import { authRouter } from './routes/auth.routes.js';
import { imagesRouter } from './routes/images.routes.js';
import { jobsRouter } from './routes/jobs.routes.js';

const app = express();

app.use(requestLogger);
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/auth', authRouter);
app.use('/api/images', imagesRouter);
app.use('/api/jobs', jobsRouter);

app.use(notFound);
app.use(errorHandler);

export default app;
