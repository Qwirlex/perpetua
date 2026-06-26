import { config } from "../shared/config.js";
import { mulberry32 } from "../shared/rng.js";
import type { MarketSnapshot } from "../shared/types.js";

// The market the agent studies and sells into. In demo it evolves a seeded synthetic
// price plus on chain stats so the loop has realistic moving inputs. When
// MARKET_DATA_URL is set it fetches real data and maps it, and a fetch failure falls
// back to the synthetic snapshot so the loop never dies on a data outage.
export class MarketSource {
  private rnd = mulberry32(42);
  private price = 3000;
  private step = 0;

  async snapshot(ts: number): Promise<MarketSnapshot> {
    if (config.marketDataUrl) {
      try {
        return await this.fetchReal(ts);
      } catch {
        // fall through to the synthetic snapshot
      }
    }
    this.step++;
    const drift = (this.rnd() - 0.48) * 0.04; // small per step move, slight upward bias
    const prev = this.price;
    this.price = Math.max(1, prev * (1 + drift));
    const changePct24h = ((this.price - prev) / prev) * 100 * 6;
    return {
      ts,
      asset: config.asset,
      price: Number(this.price.toFixed(2)),
      changePct24h: Number(changePct24h.toFixed(2)),
      volumeUsd: Math.round(5e8 + this.rnd() * 5e8),
      activeAddresses: Math.round(4e5 + this.rnd() * 2e5),
      txCount24h: Math.round(1e6 + this.rnd() * 5e5),
      gasGwei: Number((5 + this.rnd() * 40).toFixed(1)),
    };
  }

  private async fetchReal(ts: number): Promise<MarketSnapshot> {
    const r = await fetch(config.marketDataUrl);
    if (!r.ok) throw new Error(String(r.status));
    const d = (await r.json()) as Record<string, unknown>;
    return {
      ts,
      asset: config.asset,
      price: Number(d.price),
      changePct24h: Number(d.changePct24h ?? 0),
      volumeUsd: Number(d.volumeUsd ?? 0),
      activeAddresses: Number(d.activeAddresses ?? 0),
      txCount24h: Number(d.txCount24h ?? 0),
      gasGwei: Number(d.gasGwei ?? 0),
    };
  }
}
