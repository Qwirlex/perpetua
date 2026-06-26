import express from "express";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { declareDiscoveryExtension } from "@x402/extensions/bazaar";
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

// Optional asset query param, currently ETH. Gives agents an input schema to read.
const INPUT_SCHEMA = {
  properties: {
    asset: { type: "string", enum: ["ETH"], description: "Asset symbol, currently ETH" },
  },
};

const SIGNAL_OUTPUT = {
  example: { asset: "ETH", price: 1578.1, score: 23, trend: "flat", anomaly: false, rationale: "ETH is steady with low risk." },
  schema: {
    type: "object",
    properties: {
      asset: { type: "string" },
      price: { type: "number" },
      score: { type: "number", description: "Risk score 0 to 100" },
      trend: { type: "string", enum: ["up", "down", "flat"] },
      anomaly: { type: "boolean" },
      rationale: { type: "string" },
    },
  },
};

const REPORT_OUTPUT = {
  example: {
    asset: "ETH", price: 1578.1, score: 23, trend: "flat", anomaly: false, confidence: "medium",
    factors: [{ name: "Price move 24h", reading: "0.4 percent", weight: "low" }],
    analysis: "ETH is steady near 1578 with low risk, volume is moderate and gas is calm.",
  },
  schema: {
    type: "object",
    properties: {
      asset: { type: "string" }, price: { type: "number" }, score: { type: "number" },
      trend: { type: "string" }, anomaly: { type: "boolean" },
      confidence: { type: "string", enum: ["low", "medium", "high"] },
      factors: { type: "array" }, analysis: { type: "string" },
    },
  },
};

export async function createSellerApp(payTo: string, latest: LatestState) {
  // Facilitator selection. A configured URL such as the PayAI facilitator wins, it needs
  // no KYB and covers gas. Otherwise CDP if creds are present, else the public testnet one.
  const facilitatorConfig = config.facilitatorUrl
    ? { url: config.facilitatorUrl }
    : config.cdpKeyId && config.cdpKeySecret
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
          extensions: {
            ...declareDiscoveryExtension({
              input: { asset: "ETH" },
              inputSchema: INPUT_SCHEMA,
              output: SIGNAL_OUTPUT,
            }),
          },
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
          extensions: {
            ...declareDiscoveryExtension({
              input: { asset: "ETH" },
              inputSchema: INPUT_SCHEMA,
              output: REPORT_OUTPUT,
            }),
          },
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

  // USDC contract per network, used in the discovery document.
  const USDC_BY_NETWORK: Record<string, string> = {
    "eip155:8453": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    "eip155:84532": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  };
  const usdc = USDC_BY_NETWORK[network] ?? USDC_BY_NETWORK["eip155:8453"];
  const priceToAmount = (p: string) => Math.round(parseFloat(p.replace("$", "")) * 1_000_000).toString();
  const base = config.sellerPublicUrl.replace(/\/$/, "");

  function item(path: string, price: string, description: string) {
    return {
      resource: `${base}${path}`,
      type: "http",
      method: "GET",
      x402Version: 1,
      description,
      accepts: [
        {
          scheme: "exact",
          network,
          maxAmountRequired: priceToAmount(price),
          asset: usdc,
          payTo,
          extra: { name: "USD Coin", version: "2" },
        },
      ],
    };
  }

  // Discovery document. Crawlers and x402scan can auto register both resources with full
  // metadata from here. Served at the well known path and at /discovery.
  const discovery = {
    x402Version: 1,
    items: [
      item("/signal", config.basicPrice, "Crypto risk signal, a 0 to 100 risk score plus trend and an on chain anomaly flag with a short rationale."),
      item("/report", config.reportPrice, "Enriched crypto risk report, a weighted factor breakdown plus a written analysis and a confidence label."),
    ],
  };
  app.get("/.well-known/x402", (_req, res) => res.json(discovery));
  app.get("/discovery", (_req, res) => res.json(discovery));

  // Free, a plain catalog so a human or an agent can see what is sold and the price.
  app.get("/", (_req, res) => {
    res.json({
      name: "Perpetua crypto intelligence",
      description:
        "An autonomous agent that sells crypto risk intelligence over x402. Pay per call in USDC on Base.",
      network,
      payTo,
      docs: `${base}/docs`,
      discovery: `${base}/.well-known/x402`,
      products: [
        { resource: "/signal", price: config.basicPrice, description: "Risk score, trend, anomaly, rationale." },
        { resource: "/report", price: config.reportPrice, description: "Factor breakdown plus written analysis and confidence." },
      ],
    });
  });

  // Human and agent friendly docs page.
  app.get("/docs", (_req, res) => {
    res.type("html").send(docsHtml(base, config.basicPrice, config.reportPrice, network));
  });

  return app;
}

function docsHtml(base: string, basicPrice: string, reportPrice: string, network: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Perpetua API, crypto risk intelligence over x402</title>
<style>
body{font:15px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;max-width:760px;margin:40px auto;padding:0 22px;background:#0a0e16;color:#e6edf3}
h1{font-size:26px} h2{font-size:18px;margin-top:30px;border-bottom:1px solid #1f2937;padding-bottom:6px}
code,pre{font-family:ui-monospace,monospace} pre{background:#121826;border:1px solid #1f2937;border-radius:10px;padding:14px;overflow:auto}
a{color:#6ea8fe} .price{color:#3fd07f;font-weight:700} .muted{color:#8b98a9}
table{width:100%;border-collapse:collapse;margin:10px 0} td,th{border:1px solid #1f2937;padding:8px;text-align:left}
</style></head><body>
<h1>Perpetua API</h1>
<p>Crypto risk intelligence, sold per call over the x402 payment protocol. Pay in USDC on Base, no account, no API key. An AI agent researches the market and sells what it learns.</p>
<h2>Endpoints</h2>
<table>
<tr><th>Resource</th><th>Price</th><th>What you get</th></tr>
<tr><td><code>GET ${base}/signal</code></td><td class="price">${basicPrice}</td><td>Risk score 0 to 100, trend, on chain anomaly flag, one line rationale.</td></tr>
<tr><td><code>GET ${base}/report</code></td><td class="price">${reportPrice}</td><td>Weighted factor breakdown, written analysis, confidence label.</td></tr>
</table>
<p class="muted">Network ${network}, asset USDC. Payments settle on chain.</p>
<h2>Pay with an x402 client</h2>
<pre>import { wrapFetchWithPayment } from "@x402/fetch";
import { x402Client } from "@x402/core/client";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { privateKeyToAccount } from "viem/accounts";

const account = privateKeyToAccount(process.env.KEY);
const client = new x402Client().register("${network}", new ExactEvmScheme(account));
const pay = wrapFetchWithPayment(fetch, client);

const res = await pay("${base}/signal");
console.log(await res.json());</pre>
<h2>The flow</h2>
<p>An unpaid request returns HTTP 402 with the payment requirements in the <code>PAYMENT-REQUIRED</code> header. Your x402 client signs a USDC authorization, the facilitator settles it on Base, and the request returns the data. It is gasless for the caller.</p>
<h2>Example signal</h2>
<pre>{ "asset": "ETH", "price": 1578.1, "score": 23, "trend": "flat",
  "anomaly": false, "rationale": "ETH is steady with low risk." }</pre>
<h2>Discovery</h2>
<p>Machine discovery document at <a href="${base}/.well-known/x402">${base}/.well-known/x402</a>.</p>
<p class="muted">Perpetua, a self funding autonomous research agent. <a href="https://tradeperpetua.xyz">tradeperpetua.xyz</a></p>
</body></html>`;
}
