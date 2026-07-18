import type { DerivsRaw } from "../shared/types.js";
import { PERP_SYMBOLS } from "./binanceDerivs.js";

// OKX v5 fallback source for the derivatives signal. Same DerivsRaw output as the
// Binance adapter, used when the host IP is geo-blocked by Binance (451). Public
// endpoints, no key. Rubik stat series are hourly rows, newest first.
const OKX = "https://www.okx.com";

export const OKX_INSTRUMENTS: Record<string, { instId: string; ccy: string }> =
  Object.fromEntries(Object.keys(PERP_SYMBOLS).map((a) => [a, { instId: `${a}-USDT-SWAP`, ccy: a }]));

const num = (x: unknown): number | null => {
  const n = typeof x === "string" ? parseFloat(x) : typeof x === "number" ? x : NaN;
  return Number.isFinite(n) ? n : null;
};

type RubikRow = string[];

export interface OkxDerivsParts {
  markPrice: { markPx?: unknown };
  indexTicker: { idxPx?: unknown };
  funding?: { fundingRate?: unknown };
  openInterest: { oiCcy?: unknown };
  oiHist?: RubikRow[];
  longShort?: RubikRow[];
  takerVol?: RubikRow[];
  ticker?: { last?: unknown; open24h?: unknown };
}

// Row nearest to (newest ts - 24h) so the series ordering does not matter.
function oiValueAgo(rows: RubikRow[]): number | null {
  const stamped = rows
    .map((r) => ({ ts: num(r[0]), v: num(r[1]) }))
    .filter((r): r is { ts: number; v: number } => r.ts !== null && r.v !== null);
  if (stamped.length < 2) return null;
  const newest = Math.max(...stamped.map((r) => r.ts));
  const target = newest - 24 * 3600_000;
  let best = stamped[0];
  for (const r of stamped) if (Math.abs(r.ts - target) < Math.abs(best.ts - target)) best = r;
  return best.v;
}

// Pure normalizer: raw OKX JSON pieces -> DerivsRaw.
export function parseDerivsOkx(asset: string, p: OkxDerivsParts, ts: number): DerivsRaw {
  const hist = Array.isArray(p.oiHist) ? p.oiHist : [];
  const newestOi = hist.length
    ? hist.reduce((a, b) => ((num(a[0]) ?? -Infinity) >= (num(b[0]) ?? -Infinity) ? a : b))
    : null;
  const taker = p.takerVol?.length ? p.takerVol[0] : null;
  const takerSell = taker ? num(taker[1]) : null;
  const takerBuy = taker ? num(taker[2]) : null;
  const last = p.ticker ? num(p.ticker.last) : null;
  const open24h = p.ticker ? num(p.ticker.open24h) : null;
  return {
    asset,
    markPrice: num(p.markPrice?.markPx) ?? 0,
    indexPrice: num(p.indexTicker?.idxPx) ?? 0,
    lastFundingRate: num(p.funding?.fundingRate) ?? 0,
    openInterestBase: num(p.openInterest?.oiCcy) ?? 0,
    oiValNow: newestOi ? num(newestOi[1]) : null,
    oiVal24hAgo: oiValueAgo(hist),
    longShortRatio: p.longShort?.length ? num(p.longShort[0][1]) : null,
    takerBuySellRatio: takerBuy !== null && takerSell !== null && takerSell > 0 ? takerBuy / takerSell : null,
    priceChangePct24h: last !== null && open24h !== null && open24h > 0 ? ((last - open24h) / open24h) * 100 : null,
    ts,
  };
}

async function getJson(url: string): Promise<any> {
  const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
  if (!res.ok) throw new Error(`okx ${res.status} ${url}`);
  const body = await res.json();
  if (body?.code && body.code !== "0") throw new Error(`okx code ${body.code} ${url}`);
  return body.data;
}
async function tryJson(url: string): Promise<any | undefined> {
  try {
    return await getJson(url);
  } catch {
    return undefined; // optional metric — degrade gracefully
  }
}

// Adapter: fetch all pieces for an instrument and normalize. mark price + open
// interest are core (throw on failure); the rest degrade to null.
export async function fetchDerivsRawOkx(asset: string, ts: number): Promise<DerivsRaw> {
  const inst = OKX_INSTRUMENTS[asset];
  if (!inst) throw new Error(`no okx perp market for ${asset}`);
  const { instId, ccy } = inst;
  const [markPrice, openInterest] = await Promise.all([
    getJson(`${OKX}/api/v5/public/mark-price?instType=SWAP&instId=${instId}`).then((d) => d?.[0]),
    getJson(`${OKX}/api/v5/public/open-interest?instId=${instId}`).then((d) => d?.[0]),
  ]);
  if (!markPrice || !openInterest) throw new Error(`okx empty core data for ${instId}`);
  const [indexTicker, funding, oiHist, longShort, takerVol, ticker] = await Promise.all([
    tryJson(`${OKX}/api/v5/market/index-tickers?instId=${ccy}-USDT`).then((d) => d?.[0]),
    tryJson(`${OKX}/api/v5/public/funding-rate?instId=${instId}`).then((d) => d?.[0]),
    tryJson(`${OKX}/api/v5/rubik/stat/contracts/open-interest-volume?ccy=${ccy}&period=1H`),
    tryJson(`${OKX}/api/v5/rubik/stat/contracts/long-short-account-ratio?ccy=${ccy}&period=1H`),
    tryJson(`${OKX}/api/v5/rubik/stat/taker-volume?ccy=${ccy}&instType=CONTRACTS&period=1H`),
    tryJson(`${OKX}/api/v5/market/ticker?instId=${instId}`).then((d) => d?.[0]),
  ]);
  return parseDerivsOkx(
    asset,
    { markPrice, indexTicker: indexTicker ?? {}, funding, openInterest, oiHist, longShort, takerVol, ticker },
    ts,
  );
}
