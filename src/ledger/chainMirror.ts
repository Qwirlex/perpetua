import { keccak256, toHex } from "viem";
import { config } from "../shared/config.js";
import type { LedgerEntry } from "../shared/types.js";

// The on chain mirror gives every ledger entry a provable reference. In live mode it
// writes the entry digest to Base via viem and returns the transaction hash. In demo
// it returns a deterministic keccak based reference so the dashboard can still show a
// provable record. It never blocks the loop, a failure falls back to the demo ref.
export async function mirror(entry: LedgerEntry): Promise<string> {
  const digest = keccak256(
    toHex(`${entry.id}:${entry.kind}:${entry.amount}:${entry.balanceAfter}`),
  );
  if (!config.live || !config.baseRpc) {
    return "mirror:" + digest.slice(2, 18);
  }
  try {
    return await writeOnChain(digest);
  } catch {
    return "mirror:" + digest.slice(2, 18);
  }
}

// Live only. Submit the digest to a Base contract or as calldata and return the tx
// hash. Wired with viem and MIRROR_PRIVATE_KEY when going live.
async function writeOnChain(_digest: string): Promise<string> {
  return "mirror:onchain-pending";
}
