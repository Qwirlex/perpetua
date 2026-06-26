import "dotenv/config";

const n = (v: string | undefined, d: number) => (v !== undefined && v !== "" ? Number(v) : d);

// Central config. With nothing in the environment the demo runs end to end on local
// settlement. The economics constants are fixed here so the loop stays net positive,
// see the plan, seed 0.02 USDC, research 0.005, sale 0.01, three buyers per cycle.
export const config = {
  live: process.env.PERPETUA_LIVE === "1",

  // Economics, micro USDC.
  seedMicro: 20_000n,
  researchCostMicro: 5_000n,
  signalPriceMicro: 10_000n,

  buyersPerCycle: n(process.env.BUYERS_PER_CYCLE, 3),
  cycleMs: n(process.env.CYCLE_MS, 6000),
  marketPort: n(process.env.MARKET_PORT, 4021),
  apiPort: n(process.env.API_PORT, 4022),
  asset: process.env.ASSET ?? "ETH",

  mongoUri: process.env.MONGODB_URI ?? "",
  mongoDb: process.env.MONGODB_DB ?? "perpetua",

  baseRpc: process.env.BASE_RPC_URL ?? "",
  usdc: process.env.USDC_ADDRESS ?? "",
  x402Network: process.env.X402_NETWORK ?? "base-sepolia",

  agentPrivateKey: process.env.AGENT_PRIVATE_KEY ?? "",
  mirrorPrivateKey: process.env.MIRROR_PRIVATE_KEY ?? "",

  llmProvider: process.env.LLM_PROVIDER ?? "none",
  geminiModel: process.env.GEMINI_MODEL ?? "gemini-3.5-flash",
  googleProject: process.env.GOOGLE_CLOUD_PROJECT ?? "",
  anthropicKey: process.env.ANTHROPIC_API_KEY ?? "",

  marketDataUrl: process.env.MARKET_DATA_URL ?? "",
};
