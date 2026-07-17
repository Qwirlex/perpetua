import { describe, it, expect } from "vitest";
import { computeDerivativeSignal } from "../src/research/derivativeSignal.js";
import type { DerivsRaw } from "../src/shared/types.js";

const base: DerivsRaw = {
  asset: "BTC",
  markPrice: 61240.5,
  indexPrice: 61210.0,
  lastFundingRate: 0.0001, // 0.01% per 8h
  openInterestBase: 100000,
  oiValNow: 8_000_000_000,
  oiVal24hAgo: 7_680_000_000,
  longShortRatio: 1.42,
  takerBuySellRatio: 1.08,
  priceChangePct24h: 2.1,
  ts: 1784308577,
};

describe("computeDerivativeSignal", () => {
  it("annualizes funding: rate x 3 x 365 x 100", () => {
    const s = computeDerivativeSignal(base);
    expect(s.fundingRate8hPct).toBeCloseTo(0.01, 6);
    expect(s.fundingAnnualizedPct).toBeCloseTo(0.0001 * 3 * 365 * 100, 6);
  });

  it("computes basis and OI change and OI usd", () => {
    const s = computeDerivativeSignal(base);
    expect(s.basisPct).toBeCloseTo(((61240.5 - 61210) / 61210) * 100, 3); // output rounded to 4 dp
    expect(s.oiChangePct24h).toBeCloseTo(((8_000_000_000 - 7_680_000_000) / 7_680_000_000) * 100, 4);
    expect(s.openInterestUsd).toBeCloseTo(100000 * 61240.5, 2);
  });

  it("crowded longs paying positive funding => long_squeeze_risk", () => {
    const s = computeDerivativeSignal({ ...base, longShortRatio: 1.5, lastFundingRate: 0.0002 });
    expect(s.bias).toBe("long_squeeze_risk");
  });

  it("crowded shorts with negative funding => short_squeeze_risk", () => {
    const s = computeDerivativeSignal({ ...base, longShortRatio: 0.6, lastFundingRate: -0.0002 });
    expect(s.bias).toBe("short_squeeze_risk");
  });

  it("balanced book => neutral", () => {
    const s = computeDerivativeSignal({ ...base, longShortRatio: 1.0, lastFundingRate: 0.00001 });
    expect(s.bias).toBe("neutral");
  });

  it("leverageHeat stays within 0..100; extreme inputs push high", () => {
    const calm = computeDerivativeSignal({
      ...base, lastFundingRate: 0, longShortRatio: 1.0, oiValNow: 100, oiVal24hAgo: 100, markPrice: 61210,
    });
    const hot = computeDerivativeSignal({
      ...base, lastFundingRate: 0.003, longShortRatio: 3.0, oiValNow: 2e10, oiVal24hAgo: 1e10, markPrice: 62000, indexPrice: 61000,
    });
    expect(calm.leverageHeat).toBeGreaterThanOrEqual(0);
    expect(hot.leverageHeat).toBeLessThanOrEqual(100);
    expect(hot.leverageHeat).toBeGreaterThan(calm.leverageHeat);
  });

  it("missing crowding & oi lowers confidence and still returns", () => {
    const s = computeDerivativeSignal({
      ...base, longShortRatio: null, oiValNow: null, oiVal24hAgo: null,
    });
    expect(s.oiChangePct24h).toBeNull();
    expect(s.confidence).toBe("medium"); // 2 of {oi,crowding,taker,priceChange} missing
    expect(s.leverageHeat).toBeGreaterThanOrEqual(0);
  });
});
