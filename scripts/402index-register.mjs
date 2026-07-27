// Register every Perpetua endpoint on 402index.io. Free, no wallet, no key, but the
// directory rate limits registration, so this walks the list slowly and prints what came
// back for each one.
//
// Registrations made on 2026-07-18 and 2026-07-26 never appeared in the public directory
// and their ids 404, so a submission is not a listing. Re-run this and check the search
// afterwards rather than trusting the 201.
//
// Run:
//   node scripts/402index-register.mjs
//   DRY=1 node scripts/402index-register.mjs   # print the payloads, send nothing
const API = process.env.INDEX_API || "https://402index.io/api/v1/register";
const BASE = process.env.SELLER_PUBLIC_URL || "https://api.tradeperpetua.xyz";
const EMAIL = process.env.CONTACT_EMAIL || "t0685985352@gmail.com";
const PASTE = '{"source":"// SPDX-License-Identifier: MIT\\npragma solidity ^0.8.20;\\ncontract Vault { address public owner; }"}';

const common = {
  protocol: "x402",
  contact_email: EMAIL,
  payment_asset: "USDC",
  payment_network: "base",
  provider: "Perpetua",
};

const services = [
  {
    url: `${BASE}/audit`, name: "Aegis smart contract full audit", price_usd: 10, category: "security",
    description:
      "Full smart contract audit across six focused lenses, access control, reentrancy and state order, arithmetic, economics and oracles, upgradeability and token rug vectors. Every finding is then challenged by an adversarial pass that tries to refute it, so what ships is only what survived. Returns a job id at once, then a signed report with exploit scenarios and a table of what the owner can do. Six EVM chains. Nothing is charged when the source is unverified or does not compile.",
  },
  {
    url: `${BASE}/scan`, name: "Aegis smart contract quick scan", price_usd: 5, category: "security",
    description:
      "Fast security verdict for a deployed contract on Base, Ethereum, Arbitrum, Optimism, Polygon or BSC. Static analysis plus one reasoning pass returns a 0 to 100 risk score, a verdict and up to five findings, each with a file and a line. Nothing is charged when the source is unverified or does not compile.",
  },
  {
    url: `${BASE}/audit`, name: "Aegis full audit, pasted source", price_usd: 10, category: "security",
    http_method: "POST", probe_body: PASTE,
    description: "The same six lens audit with the adversarial refutation pass, for Solidity pasted in the body, for code that is not deployed or not verified.",
  },
  {
    url: `${BASE}/scan`, name: "Aegis quick scan, pasted source", price_usd: 5, category: "security",
    http_method: "POST", probe_body: PASTE,
    description: "The same quick scan verdict for Solidity pasted in the body, for code that is not deployed or not verified.",
  },
  {
    url: `${BASE}/whale`, name: "Perpetua whale wallet score", price_usd: 0.15, category: "crypto-analytics",
    description:
      "Whale intelligence for any EVM wallet. Total USD size read live from the chain rather than a cached indexer, tier, a 0 to 100 whale score, 24h in and out flow, largest move, activity flags and a plain rationale. Base and Ethereum.",
  },
  {
    url: `${BASE}/derivatives`, name: "Perpetua derivatives leverage signal", price_usd: 0.15, category: "trading-signals",
    description:
      "Perp derivatives leverage and squeeze signal. Funding 8h and annualized, open interest and its 24h change, long short crowding, taker flow, basis, and a 0 to 100 leverage heat score with a bias call and a rationale. 22 majors.",
  },
  {
    url: `${BASE}/report`, name: "Perpetua enriched crypto risk report", price_usd: 0.05, category: "market-data",
    description: "Enriched crypto risk report, a weighted factor breakdown plus a written analysis and a confidence label, across 24 assets.",
  },
  {
    url: `${BASE}/signal`, name: "Perpetua crypto risk signal", price_usd: 0.005, category: "trading-signals",
    description: "Crypto risk signal, a 0 to 100 risk score, a trend call and an on chain anomaly flag with a short rationale, across 24 assets.",
  },
];

for (const s of services) {
  const body = { ...common, ...s };
  if (process.env.DRY === "1") {
    console.log("DRY", body.http_method ?? "GET", body.url, body.name);
    continue;
  }
  const res = await fetch(API, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  console.log(res.status, (body.http_method ?? "GET").padEnd(4), body.url.padEnd(42), text.slice(0, 320));
  // The directory rate limits registration, so do not hammer it.
  await new Promise((r) => setTimeout(r, 3000));
}
