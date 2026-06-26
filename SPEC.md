# Moonshot spec, a self funding autonomous research agent

Working name, Perpetua (tentative, alternatives Aevum, Endow, Selfwright, pick one).

For the Moonshot Hackathon, Devpost, deadline 2026-06-30 5pm IST. Judging is 35 percent
originality, 25 percent technical depth, 20 percent long term vision, 10 percent
feasibility, 10 percent prototype. So 80 percent is the idea, the paper, and the vision.
The build is small on purpose, it only has to prove the loop is real.

## The one line

A self funding intelligence desk. An AI agent researches market and on chain signals,
sells each signal it produces over x402, and reinvests the income into researching
deeper signals. It earns in the very domain it studies, so the loop closes on itself,
no human pays its bills. It funds its own research by selling what it learns.

## Concept D, the loop closes on one domain

The earn side and the research side are the same domain. The agent studies crypto and on
chain markets, produces intelligence, risk scores, trend calls, anomaly flags, and sells
that intelligence per call over x402. The income pays for the next round of research. A
signal that sells funds the discovery of the next signal. The tightest possible self
funding loop, an autonomous analyst that pays for itself by being useful in the exact
field it works in.

## Why it can actually live, the real market

This is the missing piece, a real place to sell so the agent earns rather than producing
output nobody buys. The agent lists its paid endpoint on the x402 Bazaar, the Coinbase
backed marketplace where AI agents discover and pay for APIs in USDC on Base, no API key,
no account, pay per call from about half a cent. Providers wrap an endpoint and earn USDC
on every call, and the network is live, x402 processed over 172,000 transactions and
about 63,000 USD of volume in a single day in March 2026. So the demand and the rails are
real, our agent plugs into an existing buyer base of other agents, it does not invent a
market. Backup venues with real agent demand, Virtuals Agent Commerce Protocol, Olas Mech
Marketplace, Fetch.ai Agentverse, Nevermined.

For the 4 day prototype we run on Base Sepolia testnet, the real x402 protocol with test
USDC, and show the endpoint discoverable and callable through the Bazaar flow. Going to
real USDC income on Base mainnet is a config change, not new code. Honest framing, the
marketplace and the payment rails are real and live, the demo runs on testnet for safety.

## The misunderstood problem

Every AI agent today is rented. A human pays for every model call, every dataset, every
hour of compute. The agent has no income, so it dies the moment the budget runs out.
AutoGPT and the agent frameworks all burn the owner's API key and stop. We treat AI as a
tool a human funds, never as something that can sustain itself.

## Why current solutions fail

- Autonomous agents consume a budget and never earn, so autonomy ends when the wallet
  empties.
- Agent frameworks orchestrate steps but close no economic loop.
- AI as a service still bills a human.
- Nobody closes the loop, earn, then reinvest the income into your own compute, then keep
  pursuing the goal.

## The first principles insight

Intelligence plus a positive economic loop equals autonomy. If an agent can turn compute
into value, earn, faster than it consumes value, spend, it becomes a perpetual, self
directed entity. That single inversion turns an agent from a tool a human pays for into
an economic organism that funds its own existence and its own goals.

## The architecture, the self funding loop

A single agent runs a loop every cycle:

1. Domain. The agent studies one market, on chain activity and a price feed, the same
   field it will sell into.
2. Treasury. It tracks its balance, total earned, total spent, net.
3. Research, the spend. It pays for compute, real LLM calls, Gemini or Claude, that turn
   raw market and on chain data into a signal, a risk score, a trend call, an anomaly
   flag, with a short rationale. The cost is debited from the treasury.
4. Sell, the earn. It publishes its intelligence behind an x402 paid endpoint and lists
   it on the x402 Bazaar on Base, so real callers, other agents, discover and pay per call
   in USDC. The income credits the treasury. In the demo on testnet a couple of buyer
   agents also pull and pay so the market is visibly live.
5. Controller. Each cycle it decides, research a fresh signal if it can afford it, or
   hold and wait for sales if the balance is low, keeping itself solvent while producing
   as much sellable intelligence as it can. This is the heart of the moonshot, an agent
   managing its own runway by selling what it learns.
6. Ledger. Every research spend and every signal sale is recorded, in MongoDB Atlas for
   memory and the sponsor award, and optionally on chain via the Casper contracts for a
   provable public record of a self funding agent.

## The prototype, lean, only 10 percent of the score

A working agent that runs the loop unattended and a small dashboard that proves it. Two
things on screen, a balance over time chart that stays above zero with no human top up,
and a live signal feed that grows as the agent researches and sells. A few buyer agents
pull and pay for the signals so the earn side is real. Scope, one research agent, the
full loop, the chart and the feed. Reuse the Solvent and Aegis TypeScript stack, the x402
service for selling signals, real LLM calls for producing them, MongoDB Atlas for the
ledger and memory.

The single demo moment, the agent starts with almost nothing, spends to produce a signal,
sells it, and uses the income to produce the next one. The signal feed grows and the
balance sustains itself. It funds its own research by selling what it learns, and it never
asks a human for money.

## Long term vision, 20 percent of the score

Self funding agents become economic organisms. Fleets of them can run science, monitoring,
and maintenance indefinitely, each paying its own way. They can fund each other, an agent
hiring another agent, which opens a whole self sustaining agent economy. The end state is
AI that funds its own existence and directs its own goals, decoupled from human budgets.
A new category, autonomous economic intelligence.

## The future we are creating

A world where an AI does not wait for a grant or a credit card. It earns, it reinvests in
itself, and it pursues a goal for as long as it stays solvent, which, if it earns more
than it spends, is forever.

## Build plan, lean for a 4 day window

Stack, Node and TypeScript, reuse the Solvent agent loop pattern and the x402 service
shape, but on Base with the Coinbase x402 stack and USDC, not Casper, so it lists on the
x402 Bazaar. Components.

- Treasury, balance and accounting, earned from sales, spent on research, net.
- ResearchModule, the spend, pulls market and on chain data, calls an LLM to produce a
  structured signal, a score plus a trend or anomaly call plus a short rationale, debits
  the compute cost.
- SignalMarket, the earn, an x402 paid endpoint on Base listed on the x402 Bazaar, real
  callers pay USDC per call, income credits the treasury. Use the Coinbase x402 stack on
  Base Sepolia for the demo, mainnet is a config flip. Buyer agents in the demo make it
  visibly live.
- Controller, each cycle decides research now or wait for sales, stays solvent, logs the
  choice.
- Ledger, MongoDB Atlas, every research spend and signal sale plus the agent memory and
  the signal history, optional on chain mirror for provability.
- Dashboard, the balance over time chart, the live growing signal feed, the loop log.

Deliverables for submission.

1. Prototype, the running loop and the dashboard.
2. Moonshot Paper, the sections above, the misunderstood problem through the future.
3. Vision presentation, a short video or slides, lead with the human framed thesis, show
   the self sustaining balance chart, state the long term vision.

## Decided

- Concept D, a self funding intelligence desk, the agent researches crypto and on chain
  intelligence and sells it, the earn and research close on one domain.
- Marketplace, the x402 Bazaar on Base, USDC pay per call, a real live market with a real
  buyer base of agents. This is the missing piece that lets the agent actually earn.
- Chain and rails, Base with USDC and the Coinbase x402 stack, demo on Base Sepolia
  testnet, mainnet is a config flip. Note, this is Base not Casper, Moonshot is open ended
  so that is fine, our x402 protocol knowledge from Solvent carries over.
- Product, crypto and on chain analysis, risk score plus trend or anomaly plus rationale,
  our edge and a category already in demand on the Bazaar.

## Open decisions to confirm on resume

- The ledger, MongoDB Atlas for the loop and the sponsor award, recommended, plus an
  optional on chain mirror if time allows.
- The name, Perpetua, Aevum, Endow, Selfwright, or your own.

## Notes

No AI tells in any written text, no em dashes, no parenthetical asides, no hyphenated
jargon. The paper must read as a human framed thesis, the rules require the central
insight and the vision to be the participant's, AI is only the tool.
