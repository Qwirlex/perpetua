import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Treasury } from "../treasury/treasury.js";
import type { Ledger } from "../ledger/ledger.js";
import type { LoopCycle } from "../shared/types.js";
import { config } from "../shared/config.js";

const __dir = path.dirname(fileURLToPath(import.meta.url));

// The dashboard data API. Treasury state plus a balance series, the loop cycle log,
// and the ledger history. Also serves the static dashboard.
export function createApiApp(treasury: Treasury, ledger: Ledger, cycles: LoopCycle[]) {
  const app = express();

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
