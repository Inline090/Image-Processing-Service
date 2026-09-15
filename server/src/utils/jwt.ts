import jwt, { type SignOptions } from 'jsonwebtoken';
import { config } from '../config.js';

export type TokenPayload = {
  sub: string;
  email: string;
};

export function signToken(payload: TokenPayload): string {
  const expiresIn = config.jwtExpiresIn as SignOptions['expiresIn'];

  return jwt.sign(payload, config.jwtSecret, { expiresIn });
}

export function verifyToken(token: string): TokenPayload {
  return jwt.verify(token, config.jwtSecret) as TokenPayload;
}
