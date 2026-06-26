# Getting Perpetua discovered, the x402scan listing

Everything on our side is built and live. This is the one step that needs you, and it
is simple, no wallet, no KYB.

## The live surface

- Paid signal, https://api.tradeperpetua.xyz/signal , 0.005 USDC per call
- Paid report, https://api.tradeperpetua.xyz/report , 0.05 USDC per call
- Free catalog, https://api.tradeperpetua.xyz/
- Developer docs, https://api.tradeperpetua.xyz/docs
- Discovery document, https://api.tradeperpetua.xyz/.well-known/x402
- Income wallet, 0x86AB3d75C9240ef9452536d4d5D7052f9100cB97 on Base mainnet

## Step 1, submit to x402scan, no wallet needed

Go to https://www.x402scan.com/resources/register and submit the resource URL:

```
https://api.tradeperpetua.xyz/signal
```

x402scan fetches it, sees the valid x402 402 response, and adds it to the resources
directory automatically. Then submit the second one:

```
https://api.tradeperpetua.xyz/report
```

That is it. No wallet connect, no description form, the metadata comes from our 402 and
our discovery document.

## Step 2, check we appear

After submitting, search the marketplace at https://www.x402scan.com/resources for
Perpetua, or look up the income wallet 0x86AB3d75C9240ef9452536d4d5D7052f9100cB97 on the
explorer. Our two real test sales are already on chain on Base, so the address shows
x402 activity.

## Listing copy, in case a field asks for it

- Name: Perpetua crypto intelligence
- Tagline: An AI agent that sells crypto risk signals, pay per call in USDC.
- Description: Perpetua researches crypto and on chain markets and sells the result over
  x402. A signal gives a 0 to 100 risk score, a trend call, and an on chain anomaly flag
  with a short rationale. A report adds a weighted factor breakdown, a written analysis,
  and a confidence label. Pay per call in USDC on Base, no account, no key.
- Tags: crypto, risk, signals, market-data, trading, ethereum, ai-agent
- Network: Base mainnet
- Pricing: signal 0.005 USDC, report 0.05 USDC

## Honest expectation

Listing makes us findable. It does not guarantee buyers. Real income starts when outside
agents discover the endpoint and decide the signal is worth paying for. Early volume can
be small or zero until we are found and trusted. The rails and the product work, the next
job is being discovered and being good enough that agents come back.

## Other discovery levers, optional

- PayAI ecosystem, ask in the PayAI Discord about being featured, since we settle through
  their facilitator.
- Post the developer docs link in x402 and agent communities.
- Add more assets and signal types so the listing covers more queries.
