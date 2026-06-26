import { createPublicClient, http } from "viem";
import { base } from "viem/chains";
import { config } from "../shared/config.js";
import type { MarketSnapshot } from "../shared/types.js";

// Real market data for the paid product. Price, 24h move, and volume come from the
// CoinGecko free API in one call for all tracked assets, the gas reading comes from a
// Base RPC. This is what makes the signal worth paying for, real numbers rather than a
// synthetic feed. A failure throws, the caller falls back to the synthetic source.

// Asset symbol to CoinGecko id. Extend as we add assets.
const SYMBOL_TO_ID: Record<string, string> = {
  ETH: "ethereum",
  BTC: "bitcoin",
  SOL: "solana",
  BNB: "binancecoin",
  XRP: "ripple",
  ADA: "cardano",
  AVAX: "avalanche-2",
  LINK: "chainlink",
};

function buildClient() {
  return createPublicClient({ chain: base, transport: http(config.baseRpc || undefined) });
}
let cachedClient: ReturnType<typeof buildClient> | null = null;
function baseClient() {
  return (cachedClient ??= buildClient());
}

interface CoinGeckoRow {
  symbol: string;
  current_price: number;
  price_change_percentage_24h: number | null;
  total_volume: number;
}

async function currentGasGwei(): Promise<number> {
  try {
    const wei = await baseClient().getGasPrice();
    return Number((Number(wei) / 1e9).toFixed(2));
  } catch {
    return 0;
  }
}

// Fetch real snapshots for several assets in one CoinGecko call. Returns a map keyed by
// the uppercase symbol.
export async function coingeckoSnapshots(ts: number, symbols: string[]): Promise<Record<string, MarketSnapshot>> {
  const ids = symbols.map((s) => SYMBOL_TO_ID[s]).filter(Boolean);
  if (ids.length === 0) throw new Error("no known coingecko ids");
  const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${ids.join(",")}`;

  const headers: Record<string, string> = { accept: "application/json" };
  if (config.coingeckoKey) headers["x-cg-demo-api-key"] = config.coingeckoKey;
  const r = await fetch(url, { headers });
  if (!r.ok) throw new Error(`coingecko ${r.status}`);
  const rows = (await r.json()) as CoinGeckoRow[];

  const gasGwei = await currentGasGwei();
  const out: Record<string, MarketSnapshot> = {};
  for (const row of rows) {
    const sym = row.symbol?.toUpperCase();
    if (!sym || typeof row.current_price !== "number") continue;
    out[sym] = {
      ts,
      asset: sym,
      price: Number(row.current_price.toFixed(2)),
      changePct24h: Number((row.price_change_percentage_24h ?? 0).toFixed(2)),
      volumeUsd: Math.round(row.total_volume ?? 0),
      activeAddresses: 0,
      txCount24h: 0,
      gasGwei,
    };
  }
  if (Object.keys(out).length === 0) throw new Error("coingecko empty");
  return out;
}

// Back compat, a single primary asset snapshot.
export async function coingeckoSnapshot(ts: number): Promise<MarketSnapshot> {
  const all = await coingeckoSnapshots(ts, [config.asset]);
  const snap = all[config.asset];
  if (!snap) throw new Error("coingecko primary asset missing");
  return snap;
}
