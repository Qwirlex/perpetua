import { analyze } from "./analyst.js";
import { rationale } from "./llm.js";
import { config } from "../shared/config.js";
import type { MarketSnapshot, Signal } from "../shared/types.js";

let seq = 0;

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
