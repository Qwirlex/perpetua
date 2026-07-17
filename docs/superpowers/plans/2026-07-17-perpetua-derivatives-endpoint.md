# Perpetua Derivatives Endpoint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a premium paid x402 route `GET /derivatives?asset=BTC` to the Perpetua seller returning a Binance-Futures leverage/squeeze signal at $0.05 USDC.

**Architecture:** Pure signal core (`computeDerivativeSignal`) + pure normalizer (`parseDerivs`) tested with vitest; a thin Binance fetch adapter; a new route wired into the existing `src/seller/server.ts` pattern (paymentMiddleware entry + `app.get` handler + discovery/openapi/catalog/docs rows) with a per-symbol TTL cache.

**Tech Stack:** Node TypeScript ESM, vitest, express, `@x402/express` (already in repo). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-17-perpetua-derivatives-endpoint-design.md`

**Conventions (verified in repo):** tests live in `test/*.test.ts`, import source as `../src/**/x.js` (ESM), `import { describe, it, expect } from "vitest"`. Run all: `npm test` (`vitest run`). Typecheck: `npm run typecheck`.

---

## File Structure

- `src/shared/types.ts` — add `DerivsRaw`, `DerivBias`, `DerivativeSignal`.
- `src/research/derivativeSignal.ts` — **new** — pure `computeDerivativeSignal(raw)`.
- `src/market/binanceDerivs.ts` — **new** — `PERP_SYMBOLS`, pure `parseDerivs(parts)`, adapter `fetchDerivsRaw(symbol)`.
- `src/shared/config.ts` — add `derivativesPrice`, `perpAssets`.
- `src/seller/server.ts` — new paid route + discovery/openapi/catalog/docs.
- `test/derivativeSignal.test.ts` — **new** — signal core tests.
- `test/binanceDerivs.test.ts` — **new** — parse tests.

---

## Task 1: Types

**Files:**
- Modify: `src/shared/types.ts` (append)

- [ ] **Step 1: Append the derivative types**

```ts
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
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS (no usage yet, just declarations).

- [ ] **Step 3: Commit**

```bash
git add src/shared/types.ts && git commit -q -m "feat(types): derivative signal shapes"
```

---

## Task 2: Signal core (pure, TDD)

**Files:**
- Create: `src/research/derivativeSignal.ts`
- Test: `test/derivativeSignal.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// test/derivativeSignal.test.ts
import { describe, it, expect } from "vitest";
import { computeDerivativeSignal } from "../src/research/derivativeSignal.js";
import type { DerivsRaw } from "../src/shared/types.js";

const base: DerivsRaw = {
  asset: "BTC",
  markPrice: 61240.5,
  indexPrice: 61210.0,
  lastFundingRate: 0.0001, // 0.01% per 8h
  openInterestBase: 100000,
  oiValNow: 8_000_000_000,
  oiVal24hAgo: 7_680_000_000,
  longShortRatio: 1.42,
  takerBuySellRatio: 1.08,
  priceChangePct24h: 2.1,
  ts: 1784308577,
};

describe("computeDerivativeSignal", () => {
  it("annualizes funding: rate x 3 x 365 x 100", () => {
    const s = computeDerivativeSignal(base);
    expect(s.fundingRate8hPct).toBeCloseTo(0.01, 6);
    expect(s.fundingAnnualizedPct).toBeCloseTo(0.0001 * 3 * 365 * 100, 6);
  });

  it("computes basis and OI change and OI usd", () => {
    const s = computeDerivativeSignal(base);
    expect(s.basisPct).toBeCloseTo(((61240.5 - 61210) / 61210) * 100, 6);
    expect(s.oiChangePct24h).toBeCloseTo(((8_000_000_000 - 7_680_000_000) / 7_680_000_000) * 100, 4);
    expect(s.openInterestUsd).toBeCloseTo(100000 * 61240.5, 2);
  });

  it("crowded longs paying positive funding => long_squeeze_risk", () => {
    const s = computeDerivativeSignal({ ...base, longShortRatio: 1.5, lastFundingRate: 0.0002 });
    expect(s.bias).toBe("long_squeeze_risk");
  });

  it("crowded shorts with negative funding => short_squeeze_risk", () => {
    const s = computeDerivativeSignal({ ...base, longShortRatio: 0.6, lastFundingRate: -0.0002 });
    expect(s.bias).toBe("short_squeeze_risk");
  });

  it("balanced book => neutral", () => {
    const s = computeDerivativeSignal({ ...base, longShortRatio: 1.0, lastFundingRate: 0.00001 });
    expect(s.bias).toBe("neutral");
  });

  it("leverageHeat stays within 0..100; extreme inputs push high", () => {
    const calm = computeDerivativeSignal({
      ...base, lastFundingRate: 0, longShortRatio: 1.0, oiValNow: 100, oiVal24hAgo: 100, markPrice: 61210,
    });
    const hot = computeDerivativeSignal({
      ...base, lastFundingRate: 0.003, longShortRatio: 3.0, oiValNow: 2e10, oiVal24hAgo: 1e10, markPrice: 62000, indexPrice: 61000,
    });
    expect(calm.leverageHeat).toBeGreaterThanOrEqual(0);
    expect(hot.leverageHeat).toBeLessThanOrEqual(100);
    expect(hot.leverageHeat).toBeGreaterThan(calm.leverageHeat);
  });

  it("missing crowding & oi lowers confidence and still returns", () => {
    const s = computeDerivativeSignal({
      ...base, longShortRatio: null, oiValNow: null, oiVal24hAgo: null,
    });
    expect(s.oiChangePct24h).toBeNull();
    expect(s.confidence).toBe("medium"); // 2 of {oi,crowding,taker,priceChange} missing
    expect(s.leverageHeat).toBeGreaterThanOrEqual(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/derivativeSignal.test.ts`
Expected: FAIL — cannot find module `../src/research/derivativeSignal.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/research/derivativeSignal.ts
import type { DerivsRaw, DerivativeSignal, DerivBias } from "../shared/types.js";

// Weights for the leverageHeat blend and the crowding thresholds for bias.
const W = { funding: 0.35, crowding: 0.25, oi: 0.25, basis: 0.15 };
const LONG_CROWD = 1.3;
const SHORT_CROWD = 0.77;
// Normalizers: the value that maps a component to 1.0 (fully "hot").
const NORM = { fundingAnnPct: 50, basisPct: 0.5, oiPct: 30, crowd: 1.5 };

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

export function computeDerivativeSignal(raw: DerivsRaw): DerivativeSignal {
  const fundingRate8hPct = raw.lastFundingRate * 100;
  const fundingAnnualizedPct = raw.lastFundingRate * 3 * 365 * 100;
  const basisPct = raw.indexPrice ? ((raw.markPrice - raw.indexPrice) / raw.indexPrice) * 100 : 0;
  const openInterestUsd = raw.openInterestBase * raw.markPrice;

  const oiChangePct24h =
    raw.oiValNow != null && raw.oiVal24hAgo != null && raw.oiVal24hAgo !== 0
      ? ((raw.oiValNow - raw.oiVal24hAgo) / raw.oiVal24hAgo) * 100
      : null;

  // leverageHeat: weighted average over the components that are present.
  const comps: { w: number; v: number }[] = [
    { w: W.funding, v: clamp(Math.abs(fundingAnnualizedPct) / NORM.fundingAnnPct, 0, 1) },
    { w: W.basis, v: clamp(Math.abs(basisPct) / NORM.basisPct, 0, 1) },
  ];
  if (oiChangePct24h != null) comps.push({ w: W.oi, v: clamp(Math.abs(oiChangePct24h) / NORM.oiPct, 0, 1) });
  if (raw.longShortRatio != null) comps.push({ w: W.crowding, v: clamp(Math.abs(raw.longShortRatio - 1) / NORM.crowd, 0, 1) });
  const wsum = comps.reduce((a, c) => a + c.w, 0);
  const leverageHeat = Math.round((comps.reduce((a, c) => a + c.w * c.v, 0) / wsum) * 100);

  // bias
  let bias: DerivBias = "neutral";
  if (raw.longShortRatio != null) {
    if (raw.longShortRatio > LONG_CROWD && fundingAnnualizedPct > 0) bias = "long_squeeze_risk";
    else if (raw.longShortRatio < SHORT_CROWD && fundingAnnualizedPct < 0) bias = "short_squeeze_risk";
  }

  // confidence: how many of the four optional metrics are missing
  const missing = [oiChangePct24h, raw.longShortRatio, raw.takerBuySellRatio, raw.priceChangePct24h]
    .filter((x) => x == null).length;
  const confidence = missing === 0 ? "high" : missing <= 2 ? "medium" : "low";

  const rationale = buildRationale({ bias, longShortRatio: raw.longShortRatio, fundingAnnualizedPct, oiChangePct24h, leverageHeat });

  return {
    asset: raw.asset,
    markPrice: raw.markPrice,
    indexPrice: raw.indexPrice,
    basisPct: round(basisPct, 4),
    fundingRate8hPct: round(fundingRate8hPct, 6),
    fundingAnnualizedPct: round(fundingAnnualizedPct, 4),
    openInterestUsd: Math.round(openInterestUsd),
    oiChangePct24h: oiChangePct24h == null ? null : round(oiChangePct24h, 4),
    longShortRatio: raw.longShortRatio,
    takerBuySellRatio: raw.takerBuySellRatio,
    priceChangePct24h: raw.priceChangePct24h,
    leverageHeat,
    bias,
    confidence,
    rationale,
    ts: raw.ts,
  };
}

function round(x: number, d: number): number {
  const f = 10 ** d;
  return Math.round(x * f) / f;
}

function buildRationale(a: {
  bias: DerivBias; longShortRatio: number | null; fundingAnnualizedPct: number; oiChangePct24h: number | null; leverageHeat: number;
}): string {
  const ls = a.longShortRatio != null ? `L/S ${a.longShortRatio.toFixed(2)}` : "L/S n/a";
  const fund = `${a.fundingAnnualizedPct.toFixed(1)}% ann funding`;
  const oi = a.oiChangePct24h != null ? `, OI ${a.oiChangePct24h >= 0 ? "up" : "down"} ${Math.abs(a.oiChangePct24h).toFixed(1)}%` : "";
  if (a.bias === "long_squeeze_risk") return `Longs crowded (${ls}) paying ${fund}${oi}; elevated long-squeeze risk (heat ${a.leverageHeat}).`;
  if (a.bias === "short_squeeze_risk") return `Shorts crowded (${ls}) with ${fund}${oi}; elevated short-squeeze risk (heat ${a.leverageHeat}).`;
  return `Balanced positioning (${ls}), ${fund}${oi}; leverage heat ${a.leverageHeat}.`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/derivativeSignal.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/research/derivativeSignal.ts test/derivativeSignal.test.ts && git commit -q -m "feat: derivative leverage/squeeze signal core"
```

---

## Task 3: Binance adapter + parser

**Files:**
- Create: `src/market/binanceDerivs.ts`
- Test: `test/binanceDerivs.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// test/binanceDerivs.test.ts
import { describe, it, expect } from "vitest";
import { parseDerivs, PERP_SYMBOLS } from "../src/market/binanceDerivs.js";

const parts = {
  premiumIndex: { markPrice: "61240.5", indexPrice: "61210.0", lastFundingRate: "0.0001", time: 1784308577000 },
  openInterest: { openInterest: "100000", symbol: "BTCUSDT", time: 1784308577000 },
  oiHist: [
    { sumOpenInterestValue: "7680000000", timestamp: 1784222177000 },
    { sumOpenInterestValue: "8000000000", timestamp: 1784308577000 },
  ],
  longShort: [{ longShortRatio: "1.42", timestamp: 1784308577000 }],
  takerRatio: [{ buySellRatio: "1.08", timestamp: 1784308577000 }],
  ticker: { priceChangePercent: "2.1" },
};

describe("parseDerivs", () => {
  it("normalizes Binance responses into DerivsRaw", () => {
    const r = parseDerivs("BTC", parts, 1784308577);
    expect(r.markPrice).toBe(61240.5);
    expect(r.indexPrice).toBe(61210.0);
    expect(r.lastFundingRate).toBe(0.0001);
    expect(r.openInterestBase).toBe(100000);
    expect(r.oiVal24hAgo).toBe(7680000000);
    expect(r.oiValNow).toBe(8000000000);
    expect(r.longShortRatio).toBe(1.42);
    expect(r.takerBuySellRatio).toBe(1.08);
    expect(r.priceChangePct24h).toBe(2.1);
  });

  it("tolerates missing optional parts (nulls, no throw)", () => {
    const r = parseDerivs("BTC", { premiumIndex: parts.premiumIndex, openInterest: parts.openInterest }, 1);
    expect(r.oiValNow).toBeNull();
    expect(r.longShortRatio).toBeNull();
    expect(r.takerBuySellRatio).toBeNull();
    expect(r.priceChangePct24h).toBeNull();
  });

  it("PERP_SYMBOLS maps symbols to USDT perps", () => {
    expect(PERP_SYMBOLS.BTC).toBe("BTCUSDT");
    expect(PERP_SYMBOLS.ETH).toBe("ETHUSDT");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/binanceDerivs.test.ts`
Expected: FAIL — cannot find module `../src/market/binanceDerivs.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/market/binanceDerivs.ts
import type { DerivsRaw } from "../shared/types.js";

const FAPI = "https://fapi.binance.com";

// Perp majors with a Binance USDT-perp contract. Validated to have PERPETUAL contracts.
export const PERP_SYMBOLS: Record<string, string> = {
  BTC: "BTCUSDT", ETH: "ETHUSDT", SOL: "SOLUSDT", BNB: "BNBUSDT", XRP: "XRPUSDT",
  ADA: "ADAUSDT", DOGE: "DOGEUSDT", AVAX: "AVAXUSDT", LINK: "LINKUSDT", DOT: "DOTUSDT",
  TRX: "TRXUSDT", LTC: "LTCUSDT", UNI: "UNIUSDT", ATOM: "ATOMUSDT", NEAR: "NEARUSDT",
  APT: "APTUSDT", ARB: "ARBUSDT", OP: "OPUSDT", SUI: "SUIUSDT", AAVE: "AAVEUSDT",
  INJ: "INJUSDT", POL: "POLUSDT",
};

const num = (x: unknown): number | null => {
  const n = typeof x === "string" ? parseFloat(x) : typeof x === "number" ? x : NaN;
  return Number.isFinite(n) ? n : null;
};

export interface DerivsParts {
  premiumIndex: { markPrice?: unknown; indexPrice?: unknown; lastFundingRate?: unknown };
  openInterest: { openInterest?: unknown };
  oiHist?: { sumOpenInterestValue?: unknown }[];
  longShort?: { longShortRatio?: unknown }[];
  takerRatio?: { buySellRatio?: unknown }[];
  ticker?: { priceChangePercent?: unknown };
}

// Pure normalizer: raw Binance JSON pieces -> DerivsRaw.
export function parseDerivs(asset: string, p: DerivsParts, ts: number): DerivsRaw {
  const hist = Array.isArray(p.oiHist) ? p.oiHist : [];
  const oiVal24hAgo = hist.length ? num(hist[0].sumOpenInterestValue) : null;
  const oiValNow = hist.length ? num(hist[hist.length - 1].sumOpenInterestValue) : null;
  return {
    asset,
    markPrice: num(p.premiumIndex?.markPrice) ?? 0,
    indexPrice: num(p.premiumIndex?.indexPrice) ?? 0,
    lastFundingRate: num(p.premiumIndex?.lastFundingRate) ?? 0,
    openInterestBase: num(p.openInterest?.openInterest) ?? 0,
    oiValNow,
    oiVal24hAgo,
    longShortRatio: p.longShort?.length ? num(p.longShort[0].longShortRatio) : null,
    takerBuySellRatio: p.takerRatio?.length ? num(p.takerRatio[0].buySellRatio) : null,
    priceChangePct24h: p.ticker ? num(p.ticker.priceChangePercent) : null,
    ts,
  };
}

async function getJson(url: string): Promise<any> {
  const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
  if (!res.ok) throw new Error(`binance ${res.status} ${url}`);
  return res.json();
}
async function tryJson(url: string): Promise<any | undefined> {
  try {
    return await getJson(url);
  } catch {
    return undefined; // optional metric — degrade gracefully
  }
}

// Adapter: fetch all pieces for a symbol and normalize. premiumIndex + openInterest are
// core (throw on failure); the rest degrade to null.
export async function fetchDerivsRaw(asset: string, ts: number): Promise<DerivsRaw> {
  const sym = PERP_SYMBOLS[asset];
  if (!sym) throw new Error(`no perp market for ${asset}`);
  const [premiumIndex, openInterest] = await Promise.all([
    getJson(`${FAPI}/fapi/v1/premiumIndex?symbol=${sym}`),
    getJson(`${FAPI}/fapi/v1/openInterest?symbol=${sym}`),
  ]);
  const [oiHist, longShort, takerRatio, ticker] = await Promise.all([
    tryJson(`${FAPI}/futures/data/openInterestHist?symbol=${sym}&period=1h&limit=25`),
    tryJson(`${FAPI}/futures/data/globalLongShortAccountRatio?symbol=${sym}&period=1h&limit=1`),
    tryJson(`${FAPI}/futures/data/takerlongshortRatio?symbol=${sym}&period=1h&limit=1`),
    tryJson(`${FAPI}/fapi/v1/ticker/24hr?symbol=${sym}`),
  ]);
  return parseDerivs(asset, { premiumIndex, openInterest, oiHist, longShort, takerRatio, ticker }, ts);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/binanceDerivs.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/market/binanceDerivs.ts test/binanceDerivs.test.ts && git commit -q -m "feat: binance futures derivs adapter + parser"
```

---

## Task 4: Config

**Files:**
- Modify: `src/shared/config.ts`

- [ ] **Step 1: Add config fields**

Insert after the `reportPrice` line (currently `src/shared/config.ts:66`):

```ts
  derivativesPrice: process.env.DERIVATIVES_PRICE ?? "$0.05",
  // Perp majors the derivatives endpoint covers (must have a Binance USDT perp).
  perpAssets: (
    process.env.PERP_ASSETS ??
    "BTC,ETH,SOL,BNB,XRP,ADA,DOGE,AVAX,LINK,DOT,TRX,LTC,UNI,ATOM,NEAR,APT,ARB,OP,SUI,AAVE,INJ,POL"
  )
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean),
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/shared/config.ts && git commit -q -m "feat(config): derivatives price + perp assets"
```

---

## Task 5: Wire the paid /derivatives route into the seller

**Files:**
- Modify: `src/seller/server.ts`

- [ ] **Step 1: Add imports and constants**

At the top of `src/seller/server.ts`, extend the type import (line 9) and add derivs imports:

```ts
import type { Signal, MarketSnapshot, DerivativeSignal } from "../shared/types.js";
import { fetchDerivsRaw, PERP_SYMBOLS } from "../market/binanceDerivs.js";
import { computeDerivativeSignal } from "../research/derivativeSignal.js";
```

After the `REPORT_OUTPUT` constant (ends line 72), add the derivatives schema + cache:

```ts
const DERIV_INPUT_SCHEMA = {
  properties: {
    asset: {
      type: "string",
      enum: config.perpAssets,
      default: "BTC",
      description: `Perp asset symbol, one of ${config.perpAssets.join(", ")}`,
    },
  },
};

const DERIV_OUTPUT = {
  example: {
    asset: "BTC", markPrice: 61240.5, indexPrice: 61210, basisPct: 0.05,
    fundingRate8hPct: 0.01, fundingAnnualizedPct: 10.95, openInterestUsd: 8123456789,
    oiChangePct24h: 4.2, longShortRatio: 1.42, takerBuySellRatio: 1.08, priceChangePct24h: 2.1,
    leverageHeat: 38, bias: "long_squeeze_risk", confidence: "high",
    rationale: "Longs crowded (L/S 1.42) paying 10.9% ann funding; elevated long-squeeze risk.",
  },
  schema: {
    type: "object",
    properties: {
      asset: { type: "string" }, markPrice: { type: "number" }, indexPrice: { type: "number" },
      basisPct: { type: "number" }, fundingRate8hPct: { type: "number" }, fundingAnnualizedPct: { type: "number" },
      openInterestUsd: { type: "number" }, oiChangePct24h: { type: "number" },
      longShortRatio: { type: "number" }, takerBuySellRatio: { type: "number" }, priceChangePct24h: { type: "number" },
      leverageHeat: { type: "number", description: "0 to 100 leverage/fragility heat" },
      bias: { type: "string", enum: ["long_squeeze_risk", "short_squeeze_risk", "neutral"] },
      confidence: { type: "string", enum: ["low", "medium", "high"] },
      rationale: { type: "string" },
    },
  },
};

// Per-symbol TTL cache so repeated calls are fast and Binance-friendly.
const DERIV_TTL_MS = 45_000;
const derivCache = new Map<string, { ts: number; value: DerivativeSignal }>();
async function getDerivSignal(asset: string): Promise<DerivativeSignal> {
  const now = Date.now();
  const hit = derivCache.get(asset);
  if (hit && now - hit.ts < DERIV_TTL_MS) return hit.value;
  const raw = await fetchDerivsRaw(asset, Math.floor(now / 1000));
  const value = computeDerivativeSignal(raw);
  derivCache.set(asset, { ts: now, value });
  return value;
}
```

- [ ] **Step 2: Add the paid route to paymentMiddleware**

Inside the `paymentMiddleware({ ... })` map, after the `"GET /report"` entry (before the closing `}` of the routes object at line 154), add:

```ts
        "GET /derivatives": {
          accepts: {
            scheme: "exact",
            price: config.derivativesPrice,
            network,
            payTo,
          },
          serviceName: "Perpetua derivatives leverage signal",
          description:
            "Perp derivatives leverage/squeeze signal: funding (8h + annualized), open interest and 24h change, long/short crowding, taker flow, basis, and a 0 to 100 leverage-heat score with a bias call and rationale. Binance Futures data.",
          tags: [...TAGS, "derivatives", "perps", "funding", "open-interest", "liquidations"],
          extensions: {
            ...declareDiscoveryExtension({
              input: { asset: "BTC" },
              inputSchema: DERIV_INPUT_SCHEMA,
              output: DERIV_OUTPUT,
            }),
          },
        },
```

- [ ] **Step 3: Add the express handler**

After the `/report` handler (ends line 192), add:

```ts
  // Paid, the premium derivatives leverage signal, computed on demand from Binance Futures.
  app.get("/derivatives", async (_req, res) => {
    const raw = (_req.query.asset as string | undefined)?.toUpperCase() || "BTC";
    if (!PERP_SYMBOLS[raw]) {
      res.status(400).json({ error: `asset has no perp market, supported ${config.perpAssets.join(", ")}` });
      return;
    }
    try {
      res.json(await getDerivSignal(raw));
    } catch (e) {
      res.status(502).json({ error: "derivatives source unavailable" });
    }
  });
```

- [ ] **Step 4: Add to discovery, openapi, catalog, docs**

In the `discovery.items` array (line 227-230), add a third item:

```ts
      item("/derivatives", config.derivativesPrice, "Perp derivatives leverage/squeeze signal: funding, open interest, long/short crowding, basis, and a 0 to 100 leverage-heat score with a bias call."),
```

In `openapi.paths` (line 270-273), add:

```ts
      "/derivatives": { get: operation(config.derivativesPrice, "Derivatives leverage signal", DERIV_OUTPUT.schema) },
```

Note: `operation()` hardcodes the `asset` enum to `config.assets`. Change its `parameters[0].schema.enum` to accept a passed enum. Modify `operation` (line 237) signature and body:

```ts
  function operation(price: string, summary: string, outSchema: Record<string, unknown>, assetEnum: string[] = config.assets) {
```
and inside it change the parameter schema line to:
```ts
          schema: { type: "string", enum: assetEnum, default: assetEnum[0] },
```
then call the derivatives one with the perp list:
```ts
      "/derivatives": { get: operation(config.derivativesPrice, "Derivatives leverage signal", DERIV_OUTPUT.schema, config.perpAssets) },
```

In the free catalog `products` array (line 300-303), add:

```ts
        { resource: "/derivatives", price: config.derivativesPrice, description: "Perp leverage/squeeze signal: funding, OI, crowding, basis, 0-100 heat, bias." },
```

In `docsHtml` (the endpoints `<table>`, after the `/report` row ~line 332), add:

```ts
<tr><td><code>GET ${base}/derivatives</code></td><td class="price">${config.derivativesPrice}</td><td>Perp leverage/squeeze signal: funding, open interest, crowding, basis, 0-100 heat, bias call.</td></tr>
```

(Pass `config.derivativesPrice` into `docsHtml` by adding a parameter, or reference `config` directly — `config` is already imported in the module, so use `config.derivativesPrice` inline in the template. Update the `docsHtml` call at line 309 only if you thread it as a param; simplest is to read `config.derivativesPrice` directly inside `docsHtml`.)

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/seller/server.ts && git commit -q -m "feat(seller): premium /derivatives paid route"
```

---

## Task 6: Full verification

- [ ] **Step 1: Run the whole test suite**

Run: `npm test`
Expected: all test files PASS, including the new `derivativeSignal` and `binanceDerivs` tests plus the existing suite (analyst, controller, loop, money, treasury, x402).

- [ ] **Step 2: Typecheck the whole project**

Run: `npm run typecheck`
Expected: PASS, no errors.

- [ ] **Step 3: Live smoke test (network) — optional but recommended**

Run:
```bash
node --input-type=module -e "import('./src/market/binanceDerivs.ts')" 2>/dev/null || npx tsx -e "import { fetchDerivsRaw } from './src/market/binanceDerivs.js'; import { computeDerivativeSignal } from './src/research/derivativeSignal.js'; const r = await fetchDerivsRaw('BTC', Math.floor(Date.now()/1000)); console.log(JSON.stringify(computeDerivativeSignal(r), null, 2));"
```
Expected: a populated `DerivativeSignal` JSON for BTC with real funding/OI/leverageHeat — confirms live Binance wiring.

- [ ] **Step 4: Commit any smoke-test fixes**

```bash
git add -A && git commit -q -m "test: verify derivatives endpoint end to end" || echo "nothing to commit"
```

---

## Self-Review (done at plan time)

- **Spec coverage:** data source (Task 3, exact Binance endpoints) ✓; signal formulas — funding annualize, basis, OI change, leverageHeat weights, bias thresholds, confidence (Task 2) ✓; types (Task 1) ✓; config price+perp list (Task 4) ✓; seller route + discovery/openapi/catalog/docs + TTL cache + error handling 400/502 (Task 5) ✓; coverage list = perp majors (Tasks 3,4) ✓; TDD on pure cores (Tasks 2,3) ✓; out-of-scope (no LLM tier, single exchange) honored ✓.
- **Placeholders:** none — every code step is complete.
- **Type consistency:** `DerivsRaw`/`DerivativeSignal`/`DerivBias` defined in Task 1 are used identically in Tasks 2,3,5; `computeDerivativeSignal(raw)`, `parseDerivs(asset, parts, ts)`, `fetchDerivsRaw(asset, ts)`, `PERP_SYMBOLS` signatures consistent across tasks; `config.derivativesPrice`/`config.perpAssets` (Task 4) referenced exactly in Task 5.

## Deliverable

A live `/derivatives` paid route on the Perpetua seller — the differentiated, demand-backed product, settling real USDC on Base via the existing x402 stack.
