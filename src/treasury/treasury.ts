// The agent wallet accounting. Balance, total earned, total spent, all micro USDC.
// solvent enforces the runway buffer the controller uses to decide research or wait.
export class Treasury {
  balance: bigint;
  earned = 0n;
  spent = 0n;

  constructor(seed: bigint) {
    this.balance = seed;
  }

  canAfford(amount: bigint): boolean {
    return this.balance >= amount;
  }

  // True when the balance covers a research spend plus a one cycle price buffer, the
  // runway the controller keeps so the agent never spends itself insolvent.
  solvent(research: bigint, price: bigint): boolean {
    return this.balance >= research + price;
  }

  spend(amount: bigint, _ref: string): void {
    if (amount > this.balance) throw new Error("insufficient balance");
    this.balance -= amount;
    this.spent += amount;
  }

  earn(amount: bigint, _ref: string): void {
    this.balance += amount;
    this.earned += amount;
  }

  state() {
    return {
      balance: this.balance.toString(),
      earned: this.earned.toString(),
      spent: this.spent.toString(),
    };
  }
}
