import { AUDIT_CHAINS, CONTRACT_ADDRESS_RE } from "../market/aegisEngine.js";

export type AuditInput = { address?: string; chain: string; source?: string };
export type Validated =
  | { ok: true; input: AuditInput }
  | { ok: false; status: number; error: string };

/** Reject everything we can judge locally, so the engine is only asked about real work.
 *
 *  Every rejection here is a 4xx, and the x402 middleware settles only on a 2xx,
 *  so a malformed request costs the buyer nothing. */
export function validateAuditInput(q: { address?: string; chain?: string; source?: string }): Validated {
  const source = (q.source ?? "").trim();
  if (source) {
    if (source.length < 40) {
      return { ok: false, status: 400, error: "source is too short to be a contract" };
    }
    return { ok: true, input: { source, chain: "base" } };
  }
  const address = (q.address ?? "").trim();
  if (!address) {
    return { ok: false, status: 400, error: "pass an address with an optional chain, or a source body" };
  }
  if (!CONTRACT_ADDRESS_RE.test(address)) {
    return { ok: false, status: 400, error: "address must be a 0x-prefixed 40-hex contract address" };
  }
  const chain = (q.chain ?? "base").trim().toLowerCase();
  if (!(AUDIT_CHAINS as readonly string[]).includes(chain)) {
    return { ok: false, status: 400, error: `chain not covered, supported ${AUDIT_CHAINS.join(", ")}` };
  }
  return { ok: true, input: { address, chain } };
}
