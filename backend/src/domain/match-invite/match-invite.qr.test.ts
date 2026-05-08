import { describe, it, expect } from 'vitest';
import { generateInviteCode, signQrPayload, verifyQrPayload } from './match-invite.qr.js';

const SECRET = 'test-secret-1234567890';

describe('generateInviteCode', () => {
  it('returns ARN-XXXX shape', () => {
    const code = generateInviteCode();
    expect(code).toMatch(/^ARN-[A-Z2-9]{4}$/);
  });

  it('excludes confusable characters', () => {
    for (let i = 0; i < 200; i += 1) {
      const c = generateInviteCode();
      expect(c).not.toMatch(/[IO10]/);
    }
  });
});

describe('signQrPayload / verifyQrPayload', () => {
  it('round-trips inviteId', () => {
    const id = 'abc-123';
    const token = signQrPayload(id, SECRET, 60);
    const decoded = verifyQrPayload(token, SECRET);
    expect(decoded.iid).toBe(id);
    expect(decoded.iss).toBe('arena-invite');
  });

  it('rejects a wrong secret', () => {
    const token = signQrPayload('id-1', SECRET, 60);
    expect(() => verifyQrPayload(token, 'other-secret')).toThrow();
  });

  it('rejects an expired token', async () => {
    const token = signQrPayload('id-1', SECRET, -1); // already expired
    expect(() => verifyQrPayload(token, SECRET)).toThrow();
  });

  it('rejects a token issued by a different system', () => {
    const wrongIssuer = require('jsonwebtoken').sign(
      { iid: 'id-1', iss: 'other-system' },
      SECRET,
      { expiresIn: 60 },
    ) as string;
    expect(() => verifyQrPayload(wrongIssuer, SECRET)).toThrow(/issuer/);
  });
});
