import type { TokenPayload } from '../utils/jwt.js';

declare global {
  namespace Express {
    /**
     * Passport declares `user` on a request, and the bearer-token middleware fills the
     * same slot with the payload it decoded. Declaring that shape here, rather than
     * declaring `Request.user` a second time, keeps the two from disagreeing: two
     * declarations of one property with different types leave the property unreadable.
     *
     * The interface is empty on purpose - it is a merge with Passport's, not a new type.
     */
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface User extends TokenPayload {}
  }
}
