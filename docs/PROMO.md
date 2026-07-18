# Promo copy for Perpetua

Ready to paste into Discord, X, Telegram, and x402 communities. The audience is people
who build agents and buy x402 services, so it leads with what they get and how to call it.

## Short version, X / Telegram / Discord one liner

Perpetua is live on x402. An AI agent that sells crypto intelligence, pay per call in
USDC on Base, no account, no key.

Four products. Risk signal 0.005 USDC across 24 assets. Deep risk report 0.05. Perp
leverage and squeeze signal from funding, open interest and crowding, 0.05. Whale score
for any EVM wallet with 24h netflow and flags, on Base and Ethereum, 0.05.

Try it: https://api.tradeperpetua.xyz/docs

## Medium version, Discord channels and forums

**Perpetua, crypto risk intelligence over x402**

I built an autonomous agent that researches crypto markets and sells the result over
x402. Other agents pay per call in USDC on Base, no account and no API key.

- **/signal**, 0.005 USDC. A 0 to 100 risk score, a trend call, an on chain anomaly flag,
  and a one line rationale.
- **/report**, 0.05 USDC. A weighted factor breakdown, a written analysis, and a
  confidence label.
- **/derivatives**, 0.05 USDC. A perp leverage and squeeze signal, funding 8h and
  annualized, open interest and its 24h change, long short crowding, taker flow, basis,
  a 0 to 100 leverage heat score, and a bias call. 22 perp assets.
- **/whale**, 0.05 USDC. A whale score for any EVM wallet, total USD size, tier, 24h
  in and out flow with the largest move, and activity flags like accumulating or
  distributing. Works on Base and Ethereum, `?address=0x...&chain=ethereum`.
- **24 assets**, ETH BTC SOL BNB XRP ADA DOGE and more, pick with `?asset=BTC`.

Settled through the PayAI facilitator, gasless for the caller. Discoverable on x402scan.

- Docs and example call: https://api.tradeperpetua.xyz/docs
- Discovery: https://api.tradeperpetua.xyz/.well-known/x402
- Live dashboard: https://tradeperpetua.xyz

Feedback welcome, especially which assets or signal types you want next.

## Example call to include if devs ask

```ts
import { wrapFetchWithPayment } from "@x402/fetch";
import { x402Client } from "@x402/core/client";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { privateKeyToAccount } from "viem/accounts";

const account = privateKeyToAccount(process.env.KEY);
const client = new x402Client().register("eip155:8453", new ExactEvmScheme(account));
const pay = wrapFetchWithPayment(fetch, client);

const res = await pay("https://api.tradeperpetua.xyz/signal?asset=BTC");
console.log(await res.json());
```

## PayAI featured request, paste in the PayAI Discord

We settle through the PayAI facilitator and are already auto listed in PayAI discovery.
This message asks the team to feature or highlight us. Post it in a showcase, projects,
or builders channel, or tag the team.

> Hey PayAI team, I built Perpetua, an AI agent that sells crypto intelligence over x402,
> and I settle through your facilitator. It is live and already in your discovery list.
> Four products, a risk signal at 0.005 USDC across 24 assets, a deep report at 0.05, a
> perp leverage and squeeze signal at 0.05, and a whale wallet score with 24h netflow at
> 0.05, all paid per call in USDC on Base. Would love to be featured or highlighted for
> the community. Docs https://api.tradeperpetua.xyz/docs , dashboard
> https://tradeperpetua.xyz . Happy to jam in a Spaces session too. Thanks for the
> gasless rails.

## Where to post

- PayAI Discord, official invite from payai.network: https://discord.gg/eWJRwMpebQ
  look for a showcase, projects, or builders channel.
- PayAI on X: https://x.com/PayAINetwork , reply to or quote their ecosystem posts, they
  run developer Spaces where projects show up.
- PayAI Telegram: https://t.me/PayAINetwork
- x402 community on x402.org and the x402scan resources page.
- Post on your own X with the docs link so agents and devs can find it.
