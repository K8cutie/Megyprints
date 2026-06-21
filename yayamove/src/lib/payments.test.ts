import { describe, it, expect } from "vitest";
import { computeSplit, PLATFORM_COMMISSION_RATE } from "./payments";

describe("computeSplit", () => {
  it("splits a round amount at the default rate", () => {
    const s = computeSplit(1000);
    expect(s.commissionRate).toBe(PLATFORM_COMMISSION_RATE);
    expect(s.commissionAmount).toBe(120);
    expect(s.providerAmount).toBe(880);
  });

  it("commission + provider always equals the total (no centavo leak)", () => {
    for (const amount of [333.33, 999.99, 1, 12_345.67]) {
      const s = computeSplit(amount);
      expect(s.commissionAmount + s.providerAmount).toBeCloseTo(amount, 2);
    }
  });

  it("respects a custom rate", () => {
    const s = computeSplit(500, 0.2);
    expect(s.commissionAmount).toBe(100);
    expect(s.providerAmount).toBe(400);
  });
});
