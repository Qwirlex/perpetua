# Aegis smart contract audit over x402, design

Date 2026-07-26. Status approved by the user, ready for an implementation plan.

## Context

Perpetua sells four cheap crypto data products over x402 and they earn very little.
Real income to date is 0.805 USDC across 29 paid calls, and the only recurring outside
buyer pays about 0.055 USDC per day. The conclusion from the growth research is that
micropayment volume is not reachable for an unknown seller, so the money has to come
from price. This spec is the first expensive product in that lane.

We already own the two halves needed. Aegis is a live smart contract auditor on the
shared VPS, Python FastAPI with Slither, dynamic solc selection through solc-select and
Gemini reasoning through a local ADC file, plus a Next.js report viewer on aegiscan.xyz
with content addressed short report links. Perpetua is a live x402 seller on
api.tradeperpetua.xyz that settles real USDC on Base mainnet through the PayAI
facilitator with no KYB and no gas cost to either side.

The gap is quality. The current Aegis pipeline is a single Slither run followed by one
Gemini pass, and its risk score is a plain sum of severity weights. That was fine at
0.5 USDC per audit. Nobody pays ten dollars for output a free scanner also produces,
and nobody trusts a paid report that is padded with false positives. So the product is
defined by two things, a multi lens analysis and an explicit refutation pass that
deletes findings it cannot defend.

## Decisions locked with the user

| Question | Decision |
| --- | --- |
| Analysis depth | Multi lens, then an adversarial refutation pass over every finding |
| Delivery | Asynchronous. The paid call returns a job id, a free status route returns the result |
| Pricing | Two tiers, 5 USD quick scan and 10 USD full audit |
| Reasoning model | Gemini through the existing ADC on the VPS, no new provider |
| Hosting | Paid routes on the Perpetua seller, report pages on aegiscan.xyz |
| Input | Contract address on six chains, plus a raw source mode |
| Token rug lens | Yes, mandatory whenever the target looks like an ERC-20 |
| Report authenticity | keccak256 hash of the canonical report plus a service signature, no on chain write |

The user also decided to fund a 15 USD bootstrap purchase of both tiers after the build
is finished, so PayAI discovery indexes both routes at the correct price.

## Product surface

Both paid routes live on the Perpetua seller and are priced from env so they can be
tuned without a redeploy.

### Quick scan, 5 USD, synchronous

```
GET  /scan?address=0x...&chain=base
POST /scan            body { source, compiler } for the raw source mode
```

Returns the verdict, the risk score, the severity counts and up to five top findings with
location and a one line reason. No exploit scenarios, no refutation pass, no report page.
Target latency 20 to 40 seconds, which fits well inside the 300 second x402 timeout.

### Full audit, 10 USD, asynchronous

```
GET  /audit?address=0x...&chain=base
POST /audit           body { source, compiler } for the raw source mode
```

Returns 200 with the job handle as soon as source resolution and compilation succeed.

```json
{
  "jobId": "a3f19c2b7d84",
  "state": "running",
  "statusUrl": "https://api.tradeperpetua.xyz/audit/status?job=a3f19c2b7d84",
  "reportUrl": "https://aegiscan.xyz/audit/a3f19c2b7d84",
  "etaSeconds": 180,
  "target": { "address": "0x...", "chain": "base", "contractName": "Vault", "compiler": "0.8.25" }
}
```

The status route is free, unmetered and idempotent.

```
GET /audit/status?job=a3f19c2b7d84
```

```json
{
  "jobId": "a3f19c2b7d84",
  "state": "done",
  "progress": { "stage": "complete", "lensesDone": 6, "lensesTotal": 6, "findingsKept": 4, "findingsRefuted": 7 },
  "reportUrl": "https://aegiscan.xyz/audit/a3f19c2b7d84",
  "report": { "...": "the full report object" },
  "degraded": false,
  "retryUrl": null
}
```

States are `queued`, `running`, `done`, `failed`. A `failed` job and a `degraded` result
both expose `retryUrl`, a free one time rerun.

### Raw source mode

Both tiers accept unverified or undeployed code. Because a Solidity file does not fit in
a query string, the raw path is a POST with a JSON body holding `source` and an optional
`compiler`. The paid middleware covers the POST route the same way it covers the GET.

## No charge matrix

This is the trust core of the product and it comes for free from the x402 middleware,
which settles a payment only on a successful response. Verified twice in production on a
502 and a 404, the buyer was not charged either time.

| Condition | Response | Buyer charged |
| --- | --- | --- |
| Bad address, unsupported chain, missing parameter | 400 | No |
| Source not verified on the explorer and no raw source given | 422 with a hint to use the raw source mode | No |
| Source resolves but does not compile | 422 with the compiler error | No |
| Explorer or Aegis engine unreachable | 503 | No |
| Compilation succeeds, job created | 200 with the job handle | Yes |
| Reasoning fails after the job was created | Job goes `degraded` or `failed`, one free rerun offered | Yes, already settled |

The important consequence is that the expensive part of the paid request happens before
the response is written. Source resolution and the Slither compile run synchronously
inside the paid call, so a target we cannot analyse never produces a charge.

## Engine pipeline

All of this lives in the Aegis engine, the Python service that already owns Slither, solc
and Gemini. The Perpetua seller stays a thin paid gateway and never runs analysis itself.

1. **Resolve source.** `resolve_source` grows a chain parameter. One Etherscan V2 key
   serves every chain through `api.etherscan.io/v2/api` with a chainid, so the mapping is
   base 8453, ethereum 1, arbitrum 42161, optimism 10, polygon 137, bsc 56. The existing
   crytic-compile Etherscan platform path is kept, since it is what made multi file and
   double wrapped standard json projects compile correctly.
2. **Static analysis.** `run_slither` unchanged, including dynamic solc resolution from
   the pragma and the rule that a slither json with `success:false` is a compile error and
   not a clean report.
3. **Contract inventory.** Derive the function list with visibility, modifiers, mutability
   and inheritance from the Slither output. This feeds both the lenses and the privileged
   powers panel in the report.
4. **Lenses.** Six focused reasoning passes run concurrently, each receiving the flattened
   source, the inventory and the raw Slither hits, each returning findings only in its own
   domain.
   - `access_control`, privileged functions, missing or wrong modifiers, owner powers,
     renounce and transfer of ownership, absence of a timelock
   - `reentrancy_state`, external calls, checks effects interactions order, state written
     after a call, callback surfaces
   - `arithmetic_logic`, precision loss, rounding direction, unchecked blocks, unsafe
     casts, off by one in accounting
   - `economics_oracle`, price source manipulation, missing slippage bounds, fee math,
     flash loan sensitivity, first depositor and share inflation patterns
   - `upgrade_proxy`, proxy shape, uninitialized initializer, storage layout collisions,
     delegatecall and selfdestruct exposure
   - `erc20_rug`, enabled automatically when the inventory looks like an ERC-20. Hidden or
     unbounded mint, blacklist and allowlist gates, fee on transfer, transfer pausing,
     owner only sell paths, an upgradeable token implementation
5. **Merge.** Plain code, no model involved. Deduplicate by file, line and category, keep
   the highest severity variant, remember every provenance so the report can show that two
   independent lenses agreed.
6. **Refutation.** For every surviving finding a separate reasoning call receives the
   finding and the surrounding code with one instruction, refute it, and with an explicit
   bias, when uncertain answer refuted. A refuted finding is dropped or demoted to info
   with the refutation reason attached. Every kept finding carries the refutation verdict,
   which is what a buyer is actually paying for.
7. **Score and verdict.** Weighted, capped per severity rather than a plain sum, so ten
   low findings cannot outrank one critical. Confidence is computed, not asserted, from
   whether the source was verified, whether compilation was clean, how many lenses
   completed and what share of findings survived refutation. Verdict labels are
   `critical_risk`, `high_risk`, `caution`, `looks_ok`, each shipped next to a plain
   statement that a passing audit is not an endorsement.
8. **Assemble.** Executive summary in plain language, findings sorted by severity, the
   privileged powers table, a coverage table naming both what ran and what was not
   checked, target metadata, and integrity fields. `reportHash` is keccak256 over the
   canonical JSON with the signature fields removed, `report_signature` is that hash signed
   by a dedicated service key, and `signer` is the address recovered from it. An Ethereum style
   signature is used rather than a hosted public key file, because anyone can recover the signer
   from the hash with standard tooling and there is nothing extra to host or rotate.

The quick scan tier runs steps 1, 2, 3 and a single triage pass, then scores. No lenses,
no refutation, no report page.

## Data model

The current flat `Report` is not enough, so it grows without breaking the existing CROO
consumer. New fields are additive and the old ones keep their meaning.

```
Finding
  id, severity, title, location, category
  description            what is wrong
  impact                 what an attacker or an owner can actually do
  exploitScenario        concrete steps, full tier only
  recommendation         the concrete fix
  provenance[]           slither:<detector> or lens:<name>, one entry per source that found it
  refutation             { verdict: kept | refuted | demoted, reason }
  confidence             high | medium | low

PrivilegedPower
  function, selector, role, capability, canRugFunds

Coverage
  lensesRun[], lensesSkipped[], detectorsRun, notChecked[]

Report
  agent, version, tier
  target { address, chain, chainId, contractName, compiler, sourceVerified }
  status  ok | cannot_analyze | degraded
  verdict, riskScore, confidence
  summary
  findings[], privilegedPowers[], coverage
  generatedAt, durationMs
  reportHash, reportSignature, signer
```

## Job store

The job registry lives in the Aegis engine because the engine owns the long running work.
Jobs persist to disk as one JSON file per job under a configured directory, the same shape
the Aegis web report store already uses, so an engine restart does not lose a paid job.
A job that was `running` when the process died is resumed as `failed` with a free rerun
available, which is honest and cheap. Jobs expire on a configurable TTL, default seven
days, long enough for a buyer to fetch a result and short enough to stay small.

New engine routes, all internal on 127.0.0.1 and never exposed publicly:

```
POST /audit/jobs         create, body holds the resolved target and the slither result
GET  /audit/jobs/{id}    state, progress and the report when complete
POST /audit/jobs/{id}/retry   one free rerun
POST /scan               synchronous quick tier
```

## Report page

A new route on aegiscan.xyz, `/audit/<jobId>`, reusing the existing content addressed
store and short link machinery. The page order follows how a person actually decides
whether to put money into a contract.

1. Verdict band. Colour coded verdict, the risk score, the target identity with contract
   name, chain, address, compiler and a verified source badge, and one paragraph in plain
   language. Severity counts as chips.
2. Findings as cards. Severity chip, title, the file and line with the relevant code
   excerpt and the line highlighted, then three labelled blocks, what is wrong, what can
   happen, how to fix. Each card shows provenance and the refutation verdict, and a card
   found by two lenses says so.
3. Privileged powers table. Every function an owner or admin can call, what it can do, and
   a clear marker on anything that can move or freeze user funds. This is the section a non
   expert needs most and almost no free tool presents well.
4. Method and coverage. Which lenses ran, which were skipped and why, and an explicit list
   of what was not checked. Naming the limits is what makes the rest credible.
5. Integrity footer. The report hash, the signature and a short how to verify.

Design constraints. Light and dark themes, readable on a phone, wide content such as code
and tables scrolls inside its own container so the page never scrolls sideways, and the
layout prints to a clean PDF because buyers forward audits to other people.

## Configuration

New env on the Perpetua seller, all with defaults so a deploy needs no manual step:
`SCAN_PRICE` default `$5`, `AUDIT_PRICE` default `$10`, `AEGIS_ENGINE_URL` default
`http://127.0.0.1:8731`, `AUDIT_REPORT_BASE` default `https://aegiscan.xyz`.

New env on the Aegis engine: `AUDIT_JOB_DIR`, `AUDIT_JOB_TTL_DAYS`, `AUDIT_REPORT_DIR` pointing
at the same directory the web app reads, and `REPORT_SIGNING_KEY`, a dedicated key that holds no
funds and only signs reports. The Etherscan V2 key and the Gemini ADC path already exist.

## Testing

Python, pytest, Gemini and the explorer both mocked.
- chain mapping and rejection of an unsupported chain
- prompt builders for each lens are pure functions and are asserted on shape, not wording
- merge and deduplication, including two lenses agreeing on one line
- refutation filter, a refuted finding disappears, a demoted one survives as info
- scoring, ten lows never outrank one critical, confidence drops when a lens is skipped
- ERC-20 detection heuristic, a token triggers the rug lens and a vault does not
- job store state machine, create, progress, done, failed, retry once and only once, TTL
- degraded path, reasoning throws and the report still returns with Slither only content

Node, vitest.
- the 402 challenge carries the right amount for each tier
- 400, 422 and 503 paths return before any settlement
- the status route proxies engine state and never requires payment
- discovery, openapi, catalog and docs rows list both tiers with the env price

Web.
- the audit page renders from a fixture report, including a refuted finding, a two lens
  finding, an empty findings list and a `cannot_analyze` report

## Deployment

The Aegis engine and the Perpetua seller both already run under systemd on the shared VPS
31.77.199.251, and Caddy already serves aegiscan.xyz and api.tradeperpetua.xyz. So the
rollout is a git pull and a restart on each of the three services, no new domain, no new
TLS, no new Caddy block. Deploy order is engine first, then web, then seller, so the paid
routes never point at a version of the engine that lacks the job API.

## Open items, not blocking the build

- PayAI discovery only indexes a resource after a settled payment, so both tiers need one
  bootstrap purchase, 15 USD total. The user has agreed to fund this once the build is
  tested.
- x402scan has a documented API but registration needs a SIWX wallet signature and its
  reads cost 0.01 USDC per call, so the listing stays a manual step for the user.
- 402index accepts free self registration and can be done programmatically.

## Out of scope

A second static analyser such as Mythril, formal invariant checking, an on chain hash
anchor, refunds in USDC, project wide audits across many contracts, and any chain outside
the six named above. Each is a candidate for a later tier once the first one sells.
