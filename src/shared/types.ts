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
