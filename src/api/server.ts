import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Treasury } from "../treasury/treasury.js";
import type { Ledger } from "../ledger/ledger.js";
import type { LoopCycle } from "../shared/types.js";
import type { IncomeTracker } from "../income/income.js";
import { config } from "../shared/config.js";

const __dir = path.dirname(fileURLToPath(import.meta.url));

// The dashboard data API. Treasury state plus a balance series, the loop cycle log,
// the ledger history, and the real on chain income. Also serves the static dashboard.
export function createApiApp(treasury: Treasury, ledger: Ledger, cycles: LoopCycle[], income?: IncomeTracker) {
  const app = express();

  // Real income earned at the seller wallet on Base mainnet from outside buyers.
  app.get("/income", (_req, res) => {
    res.json(income ? income.state() : { totalMicro: "0", count: 0, balanceMicro: "0", recent: [] });
  });

  app.get("/state", (_req, res) => {
    res.json({
      ...treasury.state(),
      live: config.live,
      asset: config.asset,
      price: config.signalPriceMicro.toString(),
      researchCost: config.researchCostMicro.toString(),
      series: cycles.map((c) => ({ ts: c.ts, balance: c.balanceAfter })),
    });
  });

  app.get("/cycles", (_req, res) => {
    res.json(cycles.slice(-100));
  });

  app.get("/ledger", async (_req, res) => {
    res.json(await ledger.history(200));
  });

  app.use("/", express.static(path.resolve(__dir, "../../dashboard")));

  return app;
}
