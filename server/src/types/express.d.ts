import type { TokenPayload } from '../utils/jwt.js';

declare global {
  namespace Express {

    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface User extends TokenPayload {}
  }
}
