import type { DerivsRaw } from "../shared/types.js";

const FAPI = "https://fapi.binance.com";

// Perp majors with a Binance USDT-perp contract.
export const PERP_SYMBOLS: Record<string, string> = {
  BTC: "BTCUSDT", ETH: "ETHUSDT", SOL: "SOLUSDT", BNB: "BNBUSDT", XRP: "XRPUSDT",
  ADA: "ADAUSDT", DOGE: "DOGEUSDT", AVAX: "AVAXUSDT", LINK: "LINKUSDT", DOT: "DOTUSDT",
  TRX: "TRXUSDT", LTC: "LTCUSDT", UNI: "UNIUSDT", ATOM: "ATOMUSDT", NEAR: "NEARUSDT",
  APT: "APTUSDT", ARB: "ARBUSDT", OP: "OPUSDT", SUI: "SUIUSDT", AAVE: "AAVEUSDT",
  INJ: "INJUSDT", POL: "POLUSDT",
};

const num = (x: unknown): number | null => {
  const n = typeof x === "string" ? parseFloat(x) : typeof x === "number" ? x : NaN;
  return Number.isFinite(n) ? n : null;
};

export interface DerivsParts {
  premiumIndex: { markPrice?: unknown; indexPrice?: unknown; lastFundingRate?: unknown };
  openInterest: { openInterest?: unknown };
  oiHist?: { sumOpenInterestValue?: unknown }[];
  longShort?: { longShortRatio?: unknown }[];
  takerRatio?: { buySellRatio?: unknown }[];
  ticker?: { priceChangePercent?: unknown };
}

// Pure normalizer: raw Binance JSON pieces -> DerivsRaw.
export function parseDerivs(asset: string, p: DerivsParts, ts: number): DerivsRaw {
  const hist = Array.isArray(p.oiHist) ? p.oiHist : [];
  const oiVal24hAgo = hist.length ? num(hist[0].sumOpenInterestValue) : null;
  const oiValNow = hist.length ? num(hist[hist.length - 1].sumOpenInterestValue) : null;
  return {
    asset,
    markPrice: num(p.premiumIndex?.markPrice) ?? 0,
    indexPrice: num(p.premiumIndex?.indexPrice) ?? 0,
    lastFundingRate: num(p.premiumIndex?.lastFundingRate) ?? 0,
    openInterestBase: num(p.openInterest?.openInterest) ?? 0,
    oiValNow,
    oiVal24hAgo,
    longShortRatio: p.longShort?.length ? num(p.longShort[0].longShortRatio) : null,
    takerBuySellRatio: p.takerRatio?.length ? num(p.takerRatio[0].buySellRatio) : null,
    priceChangePct24h: p.ticker ? num(p.ticker.priceChangePercent) : null,
    ts,
  };
}

async function getJson(url: string): Promise<any> {
  const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
  if (!res.ok) throw new Error(`binance ${res.status} ${url}`);
  return res.json();
}
async function tryJson(url: string): Promise<any | undefined> {
  try {
    return await getJson(url);
  } catch {
    return undefined; // optional metric — degrade gracefully
  }
}

// Adapter: fetch all pieces for a symbol and normalize. premiumIndex + openInterest are
// core (throw on failure); the rest degrade to null.
export async function fetchDerivsRaw(asset: string, ts: number): Promise<DerivsRaw> {
  const sym = PERP_SYMBOLS[asset];
  if (!sym) throw new Error(`no perp market for ${asset}`);
  const [premiumIndex, openInterest] = await Promise.all([
    getJson(`${FAPI}/fapi/v1/premiumIndex?symbol=${sym}`),
    getJson(`${FAPI}/fapi/v1/openInterest?symbol=${sym}`),
  ]);
  const [oiHist, longShort, takerRatio, ticker] = await Promise.all([
    tryJson(`${FAPI}/futures/data/openInterestHist?symbol=${sym}&period=1h&limit=25`),
    tryJson(`${FAPI}/futures/data/globalLongShortAccountRatio?symbol=${sym}&period=1h&limit=1`),
    tryJson(`${FAPI}/futures/data/takerlongshortRatio?symbol=${sym}&period=1h&limit=1`),
    tryJson(`${FAPI}/fapi/v1/ticker/24hr?symbol=${sym}`),
  ]);
  return parseDerivs(asset, { premiumIndex, openInterest, oiHist, longShort, takerRatio, ticker }, ts);
}
