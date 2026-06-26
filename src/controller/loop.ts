import { config } from "../shared/config.js";
import { decide } from "./controller.js";
import { research } from "../research/research.js";
import { mirror } from "../ledger/chainMirror.js";
import type { Treasury } from "../treasury/treasury.js";
import type { MarketSource } from "../market/dataSource.js";
import type { Ledger } from "../ledger/ledger.js";
import type { LedgerEntry, LoopCycle, Signal } from "../shared/types.js";

export interface SaleReceipt {
  payer: string;
  value: string;
  settlement: string;
}

export type Sell = (signal: Signal, price: bigint) => Promise<SaleReceipt[]>;

export interface CycleDeps {
  treasury: Treasury;
  market: MarketSource;
  ledger: Ledger;
  sell: Sell;
  ts: number;
  latest?: { signal: Signal | null };
}

let n = 0;

// Write a ledger entry with its on chain mirror reference attached.
async function write(ledger: Ledger, e: Omit<LedgerEntry, "mirrorTx">): Promise<LedgerEntry> {
  const mirrorTx = await mirror(e as LedgerEntry);
  const full = { ...e, mirrorTx };
  await ledger.record(full);
  return full;
}

// One self funding cycle. Decide research or wait, spend on research when solvent,
// publish the signal, let buyers pay, and record every spend and sale with a mirror.
// On a wait cycle the prior signal still sells, so income keeps arriving while the
// agent rebuilds its runway.
export async function runCycle(deps: CycleDeps): Promise<LoopCycle> {
  const { treasury, market, ledger, sell, ts } = deps;
  const d = decide(treasury.balance, config.researchCostMicro, config.signalPriceMicro);

  let signal: Signal | undefined;
  let spent = 0n;
  let earned = 0n;
  let sales = 0;

  if (d.action === "research") {
    const snap = await market.snapshot(ts);
    const r = await research(snap);
    treasury.spend(r.costMicro, r.signal.id);
    spent = r.costMicro;
    await write(ledger, {
      id: `l-${ts}-${++n}`,
      ts,
      kind: "research_spend",
      amount: "-" + r.costMicro.toString(),
      balanceAfter: treasury.balance.toString(),
      ref: r.signal.id,
    });
    signal = r.signal;
    if (deps.latest) deps.latest.signal = signal;
  }

  // Sell whatever the latest signal is. Even on a wait cycle the prior signal earns.
  const toSell = signal ?? deps.latest?.signal ?? null;
  if (toSell) {
    const receipts = await sell(toSell, config.signalPriceMicro);
    for (const rc of receipts) {
      treasury.earn(BigInt(rc.value), toSell.id);
      earned += BigInt(rc.value);
      sales++;
      await write(ledger, {
        id: `l-${ts}-${++n}`,
        ts,
        kind: "signal_sale",
        amount: rc.value,
        balanceAfter: treasury.balance.toString(),
        ref: toSell.id,
        payer: rc.payer,
        settlement: rc.settlement,
      });
    }
  }

  return {
    ts,
    action: d.action,
    reason: d.reason,
    signal,
    sales,
    spent: spent.toString(),
    earned: earned.toString(),
    balanceAfter: treasury.balance.toString(),
  };
}
