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

// Registers a strategy per provider that has credentials. Done once, at load.
configurePassport();

const app = express();

// Behind a load balancer every request arrives from the balancer, so without this
// the rate limits below would count all visitors as one address.
if (config.trustProxy !== undefined) {
  app.set('trust proxy', config.trustProxy);
}

app.use(requestLogger);
app.use(cors);
app.use(express.json());

// Only the sign-in round trip uses Passport, and there are no sessions: the routes
// tell it so, and the state check reads a signature rather than stored memory.
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
