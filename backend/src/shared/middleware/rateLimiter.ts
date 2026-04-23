import { TRPCError } from '@trpc/server';

interface Window {
  count: number;
  resetAt: number;
}

/**
 * Simple in-memory sliding-window rate limiter per IP.
 * For production with multiple instances, replace with a Redis-backed store.
 */
export class RateLimiter {
  private store = new Map<string, Window>();

  constructor(
    private readonly maxRequests: number,
    private readonly windowMs: number,
  ) {
    // Purge stale entries every window to avoid memory growth
    setInterval(() => this.purge(), this.windowMs);
  }

  check(key: string): void {
    const now = Date.now();
    const entry = this.store.get(key);

    if (!entry || now > entry.resetAt) {
      this.store.set(key, { count: 1, resetAt: now + this.windowMs });
      return;
    }

    entry.count++;
    if (entry.count > this.maxRequests) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      throw new TRPCError({
        code: 'TOO_MANY_REQUESTS',
        message: `Too many requests. Try again in ${retryAfter}s.`,
      });
    }
  }

  private purge(): void {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (now > entry.resetAt) this.store.delete(key);
    }
  }
}

// Shared limiters for auth routes
export const loginLimiter = new RateLimiter(10, 15 * 60 * 1000);        // 10 per 15m
export const registerLimiter = new RateLimiter(5, 60 * 60 * 1000);      // 5 per hour
export const passwordResetLimiter = new RateLimiter(5, 60 * 60 * 1000); // 5 per hour
export const refreshTokenLimiter = new RateLimiter(30, 15 * 60 * 1000); // 30 per 15m
