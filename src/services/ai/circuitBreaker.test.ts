import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  CircuitBreaker,
  CircuitBreakerOpenError,
  getCircuitBreaker,
  resetAllCircuitBreakers,
} from "./circuitBreaker";

describe("CircuitBreaker", () => {
  beforeEach(() => {
    resetAllCircuitBreakers();
    vi.useRealTimers();
  });

  it("starts in CLOSED state with 0 failures", () => {
    const breaker = new CircuitBreaker({ name: "test-gateway", failureThreshold: 3 });
    expect(breaker.getState()).toBe("CLOSED");
    expect(breaker.getConsecutiveFailures()).toBe(0);
    expect(breaker.canExecute()).toBe(true);
  });

  it("executes actions normally in CLOSED state", async () => {
    const breaker = new CircuitBreaker({ failureThreshold: 3 });
    const result = await breaker.execute(async () => "success");
    expect(result).toBe("success");
    expect(breaker.getState()).toBe("CLOSED");
  });

  it("trips to OPEN after reaching failureThreshold", async () => {
    const breaker = new CircuitBreaker({ failureThreshold: 3, cooldownMs: 1000 });

    for (let i = 0; i < 3; i++) {
      await expect(
        breaker.execute(async () => {
          throw new Error("503 Service Unavailable");
        })
      ).rejects.toThrow("503 Service Unavailable");
    }

    expect(breaker.getState()).toBe("OPEN");
    expect(breaker.canExecute()).toBe(false);
  });

  it("fails fast when OPEN without calling underlying action", async () => {
    const breaker = new CircuitBreaker({ failureThreshold: 1, cooldownMs: 5000 });
    const mockAction = vi.fn().mockRejectedValue(new Error("Network Error"));

    await expect(breaker.execute(mockAction)).rejects.toThrow("Network Error");
    expect(breaker.getState()).toBe("OPEN");

    // Next call should fail fast without calling mockAction again
    await expect(breaker.execute(mockAction)).rejects.toThrow(CircuitBreakerOpenError);
    expect(mockAction).toHaveBeenCalledTimes(1);
  });

  it("invokes fallbackFn seamlessly when breaker is OPEN", async () => {
    const breaker = new CircuitBreaker({ failureThreshold: 1, cooldownMs: 5000 });
    await expect(
      breaker.execute(async () => {
        throw new Error("Failed");
      })
    ).rejects.toThrow();

    const fallback = vi.fn().mockResolvedValue("offline-fallback-result");
    const result = await breaker.execute(
      async () => "online-result",
      fallback
    );

    expect(result).toBe("offline-fallback-result");
    expect(fallback).toHaveBeenCalled();
  });

  it("transitions to HALF_OPEN after cooldown and resets to CLOSED on recovery", async () => {
    vi.useFakeTimers();
    const breaker = new CircuitBreaker({ failureThreshold: 2, cooldownMs: 1000 });

    // Cause 2 failures
    breaker.recordFailure();
    breaker.recordFailure();
    expect(breaker.getState()).toBe("OPEN");

    // Advance time past cooldown
    vi.advanceTimersByTime(1100);
    expect(breaker.getState()).toBe("HALF_OPEN");
    expect(breaker.canExecute()).toBe(true);

    // Trial action succeeds -> resets to CLOSED
    breaker.recordSuccess();
    expect(breaker.getState()).toBe("CLOSED");
    expect(breaker.getConsecutiveFailures()).toBe(0);
  });

  it("registry caches breakers by key and resets all", () => {
    const b1 = getCircuitBreaker("openrouter");
    const b2 = getCircuitBreaker("openrouter");
    expect(b1).toBe(b2);

    resetAllCircuitBreakers();
    const b3 = getCircuitBreaker("openrouter");
    expect(b3).not.toBe(b1);
  });
});
