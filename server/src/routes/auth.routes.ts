import { Router } from 'express';
import { register } from '../controllers/auth.controller.js';

export const authRouter = Router();

authRouter.post('/register', register);
