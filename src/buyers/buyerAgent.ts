import { privateKeyToAccount, generatePrivateKey, type Account } from "viem/accounts";
import { keccak256, toHex } from "viem";
import { payAndGet } from "../x402/client.js";
import { config } from "../shared/config.js";
import type { Signal } from "../shared/types.js";
import type { PaymentRequirements, PaymentPayload } from "../x402/scheme.js";

// A buyer agent on the x402 Bazaar. It has its own wallet and pays per call for the
// agent's signal. In demo the settlement is a deterministic local hash, in live mode it
// is a real Base USDC transferWithAuthorization that moves test USDC to the agent.
export class BuyerAgent {
  account: Account;
  private salt = 0;

  constructor(pk?: `0x${string}`) {
    this.account = privateKeyToAccount(pk ?? generatePrivateKey());
  }

  private async settle(req: PaymentRequirements, payload: PaymentPayload): Promise<string> {
    if (config.live && config.baseRpc) {
      const { settleOnBase } = await import("../x402/baseSettle.js");
      return settleOnBase(payload);
    }
    this.salt += 1;
    return (
      "settle:" +
      keccak256(toHex(`${this.account.address}:${req.amount}:${this.salt}`)).slice(2, 18)
    );
  }

  async buy(marketUrl: string) {
    return payAndGet<Signal>(`${marketUrl}/signal`, this.account, (req, payload) =>
      this.settle(req, payload),
    );
  }

  short(): string {
    return this.account.address.slice(0, 6) + "…" + this.account.address.slice(-4);
  }
}
