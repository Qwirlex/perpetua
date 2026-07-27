import { createPublicClient, erc20Abi, http, type Address } from "viem";
import { base, mainnet } from "viem/chains";
import { config } from "../shared/config.js";

// Blockscout caches an address's token balances and they go stale for days while its
// block and transfer indexing stays current. On 2026-07-27 it reported 0.695 USDC for a
// wallet the chain valued at 16.11, which a paid /whale answer had already shipped. So
// balances are read from the chain itself, and the indexer is used only to discover
// which tokens to ask about and what each is worth.
const CHAINS = {
  base: { chain: base, rpc: config.walletBaseRpc },
  ethereum: { chain: mainnet, rpc: config.walletEthRpc },
} as const;

// Bounds the multicall. The caller sends recently transferred tokens first, then the
// indexer's balance list largest first, so the cut falls on small stale positions.
// Binance-scale wallets hold well over a thousand tokens, almost all airdrop noise.
const MAX_TOKENS = 120;

export interface OnchainBalances {
  nativeWei: bigint;
  tokens: Map<string, bigint>; // lowercase token address -> raw balance
}

// Reads the native balance and one balanceOf per candidate token in a single multicall.
// Returns null on any failure so the caller can still ship indexer numbers, labelled.
export async function fetchChainBalances(
  chain: string,
  address: string,
  tokens: string[],
): Promise<OnchainBalances | null> {
  const entry = CHAINS[chain as keyof typeof CHAINS];
  if (!entry) return null;
  const wanted = tokens.slice(0, MAX_TOKENS);
  const holder = address as Address;
  try {
    const client = createPublicClient({
      chain: entry.chain,
      transport: http(entry.rpc || undefined, { timeout: 9000, retryCount: 1 }),
    });
    const [nativeWei, results] = await Promise.all([
      client.getBalance({ address: holder }),
      wanted.length
        ? client.multicall({
            contracts: wanted.map((t) => ({
              address: t as Address,
              abi: erc20Abi,
              functionName: "balanceOf" as const,
              args: [holder] as const,
            })),
            allowFailure: true,
          })
        : Promise.resolve([]),
    ]);
    const held = new Map<string, bigint>();
    results.forEach((r, i) => {
      if (r.status === "success" && typeof r.result === "bigint") held.set(wanted[i].toLowerCase(), r.result);
    });
    return { nativeWei, tokens: held };
  } catch {
    return null;
  }
}
