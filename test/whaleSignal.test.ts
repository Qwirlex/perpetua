import { describe, it, expect } from "vitest";
import { computeWhaleSignal } from "../src/research/whaleSignal.js";
import type { WalletRaw } from "../src/shared/types.js";

const TS = 1784390000;
const base: WalletRaw = {
  address: "0xf977814e90da44bfa03b6295a0616a897441acec",
  chain: "base",
  isContract: false,
  nativeBalance: 30002.6,
  nativeUsd: 55_210_000,
  txCount: 667,
  tokenTransfersCount: 37_281_929,
  holdings: [
    { symbol: "USDC", usd: 2_500_000 },
    { symbol: "ZEN", usd: 4130 },
  ],
  recentTransfers: [
    { ts: TS - 3600, direction: "in", usd: 1_200_000, symbol: "USDC", counterpartyContract: true },
    { ts: TS - 7200, direction: "out", usd: 3680, symbol: "WETH", counterpartyContract: false },
    { ts: TS - 200_000, direction: "out", usd: 9_999_999, symbol: "USDC", counterpartyContract: false },
  ],
  ts: TS,
};

describe("computeWhaleSignal", () => {
  it("sums balances into totalUsd and picks the tier", () => {
    const s = computeWhaleSignal(base);
    expect(s.totalUsd).toBeCloseTo(55_210_000 + 2_504_130, 0);
    expect(s.tier).toBe("humpback");
    expect(s.topHoldings[0].symbol).toBe("USDC");
  });

  it("tier ladder by powers of ten", () => {
    const at = (usd: number) => computeWhaleSignal({ ...base, nativeUsd: usd, holdings: [], recentTransfers: [] }).tier;
    expect(at(500)).toBe("shrimp");
    expect(at(50_000)).toBe("fish");
    expect(at(500_000)).toBe("dolphin");
    expect(at(5_000_000)).toBe("whale");
    expect(at(50_000_000)).toBe("humpback");
  });

  it("computes 24h flows only from transfers inside the window", () => {
    const s = computeWhaleSignal(base);
    expect(s.inflowUsd24h).toBeCloseTo(1_200_000, 0);
    expect(s.outflowUsd24h).toBeCloseTo(3680, 0); // the 9.99M move is older than 24h
    expect(s.netflowUsd24h).toBeCloseTo(1_196_320, 0);
    expect(s.largestMoveUsd24h).toBeCloseTo(1_200_000, 0);
    expect(s.activeLast24h).toBe(true);
    expect(s.flags).toContain("accumulating");
    expect(s.flags).toContain("high_velocity");
  });

  it("whaleScore is 0..100 and grows with size", () => {
    const small = computeWhaleSignal({ ...base, nativeUsd: 100, holdings: [], recentTransfers: [], txCount: 2, tokenTransfersCount: 3 });
    const big = computeWhaleSignal(base);
    expect(small.whaleScore).toBeGreaterThanOrEqual(0);
    expect(big.whaleScore).toBeLessThanOrEqual(100);
    expect(big.whaleScore).toBeGreaterThan(small.whaleScore);
    expect(small.flags).toContain("fresh_wallet");
  });

  it("quiet wallet gets quiet_24h and no flow flags", () => {
    const s = computeWhaleSignal({
      ...base,
      recentTransfers: [{ ts: TS - 90_000, direction: "out", usd: 500, symbol: "USDC", counterpartyContract: false }],
    });
    expect(s.activeLast24h).toBe(false);
    expect(s.flags).toContain("quiet_24h");
    expect(s.flags).not.toContain("accumulating");
    expect(s.rationale).toContain("quiet");
  });

  it("missing sources lower confidence, empty transfers null the flows", () => {
    const s = computeWhaleSignal({ ...base, nativeUsd: null, txCount: null, recentTransfers: [] });
    expect(s.confidence).toBe("low");
    expect(s.inflowUsd24h).toBeNull();
    expect(s.netflowUsd24h).toBeNull();
    const m = computeWhaleSignal({ ...base, recentTransfers: [] });
    expect(m.confidence).toBe("medium");
    const h = computeWhaleSignal(base);
    expect(h.confidence).toBe("high");
  });

  it("contract wallets are flagged and named in the rationale", () => {
    const s = computeWhaleSignal({ ...base, isContract: true });
    expect(s.flags).toContain("contract_wallet");
    expect(s.rationale).toContain("contract");
  });
});
