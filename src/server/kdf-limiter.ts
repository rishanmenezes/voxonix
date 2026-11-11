/**
 * Bounded Concurrency Queue for CPU & Memory Intensive Key Derivation (scrypt).
 *
 * OWASP scrypt with N=131072, r=8, p=1 requires ~128 MiB of memory per operation.
 * Without concurrency limits, an attacker submitting concurrent authentication requests
 * could exhaust server memory and saturate the libuv worker threadpool (default 4 threads).
 *
 * This limiter guarantees:
 * 1. Maximum concurrent scrypt operations (default: 2, peak ~256 MiB memory).
 * 2. Bounded waiting queue (default: max 10 requests waiting).
 * 3. Immediate rejection (HTTP 503 / 429) if the queue is full.
 * 4. Maximum wait timeout to prevent request starvation.
 */

export class KdfQueueFullError extends Error {
  readonly code = "KDF_QUEUE_FULL";
  readonly retryAfterSeconds: number;

  constructor(
    message = "Authentication subsystem is busy. Please try again shortly.",
    retryAfterSeconds = 2,
  ) {
    super(message);
    this.name = "KdfQueueFullError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class KdfTimeoutError extends Error {
  readonly code = "KDF_TIMEOUT";

  constructor(message = "Authentication request timed out while queued.") {
    super(message);
    this.name = "KdfTimeoutError";
  }
}

export interface KdfLimiterOptions {
  maxConcurrent?: number;
  maxQueueSize?: number;
  queueTimeoutMs?: number;
}

export class KdfResourceLimiter {
  private maxConcurrent: number;
  private maxQueueSize: number;
  private queueTimeoutMs: number;

  private activeCount = 0;
  private peakConcurrent = 0;
  private queue: Array<{
    fn: () => Promise<unknown>;
    resolve: (value: unknown) => void;
    reject: (reason?: unknown) => void;
    timer: NodeJS.Timeout;
  }> = [];

  constructor(options: KdfLimiterOptions = {}) {
    this.maxConcurrent = options.maxConcurrent ?? 2;
    this.maxQueueSize = options.maxQueueSize ?? 10;
    this.queueTimeoutMs = options.queueTimeoutMs ?? 10_000;
  }

  get active(): number {
    return this.activeCount;
  }

  get queueLength(): number {
    return this.queue.length;
  }

  get peak(): number {
    return this.peakConcurrent;
  }

  configure(options: Partial<KdfLimiterOptions>): void {
    if (typeof options.maxConcurrent === "number") this.maxConcurrent = options.maxConcurrent;
    if (typeof options.maxQueueSize === "number") this.maxQueueSize = options.maxQueueSize;
    if (typeof options.queueTimeoutMs === "number") this.queueTimeoutMs = options.queueTimeoutMs;
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.activeCount < this.maxConcurrent) {
      return this.executeDirectly(fn);
    }

    if (this.queue.length >= this.maxQueueSize) {
      throw new KdfQueueFullError();
    }

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.queue.findIndex((item) => item.resolve === (resolve as unknown));
        if (idx !== -1) {
          this.queue.splice(idx, 1);
          reject(new KdfTimeoutError());
        }
      }, this.queueTimeoutMs);

      this.queue.push({
        fn: fn as () => Promise<unknown>,
        resolve: resolve as (val: unknown) => void,
        reject,
        timer,
      });
    });
  }

  private async executeDirectly<T>(fn: () => Promise<T>): Promise<T> {
    this.activeCount++;
    if (this.activeCount > this.peakConcurrent) {
      this.peakConcurrent = this.activeCount;
    }

    try {
      return await fn();
    } finally {
      this.activeCount--;
      this.pumpNext();
    }
  }

  private pumpNext(): void {
    if (this.activeCount >= this.maxConcurrent || this.queue.length === 0) {
      return;
    }

    const next = this.queue.shift();
    if (!next) return;

    clearTimeout(next.timer);
    this.activeCount++;
    if (this.activeCount > this.peakConcurrent) {
      this.peakConcurrent = this.activeCount;
    }

    next
      .fn()
      .then((res) => {
        next.resolve(res);
      })
      .catch((err) => {
        next.reject(err);
      })
      .finally(() => {
        this.activeCount--;
        this.pumpNext();
      });
  }

  reset(): void {
    for (const item of this.queue) {
      clearTimeout(item.timer);
      item.reject(new KdfTimeoutError("Limiter reset"));
    }
    this.queue = [];
    this.activeCount = 0;
    this.peakConcurrent = 0;
  }
}

export const defaultKdfLimiter = new KdfResourceLimiter({
  maxConcurrent: 2,
  maxQueueSize: 10,
  queueTimeoutMs: 10_000,
});
