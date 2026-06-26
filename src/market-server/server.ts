import express from "express";
import { x402Gate } from "../x402/gate.js";
import { config } from "../shared/config.js";
import type { Signal } from "../shared/types.js";

// SignalMarket, the earn side. GET /catalog returns the x402 Bazaar listing shape so
// the endpoint looks discoverable to other agents. GET /signal is gated by x402, on a
// verified payment it returns the current signal. The loop publishes the latest signal
// through getSignal.
export function createMarketApp(payTo: string, getSignal: () => Signal | null) {
  const app = express();

  app.get("/catalog", (_req, res) => {
    res.json({
      name: "Perpetua crypto intelligence",
      resource: "/signal",
      network: config.x402Network,
      asset: config.usdc || "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      payTo,
      price: config.signalPriceMicro.toString(),
      currency: "USDC",
      description:
        "Risk score, trend, and on chain anomaly flag for a crypto asset, priced per call over x402.",
    });
  });

  app.get(
    "/signal",
    x402Gate({ payTo, amount: config.signalPriceMicro.toString(), resource: "/signal" }),
    (_req, res) => {
      const s = getSignal();
      if (!s) {
        res.status(404).json({ error: "no signal yet" });
        return;
      }
      res.json(s);
    },
  );

  return app;
}
