/**
 * Narrows an unknown caught value to the shape of a pg DatabaseError that we care about.
 * pg.DatabaseError exposes `code` (SQLSTATE) and `constraint` (constraint name on FK/unique violations).
 */
export interface PgErrorLike {
  code?: string;
  constraint?: string;
  message?: string;
}

export function isPgError(err: unknown): err is PgErrorLike {
  return typeof err === 'object' && err !== null && 'code' in err;
}
