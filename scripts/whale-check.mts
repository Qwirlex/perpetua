// Verify a /whale answer against the chain without paying for it. Prints the signal plus
// a direct balanceOf read of the wallet's largest holding, so a stale indexer shows up as
// a mismatch instead of silently shipping to a buyer.
//
// Run:
//   npx tsx scripts/whale-check.mts 0xADDRESS [chain]
import { fetchWalletRaw } from "../src/market/blockscoutWallet.js";
import { computeWhaleSignal } from "../src/research/whaleSignal.js";

const address = process.argv[2];
const chain = process.argv[3] ?? "base";
if (!address) throw new Error("usage: tsx scripts/whale-check.mts 0xADDRESS [base|ethereum]");

const raw = await fetchWalletRaw(address, chain, Math.floor(Date.now() / 1000));
const signal = computeWhaleSignal(raw);
console.log(JSON.stringify(signal, null, 2));
console.log("balanceSource", raw.balanceSource, "| holdings", raw.holdings.length, "| native", raw.nativeBalance);
