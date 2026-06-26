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
  buyerKeys: (process.env.BUYER_PRIVATE_KEYS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),

  llmProvider: process.env.LLM_PROVIDER ?? "none",
  geminiModel: process.env.GEMINI_MODEL ?? "gemini-3.5-flash",
  geminiLocation: process.env.GEMINI_LOCATION ?? "global",
  googleProject: process.env.GOOGLE_CLOUD_PROJECT ?? "",
  anthropicKey: process.env.ANTHROPIC_API_KEY ?? "",

  marketDataUrl: process.env.MARKET_DATA_URL ?? "",
  // Use the real CoinGecko feed in live mode, synthetic otherwise so tests stay offline.
  useRealData: process.env.USE_REAL_DATA === "1" || process.env.PERPETUA_LIVE === "1",

  // Monetization, the real x402 seller surface on the official v2 stack plus the CDP
  // facilitator. Receives real USDC to sellerPayTo, lists on the Bazaar.
  cdpKeyId: process.env.CDP_API_KEY_ID ?? "",
  cdpKeySecret: process.env.CDP_API_KEY_SECRET ?? "",
  // A facilitator URL to use instead of CDP, for example the PayAI facilitator which
  // needs no API keys, no KYB, and covers gas. Takes priority over CDP when set.
  facilitatorUrl: process.env.FACILITATOR_URL ?? "",
  sellerPayTo: process.env.SELLER_PAYTO ?? "",
  // CAIP-2 network for the seller, Base mainnet when live, Base Sepolia otherwise.
  sellerNetwork: process.env.SELLER_NETWORK ?? (process.env.PERPETUA_LIVE === "1" ? "eip155:8453" : "eip155:84532"),
  basicPrice: process.env.BASIC_PRICE ?? "$0.005",
  reportPrice: process.env.REPORT_PRICE ?? "$0.05",
  sellerPort: n(process.env.SELLER_PORT, 4055),
  sellerPublicUrl: process.env.SELLER_PUBLIC_URL ?? "https://api.tradeperpetua.xyz",
  contactEmail: process.env.CONTACT_EMAIL ?? "",
  coingeckoUrl:
    process.env.COINGECKO_URL ??
    "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=ethereum",
  coingeckoKey: process.env.COINGECKO_KEY ?? "",
};
