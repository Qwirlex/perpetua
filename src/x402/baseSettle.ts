import {
  createWalletClient,
  createPublicClient,
  http,
  type Hex,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { config } from "../shared/config.js";
import type { PaymentPayload } from "./scheme.js";

// Live settlement on Base. The buyer signs an EIP-3009 authorization gaslessly, then a
// relayer submits transferWithAuthorization to the USDC contract and pays the gas. USDC
// moves from the buyer to the agent on chain, the canonical x402 settlement. The relayer
// is the agent itself, funded with a little test ETH for gas.

// FiatTokenV2 transferWithAuthorization, the packed 65 byte signature variant.
const USDC_ABI = [
  {
    inputs: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "nonce", type: "bytes32" },
      { name: "signature", type: "bytes" },
    ],
    name: "transferWithAuthorization",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

function build() {
  if (!config.agentPrivateKey) throw new Error("AGENT_PRIVATE_KEY required for live settlement");
  const account = privateKeyToAccount(config.agentPrivateKey as Hex);
  const transport = http(config.baseRpc);
  const relayer = createWalletClient({ account, chain: baseSepolia, transport });
  const publicClient = createPublicClient({ chain: baseSepolia, transport });
  return { relayer, publicClient };
}

let cached: ReturnType<typeof build> | null = null;
function clients() {
  return (cached ??= build());
}

// Submit the signed authorization on chain and return the confirmed transaction hash.
// Waits for the receipt so a counted sale always reflects USDC that actually moved.
export async function settleOnBase(payload: PaymentPayload): Promise<string> {
  const { relayer, publicClient } = clients();
  const a = payload.authorization;
  const hash = await relayer.writeContract({
    address: (config.usdc || "0x036CbD53842c5426634e7929541eC2318f3dCF7e") as Address,
    abi: USDC_ABI,
    functionName: "transferWithAuthorization",
    args: [
      a.from as Address,
      a.to as Address,
      BigInt(a.value),
      BigInt(a.validAfter),
      BigInt(a.validBefore),
      a.nonce as Hex,
      payload.signature,
    ],
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 60_000 });
  if (receipt.status !== "success") throw new Error(`settlement reverted ${hash}`);
  return hash;
}
