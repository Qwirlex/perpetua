import { describe, it, expect, afterAll } from "vitest";
import { rm } from "node:fs/promises";
import { Treasury } from "../src/treasury/treasury.js";
import { MarketSource } from "../src/market/dataSource.js";
import { FileLedger } from "../src/ledger/fileLedger.js";
import { runCycle, type SaleReceipt } from "../src/controller/loop.js";
import type { Signal } from "../src/shared/types.js";

const LEDGER_PATH = "test-ledger.local.json";

afterAll(async () => {
  await rm(LEDGER_PATH, { force: true });
});

describe("loop", () => {
  it("a producing cycle ends with a higher balance and records both sides", async () => {
    const t = new Treasury(20_000n);
    const market = new MarketSource();
    const ledger = new FileLedger(LEDGER_PATH);
    const before = t.balance;
    const sell = async (_sig: Signal, price: bigint): Promise<SaleReceipt[]> => [
      { payer: "0xbuyer1", value: price.toString(), settlement: "demo1" },
      { payer: "0xbuyer2", value: price.toString(), settlement: "demo2" },
      { payer: "0xbuyer3", value: price.toString(), settlement: "demo3" },
    ];
    const cyc = await runCycle({ treasury: t, market, ledger, sell, ts: 1000 });
    expect(cyc.action).toBe("research");
    expect(cyc.sales).toBe(3);
    expect(t.balance).toBeGreaterThan(before); // 20000 - 5000 + 30000 = 45000
    expect(t.balance).toBe(45_000n);

    const hist = await ledger.history();
    expect(hist.some((e) => e.kind === "research_spend")).toBe(true);
    expect(hist.filter((e) => e.kind === "signal_sale").length).toBe(3);
    expect(hist.every((e) => !!e.mirrorTx)).toBe(true); // every entry mirrored
  });

  it("waits and still earns when the balance is below the buffer", async () => {
    const t = new Treasury(8_000n); // below research 5000 + price 10000 buffer
    const market = new MarketSource();
    const ledger = new FileLedger(LEDGER_PATH);
    const priorSignal: Signal = {
      id: "sig-prior",
      ts: 0,
      asset: "ETH",
      price: 3000,
      score: 40,
      trend: "flat",
      anomaly: false,
      rationale: "prior",
    };
    const sell = async (_sig: Signal, price: bigint): Promise<SaleReceipt[]> => [
      { payer: "0xbuyer1", value: price.toString(), settlement: "d1" },
    ];
    const cyc = await runCycle({
      treasury: t,
      market,
      ledger,
      sell,
      ts: 2000,
      latest: { signal: priorSignal },
    });
    expect(cyc.action).toBe("wait");
    expect(cyc.sales).toBe(1); // the prior signal still sells
    expect(t.balance).toBe(18_000n); // 8000 + 10000, no research spend
  });
});
