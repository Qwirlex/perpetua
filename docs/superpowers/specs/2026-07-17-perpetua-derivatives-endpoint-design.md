# Perpetua Premium Derivatives Endpoint — Design Spec

**Date:** 2026-07-17
**Status:** Approved (design), pending implementation
**Project:** Perpetua (moonshot) — x402 self-funding agent

## Goal

Add a premium paid x402 route `GET /derivatives?asset=BTC` to Perpetua's existing seller
that returns a composite **leverage / squeeze signal** computed from Binance Futures perp
data, priced at **$0.05 USDC**. This is a differentiated product agents cannot cheaply
self-compute (multi-metric derivatives aggregation), unlike the commodity spot `/signal`.

## Why this earns (evidence)

On-chain demand scan (`x402-scan`, 637/650 Base sellers, 2026-07-17):
- `derivatives_mev` category: clean **repeat EOA demand** — top seller 95 repeat buyers
  (102/1 EOA), laevitas 33, plus 26 & 22 — across only **17–19 sellers** (thin supply).
- Buyers already pay **$0.10** for derivatives data (laevitas perps/options).
Perpetua reuses its live x402 rails (PayAI facilitator, Base mainnet, discovery,
income wallet `0x86AB3d75C9240ef9452536d4d5D7052f9100cB97`) — **zero new infra, one route.**

## Data source — Binance Futures public API (free, no key)

Base host `https://fapi.binance.com`. Symbol map `SYMBOL → SYMBOLUSDT` (perp majors only).

| Metric | Endpoint | Field(s) used |
|---|---|---|
| Funding + basis | `/fapi/v1/premiumIndex?symbol=` | `markPrice`, `indexPrice`, `lastFundingRate` |
| Open interest (now) | `/fapi/v1/openInterest?symbol=` | `openInterest` (base units) → ×markPrice = USD |
| OI history (Δ24h) | `/futures/data/openInterestHist?symbol=&period=1h&limit=25` | `sumOpenInterestValue` first vs last |
| Crowding | `/futures/data/globalLongShortAccountRatio?symbol=&period=1h&limit=1` | `longShortRatio` |
| Taker flow | `/futures/data/takerlongshortRatio?symbol=&period=1h&limit=1` | `buySellRatio` |
| Price context | `/fapi/v1/ticker/24hr?symbol=` | `priceChangePercent` |

Binance rate limits are generous (weight-based, ~2400/min); a per-symbol TTL cache keeps
us well under.

## Signal computation (pure, tested)

`computeDerivativeSignal(raw) → DerivativeSignal`. Derivations:

- `fundingRate8hPct` = `lastFundingRate × 100`
- `fundingAnnualizedPct` = `lastFundingRate × 3 × 365 × 100` (funding every 8h → 3/day)
- `basisPct` = `(markPrice − indexPrice) / indexPrice × 100`
- `openInterestUsd` = `openInterest × markPrice`
- `oiChangePct24h` = `(oiValNow − oiVal24hAgo) / oiVal24hAgo × 100` (from `sumOpenInterestValue`)
- `longShortRatio`, `takerBuySellRatio`, `priceChangePct24h` passthrough
- **`leverageHeat` (0–100)** = `round(100 × weighted avg)` of four normalized components:
  - funding: `min(|fundingAnnualizedPct| / 50, 1)` — weight 0.35
  - crowding: `min(|longShortRatio − 1| / 1.5, 1)` — weight 0.25
  - oi: `min(|oiChangePct24h| / 30, 1)` — weight 0.25
  - basis: `min(|basisPct| / 0.5, 1)` — weight 0.15
  (missing component → dropped, weights renormalized over present components)
- **`bias`**:
  - `long_squeeze_risk` if `longShortRatio > 1.3` AND `fundingAnnualizedPct > 0`
  - `short_squeeze_risk` if `longShortRatio < 0.77` AND `fundingAnnualizedPct < 0`
  - else `neutral`
- `confidence`: `high` if all six metrics present, `medium` if 1–2 missing, `low` if ≥3 missing
- `rationale`: templated plain-language string from the numbers (no LLM in v1 — cheap, fast)

Thresholds (`1.3`, `0.77`, normalizers, weights) are named constants at the top of the module.

### Output shape (`DerivativeSignal`)

```json
{
  "asset": "BTC", "markPrice": 61240.5, "indexPrice": 61210.0,
  "basisPct": 0.05, "fundingRate8hPct": 0.01, "fundingAnnualizedPct": 10.95,
  "openInterestUsd": 8123456789, "oiChangePct24h": 4.2,
  "longShortRatio": 1.42, "takerBuySellRatio": 1.08, "priceChangePct24h": 2.1,
  "leverageHeat": 38, "bias": "long_squeeze_risk", "confidence": "high",
  "rationale": "Longs crowded (L/S 1.42) and paying 10.9% annualized funding; OI up 4.2% — elevated long-squeeze risk.",
  "ts": 1784308577
}
```

## Integration (isolated units)

Follows the existing seller pattern (`src/seller/server.ts`): paymentMiddleware entry +
`app.get` handler + discovery/openapi/catalog/docs rows.

| File | Change |
|---|---|
| `src/shared/types.ts` | add `DerivativeSignal`, `DerivsRaw` interfaces |
| `src/market/binanceDerivs.ts` | **new** — `PERP_SYMBOLS` map, `fetchDerivsRaw(symbol)` (network, tolerant per-call), `parseDerivs(responses)` (pure normalize) |
| `src/research/derivativeSignal.ts` | **new** — `computeDerivativeSignal(raw)` (pure, tested core) |
| `src/shared/config.ts` | add `derivativesPrice` (env `DERIVATIVES_PRICE`, default `"$0.05"`), `perpAssets` list |
| `src/seller/server.ts` | `DERIV_INPUT_SCHEMA` (asset enum = perp symbols) + `DERIV_OUTPUT`; paymentMiddleware `"GET /derivatives"`; `app.get("/derivatives")` handler (resolve asset → TTL cache → fetch → compute → json); add to `discovery.items`, `openapi.paths`, catalog `products`, docs table |

**Caching:** module-level `Map<symbol, {ts, value}>` in the seller (or derivs module), TTL
45s. Repeated calls to the same asset within TTL return cached — fast and Binance-friendly.

## Error handling

- Non-perp asset → HTTP 400 `{ error: "asset has no perp market, supported: BTC, ETH, …" }`
  (mirrors existing `unsupported` pattern).
- A failed sub-call (e.g. long/short ratio) → that metric is omitted, `confidence` lowered,
  response still returns. Only a failed `premiumIndex` (core price/funding) → HTTP 502
  `{ error: "derivatives source unavailable" }`.
- All fetches wrapped with a short timeout; the handler never hangs.

## Testing (TDD)

Network is a thin adapter (not unit-tested live). Pure core is tested with fixtures:

`test` for `computeDerivativeSignal`:
- positive funding + `longShortRatio 1.5` → `bias: long_squeeze_risk`
- negative funding + `longShortRatio 0.6` → `bias: short_squeeze_risk`
- balanced → `neutral`
- `fundingAnnualizedPct` = `lastFundingRate × 3 × 365 × 100` exact
- `basisPct` sign and magnitude
- `oiChangePct24h` from first/last `sumOpenInterestValue`
- `leverageHeat` ∈ [0,100]; extreme inputs → near 100; calm → near 0
- missing crowding metric → weights renormalize, `confidence: medium`

`test` for `parseDerivs`: sample Binance JSON responses → correct `DerivsRaw` fields;
missing/empty arrays tolerated.

## Coverage (perp majors)

BTC ETH SOL BNB XRP ADA DOGE AVAX LINK DOT TRX LTC UNI ATOM NEAR APT ARB OP SUI AAVE INJ POL.
Validate the list against Binance `exchangeInfo` during implementation; drop any without a
`SYMBOLUSDT` PERPETUAL contract. `asset` enum in the discovery/openapi schema = this list.

## Out of scope (YAGNI, v1)

- LLM-written derivatives report tier (add later as `/derivatives/report` if demand shows).
- Multi-exchange aggregation (Hyperliquid, Bybit) — Binance alone is deep/representative.
- True liquidation-level feeds (need paid Coinglass) — `leverageHeat` proxies fragility.

## Deliverable

A new `/derivatives` paid route live on the Perpetua seller, discoverable and settling real
USDC on Base via the existing x402 stack — the differentiated product the demand scan
identified.
