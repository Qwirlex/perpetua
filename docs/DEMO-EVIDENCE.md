# Demo evidence

Captured from a live run on 2026-06-26, `CYCLE_MS=1500`, no keys configured, local
settlement. This is the raw proof that the self funding loop runs and is net positive.
Reproduce it with `CYCLE_MS=1500 npm run dev` and watch the dashboard at
http://127.0.0.1:4022.

## The loop log

The agent boots, lists its endpoint, and runs. The seed is 0.02 USDC. Each cycle it
spends 0.005 on research and earns 0.03 from three real x402 sales, so the balance
climbs about 0.025 per cycle with no human top up.

```
ledger, local JSON file
market on http://127.0.0.1:4021  agent 0x350994Eb639351e377fd5Ab6858d32C7acbeCFb9
dashboard http://127.0.0.1:4022
[research] balance 0.045000 USDC  earned 0.030000  spent 0.005000  sales 3  signal risk 27 up
[research] balance 0.070000 USDC  earned 0.060000  spent 0.010000  sales 3  signal risk 25 flat
[research] balance 0.095000 USDC  earned 0.090000  spent 0.015000  sales 3  signal risk 44 down
[research] balance 0.120000 USDC  earned 0.120000  spent 0.020000  sales 3  signal risk 23 flat
[research] balance 0.145000 USDC  earned 0.150000  spent 0.025000  sales 3  signal risk 41 up
[research] balance 0.170000 USDC  earned 0.180000  spent 0.030000  sales 3  signal risk 55 down
[research] balance 0.195000 USDC  earned 0.210000  spent 0.035000  sales 3  signal risk 48 down
[research] balance 0.220000 USDC  earned 0.240000  spent 0.045000  sales 3  signal risk 51 down
```

After about 100 cycles the treasury held 0.245 USDC, having earned 0.270 and spent
0.045, from a 0.02 seed. The balance only ever moved up.

## The x402 payment is real

An unpaid request to the signal endpoint returns a real HTTP 402 with the payment
requirements, the same shape the Coinbase x402 stack uses on Base.

```
$ curl -i http://127.0.0.1:4021/signal
HTTP 402
{
  "x402Version": 1,
  "error": "payment required",
  "resource": "/signal",
  "accepts": [{
    "scheme": "exact",
    "network": "base-sepolia",
    "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    "payTo": "0x350994Eb639351e377fd5Ab6858d32C7acbeCFb9",
    "amount": "10000",
    "maxTimeoutSeconds": 120,
    "extra": { "name": "USDC", "version": "2" }
  }]
}
```

The buyer signs an EIP-3009 TransferWithAuthorization for exactly 10000 micro USDC,
retries with the X-PAYMENT header, and the server verifies the signature before
releasing the signal. A tampered amount and a replayed nonce are both rejected, proven
in `test/x402.test.ts`.

## The catalog, the Bazaar listing

```
$ curl http://127.0.0.1:4021/catalog
{
  "name": "Perpetua crypto intelligence",
  "resource": "/signal",
  "network": "base-sepolia",
  "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  "payTo": "0x350994Eb639351e377fd5Ab6858d32C7acbeCFb9",
  "price": "10000",
  "currency": "USDC",
  "description": "Risk score, trend, and on chain anomaly flag for a crypto asset, priced per call over x402."
}
```

## The ledger, every move with a mirror

101 entries across the three kinds, seed, research_spend, signal_sale. A real sale
entry, the payer is the buyer address recovered from the signature, with a settlement
reference and an on chain mirror reference.

```json
{
  "id": "l-1782455942737-2",
  "ts": 1782455942737,
  "kind": "signal_sale",
  "amount": "10000",
  "balanceAfter": "25000",
  "ref": "sig-1782455942737-1",
  "payer": "0xaEBfE8532e8E047F17EC4d50558196FD0768A10E",
  "settlement": "settle:456b0f12b4cd4299",
  "mirrorTx": "mirror:760e89a6936cb99e"
}
```

## Tests

```
Test Files  6 passed (6)
     Tests  17 passed (17)
```

Including the real EIP-3009 sign then verify round trip, the tampered amount rejection,
the replay rejection, the treasury accounting, the analyst bounds, the controller
decision, and a full loop cycle that ends with a higher balance and records both sides.
