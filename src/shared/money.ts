// All money is micro USDC, integer atomic units. 1 USDC = 1_000_000 micro. bigint
// everywhere so the treasury never drifts on float rounding.
export const USDC = 1_000_000n; // micro per USDC

export function toUsdc(micro: bigint): string {
  const neg = micro < 0n;
  const v = neg ? -micro : micro;
  const whole = v / USDC;
  const frac = (v % USDC).toString().padStart(6, "0");
  return (neg ? "-" : "") + whole.toString() + "." + frac;
}

export function fromUsdc(s: string): bigint {
  const [w, f = ""] = s.trim().split(".");
  const frac = (f + "000000").slice(0, 6);
  return BigInt(w) * USDC + BigInt(frac || "0");
}
