// Check the Base Sepolia funding status of the agent and buyer wallets.
// Run: node scripts/base-status.mjs
import "dotenv/config";
import { createPublicClient, http, formatEther, formatUnits } from "viem";
import { baseSepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

const RPC = process.env.BASE_RPC_URL || "https://sepolia.base.org";
const USDC = process.env.USDC_ADDRESS || "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const client = createPublicClient({ chain: baseSepolia, transport: http(RPC) });

const erc20 = [
  { inputs: [{ name: "a", type: "address" }], name: "balanceOf", outputs: [{ type: "uint256" }], stateMutability: "view", type: "function" },
];

function addrOf(key) {
  try { return privateKeyToAccount(key).address; } catch { return null; }
}

const agent = addrOf(process.env.AGENT_PRIVATE_KEY);
const buyers = (process.env.BUYER_PRIVATE_KEYS || "").split(",").map((s) => s.trim()).filter(Boolean).map(addrOf);

async function show(label, addr, needsUsdc) {
  if (!addr) { console.log(`${label}: no key set`); return; }
  const eth = await client.getBalance({ address: addr });
  let usdc = 0n;
  try { usdc = await client.readContract({ address: USDC, abi: erc20, functionName: "balanceOf", args: [addr] }); } catch {}
  console.log(`${label}  ${addr}`);
  console.log(`   ETH  ${formatEther(eth)}${needsUsdc ? "" : "   (needs a little for gas)"}`);
  console.log(`   USDC ${formatUnits(usdc, 6)}${needsUsdc ? "   (the agent earns this)" : ""}`);
}

console.log("Base Sepolia status, chainId 84532\n");
await show("AGENT (relayer, receives sales, pays gas)", agent, true);
for (let i = 0; i < buyers.length; i++) await show(`BUYER ${i + 1} (pays USDC)`, buyers[i], false);

console.log("\nFund the AGENT with test ETH for gas, and each BUYER with test USDC.");
console.log("ETH faucet:  https://www.alchemy.com/faucets/base-sepolia  or  https://docs.base.org/tools/network-faucets");
console.log("USDC faucet: https://faucet.circle.com  (pick Base Sepolia)");
