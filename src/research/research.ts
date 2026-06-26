import { analyze } from "./analyst.js";
import { rationale, fallback } from "./llm.js";
import { config } from "../shared/config.js";
import type { MarketSnapshot, Signal } from "../shared/types.js";

let seq = 0;

// A fast signal with the deterministic rationale, no LLM call. Used to refresh the
// non primary assets each cycle cheaply. The paid report still calls the LLM on demand.
export function quickSignal(m: MarketSnapshot): Signal {
  const core = analyze(m);
  seq += 1;
  return {
    id: `sig-${m.ts}-${seq}`,
    ts: m.ts,
    asset: m.asset,
    price: m.price,
    score: core.score,
    trend: core.trend,
    anomaly: core.anomaly,
    rationale: fallback(m, core),
  };
}

export interface ResearchResult {
  signal: Signal;
  costMicro: bigint;
}

// The spend side. Compute a signal from the snapshot, narrate it, charge the research
// cost. The cost models the compute the agent pays for, debited by the loop.
export async function research(m: MarketSnapshot): Promise<ResearchResult> {
  const core = analyze(m);
  const text = await rationale(m, core);
  seq += 1;
  const signal: Signal = {
    id: `sig-${m.ts}-${seq}`,
    ts: m.ts,
    asset: m.asset,
    price: m.price,
    score: core.score,
    trend: core.trend,
    anomaly: core.anomaly,
    rationale: text,
  };
  return { signal, costMicro: config.researchCostMicro };
}
