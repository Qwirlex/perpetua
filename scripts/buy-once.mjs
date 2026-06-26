// Make one real x402 purchase from the Perpetua paid endpoint. The buyer signs an
// EIP-3009 USDC authorization, the Coinbase CDP facilitator settles it on Base, and the
// first settled payment triggers the Bazaar cataloging so outside agents can find us.
//
// The buyer is gasless, it only needs USDC, the facilitator pays the gas.
//
// Run:
//   BUYER_KEY=0x... node scripts/buy-once.mjs
//   BUYER_KEY=0x... BUY_URL=https://api.tradeperpetua.xyz/report node scripts/buy-once.mjs
import { wrapFetchWithPayment } from "@x402/fetch";
import { x402Client } from "@x402/core/client";
import { registerExactEvmScheme } from "@x402/evm/exact/client/register";
import { privateKeyToAccount } from "viem/accounts";

const KEY = process.env.BUYER_KEY;
const URL = process.env.BUY_URL || "https://api.tradeperpetua.xyz/signal";
if (!KEY) throw new Error("set BUYER_KEY to the buyer wallet private key");

const account = privateKeyToAccount(KEY);
console.log("buyer", account.address);
console.log("buying", URL);

const client = new x402Client();
registerExactEvmScheme(client, {
  signer: account,
  options: { rpcUrl: process.env.BASE_RPC_URL || "https://mainnet.base.org" },
});

const fetchWithPay = wrapFetchWithPayment(fetch, client);

const res = await fetchWithPay(URL);
console.log("status", res.status);
const payResp = res.headers.get("x-payment-response") || res.headers.get("payment-response");
if (payResp) {
  try {
    const decoded = JSON.parse(Buffer.from(payResp, "base64").toString("utf8"));
    console.log("settlement", JSON.stringify(decoded));
  } catch {
    console.log("payment-response header", payResp);
  }
}
const body = await res.text();
console.log("body", body.slice(0, 600));
