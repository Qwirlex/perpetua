// Shared data shapes across every module. Keep them small and reused.

export interface MarketSnapshot {
  ts: number;
  asset: string;
  price: number;
  changePct24h: number;
  volumeUsd: number;
  activeAddresses: number;
  txCount24h: number;
  gasGwei: number;
}

export type Trend = "up" | "down" | "flat";

export interface SignalCore {
  score: number; // 0 to 100 risk
  trend: Trend;
  anomaly: boolean;
}

export interface Signal extends SignalCore {
  id: string;
  ts: number;
  asset: string;
  price: number;
  rationale: string;
}

export type LedgerKind = "seed" | "research_spend" | "signal_sale";

export interface LedgerEntry {
  id: string;
  ts: number;
  kind: LedgerKind;
  amount: string; // signed micro USDC, kept as a string for mongo and json safety
  balanceAfter: string;
  ref: string;
  payer?: string;
  settlement?: string;
  mirrorTx?: string;
}

export interface TreasuryState {
  balance: string;
  earned: string;
  spent: string;
}

export interface LoopCycle {
  ts: number;
  action: "research" | "wait";
  reason: string;
  signal?: Signal;
  sales: number;
  spent: string;
  earned: string;
  balanceAfter: string;
  mirrorTx?: string;
}

export interface DerivsRaw {
  asset: string;
  markPrice: number;
  indexPrice: number;
  lastFundingRate: number; // 8h funding as a decimal, e.g. 0.0001
  openInterestBase: number; // base-unit OI from /openInterest
  oiValNow: number | null; // sumOpenInterestValue latest (USD)
  oiVal24hAgo: number | null; // sumOpenInterestValue ~24h ago (USD)
  longShortRatio: number | null;
  takerBuySellRatio: number | null;
  priceChangePct24h: number | null;
  ts: number;
}

export type DerivBias = "long_squeeze_risk" | "short_squeeze_risk" | "neutral";

export interface DerivativeSignal {
  asset: string;
  markPrice: number;
  indexPrice: number;
  basisPct: number;
  fundingRate8hPct: number;
  fundingAnnualizedPct: number;
  openInterestUsd: number;
  oiChangePct24h: number | null;
  longShortRatio: number | null;
  takerBuySellRatio: number | null;
  priceChangePct24h: number | null;
  leverageHeat: number; // 0 to 100
  bias: DerivBias;
  confidence: "low" | "medium" | "high";
  rationale: string;
  ts: number;
}
