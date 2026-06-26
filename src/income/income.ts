import { createPublicClient, http, parseAbiItem, getAddress, type Address } from "viem";
import { base } from "viem/chains";
import { config } from "../shared/config.js";

// Tracks real income at the seller wallet on Base mainnet. It scans USDC Transfer
// events into the wallet, incrementally, and also reads the current balance. This is
// the real money the agent has earned from outside buyers, shown on the dashboard.

const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const TRANSFER = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");
const BALANCE_ABI = [
  { inputs: [{ name: "a", type: "address" }], name: "balanceOf", outputs: [{ type: "uint256" }], stateMutability: "view", type: "function" },
] as const;
const CHUNK = 5000n;
const MAX_CHUNKS_PER_REFRESH = 30;

export interface IncomeSale {
  from: string;
  amount: string;
  tx: string;
  block: string;
}

export class IncomeTracker {
  private client = createPublicClient({ chain: base, transport: http(config.baseRpc || undefined) });
  private seller: Address | null = config.sellerPayTo ? getAddress(config.sellerPayTo) : null;
  private startBlock = BigInt(config.incomeStartBlock);
  private lastScanned = 0n;
  private scanning = false;

  totalMicro = 0n;
  count = 0;
  balanceMicro = 0n;
  recent: IncomeSale[] = [];

  async refresh(): Promise<void> {
    if (!this.seller || this.scanning) return;
    this.scanning = true;
    try {
      const latest = await this.client.getBlockNumber();
      let from = this.lastScanned > 0n ? this.lastScanned + 1n : this.startBlock;
      let chunks = 0;
      while (from <= latest && chunks < MAX_CHUNKS_PER_REFRESH) {
        const to = from + CHUNK - 1n > latest ? latest : from + CHUNK - 1n;
        const logs = await this.client.getLogs({
          address: USDC,
          event: TRANSFER,
          args: { to: this.seller },
          fromBlock: from,
          toBlock: to,
        });
        for (const l of logs) {
          const value = l.args.value ?? 0n;
          this.totalMicro += value;
          this.count++;
          this.recent.unshift({
            from: l.args.from ?? "",
            amount: value.toString(),
            tx: l.transactionHash,
            block: l.blockNumber.toString(),
          });
        }
        this.lastScanned = to;
        from = to + 1n;
        chunks++;
      }
      this.recent = this.recent.slice(0, 12);

      this.balanceMicro = (await this.client.readContract({
        address: USDC,
        abi: BALANCE_ABI,
        functionName: "balanceOf",
        args: [this.seller],
      })) as bigint;
    } catch {
      // a transient RPC issue, retry on the next refresh
    } finally {
      this.scanning = false;
    }
  }

  state() {
    return {
      seller: this.seller,
      totalMicro: this.totalMicro.toString(),
      count: this.count,
      balanceMicro: this.balanceMicro.toString(),
      recent: this.recent,
    };
  }
}
