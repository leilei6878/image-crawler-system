class RateLimiter {
  constructor() {
    this.state = new Map();
  }

  async wait(key, rawPolicy = {}) {
    const policy = typeof rawPolicy === 'string' ? this.parse(rawPolicy) : rawPolicy;
    const requestsPerMinute = this.numberInRange(policy.requests_per_minute, 1, 120, 6);
    const minDelayMs = this.numberInRange(policy.min_delay_seconds, 0, 300, 10) * 1000;
    const burst = this.numberInRange(policy.burst, 1, 10, 1);
    const bucketKey = String(key || 'global');
    const state = this.state.get(bucketKey) || { timestamps: [], lastAt: 0 };

    while (true) {
      const now = Date.now();
      state.timestamps = state.timestamps.filter((timestamp) => now - timestamp < 60000);
      const delayUntil = Math.max(
        state.lastAt + minDelayMs,
        state.timestamps.length >= requestsPerMinute
          ? state.timestamps[Math.max(0, state.timestamps.length - burst)] + 60000
          : now
      );
      const waitMs = delayUntil - now;
      if (waitMs <= 0) break;
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }

    const admittedAt = Date.now();
    state.lastAt = admittedAt;
    state.timestamps.push(admittedAt);
    this.state.set(bucketKey, state);
  }

  parse(value) {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  numberInRange(value, min, max, fallback) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, parsed));
  }
}

module.exports = RateLimiter;
