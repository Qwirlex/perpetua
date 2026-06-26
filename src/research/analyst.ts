import type { MarketSnapshot, SignalCore, Trend } from "../shared/types.js";

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

// The deterministic quant. Turns a market snapshot into a bounded risk score, a trend
// call, and an on chain anomaly flag. This is the genuine product even with no LLM,
// the model only narrates it later.
export function analyze(s: MarketSnapshot): SignalCore {
  const move = s.changePct24h;
  const trend: Trend = move > 1.5 ? "up" : move < -1.5 ? "down" : "flat";

  const volatility = Math.abs(move); // bigger move, more risk
  const gasStress = clamp((s.gasGwei - 20) / 2, 0, 30); // network congestion
  const volSpike = s.volumeUsd > 1.5e9;
  const gasSpike = s.gasGwei > 80;
  const anomaly = volSpike && gasSpike;

  let score = 20 + volatility * 2.5 + gasStress + (anomaly ? 20 : 0);
  if (trend === "down") score += 10;

  return { score: Math.round(clamp(score, 0, 100)), trend, anomaly };
}
