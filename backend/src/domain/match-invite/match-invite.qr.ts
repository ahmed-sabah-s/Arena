/**
 * Pure: invite-code generation + JWT-based QR payload signing/verifying.
 *
 * - Code format: `ARN-XXXX` (4 alphanumeric chars), uppercase, excludes
 *   confusable characters (no I, O, 1, 0).
 * - QR payload: a signed JWT carrying { iid, iss, exp }. The signature
 *   prevents a forged QR from claiming an invite that doesn't exist /
 *   has different terms.
 */
import { randomInt } from 'crypto';
import jwt from 'jsonwebtoken';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_BODY_LENGTH = 4;
const CODE_PREFIX = 'ARN-';

export function generateInviteCode(): string {
  let body = '';
  for (let i = 0; i < CODE_BODY_LENGTH; i += 1) {
    body += CODE_ALPHABET[randomInt(0, CODE_ALPHABET.length)];
  }
  return `${CODE_PREFIX}${body}`;
}

export interface InviteJwtPayload {
  iid: string;
  iss: 'arena-invite';
  exp?: number;
  iat?: number;
}

export function signQrPayload(
  inviteId: string,
  secret: string,
  expiresInSeconds: number,
): string {
  const payload: InviteJwtPayload = { iid: inviteId, iss: 'arena-invite' };
  // ms.StringValue is required by @types/jsonwebtoken; numeric seconds is also accepted at runtime.
  return jwt.sign(payload, secret, { expiresIn: expiresInSeconds });
}

export function verifyQrPayload(
  payload: string,
  secret: string,
): InviteJwtPayload {
  const decoded = jwt.verify(payload, secret) as InviteJwtPayload;
  if (decoded.iss !== 'arena-invite') {
    throw new Error('Invalid invite payload issuer');
  }
  if (!decoded.iid) {
    throw new Error('Invite payload missing iid');
  }
  return decoded;
}
