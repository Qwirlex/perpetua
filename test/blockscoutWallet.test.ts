import { describe, it, expect } from "vitest";
import { parseWalletRaw, WALLET_CHAINS, ADDRESS_RE, type WalletParts } from "../src/market/blockscoutWallet.js";

// Shapes captured from live base.blockscout.com v2 responses 2026-07-18.
const ADDR = "0xF977814e90dA44bFA03b6295A0616a897441aceC";
const parts: WalletParts = {
  info: { coin_balance: "30002602427576417947918", exchange_rate: "1840.19", is_contract: false },
  counters: { transactions_count: "667", token_transfers_count: "37281929" },
  tokenBalances: [
    { token: { decimals: "6", exchange_rate: "1.0", symbol: "USDC", reputation: "ok" }, value: "2500000000" },
    { token: { decimals: "18", exchange_rate: "4.13", symbol: "ZEN", reputation: "ok" }, value: "1000000000000000000000" },
    { token: { decimals: "18", exchange_rate: "99999", symbol: "SCAM", reputation: "scam" }, value: "1000000000000000000000" },
    { token: { decimals: "18", exchange_rate: null, symbol: "NOPRICE", reputation: "ok" }, value: "5000000000000000000" },
    { token: { decimals: "18", exchange_rate: "0.0000001", symbol: "DUST", reputation: "ok" }, value: "1000000000000000000" },
  ],
  tokenTransfers: [
    {
      timestamp: "2026-07-18T13:57:21.000000Z",
      from: { hash: "0x151138064AEC98848cf957757585226f390deFDB", is_contract: true },
      to: { hash: ADDR, is_contract: false },
      total: { decimals: "6", value: "1200000000" },
      token: { decimals: "6", exchange_rate: "1.0", symbol: "USDC" },
    },
    {
      timestamp: "2026-07-18T10:00:00.000000Z",
      from: { hash: ADDR, is_contract: false },
      to: { hash: "0x0000000000000000000000000000000000000001", is_contract: false },
      total: { decimals: "18", value: "2000000000000000000" },
      token: { decimals: "18", exchange_rate: "1840.0", symbol: "WETH" },
    },
  ],
};
const TS = Math.floor(Date.parse("2026-07-18T14:30:00Z") / 1000);

describe("parseWalletRaw", () => {
  it("maps native balance and USD", () => {
    const r = parseWalletRaw(ADDR, "base", parts, TS);
    expect(r.nativeBalance).toBeCloseTo(30002.6024, 3);
    expect(r.nativeUsd).toBeCloseTo(30002.6024 * 1840.19, 0);
    expect(r.isContract).toBe(false);
    expect(r.txCount).toBe(667);
    expect(r.tokenTransfersCount).toBe(37281929);
    expect(r.address).toBe(ADDR.toLowerCase());
  });

  it("keeps only priced ok-reputation holdings worth >= $1, sorted desc", () => {
    const r = parseWalletRaw(ADDR, "base", parts, TS);
    expect(r.holdings.map((h) => h.symbol)).toEqual(["ZEN", "USDC"]);
    expect(r.holdings[0].usd).toBeCloseTo(1000 * 4.13, 2);
    expect(r.holdings[1].usd).toBeCloseTo(2500, 2);
  });

  it("derives transfer direction, USD value, and counterparty type", () => {
    const r = parseWalletRaw(ADDR, "base", parts, TS);
    expect(r.recentTransfers).toHaveLength(2);
    const [inTx, outTx] = r.recentTransfers;
    expect(inTx.direction).toBe("in");
    expect(inTx.usd).toBeCloseTo(1200, 2);
    expect(inTx.counterpartyContract).toBe(true);
    expect(outTx.direction).toBe("out");
    expect(outTx.usd).toBeCloseTo(2 * 1840, 2);
    expect(outTx.counterpartyContract).toBe(false);
  });

  it("degrades to nulls/empty when optional pieces are missing", () => {
    const r = parseWalletRaw(ADDR, "base", { info: parts.info }, TS);
    expect(r.txCount).toBeNull();
    expect(r.tokenTransfersCount).toBeNull();
    expect(r.holdings).toEqual([]);
    expect(r.recentTransfers).toEqual([]);
    expect(r.nativeUsd).not.toBeNull();
  });

  it("exposes supported chains and validates addresses", () => {
    expect(Object.keys(WALLET_CHAINS)).toEqual(["base", "ethereum"]);
    expect(ADDRESS_RE.test(ADDR)).toBe(true);
    expect(ADDRESS_RE.test("0x123")).toBe(false);
    expect(ADDRESS_RE.test("F977814e90dA44bFA03b6295A0616a897441aceC")).toBe(false);
  });
});
