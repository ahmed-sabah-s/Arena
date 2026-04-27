import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { createHash } from 'crypto';
import { OtpService } from './OtpService.js';
import type { IOtpRepository, OtpRequest, OtpPurpose } from './IOtpRepository.js';
import type { SmsProvider, SmsSendResult } from '../../../infrastructure/sms/index.js';

// ─── mocks ────────────────────────────────────────────────────────────────────

vi.mock('../../../shared/config/platformConfig/index.js', () => ({
  getConfigInteger: vi.fn(async (key: string) => {
    const map: Record<string, number> = {
      otp_max_sends_per_hour: 3,
      otp_expiry_minutes: 5,
      otp_max_verify_attempts: 5,
      otp_code_length: 6,
    };
    return map[key]!;
  }),
}));

// We use the real `transaction` but funnel through a fake client that calls our repo mock.
// `unknown` for cb args because the fake client only implements .query(), not the full
// CustomClient interface — and rebuilding the full interface adds no test value.
vi.mock('../../../db.js', () => ({
  transaction: vi.fn(async (cb: (client: unknown) => Promise<unknown>) => {
    const fakeClient = { query: vi.fn() };
    return cb(fakeClient);
  }),
}));

// ─── helpers ──────────────────────────────────────────────────────────────────

function hash(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

function makeOtp(overrides: Partial<OtpRequest> = {}): OtpRequest {
  return {
    id: 'otp-1',
    phone: '+9647500000001',
    codeHash: hash('123456'),
    purpose: 'login',
    attempts: 0,
    maxAttempts: 5,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    consumedAt: null,
    ipAddress: null,
    userAgent: null,
    ...overrides,
  };
}

function makeRepoMock(): IOtpRepository {
  return {
    create: vi.fn(async (input) => makeOtp({
      id: 'otp-new',
      phone: input.phone,
      codeHash: input.codeHash,
      purpose: input.purpose,
      maxAttempts: input.maxAttempts,
      expiresAt: input.expiresAt,
    })),
    findActiveByPhone: vi.fn(async () => null),
    findByIdForUpdate: vi.fn(async () => null),
    incrementAttempts: vi.fn(async () => undefined),
    markConsumed: vi.fn(async () => undefined),
    countSendsInWindow: vi.fn(async () => 0),
  };
}

class FakeSms implements SmsProvider {
  readonly name = 'fake';
  sent: Array<{ phone: string; message: string }> = [];
  async send(phone: string, message: string): Promise<SmsSendResult> {
    this.sent.push({ phone, message });
    return { success: true, providerMessageId: 'fake-1' };
  }
}

// ─── tests ────────────────────────────────────────────────────────────────────

describe('OtpService.send', () => {
  let repo: IOtpRepository;
  let sms: FakeSms;
  let svc: OtpService;

  beforeEach(() => {
    repo = makeRepoMock();
    sms = new FakeSms();
    svc = new OtpService(repo, sms);
    delete process.env.OTP_MODE;
    delete process.env.OTP_TEST_PHONE;
    delete process.env.OTP_TEST_CODE;
  });

  it('inserts OTP row and sends SMS', async () => {
    const out = await svc.send({ phone: '+9647500000001', purpose: 'login' });
    expect(out.requestId).toBe('otp-new');
    expect(out.expiresAt).toBeInstanceOf(Date);
    expect(repo.create).toHaveBeenCalledTimes(1);
    expect(sms.sent).toHaveLength(1);
    expect(sms.sent[0].phone).toBe('+9647500000001');
    expect(sms.sent[0].message).toMatch(/Arena code: \d{6}/);
  });

  it('throws OTP_RATE_LIMITED when send count is at the limit', async () => {
    repo.countSendsInWindow = vi.fn(async () => 3);
    await expect(svc.send({ phone: '+9647500000001', purpose: 'login' }))
      .rejects.toMatchObject({ code: 'OTP_RATE_LIMITED' });
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('test_pair mode forces the configured code for the test phone', async () => {
    process.env.OTP_MODE = 'test_pair';
    process.env.OTP_TEST_PHONE = '+9647500000099';
    process.env.OTP_TEST_CODE = '999999';

    await svc.send({ phone: '+9647500000099', purpose: 'login' });

    const createCall = vi.mocked(repo.create).mock.calls[0][0];
    expect(createCall.codeHash).toBe(hash('999999'));
    expect(sms.sent[0].message).toContain('999999');
  });
});

describe('OtpService.verify', () => {
  let repo: IOtpRepository;
  let sms: FakeSms;
  let svc: OtpService;

  beforeEach(() => {
    repo = makeRepoMock();
    sms = new FakeSms();
    svc = new OtpService(repo, sms);
  });

  it('verifies a valid code and marks consumed', async () => {
    const otp = makeOtp({ codeHash: hash('123456') });
    repo.findActiveByPhone = vi.fn(async () => otp);
    repo.findByIdForUpdate = vi.fn(async () => otp);

    const out = await svc.verify({ phone: otp.phone, code: '123456', purpose: 'login' });
    expect(out.verified).toBe(true);
    expect(repo.markConsumed).toHaveBeenCalledWith(otp.id, expect.anything());
  });

  it('throws OTP_NOT_FOUND when no active OTP exists', async () => {
    repo.findActiveByPhone = vi.fn(async () => null);
    await expect(svc.verify({ phone: '+9647500000001', code: '123456', purpose: 'login' }))
      .rejects.toMatchObject({ code: 'OTP_NOT_FOUND' });
  });

  it('throws OTP_EXPIRED for an expired OTP', async () => {
    const otp = makeOtp({ expiresAt: new Date(Date.now() - 1000) });
    repo.findActiveByPhone = vi.fn(async () => otp);
    repo.findByIdForUpdate = vi.fn(async () => otp);

    await expect(svc.verify({ phone: otp.phone, code: '123456', purpose: 'login' }))
      .rejects.toMatchObject({ code: 'OTP_EXPIRED' });
  });

  it('throws OTP_TOO_MANY_ATTEMPTS when attempts exhausted', async () => {
    const otp = makeOtp({ attempts: 5, maxAttempts: 5 });
    repo.findActiveByPhone = vi.fn(async () => otp);
    repo.findByIdForUpdate = vi.fn(async () => otp);

    await expect(svc.verify({ phone: otp.phone, code: '123456', purpose: 'login' }))
      .rejects.toMatchObject({ code: 'OTP_TOO_MANY_ATTEMPTS' });
  });

  it('throws OTP_INVALID_CODE and increments attempts on wrong code', async () => {
    const otp = makeOtp({ codeHash: hash('correctcode') });
    repo.findActiveByPhone = vi.fn(async () => otp);
    repo.findByIdForUpdate = vi.fn(async () => otp);

    await expect(svc.verify({ phone: otp.phone, code: 'wrongcode', purpose: 'login' }))
      .rejects.toMatchObject({ code: 'OTP_INVALID_CODE' });
    expect(repo.incrementAttempts).toHaveBeenCalledWith(otp.id, expect.anything());
    expect(repo.markConsumed).not.toHaveBeenCalled();
  });

  it('throws OTP_ALREADY_USED for a consumed OTP', async () => {
    const otp = makeOtp({ consumedAt: new Date() });
    repo.findActiveByPhone = vi.fn(async () => otp);
    repo.findByIdForUpdate = vi.fn(async () => otp);

    await expect(svc.verify({ phone: otp.phone, code: '123456', purpose: 'login' }))
      .rejects.toMatchObject({ code: 'OTP_ALREADY_USED' });
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});
