import { describe, it, expect } from "vitest";
import { USDC, toUsdc, fromUsdc } from "../src/shared/money.js";

describe("money", () => {
  it("one USDC is a million micro", () => {
    expect(USDC).toBe(1_000_000n);
  });
  it("formats micro to a human USDC string", () => {
    expect(toUsdc(25_000n)).toBe("0.025000");
    expect(toUsdc(1_500_000n)).toBe("1.500000");
    expect(toUsdc(-10_000n)).toBe("-0.010000");
  });
  it("parses a USDC string to micro", () => {
    expect(fromUsdc("0.01")).toBe(10_000n);
    expect(fromUsdc("2")).toBe(2_000_000n);
    expect(fromUsdc("0.000001")).toBe(1n);
  });
});
