// Register the Perpetua endpoints on x402scan without a browser.
//
// x402scan's registry write endpoints are free but gated by SIWX, a CAIP-122 wallet
// signature carried in the SIGN-IN-WITH-X header. The docs point at their web form, but
// the signature is just an EIP-191 personal_sign, so any key we hold can produce it and
// no browser is needed.
//
// The handshake is done by hand rather than with wrapFetchWithSIWx, because that wrapper
// gives up unless the 402 carries a payment option it can match a chain against, and
// these routes are auth only, they answer with accepts: []. The chain is in the SIWX
// extension itself, so we read it from there.
//
// register-origin is the one to run, it walks our OpenAPI spec and registers every paid
// route at once, so a price change only needs one call rather than one per resource.
//
// Run:
//   BUYER_KEY=0x... node scripts/x402scan-register.mjs
//   BUYER_KEY=0x... node scripts/x402scan-register.mjs https://api.tradeperpetua.xyz/whale
import { createSIWxPayload, encodeSIWxHeader, SIGN_IN_WITH_X } from "@x402/extensions/sign-in-with-x";
import { privateKeyToAccount } from "viem/accounts";

const KEY = process.env.BUYER_KEY;
const ORIGIN = process.env.ORIGIN || "https://api.tradeperpetua.xyz";
const SCAN = process.env.X402SCAN_BASE || "https://www.x402scan.com";
if (!KEY) throw new Error("set BUYER_KEY to a wallet private key, it only signs, it never pays");

const account = privateKeyToAccount(KEY);
console.log("signing as", account.address);

// A single resource URL as argv[2] registers just that one, otherwise the whole origin.
const one = process.argv[2];
const url = one ? `${SCAN}/api/x402/registry/register` : `${SCAN}/api/x402/registry/register-origin`;
const body = JSON.stringify(one ? { url: one } : { origin: ORIGIN });
const headers = { "content-type": "application/json" };
console.log("POST", url, body);

const challenge = await fetch(url, { method: "POST", headers, body });
if (challenge.status !== 402) {
  console.log("status", challenge.status, "no challenge, response follows");
  console.log(await challenge.text());
  process.exit(0);
}

const required = JSON.parse(Buffer.from(challenge.headers.get("payment-required"), "base64").toString("utf8"));
const siwx = required.extensions?.[SIGN_IN_WITH_X];
const chain = siwx?.supportedChains?.[0];
if (!chain) throw new Error(`no SIWX challenge in the 402: ${JSON.stringify(required).slice(0, 300)}`);
console.log("challenge", chain.chainId, chain.type, "nonce", siwx.info.nonce);

const payload = await createSIWxPayload({ ...siwx.info, chainId: chain.chainId, type: chain.type }, account);
const res = await fetch(url, {
  method: "POST",
  headers: { ...headers, [SIGN_IN_WITH_X]: encodeSIWxHeader(payload) },
  body,
});
console.log("status", res.status);
console.log(await res.text());
