import { describe, it, expect } from "vitest";
import { analyze } from "../src/research/analyst.js";
import type { MarketSnapshot } from "../src/shared/types.js";

const base: MarketSnapshot = {
  ts: 0,
  asset: "ETH",
  price: 3000,
  changePct24h: 0,
  volumeUsd: 5e8,
  activeAddresses: 4e5,
  txCount24h: 1e6,
  gasGwei: 10,
};

describe("analyst", () => {
  it("a sharp drop reads as down and higher risk", () => {
    const s = analyze({ ...base, changePct24h: -12 });
    expect(s.trend).toBe("down");
    expect(s.score).toBeGreaterThan(50);
  });
  it("a calm flat market reads as flat and lower risk", () => {
    const s = analyze({ ...base, changePct24h: 0.2 });
    expect(s.trend).toBe("flat");
    expect(s.score).toBeLessThan(50);
  });
  it("a volume and gas spike flags an anomaly", () => {
    const s = analyze({ ...base, volumeUsd: 2e9, gasGwei: 120 });
    expect(s.anomaly).toBe(true);
  });
  it("score is always within 0 to 100", () => {
    const s = analyze({ ...base, changePct24h: -90, gasGwei: 500 });
    expect(s.score).toBeGreaterThanOrEqual(0);
    expect(s.score).toBeLessThanOrEqual(100);
  });
});
