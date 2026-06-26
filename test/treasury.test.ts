import { describe, it, expect } from "vitest";
import { Treasury } from "../src/treasury/treasury.js";

describe("treasury", () => {
  it("seeds, earns, spends, tracks net", () => {
    const t = new Treasury(20_000n);
    expect(t.balance).toBe(20_000n);
    t.spend(5_000n, "research");
    expect(t.balance).toBe(15_000n);
    t.earn(10_000n, "sale");
    expect(t.balance).toBe(25_000n);
    expect(t.earned).toBe(10_000n);
    expect(t.spent).toBe(5_000n);
  });
  it("canAfford and solvent reflect the buffer", () => {
    const t = new Treasury(6_000n); // research 5000 + price 10000 = 15000 buffer
    expect(t.canAfford(5_000n)).toBe(true);
    expect(t.solvent(5_000n, 10_000n)).toBe(false); // below research + price buffer, must wait
  });
  it("never spends into the negative", () => {
    const t = new Treasury(1_000n);
    expect(() => t.spend(5_000n, "research")).toThrow();
  });
});
