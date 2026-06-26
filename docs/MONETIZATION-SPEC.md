# Perpetua monetization, turning the demo into real income

Goal. Make Perpetua earn real USDC from real outside agents, not just our own demo
buyers. This document is the honest plan for that, what we build, what it really takes,
and exactly what the human has to do by hand.

Date 2026-06-26. Researched against the live x402 ecosystem.

---

## The honest reality first

Good news, the model is validated. The exact pattern that earns money on x402 today is
take a useful data source, wrap it in an x402 paywall, list it on the Bazaar, and agents
pay per call automatically. A public example, a developer wrapped free crypto price and
signal APIs and earns about 1,500 to 2,400 USD a month at roughly 1,000 requests a day,
charging 0.01 for a basic query and 0.25 for an AI enriched report. That is Perpetua's
exact shape.

Good news, demand outweighs supply. As of mid 2026 the x402 network has roughly 4,400
buyers against 477 sellers, and Base alone did about 3.1 million agent transactions and
1.2 million USD in a recent 30 day window. The buyers are real and there are not enough
sellers.

The hard truth. Being listed is not the same as being paid. We will be discoverable, but
agents choose what to buy on price, on the quality of the data, and on whether the schema
is clear. Early revenue can be near zero until the listing is found and trusted. The
internal buyer agents we run in the demo do not count as income, they are a showcase.
Real money needs real third party agents to call our endpoint. So the work splits in two,
make the product genuinely good, and make it discoverable and cheap enough to try.

What this is not. This is not a get rich switch. It is a real, small, honest revenue
stream that can grow if the signal is good and the price is right. We treat it like a
product launch, not a faucet.

## What changes from the demo

The demo settles on Base Sepolia with our own token and our own relayer, and our own
buyer agents pay. For real income four things change.

1. The seller endpoint moves to the official x402 stack. We replace our hand rolled gate
   on the paid route with the official x402-express middleware pointed at the Coinbase
   CDP facilitator. The CDP facilitator gives fee free USDC settlement on Base mainnet,
   removes the need for us to custody gas or run a relayer, and is the only path that
   gets us auto listed in the Bazaar.
2. The network moves to Base mainnet, eip155:8453, with real Circle USDC. This is a
   config change plus the CDP facilitator credentials.
3. The data becomes real. Synthetic prices do not sell. We pull real crypto market data,
   a free source such as CoinGecko for price and volume, and a real on chain feed, and
   the signal is computed from that. The analyst and the Gemini rationale stay.
4. The endpoint goes public and discoverable. The paid route is exposed on a public URL,
   it declares Bazaar discovery metadata, input and output JSON Schemas plus a clear
   description, and after the first real settled payment CDP catalogs it automatically.

The autonomous self funding loop stays as the showcase and the story, but the real
revenue comes from outside agents hitting the public paid endpoint.

## Product, what we sell

Two tiers, matching what the market pays for.

- Basic signal, 0.01 USDC per call. The current signal, asset, price, risk score 0 to
  100, trend, anomaly flag, short rationale. Cheap enough for an agent to try on impulse.
- Enriched report, 0.25 USDC per call. A deeper read, multi factor breakdown, the on
  chain context, a longer Gemini written analysis, and a confidence note. Priced for
  agents that want a real answer, not a ping.

Differentiation. Anyone can resell a price. Our product is the judgment on top, the risk
score and the anomaly call and the plain language reasoning. That is the thing worth
paying for, and it is our edge from the Solvent and Aegis work.

## Architecture changes

```
public internet
      │
      ▼
  Caddy on the VPS  ──►  api.tradeperpetua.xyz   (public paid endpoint)
                              │
                              ▼
                   x402-express paymentMiddleware
                     payTo = our Base mainnet wallet
                     facilitator = CDP mainnet
                     routes:
                       GET /signal   $0.01   + discovery metadata
                       GET /report   $0.25   + discovery metadata
                              │
                  verify + settle via CDP facilitator (fee free, Base mainnet)
                              │
                   real USDC lands in our wallet
```

- New package, x402-express plus the CDP facilitator helper. Keep our existing custom
  x402 code for the internal demo loop, but the real seller route uses the official
  middleware so it settles on mainnet and lists in the Bazaar.
- Real data module, replace the synthetic MarketSource with a CoinGecko backed source
  for price and volume, plus an on chain feed for activity. Cache briefly so we do not
  hammer the free API.
- Discovery metadata, declare input and output JSON Schemas and a description on each
  paid route so the Bazaar can index and rank it.
- Keep the dashboard at tradeperpetua.xyz as the public face, add a short developer page
  that documents the paid endpoint, the price, and an example call, so a human or an
  agent can see how to buy.

## Economics, does it clear a profit

Per enriched call, revenue 0.25 USDC. Cost, one Gemini flash call is a fraction of a
cent, settlement on Base via CDP is fee free, our compute is a flat server cost we
already pay. So every real call is almost pure margin. The basic call at 0.01 still
clears because the analyst is deterministic and the Gemini call is tiny. The risk is not
margin, it is volume. The question is how many real agents call us, and that depends on
discovery and quality, not on the unit economics.

CDP free tier is 1,000 settlements a month, which is plenty to start. Past that there may
be facilitator pricing, check at the time.

## Phased plan

Phase 1, go live on mainnet for real, smallest version.
- Add x402-express on the paid route, CDP facilitator, Base mainnet, our wallet as payTo.
- Two routes, /signal at 0.01 and /report at 0.25, with discovery metadata.
- Swap in real CoinGecko market data.
- Expose api.tradeperpetua.xyz publicly through Caddy.
- Make one real test purchase from an outside wallet to trigger Bazaar cataloging.
- Verify the listing appears on x402scan and the Bazaar search.

Phase 2, make it findable and trusted.
- A clean developer page on the site, endpoint docs, price, example call, schema.
- Submit and polish the x402scan listing, good title, description, tags.
- Tighten the signal quality, add the real on chain feed, tune the score.

Phase 3, grow.
- Add a couple more assets, more signal types, a small free sample call to earn trust.
- Watch x402scan analytics, see what gets called, double down on what sells.
- Optionally let the autonomous agent treasury actually pay its own Gemini and data
  costs from real income, closing the real loop, not just the demo loop.

## What the human must do by hand

These are the things I cannot do for you, they need your accounts, your money, and your
identity.

1. Coinbase Developer Platform account. Sign up at the CDP site, create an x402 or API
   key, you get a key id and a secret. Send me both, I put them in the server env. This
   is what lets us use the mainnet facilitator and the Bazaar.
2. A Base mainnet wallet to receive USDC. Either a CDP wallet or any EVM wallet address
   you control. You only need the public address to receive, no funding required to take
   payments. Decide if you want a fresh dedicated wallet for clean accounting, I
   recommend yes. Send me the public address, the private key stays with you, I never
   need it for receiving.
3. Decide pricing. I propose 0.01 for the basic signal and 0.25 for the enriched report.
   Tell me if you want different numbers.
4. Optional, a CoinGecko account for a free API key, only if we hit the no key rate
   limit. Likely not needed at the start.
5. The x402scan listing. After the first real sale the Bazaar lists us automatically, but
   x402scan also lets a seller upload API info and polish the listing. You may need to
   connect a wallet there to claim or curate the listing. I will prep the text, you click
   connect and confirm.
6. Money and tax. Real USDC income is yours and your responsibility, wallet custody,
   conversion, and any tax. Not something I handle.

## Open decisions for you

- Go straight to Base mainnet, recommended since real money needs it, or run one more
  pass on Base Sepolia first. I recommend mainnet, the amounts are tiny and settlement is
  fee free.
- Which wallet receives the USDC, a fresh dedicated one, recommended, or an existing one.
- Pricing, accept 0.01 and 0.25 or change it.
- How hard to push discovery, just auto list, or also invest in the x402scan listing and
  a developer page, recommended yes since discovery is the real bottleneck.

## Sources

- Coinbase CDP x402 docs, the facilitator and Bazaar discovery
- x402scan, the ecosystem explorer and seller launchpad
- Public reports on x402 volume and the buyer to seller gap, mid 2026
