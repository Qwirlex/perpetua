// Compile and deploy the TestUSDC EIP-3009 token to Base Sepolia from the agent
// wallet, then mint test USDC to every buyer wallet. No faucet needed for USDC, the
// agent only needs a little test ETH for gas.
//
// Run: node scripts/deploy-token.mjs
// Then put the printed address into USDC_ADDRESS in .env and set PERPETUA_LIVE=1.
import "dotenv/config";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import solc from "solc";
import { createWalletClient, createPublicClient, http, formatEther, getContract } from "viem";
import { baseSepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

const __dir = path.dirname(fileURLToPath(import.meta.url));
const SOURCE = readFileSync(path.resolve(__dir, "../contracts/TestUSDC.sol"), "utf8");
const RPC = process.env.BASE_RPC_URL || "https://sepolia.base.org";
const MINT_USDC = 1000n * 1_000_000n; // 1000 test USDC per buyer

function compile() {
  const input = {
    language: "Solidity",
    sources: { "TestUSDC.sol": { content: SOURCE } },
    settings: { optimizer: { enabled: true, runs: 200 }, outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } } },
  };
  const out = JSON.parse(solc.compile(JSON.stringify(input)));
  const errs = (out.errors || []).filter((e) => e.severity === "error");
  if (errs.length) {
    for (const e of errs) console.error(e.formattedMessage);
    throw new Error("solc compile failed");
  }
  const c = out.contracts["TestUSDC.sol"].TestUSDC;
  return { abi: c.abi, bytecode: "0x" + c.evm.bytecode.object };
}

const agentKey = process.env.AGENT_PRIVATE_KEY;
if (!agentKey) throw new Error("AGENT_PRIVATE_KEY not set in .env");
const agent = privateKeyToAccount(agentKey);
const buyers = (process.env.BUYER_PRIVATE_KEYS || "")
  .split(",").map((s) => s.trim()).filter(Boolean).map((k) => privateKeyToAccount(k).address);

const transport = http(RPC);
const wallet = createWalletClient({ account: agent, chain: baseSepolia, transport });
const pub = createPublicClient({ chain: baseSepolia, transport });

const gas = await pub.getBalance({ address: agent.address });
console.log(`agent ${agent.address}  gas ${formatEther(gas)} ETH`);
if (gas === 0n) throw new Error("agent has no test ETH, fund it first then rerun");

console.log("compiling TestUSDC.sol ...");
const { abi, bytecode } = compile();

console.log("deploying ...");
const deployHash = await wallet.deployContract({ abi, bytecode });
const receipt = await pub.waitForTransactionReceipt({ hash: deployHash });
const token = receipt.contractAddress;
console.log(`token deployed at ${token}  tx ${deployHash}`);

const c = getContract({ address: token, abi, client: wallet });
for (const b of buyers) {
  // Mint with an explicit nonce and a status check. A mint sent too close behind the
  // deploy can land on a stale nonce and revert, so confirm it took and retry once.
  let minted = false;
  for (let attempt = 0; attempt < 3 && !minted; attempt++) {
    const nonce = await pub.getTransactionCount({ address: agent.address });
    const h = await c.write.mint([b, MINT_USDC], { nonce });
    const r = await pub.waitForTransactionReceipt({ hash: h });
    if (r.status === "success") {
      console.log(`minted 1000 USDC to buyer ${b}  tx ${h}`);
      minted = true;
    } else {
      console.warn(`mint attempt ${attempt + 1} reverted for ${b}, retrying`);
    }
  }
  if (!minted) throw new Error(`could not mint to ${b}`);
}

console.log("\nDONE. Set in .env:");
console.log(`USDC_ADDRESS=${token}`);
console.log("PERPETUA_LIVE=1");
console.log(`\nExplorer: https://sepolia.basescan.org/address/${token}`);
