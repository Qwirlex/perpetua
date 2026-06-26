import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { createMarketApp } from "./market-server/server.js";
import { createSellerApp } from "./seller/server.js";
import { createApiApp } from "./api/server.js";
import { BuyerAgent } from "./buyers/buyerAgent.js";
import { Treasury } from "./treasury/treasury.js";
import { MarketSource } from "./market/dataSource.js";
import { createLedger } from "./ledger/createLedger.js";
import { mirror } from "./ledger/chainMirror.js";
import { runCycle, type Sell, type SaleReceipt } from "./controller/loop.js";
import { config } from "./shared/config.js";
import { toUsdc } from "./shared/money.js";
import type { LoopCycle, Signal, LedgerEntry, MarketSnapshot } from "./shared/types.js";

// Perpetua orchestrator. Boot the SignalMarket, the buyer agents, the ledger and
// treasury, then run the self funding loop forever. Each cycle the agent decides
// research or wait, and the buyers pay for the latest signal over a real x402
// handshake against the local market server.

const agent = config.agentPrivateKey
  ? privateKeyToAccount(config.agentPrivateKey as `0x${string}`)
  : privateKeyToAccount(generatePrivateKey());

const latest: { signal: Signal | null; snapshot: MarketSnapshot | null } = {
  signal: null,
  snapshot: null,
};
const market = new MarketSource();
const treasury = new Treasury(config.seedMicro);
const cycles: LoopCycle[] = [];
// In live mode use the funded buyer wallets from the environment. In demo generate
// fresh throwaway wallets each boot.
const buyers =
  config.live && config.buyerKeys.length > 0
    ? config.buyerKeys.map((k) => new BuyerAgent(k as `0x${string}`))
    : Array.from({ length: config.buyersPerCycle }, () => new BuyerAgent());

// SignalMarket, the earn endpoint, sales pay the agent address.
const marketApp = createMarketApp(agent.address, () => latest.signal);
const marketServer = marketApp.listen(config.marketPort, () =>
  console.log(`market on http://127.0.0.1:${config.marketPort}  agent ${agent.address}`),
);
const marketUrl = `http://127.0.0.1:${config.marketPort}`;

// The real earn surface, the public x402 v2 endpoint settled by the CDP facilitator.
// Sales pay the seller wallet. Outside agents discover it on the Bazaar and pay in USDC.
const sellerPayTo = config.sellerPayTo || agent.address;
try {
  const sellerApp = await createSellerApp(sellerPayTo, latest);
  sellerApp.listen(config.sellerPort, () =>
    console.log(
      `seller on http://127.0.0.1:${config.sellerPort}  payTo ${sellerPayTo}  network ${config.sellerNetwork}  facilitator ${config.facilitatorUrl || (config.cdpKeyId ? "CDP" : "x402.org testnet")}`,
    ),
  );
} catch (e) {
  console.warn("seller endpoint not started:", (e as Error).message);
}
// A facilitator hiccup must not crash the agent or the dashboard.
process.on("unhandledRejection", (e) => console.warn("unhandledRejection:", String(e)));

const ledger = await createLedger();

// Continuity across restarts. The treasury lives in memory, so on a restart we
// reconstruct it from the ledger, the durable record of every move of value. The seed
// is recorded only on the very first boot, so a restart never injects fresh capital,
// the self funding story stays honest across reboots.
const prior = await ledger.history(1_000_000);
if (prior.length === 0) {
  const seedEntry: LedgerEntry = {
    id: "l-seed",
    ts: Date.now(),
    kind: "seed",
    amount: config.seedMicro.toString(),
    balanceAfter: treasury.balance.toString(),
    ref: "seed",
  };
  seedEntry.mirrorTx = await mirror(seedEntry);
  await ledger.record(seedEntry);
} else {
  let earned = 0n;
  let spent = 0n;
  for (const e of prior) {
    if (e.kind === "signal_sale") earned += BigInt(e.amount);
    else if (e.kind === "research_spend") spent += BigInt(e.amount.replace("-", ""));
  }
  treasury.balance = BigInt(prior[prior.length - 1].balanceAfter);
  treasury.earned = earned;
  treasury.spent = spent;
  // Seed the chart so it resumes at the real balance rather than from zero.
  for (const e of prior.slice(-300)) {
    cycles.push({
      ts: e.ts,
      action: "wait",
      reason: "history",
      sales: 0,
      spent: "0",
      earned: "0",
      balanceAfter: e.balanceAfter,
    });
  }
  console.log(
    `restored from ledger, balance ${toUsdc(treasury.balance)} USDC, earned ${toUsdc(earned)}, spent ${toUsdc(spent)}, ${prior.length} entries`,
  );
}

const apiApp = createApiApp(treasury, ledger, cycles);
apiApp.listen(config.apiPort, () =>
  console.log(`dashboard http://127.0.0.1:${config.apiPort}`),
);

// Drive every buyer through the real x402 handshake against the market server.
const sell: Sell = async () => {
  const receipts: SaleReceipt[] = [];
  for (const b of buyers) {
    try {
      const r = await b.buy(marketUrl);
      receipts.push({ payer: r.payer, value: r.value, settlement: r.settlement });
    } catch (e) {
      console.warn("buyer skipped:", (e as Error).message);
    }
  }
  return receipts;
};

let running = false;
async function tick() {
  if (running) return; // never overlap cycles
  running = true;
  try {
    const cyc = await runCycle({ treasury, market, ledger, sell, ts: Date.now(), latest });
    cycles.push(cyc);
    console.log(
      `[${cyc.action}] balance ${toUsdc(BigInt(cyc.balanceAfter))} USDC` +
        `  earned ${toUsdc(BigInt(treasury.earned))}  spent ${toUsdc(BigInt(treasury.spent))}` +
        `  sales ${cyc.sales}` +
        (cyc.signal ? `  signal risk ${cyc.signal.score} ${cyc.signal.trend}` : ""),
    );
  } catch (e) {
    console.error("cycle error:", (e as Error).message);
  } finally {
    running = false;
  }
}

await tick();
const timer = setInterval(tick, config.cycleMs);

process.on("SIGINT", () => {
  clearInterval(timer);
  marketServer.close();
  ledger.close().finally(() => process.exit(0));
});
