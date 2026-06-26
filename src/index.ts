import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { createMarketApp } from "./market-server/server.js";
import { createApiApp } from "./api/server.js";
import { BuyerAgent } from "./buyers/buyerAgent.js";
import { Treasury } from "./treasury/treasury.js";
import { MarketSource } from "./market/dataSource.js";
import { createLedger } from "./ledger/createLedger.js";
import { mirror } from "./ledger/chainMirror.js";
import { runCycle, type Sell, type SaleReceipt } from "./controller/loop.js";
import { config } from "./shared/config.js";
import { toUsdc } from "./shared/money.js";
import type { LoopCycle, Signal, LedgerEntry } from "./shared/types.js";

// Perpetua orchestrator. Boot the SignalMarket, the buyer agents, the ledger and
// treasury, then run the self funding loop forever. Each cycle the agent decides
// research or wait, and the buyers pay for the latest signal over a real x402
// handshake against the local market server.

const agent = config.agentPrivateKey
  ? privateKeyToAccount(config.agentPrivateKey as `0x${string}`)
  : privateKeyToAccount(generatePrivateKey());

const latest: { signal: Signal | null } = { signal: null };
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

const ledger = await createLedger();

// Record the seed, the only capital the agent ever receives from outside.
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
