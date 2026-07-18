import { describe, it, expect } from "vitest";
import { parseDerivsOkx, OKX_INSTRUMENTS, type OkxDerivsParts } from "../src/market/okxDerivs.js";

// Shapes captured from live OKX v5 responses 2026-07-18. Rubik series are
// newest-first hourly rows.
const T0 = 1784379600000;
const parts: OkxDerivsParts = {
  markPrice: { markPx: "64027.4" },
  indexTicker: { idxPx: "64054.5" },
  funding: { fundingRate: "0.0000881540792138" },
  openInterest: { oiCcy: "30787.1009000001772" },
  oiHist: [
    [String(T0), "2559152734.8233", "217064152.2925"],
    ...Array.from({ length: 30 }, (_, i) => [String(T0 - (i + 1) * 3600_000), String(2500000000 - i * 1000), "1"]),
  ],
  longShort: [[String(T0), "1.63"], [String(T0 - 3600_000), "1.62"]],
  takerVol: [[String(T0), "69988413.4135", "147075738.8791"]],
  ticker: { last: "64027.7", open24h: "62831.8" },
};

describe("parseDerivsOkx", () => {
  it("maps core fields to DerivsRaw", () => {
    const r = parseDerivsOkx("BTC", parts, 1784381366);
    expect(r.asset).toBe("BTC");
    expect(r.markPrice).toBeCloseTo(64027.4, 4);
    expect(r.indexPrice).toBeCloseTo(64054.5, 4);
    expect(r.lastFundingRate).toBeCloseTo(0.0000881540792138, 12);
    expect(r.openInterestBase).toBeCloseTo(30787.1009, 3);
    expect(r.ts).toBe(1784381366);
  });

  it("takes OI value now from the newest rubik row and 24h ago from the row nearest T0-24h", () => {
    const r = parseDerivsOkx("BTC", parts, 1784381366);
    expect(r.oiValNow).toBeCloseTo(2559152734.8233, 2);
    // rows are hourly, so nearest to T0-24h is index 24 => 2500000000 - 23*1000
    expect(r.oiVal24hAgo).toBeCloseTo(2500000000 - 23 * 1000, 2);
  });

  it("derives crowding, taker buy/sell ratio, and 24h price change", () => {
    const r = parseDerivsOkx("BTC", parts, 1784381366);
    expect(r.longShortRatio).toBeCloseTo(1.63, 4);
    // rubik taker rows are [ts, sellVol, buyVol] => ratio buy/sell
    expect(r.takerBuySellRatio).toBeCloseTo(147075738.8791 / 69988413.4135, 6);
    expect(r.priceChangePct24h).toBeCloseTo(((64027.7 - 62831.8) / 62831.8) * 100, 4);
  });

  it("degrades optional metrics to null when rubik series are missing", () => {
    const r = parseDerivsOkx("BTC", { markPrice: parts.markPrice, indexTicker: parts.indexTicker, funding: parts.funding, openInterest: parts.openInterest }, 1);
    expect(r.oiValNow).toBeNull();
    expect(r.oiVal24hAgo).toBeNull();
    expect(r.longShortRatio).toBeNull();
    expect(r.takerBuySellRatio).toBeNull();
    expect(r.priceChangePct24h).toBeNull();
    expect(r.markPrice).toBeGreaterThan(0);
  });

  it("covers the same asset list as the Binance adapter", () => {
    expect(OKX_INSTRUMENTS.BTC).toEqual({ instId: "BTC-USDT-SWAP", ccy: "BTC" });
    expect(Object.keys(OKX_INSTRUMENTS).length).toBeGreaterThanOrEqual(20);
  });
});
