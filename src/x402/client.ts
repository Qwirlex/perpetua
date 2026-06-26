import type { Account } from "viem/accounts";
import { encodeHeader, signAuthorization, type PaymentPayload, type PaymentRequirements } from "./scheme.js";

export interface PaidResult<T> {
  data: T;
  payer: string;
  value: string;
  settlement: string;
}

// The buyer side handshake. An unpaid GET returns 402 with requirements, the client
// signs the EIP-3009 authorization, settles, and retries with the X-PAYMENT and
// X-SETTLEMENT headers. settle is injected, on chain in live mode, a deterministic
// local hash in demo.
export async function payAndGet<T>(
  url: string,
  acct: Account,
  settle: (req: PaymentRequirements) => Promise<string>,
): Promise<PaidResult<T>> {
  const first = await fetch(url);
  if (first.ok) {
    // Resource was not gated, return with no payment.
    return { data: (await first.json()) as T, payer: "", value: "0", settlement: "" };
  }
  if (first.status !== 402) throw new Error(`expected 402, got ${first.status} for ${url}`);

  const body = (await first.json()) as { accepts?: PaymentRequirements[] };
  if (!body.accepts || body.accepts.length === 0) throw new Error("402 carried no requirements");
  const req = body.accepts[0];

  const payload: PaymentPayload = await signAuthorization(acct, req);
  const settlement = await settle(req);

  const paid = await fetch(url, {
    headers: { "x-payment": encodeHeader(payload), "x-settlement": settlement },
  });
  if (!paid.ok) {
    let reason = String(paid.status);
    try {
      const b = (await paid.json()) as { error?: string };
      if (b?.error) reason = b.error;
    } catch {
      // ignore
    }
    throw new Error(`paid request rejected for ${url}: ${reason}`);
  }
  return {
    data: (await paid.json()) as T,
    payer: payload.authorization.from,
    value: payload.authorization.value,
    settlement,
  };
}
