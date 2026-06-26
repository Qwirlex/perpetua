import { createPublicClient, http } from "viem";
import { base } from "viem/chains";
import { config } from "../shared/config.js";
import type { MarketSnapshot } from "../shared/types.js";

// Real market data for the paid product. Price, 24h move, and volume come from the
// CoinGecko free API, the gas reading comes from a Base RPC. This is what makes the
// signal worth paying for, real numbers rather than a synthetic feed. A failure here
// throws, the caller falls back to the synthetic source so the loop never dies.

function buildClient() {
  return createPublicClient({ chain: base, transport: http(config.baseRpc || undefined) });
}
let cachedClient: ReturnType<typeof buildClient> | null = null;
function baseClient() {
  return (cachedClient ??= buildClient());
}

interface CoinGeckoRow {
  current_price: number;
  price_change_percentage_24h: number | null;
  total_volume: number;
}

export async function coingeckoSnapshot(ts: number): Promise<MarketSnapshot> {
  const headers: Record<string, string> = { accept: "application/json" };
  if (config.coingeckoKey) headers["x-cg-demo-api-key"] = config.coingeckoKey;

  const r = await fetch(config.coingeckoUrl, { headers });
  if (!r.ok) throw new Error(`coingecko ${r.status}`);
  const rows = (await r.json()) as CoinGeckoRow[];
  const row = rows[0];
  if (!row || typeof row.current_price !== "number") throw new Error("coingecko empty");

  // Gas on Base in gwei. Best effort, a failure just yields a low gas reading.
  let gasGwei = 0;
  try {
    const wei = await baseClient().getGasPrice();
    gasGwei = Number(wei) / 1e9;
  } catch {
    gasGwei = 0;
  }

  return {
    ts,
    asset: config.asset,
    price: Number(row.current_price.toFixed(2)),
    changePct24h: Number((row.price_change_percentage_24h ?? 0).toFixed(2)),
    volumeUsd: Math.round(row.total_volume ?? 0),
    activeAddresses: 0,
    txCount24h: 0,
    gasGwei: Number(gasGwei.toFixed(2)),
  };
}
