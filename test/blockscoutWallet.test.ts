import { describe, it, expect } from "vitest";
import { parseWalletRaw, tokenCatalog, WALLET_CHAINS, ADDRESS_RE, type WalletParts } from "../src/market/blockscoutWallet.js";

// Shapes captured from live base.blockscout.com v2 responses 2026-07-18, token addresses
// re-checked 2026-07-27 (both the balance and the transfer feed carry full token metadata).
const ADDR = "0xF977814e90dA44bFA03b6295A0616a897441aceC";
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const ZEN = "0x1111111111111111111111111111111111111111";
const SCAM = "0x2222222222222222222222222222222222222222";
const NOPRICE = "0x3333333333333333333333333333333333333333";
const DUST = "0x4444444444444444444444444444444444444444";
const WETH = "0x4200000000000000000000000000000000000006";

const parts: WalletParts = {
  info: { coin_balance: "30002602427576417947918", exchange_rate: "1840.19", is_contract: false },
  counters: { transactions_count: "667", token_transfers_count: "37281929" },
  tokenBalances: [
    { token: { address_hash: USDC, decimals: "6", exchange_rate: "1.0", symbol: "USDC", reputation: "ok" }, value: "2500000000" },
    { token: { address_hash: ZEN, decimals: "18", exchange_rate: "4.13", symbol: "ZEN", reputation: "ok" }, value: "1000000000000000000000" },
    { token: { address_hash: SCAM, decimals: "18", exchange_rate: "99999", symbol: "SCAM", reputation: "scam" }, value: "1000000000000000000000" },
    { token: { address_hash: NOPRICE, decimals: "18", exchange_rate: null, symbol: "NOPRICE", reputation: "ok" }, value: "5000000000000000000" },
    { token: { address_hash: DUST, decimals: "18", exchange_rate: "0.0000001", symbol: "DUST", reputation: "ok" }, value: "1000000000000000000" },
  ],
  tokenTransfers: [
    {
      timestamp: "2026-07-18T13:57:21.000000Z",
      from: { hash: "0x151138064AEC98848cf957757585226f390deFDB", is_contract: true },
      to: { hash: ADDR, is_contract: false },
      total: { decimals: "6", value: "1200000000" },
      token: { address_hash: USDC, decimals: "6", exchange_rate: "1.0", symbol: "USDC", reputation: "ok" },
    },
    {
      timestamp: "2026-07-18T10:00:00.000000Z",
      from: { hash: ADDR, is_contract: false },
      to: { hash: "0x0000000000000000000000000000000000000001", is_contract: false },
      total: { decimals: "18", value: "2000000000000000000" },
      token: { address_hash: WETH, decimals: "18", exchange_rate: "1840.0", symbol: "WETH", reputation: "ok" },
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

  it("keeps only priced ok-reputation holdings worth >= the dust floor, sorted desc", () => {
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

describe("tokenCatalog", () => {
  it("unions tokens from the balance list and the transfer feed, keyed lowercase", () => {
    const cat = tokenCatalog(parts);
    expect([...cat.keys()].sort()).toEqual([USDC, ZEN, SCAM, NOPRICE, DUST, WETH].map((a) => a.toLowerCase()).sort());
    expect(cat.get(WETH.toLowerCase())?.symbol).toBe("WETH");
  });

  it("puts transferred tokens first so the capped chain read cannot drop them", () => {
    // WETH only ever appears in a transfer, and the chain read is sliced, so it has to
    // outrank the indexer's cached balance list.
    expect([...tokenCatalog(parts).values()].map((t) => t.symbol).slice(0, 2)).toEqual(["USDC", "WETH"]);
  });

  it("skips tokens with no usable address and never duplicates one", () => {
    const cat = tokenCatalog({
      info: {},
      tokenBalances: [{ token: { symbol: "NOADDR" }, value: "1" }, { token: { address_hash: USDC, symbol: "USDC" }, value: "1" }],
      tokenTransfers: [{ token: { address_hash: USDC.toLowerCase(), symbol: "USDC" } }],
    });
    expect(cat.size).toBe(1);
  });
});

describe("parseWalletRaw with on-chain balances", () => {
  // The stale-indexer case that shipped a wrong paid answer on 2026-07-27: Blockscout
  // said 0.695 USDC for a wallet the chain valued at 16.11.
  const onchain = {
    nativeWei: 5_000_000_000_000_000_000n, // 5 native units
    tokens: new Map<string, bigint>([
      [USDC.toLowerCase(), 16_110_000n], // 16.11 USDC, not the indexer's 2500
      [ZEN.toLowerCase(), 0n], // sold since the indexer cached it
      [WETH.toLowerCase(), 2_000_000_000_000_000_000n], // only ever seen in a transfer
      [SCAM.toLowerCase(), 1_000_000_000_000_000_000_000n],
      [NOPRICE.toLowerCase(), 5_000_000_000_000_000_000n],
    ]),
  };

  it("prices holdings from the chain balance, not the cached one", () => {
    const r = parseWalletRaw(ADDR, "base", parts, TS, onchain);
    const usdc = r.holdings.find((h) => h.symbol === "USDC");
    expect(usdc?.usd).toBeCloseTo(16.11, 2);
  });

  it("counts a token seen only in the transfer feed when the chain says it is held", () => {
    const r = parseWalletRaw(ADDR, "base", parts, TS, onchain);
    expect(r.holdings.find((h) => h.symbol === "WETH")?.usd).toBeCloseTo(3680, 0);
  });

  it("drops a token the chain says is gone even though the indexer still lists it", () => {
    const r = parseWalletRaw(ADDR, "base", parts, TS, onchain);
    expect(r.holdings.map((h) => h.symbol)).not.toContain("ZEN");
  });

  it("still excludes scam and unpriced tokens with a real chain balance", () => {
    const r = parseWalletRaw(ADDR, "base", parts, TS, onchain);
    expect(r.holdings.map((h) => h.symbol)).toEqual(["WETH", "USDC"]);
  });

  it("takes the native balance from the chain read", () => {
    const r = parseWalletRaw(ADDR, "base", parts, TS, onchain);
    expect(r.nativeBalance).toBeCloseTo(5, 6);
    expect(r.nativeUsd).toBeCloseTo(5 * 1840.19, 2);
  });

  it("labels where the balances came from so a buyer can tell", () => {
    expect(parseWalletRaw(ADDR, "base", parts, TS, onchain).balanceSource).toBe("chain");
    expect(parseWalletRaw(ADDR, "base", parts, TS).balanceSource).toBe("indexer");
  });

  it("treats a token the chain read did not cover as not held", () => {
    const thin = { nativeWei: 0n, tokens: new Map<string, bigint>() };
    expect(parseWalletRaw(ADDR, "base", parts, TS, thin).holdings).toEqual([]);
  });
});
