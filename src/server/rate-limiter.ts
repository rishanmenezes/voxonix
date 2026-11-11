/**
 * In-Memory Rate Limiter for Authentication Endpoints
 *
 * Provides IP and identifier-based sliding-window rate limiting to protect
 * password hashing (scrypt) and authentication endpoints from brute force and DoS attacks.
 */

interface RateLimitRecord {
  timestamps: number[];
}

class RateLimiter {
  private records = new Map<string, RateLimitRecord>();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Periodically prune stale rate limit buckets every 5 minutes
    if (typeof setInterval !== "undefined") {
      this.cleanupInterval = setInterval(() => this.prune(), 5 * 60 * 1000);
      if (this.cleanupInterval.unref) {
        this.cleanupInterval.unref();
      }
    }
  }

  /**
   * Consumes an attempt for a key. Returns whether the attempt is allowed
   * and how many seconds remain until reset if limited.
   */
  check(
    key: string,
    maxAttempts: number,
    windowMs: number,
  ): { allowed: boolean; retryAfterSeconds: number; remainingAttempts: number } {
    const now = Date.now();
    const windowStart = now - windowMs;

    let record = this.records.get(key);
    if (!record) {
      record = { timestamps: [] };
      this.records.set(key, record);
    }

    // Filter out timestamps outside the active sliding window
    record.timestamps = record.timestamps.filter((ts) => ts > windowStart);

    if (record.timestamps.length >= maxAttempts) {
      const oldestInWindow = record.timestamps[0];
      const retryAfterMs = oldestInWindow + windowMs - now;
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)),
        remainingAttempts: 0,
      };
    }

    record.timestamps.push(now);
    return {
      allowed: true,
      retryAfterSeconds: 0,
      remainingAttempts: maxAttempts - record.timestamps.length,
    };
  }

  /**
   * Resets rate limit for a key upon successful authentication.
   */
  reset(key: string): void {
    this.records.delete(key);
  }

  /**
   * Prunes all buckets that have no timestamps in the last 15 minutes.
   */
  prune(): void {
    const threshold = Date.now() - 15 * 60 * 1000;
    for (const [key, record] of this.records.entries()) {
      record.timestamps = record.timestamps.filter((ts) => ts > threshold);
      if (record.timestamps.length === 0) {
        this.records.delete(key);
      }
    }
  }

  /**
   * Clears all stored records (useful for testing).
   */
  clear(): void {
    this.records.clear();
  }
}

export const authRateLimiter = new RateLimiter();
