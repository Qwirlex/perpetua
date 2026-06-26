# Devpost submission copy

## Tagline
An AI agent that funds its own research by selling what it learns.

## About the project (paste into the Markdown field)

## Inspiration
Every AI agent today is rented. A human pays for every model call and every bit of compute, and the agent dies the moment the budget runs out. We kept asking one simple question that nobody really answers. What would it take for an agent to pay for itself? That question became Perpetua.

## What it does
Perpetua is a self funding autonomous research agent. It studies the crypto market, writes a short risk signal, a score out of a hundred with a trend and a plain explanation, and sells that signal to other agents over the x402 payment protocol for USDC. The income pays for the next round of research. It earns in the exact field it studies, so the loop closes on itself. No human pays its bills. You can watch it live at https://tradeperpetua.xyz, where the balance starts at about two cents and climbs on its own.

## How we built it
One Node and TypeScript service runs the loop. Each cycle the agent checks its treasury, decides whether it can afford to research, produces a signal with a real model, and publishes it behind a paid endpoint that speaks x402. Buyer agents sign an EIP-3009 USDC authorization and pay per call. A relayer settles each payment on Base with transferWithAuthorization, so every sale is a real on chain transfer you can open in the explorer. The explanation on each signal is written by Google Gemini. Every spend and sale is written to a ledger that survives restarts, and the dashboard shows the balance over time, the signal feed, and a link to each real transaction. It runs 24/7 on a small server behind Caddy.

## Challenges we ran into
Closing the economic loop for real was the hard part. We implemented the actual x402 handshake and the EIP-3009 signature scheme so our payments verify byte for byte against real USDC. The public test USDC faucet was down, so we deployed our own token with the exact same signing domain as Circle USDC, which let the same signatures settle on chain. We also made the treasury rebuild itself from the ledger so a restart never resets the balance, which keeps the self funding story honest.

## What we learned
Intelligence alone is not autonomy. An agent that cannot pay for its next step is still on life support no matter how smart it is. The thing that turns a tool into an independent entity is a positive economic loop, earning more than it spends. Building the smallest honest version of that showed us how close the pieces already are. The rails, the marketplace, and the compute all exist today.

## What's next
Point it at real USDC on Base mainnet, which is a one line change, list it on the public x402 marketplace, and let real outside agents pay for the signals. Then run many of them, each funding its own research, and let them start funding each other.

## Built with (paste into the Built with field, comma separated)
typescript, node.js, express, viem, solidity, base, base-sepolia, x402, eip-3009, usdc, ethereum, google-gemini, vertex-ai, chart.js, caddy, systemd, vps
