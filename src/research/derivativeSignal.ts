import type { DerivsRaw, DerivativeSignal, DerivBias } from "../shared/types.js";

// Weights for the leverageHeat blend and the crowding thresholds for bias.
const W = { funding: 0.35, crowding: 0.25, oi: 0.25, basis: 0.15 };
const LONG_CROWD = 1.3;
const SHORT_CROWD = 0.77;
// Normalizers: the value that maps a component to 1.0 ("fully hot").
const NORM = { fundingAnnPct: 50, basisPct: 0.5, oiPct: 30, crowd: 1.5 };

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

export function computeDerivativeSignal(raw: DerivsRaw): DerivativeSignal {
  const fundingRate8hPct = raw.lastFundingRate * 100;
  const fundingAnnualizedPct = raw.lastFundingRate * 3 * 365 * 100;
  const basisPct = raw.indexPrice ? ((raw.markPrice - raw.indexPrice) / raw.indexPrice) * 100 : 0;
  const openInterestUsd = raw.openInterestBase * raw.markPrice;

  const oiChangePct24h =
    raw.oiValNow != null && raw.oiVal24hAgo != null && raw.oiVal24hAgo !== 0
      ? ((raw.oiValNow - raw.oiVal24hAgo) / raw.oiVal24hAgo) * 100
      : null;

  // leverageHeat: weighted average over the components that are present.
  const comps: { w: number; v: number }[] = [
    { w: W.funding, v: clamp(Math.abs(fundingAnnualizedPct) / NORM.fundingAnnPct, 0, 1) },
    { w: W.basis, v: clamp(Math.abs(basisPct) / NORM.basisPct, 0, 1) },
  ];
  if (oiChangePct24h != null) comps.push({ w: W.oi, v: clamp(Math.abs(oiChangePct24h) / NORM.oiPct, 0, 1) });
  if (raw.longShortRatio != null) comps.push({ w: W.crowding, v: clamp(Math.abs(raw.longShortRatio - 1) / NORM.crowd, 0, 1) });
  const wsum = comps.reduce((a, c) => a + c.w, 0);
  const leverageHeat = Math.round((comps.reduce((a, c) => a + c.w * c.v, 0) / wsum) * 100);

  // bias
  let bias: DerivBias = "neutral";
  if (raw.longShortRatio != null) {
    if (raw.longShortRatio > LONG_CROWD && fundingAnnualizedPct > 0) bias = "long_squeeze_risk";
    else if (raw.longShortRatio < SHORT_CROWD && fundingAnnualizedPct < 0) bias = "short_squeeze_risk";
  }

  // confidence: how many of the four optional metrics are missing
  const missing = [oiChangePct24h, raw.longShortRatio, raw.takerBuySellRatio, raw.priceChangePct24h]
    .filter((x) => x == null).length;
  const confidence = missing === 0 ? "high" : missing <= 2 ? "medium" : "low";

  const rationale = buildRationale({ bias, longShortRatio: raw.longShortRatio, fundingAnnualizedPct, oiChangePct24h, leverageHeat });

  return {
    asset: raw.asset,
    markPrice: raw.markPrice,
    indexPrice: raw.indexPrice,
    basisPct: round(basisPct, 4),
    fundingRate8hPct: round(fundingRate8hPct, 6),
    fundingAnnualizedPct: round(fundingAnnualizedPct, 4),
    openInterestUsd: Math.round(openInterestUsd),
    oiChangePct24h: oiChangePct24h == null ? null : round(oiChangePct24h, 4),
    longShortRatio: raw.longShortRatio,
    takerBuySellRatio: raw.takerBuySellRatio,
    priceChangePct24h: raw.priceChangePct24h,
    leverageHeat,
    bias,
    confidence,
    rationale,
    ts: raw.ts,
  };
}

function round(x: number, d: number): number {
  const f = 10 ** d;
  return Math.round(x * f) / f;
}

function buildRationale(a: {
  bias: DerivBias; longShortRatio: number | null; fundingAnnualizedPct: number; oiChangePct24h: number | null; leverageHeat: number;
}): string {
  const ls = a.longShortRatio != null ? `L/S ${a.longShortRatio.toFixed(2)}` : "L/S n/a";
  const fund = `${a.fundingAnnualizedPct.toFixed(1)}% ann funding`;
  const oi = a.oiChangePct24h != null ? `, OI ${a.oiChangePct24h >= 0 ? "up" : "down"} ${Math.abs(a.oiChangePct24h).toFixed(1)}%` : "";
  if (a.bias === "long_squeeze_risk") return `Longs crowded (${ls}) paying ${fund}${oi}; elevated long-squeeze risk (heat ${a.leverageHeat}).`;
  if (a.bias === "short_squeeze_risk") return `Shorts crowded (${ls}) with ${fund}${oi}; elevated short-squeeze risk (heat ${a.leverageHeat}).`;
  return `Balanced positioning (${ls}), ${fund}${oi}; leverage heat ${a.leverageHeat}.`;
}
