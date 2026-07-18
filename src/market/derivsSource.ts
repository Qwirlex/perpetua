import type { DerivsRaw } from "../shared/types.js";
import { fetchDerivsRaw } from "./binanceDerivs.js";
import { fetchDerivsRawOkx } from "./okxDerivs.js";

// Binance geo-blocks hosting IPs (451), so the seller falls back to OKX and
// sticks with it, re-probing Binance only occasionally to avoid paying the
// timeout on every paid call.
const RETRY_BINANCE_MS = 10 * 60_000;
let binanceFailedAt = 0;

export async function fetchDerivsRawAuto(asset: string, ts: number): Promise<DerivsRaw> {
  const binanceOk = binanceFailedAt === 0 || Date.now() - binanceFailedAt > RETRY_BINANCE_MS;
  if (binanceOk) {
    try {
      const r = await fetchDerivsRaw(asset, ts);
      binanceFailedAt = 0;
      return r;
    } catch {
      binanceFailedAt = Date.now();
    }
  }
  return fetchDerivsRawOkx(asset, ts);
}
