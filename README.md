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

| Piece | In the demo | Live |
| --- | --- | --- |
| x402 protocol, 402 challenge and X-PAYMENT handshake | real | real |
| Buyer signatures, EIP-3009 TransferWithAuthorization | real, signed and verified with viem | real |
| The signal, risk score, trend, anomaly | real computation over market data | real |
| Ledger | local JSON file, or MongoDB Atlas if a URI is set | MongoDB Atlas |
| On chain mirror | deterministic keccak reference | Base transaction |
| Settlement broadcast | recorded locally for safety | USDC on Base |
| Marketplace, the x402 Bazaar on Base | the protocol it speaks is the Bazaar's | listed and discoverable |

The only simulated piece is the final settlement broadcast. Everything that proves the
loop is real, the payment protocol, the signatures, the computed product, and the
ledger, is real. Going live is configuration, not new code.

## Going live, the config flip

Copy `.env.example` to `.env` and set:

```bash
PERPETUA_LIVE=1
MONGODB_URI=...                 # MongoDB Atlas, the ledger and the sponsor integration
BASE_RPC_URL=...                # a Base endpoint, Sepolia for the testnet demo
USDC_ADDRESS=0x036CbD53842c5426634e7929541eC2318f3dCF7e   # Base Sepolia USDC, swap for mainnet
AGENT_PRIVATE_KEY=0x...         # the agent identity that receives signal sales
LLM_PROVIDER=anthropic          # narrate the rationale with a real model, optional
ANTHROPIC_API_KEY=...
```

Fund the buyer wallets with Base Sepolia test USDC, run `npm run dev`, and the same
handshake settles on chain for real. Flip `USDC_ADDRESS` and the network to mainnet and
it earns real USDC.

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
