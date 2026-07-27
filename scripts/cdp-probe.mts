// Boot ONLY the paid seller, on its own port, against whichever facilitator the env
// selects. Nothing else starts, so the demo loop and its agent key are untouched, which
// matters because two live instances sharing AGENT_PRIVATE_KEY fight over Base nonces.
//
// The point is to answer one question with real money: does a settlement through the
// Coinbase CDP facilitator work for this account today. Only CDP settled resources land
// in the CDP Bazaar, and agentic.market mirrors that Bazaar, so this single fact decides
// whether those two directories are reachable at all.
//
// Run on the host that holds the CDP keys, then tunnel to it rather than copying the
// buyer key over:
//   FACILITATOR_URL= SELLER_PORT=4099 npx tsx scripts/cdp-probe.mts
//   ssh -N -L 4099:127.0.0.1:4099 root@HOST
import { createSellerApp, type LatestState } from "../src/seller/server.js";
import { config } from "../src/shared/config.js";

const payTo = config.sellerPayTo;
if (!payTo) throw new Error("SELLER_PAYTO must be set so a real settlement has a destination");

// The seller reads the loop's latest state for /signal and /report. This probe only
// exercises a route that computes on demand, so an empty state is enough.
const latest: LatestState = { signal: null, snapshot: null, byAsset: {} };

const app = await createSellerApp(payTo, latest);
app.listen(config.sellerPort, () =>
  console.log(
    `probe seller on http://127.0.0.1:${config.sellerPort}  payTo ${payTo}  network ${config.sellerNetwork}  facilitator ${config.facilitatorUrl || (config.cdpKeyId ? "CDP" : "x402.org testnet")}`,
  ),
);
