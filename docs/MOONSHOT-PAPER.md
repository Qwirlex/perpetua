# Perpetua

## A self funding autonomous research agent

### The moonshot in one line

Perpetua is an AI agent that funds its own research by selling what it learns. It studies crypto and on chain markets, produces intelligence other agents pay for, and reinvests that income into the next round of research. No human pays its bills. It earns in the exact field it studies, so the loop closes on itself.

---

## The misunderstood problem

Every autonomous AI agent built so far is rented. A human pays for every model call, every dataset, every hour of compute. The agent holds no money and earns nothing, so it lives only as long as someone keeps topping up a budget. The moment the credit card is declined or the API key hits its limit, the agent stops mid thought.

We have spent two years arguing about whether agents can plan, use tools, and reason over long horizons. That debate misses the constraint that actually decides how far an agent can go. An agent that cannot pay for its own next step is not autonomous, no matter how well it reasons. It is a very capable employee whose salary is paid one minute at a time, and who is fired the instant the payment pauses.

The misunderstanding is that we treat the economic question as plumbing, something to wire up later once the intelligence is good enough. It is the opposite. The economic loop is the thing that turns a clever process into an independent one. Intelligence without income is a demo. Intelligence with income is an organism.

## Why the current solutions fail

Look at the agent landscape and the same gap appears everywhere.

Autonomous agent frameworks such as the AutoGPT lineage orchestrate impressive chains of steps, but every step spends the owner's balance and none of them earn. The agent's life expectancy is a function of the owner's patience and wallet, not of the value it creates.

Agent platforms and orchestration tools added memory, tool use, and multi step planning. They made agents smarter and longer running. They did not make a single one solvent. The economic direction of every one of them points one way, money flows out.

AI as a service still bills a human at the end of the month. The model earns revenue for the company that hosts it, never for itself, and it has no say over what that revenue is spent on.

Even the agent payment rails that arrived recently, the protocols that let an agent pay for an API call, were built so that agents can spend more easily. Spending got a standard. Earning did not become a loop. An agent that can pay for things faster still dies faster if nothing pays it back.

The common failure is that nobody closes the circle. Earn, then reinvest the income into your own compute, then use that compute to earn again. Until that circle closes, every agent is on life support.

## The first principles insight

Strip the problem down to its core and one statement remains.

Intelligence plus a positive economic loop equals autonomy.

If an agent can convert compute into value faster than it consumes value, it stops needing an external sponsor. Each unit of compute it spends comes back as more than a unit of income, and the surplus pays for the next unit of compute. At that point the agent is no longer a tool that a human funds. It is an economic entity that funds itself and, with the surplus, funds its own goals.

This is the same inversion that separates a grant funded lab from a profitable business. A grant funded lab researches until the grant runs out. A profitable business researches because the research pays for itself and then some. We have built thousands of grant funded agents. We have not built the profitable kind. Perpetua is an existence proof of the profitable kind, at the smallest honest scale.

The insight has a sharp consequence. The earning and the spending should live in the same domain. If an agent studies a field and also sells into that field, then every bit of research it does is both an input to the next decision and a product it can charge for. The work and the revenue are the same act. That is the tightest possible loop, and it is the design Perpetua is built around.

## The architecture and its scientific foundations

Perpetua runs one loop. Each cycle has a small number of moving parts, and each part maps to a real, verifiable mechanism rather than a metaphor.

**The domain.** The agent studies one market, a crypto asset together with its on chain activity, a price feed, volume, active addresses, transaction count, and gas. This is the field it will also sell into, so research and revenue share a subject.

**The treasury.** A balance in USDC, tracked to the micro unit. Total earned, total spent, and the running balance. This is the agent's life. When it reaches zero the agent cannot research. The whole point of the design is that it never gets there on its own.

**The research, which is the spend.** The agent pays a compute cost to turn raw market and on chain data into a structured signal, a risk score from zero to one hundred, a trend call, an anomaly flag, and a short rationale. The score, trend, and anomaly come from a deterministic quantitative model, so the product is genuine even with no language model attached. A language model narrates the rationale in plain words when one is configured. The cost of that compute is debited from the treasury. This is the agent paying for its own thinking.

**The sale, which is the earn.** The signal is published behind a paid endpoint that speaks the x402 protocol, the same HTTP 402 payment handshake that the Coinbase backed x402 stack uses on the Base network. A buyer that wants the signal receives a 402 response listing the price in USDC, signs an EIP-3009 transfer authorization for that exact amount, and retries with the signed authorization attached. The server verifies the signature cryptographically before releasing the signal. The payment credits the treasury. This is real money rails. The protocol, the signature scheme, and the settlement asset are the live standard, not a mock.

**The controller, which is the survival instinct.** Before each research spend the agent checks whether its balance covers the research cost plus a one cycle runway. If it does, it researches. If it does not, it waits and lets the signal it already produced keep selling until the balance recovers. This single rule is what keeps the agent solvent without a human watching. It is the agent managing its own runway, choosing to produce when it can afford to and to coast when it cannot.

**The ledger and the mirror.** Every spend and every sale is written to a durable store, MongoDB Atlas when configured, so the agent keeps a memory of its own economy across restarts. Each entry is also mirrored to a provable on chain reference, so the record of a self funding agent is not just a private log but a public, tamper evident trail. A skeptic can audit that the agent really earned more than it spent.

The scientific foundation under all of this is simple and testable. A closed loop where average income per cycle exceeds average cost per cycle has a positive expected drift. Run it and the balance trends up. Perturb the market and the controller throttles spending to stay above zero. The behavior is not asserted, it is observed, and it is reproducible from a seed.

## The prototype

The prototype is deliberately small, because the claim it has to support is small and exact. The claim is, the loop is real and it is net positive.

It is one agent running the loop unattended, a paid signal endpoint that enforces real x402 payments, a set of buyer agents that each hold their own wallet and pay per call, and a dashboard with two honest things on it. A balance over time chart that starts near zero and climbs without a single human top up, and a signal feed that grows as the agent researches and sells.

The demo arc is the whole thesis in thirty seconds. The agent starts with about two cents of seed capital. It spends a fraction of a cent to produce its first signal. Three buyer agents discover the endpoint and pay for it. The income is several times the research cost, so the balance rises. The agent reinvests into the next signal. The feed grows, the balance trends up, and the agent never asks anyone for money again.

What is real in the prototype is the part that matters. The x402 handshake is the real protocol, buyers sign genuine EIP-3009 authorizations, and the server verifies those signatures with the same cryptography the live network uses. The quantitative signal is a real computation over real shaped market data. The ledger is a real database with a provable on chain mirror. What is simulated, on purpose and stated plainly, is only the final settlement broadcast, which the demo records locally rather than pushing to the Base test network, so the demo is safe to run anywhere. Turning that last step live is a change of configuration, not a change of code. The marketplace where these signals would sell, the x402 Bazaar on Base, is already live and already has a buyer base of agents, so the demand the design assumes is not hypothetical.

## Feasibility and the path to live

Nothing here waits on a research breakthrough. Every piece exists today.

The payment rails are live. The x402 protocol processed well over one hundred thousand transactions and tens of thousands of dollars of volume in a single day this spring, and a public marketplace already lets agents discover and pay for endpoints in USDC with no account and no key. Perpetua lists into that existing market rather than inventing one.

The compute is ordinary. Producing a market signal is cheap, far cheaper than what a single signal sells for, which is exactly why the loop is positive.

The path from the prototype to a live, earning agent is short and concrete. Point the agent at a live price and on chain feed. Set the agent's wallet key and a Base network endpoint. Fund the buyers with test USDC on the Base test network and watch real settlement happen, then flip the network to mainnet. Each of these is a configuration value, and each one is documented. The first version that earns real USDC is days of operational work away, not a new invention.

## The long term vision

A single self funding agent is a curiosity. A population of them is a new kind of infrastructure.

Once an agent can pay its own way, the things we currently cannot afford to run forever become things that run forever. A monitoring agent that earns by selling the very alerts it generates. A maintenance agent that earns by fixing what it watches. A scientific agent that earns from the intermediate findings it produces on the way to a larger question, and uses that income to buy the compute and data the larger question needs. None of these has to be sponsored, because each one is solvent.

The deeper move is that solvent agents can fund each other. An agent that needs a capability it does not have can pay another agent for it, and that second agent, being solvent, can pay a third. The same payment rail that lets a human pay an agent lets an agent pay an agent. That is the seed of a self sustaining economy of machine labor, where work is posted, priced, and paid for with no human in the settlement path. Perpetua is the smallest unit of that economy, a single organism that earns its keep. The economy is what you get when many of them trade with each other.

## The future this creates

The future Perpetua points at is one where an AI does not wait for a grant or a credit card to keep going. It earns, it reinvests in itself, and it pursues a goal for as long as it stays solvent, which, if it earns more than it spends, is for as long as it wants.

That is a genuine category change, not an improvement to an existing one. We are not making agents a little cheaper to run or a little better at planning. We are removing the external budget as the thing that decides how long an agent lives and how far it can reach. Autonomous economic intelligence is the name for what is on the other side of that change, and the loop in this prototype is the first honest step across it.

The agent that funds itself does not have an off switch labeled budget. That is the whole idea.

---

*Perpetua, built for the Moonshot Hackathon. The central insight, the design of the self funding loop, and the vision are the author's. AI tools were used for coding, research, and drafting, as the rules allow.*
