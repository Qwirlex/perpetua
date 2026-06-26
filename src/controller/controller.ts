// The controller is the heart of the moonshot. Each cycle it decides whether to spend
// on research or hold and let the current signal keep selling, keeping the agent
// solvent while producing as much sellable intelligence as it can afford.
export interface Decision {
  action: "research" | "wait";
  reason: string;
}

export function decide(balance: bigint, research: bigint, price: bigint): Decision {
  if (balance >= research + price) {
    return {
      action: "research",
      reason: "balance covers research and a one cycle runway, produce the next signal",
    };
  }
  return {
    action: "wait",
    reason: "balance below the research plus runway buffer, hold and let the current signal keep selling",
  };
}
