import { describe, it, expect } from "vitest";
import { parseDerivs, PERP_SYMBOLS } from "../src/market/binanceDerivs.js";

const parts = {
  premiumIndex: { markPrice: "61240.5", indexPrice: "61210.0", lastFundingRate: "0.0001", time: 1784308577000 },
  openInterest: { openInterest: "100000", symbol: "BTCUSDT", time: 1784308577000 },
  oiHist: [
    { sumOpenInterestValue: "7680000000", timestamp: 1784222177000 },
    { sumOpenInterestValue: "8000000000", timestamp: 1784308577000 },
  ],
  longShort: [{ longShortRatio: "1.42", timestamp: 1784308577000 }],
  takerRatio: [{ buySellRatio: "1.08", timestamp: 1784308577000 }],
  ticker: { priceChangePercent: "2.1" },
};

describe("parseDerivs", () => {
  it("normalizes Binance responses into DerivsRaw", () => {
    const r = parseDerivs("BTC", parts, 1784308577);
    expect(r.markPrice).toBe(61240.5);
    expect(r.indexPrice).toBe(61210.0);
    expect(r.lastFundingRate).toBe(0.0001);
    expect(r.openInterestBase).toBe(100000);
    expect(r.oiVal24hAgo).toBe(7680000000);
    expect(r.oiValNow).toBe(8000000000);
    expect(r.longShortRatio).toBe(1.42);
    expect(r.takerBuySellRatio).toBe(1.08);
    expect(r.priceChangePct24h).toBe(2.1);
  });

  it("tolerates missing optional parts (nulls, no throw)", () => {
    const r = parseDerivs("BTC", { premiumIndex: parts.premiumIndex, openInterest: parts.openInterest }, 1);
    expect(r.oiValNow).toBeNull();
    expect(r.longShortRatio).toBeNull();
    expect(r.takerBuySellRatio).toBeNull();
    expect(r.priceChangePct24h).toBeNull();
  });

  it("PERP_SYMBOLS maps symbols to USDT perps", () => {
    expect(PERP_SYMBOLS.BTC).toBe("BTCUSDT");
    expect(PERP_SYMBOLS.ETH).toBe("ETHUSDT");
  });
});
