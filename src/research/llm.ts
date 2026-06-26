import { config } from "../shared/config.js";
import type { MarketSnapshot, SignalCore } from "../shared/types.js";

// The rationale is the human readable part of a signal. The agent pays compute to
// produce it. A real provider runs when LLM_PROVIDER is set, guarded by a timeout, and
// a deterministic plain sentence is the fallback so research always returns. Plain
// style, no dashes, no parentheses, no hyphen jargon.
const STYLE =
  "Write one short plain sentence on the risk for a crypto trader. " +
  "No dashes, no parentheses, no jargon.";

function fallback(m: MarketSnapshot, c: SignalCore): string {
  const dir = c.trend === "up" ? "rising" : c.trend === "down" ? "falling" : "steady";
  const lvl = c.score <= 33 ? "low" : c.score <= 66 ? "moderate" : "high";
  return `${m.asset} is ${dir} near ${m.price} with ${lvl} risk${
    c.anomaly ? " and an on chain anomaly worth watching" : ""
  }.`;
}

function prompt(m: MarketSnapshot, c: SignalCore): string {
  return (
    `${STYLE}\n` +
    `Asset ${m.asset} price ${m.price}, 24h move ${m.changePct24h} percent, ` +
    `gas ${m.gasGwei} gwei, volume ${Math.round(m.volumeUsd / 1e6)} million USD. ` +
    `Computed risk score ${c.score} out of 100, trend ${c.trend}` +
    `${c.anomaly ? ", on chain anomaly detected" : ""}.`
  );
}

const TIMEOUT_MS = 8000;
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, rej) => setTimeout(() => rej(new Error("llm timeout")), ms)),
  ]);
}

// Anthropic via REST, no SDK dependency. Returns the first text block.
async function callAnthropic(m: MarketSnapshot, c: SignalCore): Promise<string> {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": config.anthropicKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 80,
      messages: [{ role: "user", content: prompt(m, c) }],
    }),
  });
  if (!r.ok) throw new Error(`anthropic ${r.status}`);
  const d = (await r.json()) as { content?: Array<{ text?: string }> };
  return d.content?.[0]?.text ?? "";
}

async function callProvider(m: MarketSnapshot, c: SignalCore): Promise<string> {
  if (config.llmProvider === "anthropic" && config.anthropicKey) {
    return callAnthropic(m, c);
  }
  // gemini and other providers slot in here, reusing the Solvent Vertex setup.
  throw new Error("no live provider configured");
}

export async function rationale(m: MarketSnapshot, c: SignalCore): Promise<string> {
  if (config.llmProvider === "none") return fallback(m, c);
  try {
    const text = await withTimeout(callProvider(m, c), TIMEOUT_MS);
    return text && text.trim() ? text.trim() : fallback(m, c);
  } catch {
    return fallback(m, c);
  }
}

export { STYLE, fallback };
