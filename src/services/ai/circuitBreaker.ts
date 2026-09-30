/**
 * Jev Guardrail - Circuit Breaker Pattern for AI Gateway Pipelines
 * Ported & adapted from JevGuarAgent (JOG)
 *
 * Prevents cascading timeouts and token burning when third-party AI gateways fail.
 * Seamlessly fails fast or falls back to offline modes (such as jev-verdict-2.0).
 */

export type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

export interface CircuitBreakerOptions {
  failureThreshold?: number;
  cooldownMs?: number;
  name?: string;
}

export class CircuitBreakerOpenError extends Error {
  public readonly openedUntil: number;
  public readonly circuitName: string;

  constructor(circuitName: string, cooldownRemainingMs: number) {
    super(
      `[Jev Guardrail - Circuit Breaker OPEN]: Cổng AI "${circuitName}" đang tạm ngắt do lỗi liên tục. Vui lòng thử lại sau ${Math.ceil(
        cooldownRemainingMs / 1000
      )}s hoặc chuyển sang chế độ offline.`
    );
    this.name = "CircuitBreakerOpenError";
    this.circuitName = circuitName;
    this.openedUntil = Date.now() + cooldownRemainingMs;
  }
}

export class CircuitBreaker {
  public readonly name: string;
  public readonly failureThreshold: number;
  public readonly cooldownMs: number;

  private state: CircuitState = "CLOSED";
  private consecutiveFailures = 0;
  private openedAt = 0;
  constructor(options: CircuitBreakerOptions = {}) {
    this.name = options.name || "default";
    this.failureThreshold = options.failureThreshold ?? 3;
    this.cooldownMs = options.cooldownMs ?? 10000;
  }

  /**
   * Returns current state, auto-transitioning from OPEN to HALF_OPEN after cooldown.
   */
  public getState(): CircuitState {
    if (this.state === "OPEN") {
      const elapsed = Date.now() - this.openedAt;
      if (elapsed >= this.cooldownMs) {
        this.state = "HALF_OPEN";
      }
    }
    return this.state;
  }

  public getConsecutiveFailures(): number {
    return this.consecutiveFailures;
  }

  public canExecute(): boolean {
    const s = this.getState();
    return s === "CLOSED" || s === "HALF_OPEN";
  }

  public recordSuccess(): void {
    this.consecutiveFailures = 0;
    this.state = "CLOSED";
  }
  public recordFailure(_error?: unknown): void {
    this.consecutiveFailures += 1;
    if (this.consecutiveFailures >= this.failureThreshold || this.state === "HALF_OPEN") {
      this.state = "OPEN";
      this.openedAt = Date.now();
    }
  }

  public reset(): void {
    this.state = "CLOSED";
    this.consecutiveFailures = 0;
    this.openedAt = 0;
  }

  /**
   * Executes an async action protected by this circuit breaker.
   * If the circuit is open, immediately invokes fallbackFn (if provided) or throws.
   */
  public async execute<T>(
    action: () => Promise<T>,
    fallbackFn?: (err: Error) => Promise<T>
  ): Promise<T> {
    if (!this.canExecute()) {
      const remaining = Math.max(0, this.cooldownMs - (Date.now() - this.openedAt));
      const openErr = new CircuitBreakerOpenError(this.name, remaining);
      if (fallbackFn) {
        return fallbackFn(openErr);
      }
      throw openErr;
    }

    try {
      const result = await action();
      this.recordSuccess();
      return result;
    } catch (err: unknown) {
      this.recordFailure(err);
      const normalizedErr = err instanceof Error ? err : new Error(String(err));
      if (fallbackFn) {
        return fallbackFn(normalizedErr);
      }
      throw normalizedErr;
    }
  }
}

// Global registry of circuit breakers by key (e.g. gateway host or provider)
const registry = new Map<string, CircuitBreaker>();

export function getCircuitBreaker(
  key: string,
  options?: CircuitBreakerOptions
): CircuitBreaker {
  const existing = registry.get(key);
  if (existing) {
    return existing;
  }

  const breaker = new CircuitBreaker({ ...options, name: key });
  registry.set(key, breaker);
  return breaker;
}

export function resetAllCircuitBreakers(): void {
  for (const breaker of registry.values()) {
    breaker.reset();
  }
  registry.clear();
}
