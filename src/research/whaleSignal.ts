import type { WalletRaw, WhaleSignal, WhaleTier } from "../shared/types.js";

// Pure whale scorer: WalletRaw -> WhaleSignal. Deterministic, no I/O, so the paid
// endpoint is testable offline and cheap to serve.

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const round2 = (x: number) => Math.round(x * 100) / 100;

function tierOf(totalUsd: number): WhaleTier {
  if (totalUsd >= 10_000_000) return "humpback";
  if (totalUsd >= 1_000_000) return "whale";
  if (totalUsd >= 100_000) return "dolphin";
  if (totalUsd >= 10_000) return "fish";
  return "shrimp";
}

const fmtUsd = (x: number): string => {
  const abs = Math.abs(x);
  const sign = x < 0 ? "-" : "";
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(1)}k`;
  return `${sign}$${abs.toFixed(0)}`;
};

export function computeWhaleSignal(raw: WalletRaw): WhaleSignal {
  const tokenUsd = raw.holdings.reduce((s, h) => s + h.usd, 0);
  const totalUsd = (raw.nativeUsd ?? 0) + tokenUsd;
  const tier = tierOf(totalUsd);

  // 24h token flow from the recent transfer window.
  const cutoff = raw.ts - 86_400;
  const day = raw.recentTransfers.filter((t) => t.ts >= cutoff);
  const flowsKnown = day.filter((t) => t.usd !== null);
  const haveFlows = raw.recentTransfers.length > 0;
  const inflow = haveFlows ? flowsKnown.filter((t) => t.direction === "in").reduce((s, t) => s + (t.usd ?? 0), 0) : null;
  const outflow = haveFlows ? flowsKnown.filter((t) => t.direction === "out").reduce((s, t) => s + (t.usd ?? 0), 0) : null;
  const netflow = inflow !== null && outflow !== null ? inflow - outflow : null;
  const largest = flowsKnown.length ? Math.max(...flowsKnown.map((t) => Math.abs(t.usd ?? 0))) : null;
  const activeLast24h = day.length > 0;

  // 0-100: size dominates (60), lifetime activity (15), 24h move size (15), live (10).
  const sizeScore = clamp((Math.log10(totalUsd + 1) / 7) * 60, 0, 60);
  const activityScore = clamp((Math.log10((raw.txCount ?? 0) + 1) / 5) * 15, 0, 15);
  const moveScore = largest !== null ? clamp((Math.log10(largest + 1) / 6) * 15, 0, 15) : 0;
  const whaleScore = Math.round(clamp(sizeScore + activityScore + moveScore + (activeLast24h ? 10 : 0), 0, 100));

  const flags: string[] = [];
  if (raw.isContract) flags.push("contract_wallet");
  if (raw.txCount !== null && raw.txCount < 10) flags.push("fresh_wallet");
  if (raw.tokenTransfersCount !== null && raw.tokenTransfersCount > 100_000) flags.push("high_velocity");
  if (raw.recentTransfers.length > 0 && !activeLast24h) flags.push("quiet_24h");
  if (netflow !== null && totalUsd > 0 && netflow > totalUsd * 0.005 && netflow > 1000) flags.push("accumulating");
  if (netflow !== null && totalUsd > 0 && -netflow > totalUsd * 0.005 && -netflow > 1000) flags.push("distributing");

  // Confidence drops as optional data sources go missing.
  const missing =
    (raw.nativeUsd === null ? 1 : 0) +
    (raw.txCount === null ? 1 : 0) +
    (raw.holdings.length === 0 && tokenUsd === 0 ? 0 : 0) +
    (raw.recentTransfers.length === 0 ? 1 : 0);
  const confidence: WhaleSignal["confidence"] = missing === 0 ? "high" : missing === 1 ? "medium" : "low";

  const moves = netflow !== null && activeLast24h
    ? `, 24h netflow ${fmtUsd(netflow)} over ${day.length} moves${largest !== null ? `, largest ${fmtUsd(largest)}` : ""}`
    : ", quiet in the last 24h";
  const doing = flags.includes("accumulating") ? " Accumulating." : flags.includes("distributing") ? " Distributing." : "";
  const rationale = `${tier[0].toUpperCase()}${tier.slice(1)} ${raw.isContract ? "contract" : "wallet"} (${fmtUsd(totalUsd)}) on ${raw.chain}${raw.txCount !== null ? `, ${raw.txCount} txs` : ""}${moves}.${doing}`;

  return {
    address: raw.address,
    chain: raw.chain,
    isContract: raw.isContract,
    totalUsd: round2(totalUsd),
    nativeUsd: raw.nativeUsd !== null ? round2(raw.nativeUsd) : null,
    tokenUsd: round2(tokenUsd),
    topHoldings: raw.holdings.slice(0, 5).map((h) => ({ symbol: h.symbol, usd: round2(h.usd) })),
    tier,
    whaleScore,
    txCount: raw.txCount,
    tokenTransfersCount: raw.tokenTransfersCount,
    inflowUsd24h: inflow !== null ? round2(inflow) : null,
    outflowUsd24h: outflow !== null ? round2(outflow) : null,
    netflowUsd24h: netflow !== null ? round2(netflow) : null,
    largestMoveUsd24h: largest !== null ? round2(largest) : null,
    activeLast24h,
    flags,
    confidence,
    rationale,
    ts: raw.ts,
  };
}
