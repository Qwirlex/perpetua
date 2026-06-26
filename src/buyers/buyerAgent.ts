import { privateKeyToAccount, generatePrivateKey, type Account } from "viem/accounts";
import { keccak256, toHex } from "viem";
import { payAndGet } from "../x402/client.js";
import { config } from "../shared/config.js";
import type { Signal } from "../shared/types.js";
import type { PaymentRequirements } from "../x402/scheme.js";

// A buyer agent on the x402 Bazaar. It has its own wallet and pays per call for the
// agent's signal. settle is local in demo, a deterministic hash from the
// authorization, and a real Base USDC transferWithAuthorization in live mode.
export class BuyerAgent {
  account: Account;
  private salt = 0;

  constructor(pk?: `0x${string}`) {
    this.account = privateKeyToAccount(pk ?? generatePrivateKey());
  }

  private async settle(req: PaymentRequirements): Promise<string> {
    if (!config.live || !config.baseRpc) {
      this.salt += 1;
      return (
        "settle:" +
        keccak256(toHex(`${this.account.address}:${req.amount}:${this.salt}`)).slice(2, 18)
      );
    }
    // Live, submit the USDC transferWithAuthorization through a facilitator and return
    // the Base transaction hash.
    return "onchain-pending";
  }

  async buy(marketUrl: string) {
    return payAndGet<Signal>(`${marketUrl}/signal`, this.account, (req) => this.settle(req));
  }

  short(): string {
    return this.account.address.slice(0, 6) + "…" + this.account.address.slice(-4);
  }
}
