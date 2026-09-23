import express from 'express';
import passport from 'passport';
import { configurePassport } from './auth/passport.js';
import { config } from './config.js';
import { cors } from './middleware/cors.js';
import { errorHandler, notFound } from './middleware/error.js';
import { requestLogger } from './middleware/requestLogger.js';
import { authRouter } from './routes/auth.routes.js';
import { imagesRouter } from './routes/images.routes.js';
import { jobsRouter } from './routes/jobs.routes.js';

// Registers a strategy for each provider that has credentials.
configurePassport();

const app = express();

if (config.trustProxy !== undefined) {
  app.set('trust proxy', config.trustProxy);
}

// Order matters: logging, CORS, JSON, then Passport.
app.use(requestLogger);
app.use(cors);
app.use(express.json());

app.use(passport.initialize());

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/auth', authRouter);
app.use('/api/images', imagesRouter);
app.use('/api/jobs', jobsRouter);

app.use(notFound);
app.use(errorHandler);

export default app;
