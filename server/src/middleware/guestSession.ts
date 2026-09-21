import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { config } from '../config.js';

const COOKIE_NAME = 'ips_guest';

const MAX_AGE_MS = 400 * 24 * 60 * 60 * 1000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function readCookie(header: string | undefined, name: string): string | null {
  if (header === undefined) {
    return null;
  }

  for (const part of header.split(';')) {
    const separator = part.indexOf('=');

    if (separator !== -1 && part.slice(0, separator).trim() === name) {
      return decodeURIComponent(part.slice(separator + 1).trim());
    }
  }

  return null;
}

function offeredToken(req: Request): string | null {
  const offered = readCookie(req.headers.cookie, COOKIE_NAME);

  return offered !== null && UUID.test(offered) ? offered : null;
}

// Issues the browser token a guest allowance is counted against.
export function guestSession(req: Request, res: Response, next: NextFunction): void {
  if (offeredToken(req) === null) {
    res.cookie(COOKIE_NAME, randomUUID(), {
      httpOnly: true,
      sameSite: config.env === 'production' ? 'none' : 'lax',
      secure: config.env === 'production',
      maxAge: MAX_AGE_MS,
      path: '/',
    });
  }

  next();
}

export function guestKey(req: Request): string | null {
  const token = offeredToken(req);

  return token === null ? null : `guest:${token}`;
}
