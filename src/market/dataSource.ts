import { config } from "../shared/config.js";
import { mulberry32 } from "../shared/rng.js";
import { coingeckoSnapshots } from "./coingecko.js";
import type { MarketSnapshot } from "../shared/types.js";

// The market the agent studies and sells into. Live mode pulls real prices for all
// tracked assets from CoinGecko in one call. Demo mode evolves a seeded synthetic price
// per asset so the loop has realistic moving inputs with no network. A live data outage
// falls back to synthetic so the loop never dies.

const SYNTH_BASE: Record<string, number> = {
  ETH: 3000,
  BTC: 60000,
  SOL: 150,
  BNB: 600,
  XRP: 0.6,
  ADA: 0.45,
  AVAX: 35,
  LINK: 15,
};

export class MarketSource {
  private rnd = mulberry32(42);
  private prices: Record<string, number> = {};
  private step = 0;
  // Short cache so the loop and the multi asset refresher in one tick share one fetch.
  private cache: { ts: number; data: Record<string, MarketSnapshot> } | null = null;

  private synthetic(sym: string, ts: number): MarketSnapshot {
    const prev = this.prices[sym] ?? SYNTH_BASE[sym] ?? 100;
    const drift = (this.rnd() - 0.48) * 0.04;
    const price = Math.max(0.0001, prev * (1 + drift));
    this.prices[sym] = price;
    const changePct24h = ((price - prev) / prev) * 100 * 6;
    return {
      ts,
      asset: sym,
      price: Number(price.toFixed(price < 10 ? 4 : 2)),
      changePct24h: Number(changePct24h.toFixed(2)),
      volumeUsd: Math.round(5e8 + this.rnd() * 5e8),
      activeAddresses: Math.round(4e5 + this.rnd() * 2e5),
      txCount24h: Math.round(1e6 + this.rnd() * 5e5),
      gasGwei: Number((5 + this.rnd() * 40).toFixed(1)),
    };
  }

  private syntheticAll(ts: number): Record<string, MarketSnapshot> {
    this.step++;
    const out: Record<string, MarketSnapshot> = {};
    for (const sym of config.assets) out[sym] = this.synthetic(sym, ts);
    return out;
  }

  // Snapshots for every tracked asset, keyed by uppercase symbol.
  async snapshotsAll(ts: number): Promise<Record<string, MarketSnapshot>> {
    if (this.cache && ts - this.cache.ts < 5000) return this.cache.data;
    let data: Record<string, MarketSnapshot>;
    if (config.useRealData) {
      try {
        data = await coingeckoSnapshots(ts, config.assets);
      } catch {
        data = this.syntheticAll(ts); // a data outage never stops the loop
      }
    } else {
      data = this.syntheticAll(ts);
    }
    this.cache = { ts, data };
    return data;
  }

  // The primary asset snapshot, used by the self funding loop and the chart.
  async snapshot(ts: number): Promise<MarketSnapshot> {
    const all = await this.snapshotsAll(ts);
    return all[config.asset] ?? this.synthetic(config.asset, ts);
  }
}
