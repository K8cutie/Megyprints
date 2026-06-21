import { describe, it, expect } from "vitest";
import { initials, formatPHP, formatDistance, haversineKm, timeAgo, uid } from "./utils";

describe("initials", () => {
  it("takes first letters of up to two words, uppercased", () => {
    expect(initials("Maria Santos")).toBe("MS");
    expect(initials("juan dela cruz")).toBe("JD");
    expect(initials("Cher")).toBe("C");
  });
  it("is safe on empty input", () => {
    expect(initials("")).toBe("");
  });
});

describe("formatPHP", () => {
  it("formats pesos with no decimals", () => {
    expect(formatPHP(1500)).toBe("₱1,500");
    expect(formatPHP(0)).toBe("₱0");
  });
});

describe("formatDistance", () => {
  it("uses metres under 1km and km above", () => {
    expect(formatDistance(0.4)).toBe("400 m away");
    expect(formatDistance(2.5)).toBe("2.5 km away");
  });
});

describe("haversineKm", () => {
  it("is ~0 for identical points", () => {
    const p = { lat: 14.5995, lng: 120.9842 };
    expect(haversineKm(p, p)).toBeCloseTo(0, 5);
  });
  it("approximates Makati→QC distance (~13-15km)", () => {
    const makati = { lat: 14.5547, lng: 121.0244 };
    const qc = { lat: 14.676, lng: 121.0437 };
    const d = haversineKm(makati, qc);
    expect(d).toBeGreaterThan(12);
    expect(d).toBeLessThan(16);
  });
});

describe("timeAgo", () => {
  it("says 'just now' for the present", () => {
    expect(timeAgo(new Date())).toBe("just now");
  });
  it("formats past times with 'ago'", () => {
    expect(timeAgo(new Date(Date.now() - 3 * 3600_000))).toBe("3h ago");
  });
  it("formats FUTURE times with 'in' (regression: was '-1d ago')", () => {
    expect(timeAgo(new Date(Date.now() + 26 * 3600_000))).toBe("in 1d");
  });
});

describe("uid", () => {
  it("returns a non-empty string and is reasonably unique", () => {
    const a = uid();
    const b = uid();
    expect(a).toMatch(/^[a-z0-9]+$/);
    expect(a).not.toBe(b);
  });
});
