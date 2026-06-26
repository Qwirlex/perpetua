import express from "express";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { createFacilitatorConfig } from "@coinbase/x402";
import { config } from "../shared/config.js";
import { buildReport } from "../research/report.js";
import type { Signal, MarketSnapshot } from "../shared/types.js";

// The real earn surface. Two paid routes on the official x402 v2 stack, settled by the
// Coinbase CDP facilitator on Base, so real outside agents discover and pay in USDC and
// the income lands at the seller wallet. Discovery metadata lets the Bazaar index and
// rank the listing after the first settled payment.

export interface LatestState {
  signal: Signal | null;
  snapshot: MarketSnapshot | null;
}

const TAGS = ["crypto", "risk", "signals", "market-data", "trading", "ethereum"];

export async function createSellerApp(payTo: string, latest: LatestState) {
  const facilitatorConfig =
    config.cdpKeyId && config.cdpKeySecret
      ? createFacilitatorConfig(config.cdpKeyId, config.cdpKeySecret)
      : { url: "https://x402.org/facilitator" };

  const network = config.sellerNetwork as `${string}:${string}`;
  const facilitatorClient = new HTTPFacilitatorClient(facilitatorConfig);
  const resourceServer = new x402ResourceServer(facilitatorClient).register(
    network,
    new ExactEvmScheme(),
  );

  // Fetch the facilitator's supported kinds before serving so the very first request
  // can build a 402 instead of racing the background sync. Retry a few times so a brief
  // facilitator hiccup at boot self heals rather than leaving a dead endpoint.
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      await resourceServer.initialize();
      break;
    } catch (e) {
      console.warn(`seller facilitator init attempt ${attempt} failed: ${(e as Error).message}`);
      if (attempt === 4) {
        console.warn("seller starting without facilitator init, will rely on lazy sync");
      } else {
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
  }

  const app = express();

  app.use(
    paymentMiddleware(
      {
        "GET /signal": {
          accepts: {
            scheme: "exact",
            price: config.basicPrice,
            network,
            payTo,
          },
          serviceName: "Perpetua crypto risk signal",
          description:
            "Crypto risk signal for an asset, a 0 to 100 risk score plus a trend call and an on chain anomaly flag with a short plain language rationale.",
          tags: TAGS,
        },
        "GET /report": {
          accepts: {
            scheme: "exact",
            price: config.reportPrice,
            network,
            payTo,
          },
          serviceName: "Perpetua crypto risk report",
          description:
            "Enriched crypto risk report, a weighted factor breakdown plus a written analysis and a confidence label, for agents that want a real answer not just a ping.",
          tags: TAGS,
        },
      },
      resourceServer,
    ),
  );

  // Paid, the basic signal.
  app.get("/signal", (_req, res) => {
    if (!latest.signal) {
      res.status(404).json({ error: "no signal yet" });
      return;
    }
    res.json(latest.signal);
  });

  // Paid, the enriched report, computed on demand.
  app.get("/report", async (_req, res) => {
    if (!latest.signal || !latest.snapshot) {
      res.status(404).json({ error: "no signal yet" });
      return;
    }
    res.json(await buildReport(latest.signal, latest.snapshot));
  });

  // Free, a plain catalog so a human or an agent can see what is sold and the price.
  app.get("/", (_req, res) => {
    res.json({
      name: "Perpetua crypto intelligence",
      network,
      payTo,
      products: [
        { resource: "/signal", price: config.basicPrice, description: "Risk score, trend, anomaly, rationale." },
        { resource: "/report", price: config.reportPrice, description: "Factor breakdown plus written analysis and confidence." },
      ],
    });
  });

  return app;
}
