# Phase 2 Manual Test Script

End-to-end verification of the phone+OTP auth flow. Run after `db:reset`.

The backend dev server should be running on `http://localhost:3000`. tRPC endpoints
are at `http://localhost:3000/trpc/<router>.<procedure>`. All mutations are POSTs
with a JSON body of `{ "json": <input> }`. Replace `<token>` with the access
token returned by the verify call.

The console SMS provider logs each OTP to stdout — watch the backend terminal for
lines like `[SMS:console] phone=+9647500000123 | message=Arena code: 123456`.

---

## Setup

```bash
pnpm --filter ./backend db:reset
pnpm --filter ./backend dev
```

Open another terminal for the curl calls below.

---

## Steps

### 1. Reset DB and seed
Already done by `db:reset`. Verify:
```sql
SELECT phone, "fullName", "preferredLanguage" FROM "user" ORDER BY "createdAt";
-- Expect 6 rows: 1 admin + 5 players
```

### 2. Request a registration OTP for a fresh phone
```bash
curl -s -X POST http://localhost:3000/trpc/auth.requestRegistrationOtp \
  -H 'content-type: application/json' \
  -d '{"json":{"phone":"+9647500000123"}}' | jq
```
Expect: `{"requestId":"...", "expiresAt":"..."}` and a console SMS line in the backend log.
```sql
SELECT phone, purpose, attempts, "expiresAt" FROM "otpRequests"
  WHERE phone = '+9647500000123';
-- Expect one row with purpose='registration'
```

### 3. Verify the registration OTP
Use the code from the SMS log line.
```bash
curl -s -X POST http://localhost:3000/trpc/auth.verifyRegistrationOtp \
  -H 'content-type: application/json' \
  -d '{"json":{"phone":"+9647500000123","code":"<CODE>"}}' | jq
```
Expect: `{ user, accessToken, refreshToken }`.
```sql
SELECT phone, "phoneVerifiedAt", "onboardingCompletedAt" FROM "user"
  WHERE phone = '+9647500000123';
-- Expect phoneVerifiedAt set, onboardingCompletedAt null
```

### 4. Complete onboarding
```bash
curl -s -X POST http://localhost:3000/trpc/user.completeOnboarding \
  -H 'content-type: application/json' \
  -H 'authorization: Bearer <ACCESS_TOKEN>' \
  -d '{"json":{"fullName":"Test User","city":"Baghdad","preferredLanguage":"ar","preferredCurrency":"IQD","experienceLevel":"intermediate"}}' | jq
```
```sql
SELECT "fullName", "experienceLevel", "onboardingCompletedAt" FROM "user"
  WHERE phone = '+9647500000123';
-- Expect onboardingCompletedAt set
```

### 5. Request a login OTP for the same phone
```bash
curl -s -X POST http://localhost:3000/trpc/auth.requestLoginOtp \
  -H 'content-type: application/json' \
  -d '{"json":{"phone":"+9647500000123"}}' | jq
```
Expect a new `requestId` and a fresh SMS log line.

### 6. Verify the login OTP
```bash
curl -s -X POST http://localhost:3000/trpc/auth.verifyLoginOtp \
  -H 'content-type: application/json' \
  -d '{"json":{"phone":"+9647500000123","code":"<CODE>"}}' | jq
```
Expect: new tokens, `lastLoginAt` updated.

### 7. Refresh the session
```bash
curl -s -X POST http://localhost:3000/trpc/auth.refreshSession \
  -H 'content-type: application/json' \
  -d '{"json":{"refreshToken":"<REFRESH_TOKEN>"}}' | jq
```
Expect: new access + refresh tokens. The old refresh token row should be revoked.
```sql
SELECT "revokedAt" FROM "refreshToken" ORDER BY "createdAt" DESC LIMIT 2;
-- The second-most-recent row should have revokedAt set; the newest row should not.
```

### 8. Logout
```bash
curl -s -X POST http://localhost:3000/trpc/auth.logout \
  -H 'content-type: application/json' \
  -H 'authorization: Bearer <NEW_ACCESS_TOKEN>' \
  -d '{"json":{"refreshToken":"<NEW_REFRESH_TOKEN>"}}' | jq
```
Expect: `{ success: true }`. The refresh token's `revokedAt` is now set.

### 9. Refresh with the revoked refresh token
```bash
curl -s -X POST http://localhost:3000/trpc/auth.refreshSession \
  -H 'content-type: application/json' \
  -d '{"json":{"refreshToken":"<REVOKED_REFRESH_TOKEN>"}}' | jq
```
Expect: an UNAUTHORIZED error mentioning reuse-detection.

### 10. Rate limit: hit `requestLoginOtp` 4 times quickly
The `otp_max_sends_per_hour` config is 3. The 4th call should fail.
```bash
for i in 1 2 3 4; do
  curl -s -X POST http://localhost:3000/trpc/auth.requestLoginOtp \
    -H 'content-type: application/json' \
    -d '{"json":{"phone":"+9647500000123"}}' | jq -r '.error.message // .result.data.json.requestId'
done
```
Expect: 3 requestIds, then `OTP_RATE_LIMITED`.

### 11. Verify with wrong code 5 times
After requesting a fresh OTP (e.g., wait for the rate limit reset, or reset DB), call
`auth.verifyLoginOtp` with a wrong code 5 times in a row. The 5th should throw
`OTP_TOO_MANY_ATTEMPTS`.

---

## Bonus — config-driven rate limits

Verify that changing `platformConfig` takes effect without a redeploy:

```sql
UPDATE "platformConfig" SET value = '5'::jsonb
WHERE key = 'otp_max_sends_per_hour';
```

After this, `requestLoginOtp` should accept 5 sends per hour instead of 3.
