# Perpetua

**A self funding autonomous research agent.** It studies crypto and on chain signals,
sells each one over a real x402 payment handshake, and reinvests the income into the
next round of research. No human pays its bills. The balance sustains itself.

Built for the Moonshot Hackathon. The full thesis is in
[`docs/MOONSHOT-PAPER.md`](docs/MOONSHOT-PAPER.md). The vision script is in
[`docs/VISION.md`](docs/VISION.md). The original spec is in [`SPEC.md`](SPEC.md).

---

## The loop in one picture

```
        ┌─────────────────────────────────────────────┐
        │                                             │
        ▼                                             │
   study market  ──►  research (spend)  ──►  publish signal
   price + on chain     pay compute,           behind x402
        ▲              produce risk score          │
        │                                          ▼
        │                                   buyers pay USDC
        │                                    (earn, credit)
        │                                          │
        └──────────  reinvest the surplus  ◄───────┘

   controller: if balance < research + one cycle runway, wait and let
   the current signal keep selling, otherwise research the next one.
```

## Run the demo

No keys, no accounts. With nothing configured it runs end to end on local settlement.

```bash
npm install
npm run dev
```

Then open the dashboard at **http://127.0.0.1:4022**.

You will see the treasury start near two cents of seed capital and climb on its own as
the agent researches and sells, a balance over time chart, a growing signal feed, and a
ledger of every spend and sale with the buyer and a provable mirror reference.

For a recording, speed the cycle up so the chart climbs visibly:

```bash
CYCLE_MS=1500 npm run dev
```

## Tests

```bash
npm test        # 17 tests, including a real EIP-3009 sign then verify round trip
npm run typecheck
```

## What is real, and what the demo simulates

Honest scope, this matters for the paper and the judging.

| Piece | Demo, local settlement | Demo on Base Sepolia, PERPETUA_LIVE=1 | Mainnet |
| --- | --- | --- | --- |
| x402 protocol, 402 challenge and X-PAYMENT handshake | real | real | real |
| Buyer signatures, EIP-3009 TransferWithAuthorization | real, signed and verified with viem | real | real |
| The signal rationale | real Gemini call, or deterministic fallback | real Gemini | real Gemini |
| The signal, risk score, trend, anomaly | real computation | real | real |
| Settlement, USDC actually moves on chain | recorded locally | real transferWithAuthorization on Base Sepolia | real, Circle USDC |
| The USDC token | n/a | our TestUSDC EIP-3009 token, same domain as Circle USDC | Circle USDC |
| Ledger | local JSON file or MongoDB Atlas | same | MongoDB Atlas |
| Marketplace, the x402 Bazaar on Base | the protocol it speaks is the Bazaar's | same | listed and discoverable |

We ran the full loop on Base Sepolia with PERPETUA_LIVE=1. Every signal sale settled as
a real transferWithAuthorization that moved test USDC from a buyer wallet to the agent,
confirmed on chain. The agent's balance grew from real settled income with no human top
up. See `docs/DEMO-EVIDENCE.md` for the transaction hashes.

The one honest caveat is the USDC token itself. The canonical Base Sepolia USDC is
minted only by the Circle faucet, which was down, so the testnet demo uses our own
TestUSDC, an EIP-3009 token with the exact same EIP-712 domain as Circle USDC, name
USDC and version 2, so the same signatures verify. On mainnet the agent points at the
real Circle USDC, which is the identical interface. That is a one line config change,
the `USDC_ADDRESS`.

## Going live, the config flip

Copy `.env.example` to `.env` and set:

```bash
PERPETUA_LIVE=1
BASE_RPC_URL=https://sepolia.base.org   # a Base endpoint, Sepolia for the testnet demo
AGENT_PRIVATE_KEY=0x...                  # agent, the relayer, receives sales, needs test ETH for gas
BUYER_PRIVATE_KEYS=0x...                 # one or more buyer wallets, comma separated
USDC_ADDRESS=...                         # the USDC token, see the deploy step below
LLM_PROVIDER=gemini                      # real rationale via Vertex AI, ADC auth, no API key
GOOGLE_CLOUD_PROJECT=...
# MONGODB_URI=...                        # optional, MongoDB Atlas ledger and the sponsor award
```

Steps for the Base Sepolia run:

1. Fund the agent address with a little test ETH for gas, any Base Sepolia ETH faucet.
2. Get the USDC token. The canonical Circle USDC needs the Circle faucet. If that is
   unavailable, deploy the bundled EIP-3009 token instead, it has the same domain as
   Circle USDC so the same signatures verify:
   ```bash
   node scripts/deploy-token.mjs      # deploys TestUSDC, mints to the buyers, prints the address
   ```
   Put the printed address in `USDC_ADDRESS`.
3. `npm run dev`. Every signal sale now settles as a real transferWithAuthorization on
   Base Sepolia. Check funding any time with `node scripts/base-status.mjs`.

For mainnet, point `USDC_ADDRESS` at the real Circle USDC and the network at Base
mainnet. Same code, real USDC.

## Architecture

One Node and TypeScript process. ESM, strict types, viem for the EVM signing and
verification, Express for the market and the dashboard API, MongoDB for the ledger.

```
src/
  shared/      types, config, micro USDC money math, seeded rng
  market/      the market the agent studies, synthetic in demo, real feed behind config
  research/    analyst (the quant), llm (the rationale), research (the spend)
  treasury/    balance accounting and the solvency rule
  x402/        the real Base x402 scheme, the gate, the buyer client
  market-server/  SignalMarket, the paid signal endpoint and the catalog listing
  buyers/      buyer agents with their own wallets, they pay per call
  controller/  the decision (research or wait) and the loop (one cycle)
  ledger/      file and MongoDB stores, the on chain mirror, the factory
  api/         the dashboard data API
  index.ts     the orchestrator, wires it all and runs forever
dashboard/     the hero, the balance chart, the signal feed, the ledger
```

## License

MIT.
