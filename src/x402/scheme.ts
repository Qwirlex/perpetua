import { verifyTypedData, type Address, type Hex } from "viem";
import type { Account } from "viem/accounts";
import { config } from "../shared/config.js";

// The real Base x402 scheme. Buyers sign an EIP-712 TransferWithAuthorization, the
// EIP-3009 message USDC uses, the same message the Coinbase x402 facilitator settles
// on Base. We verify the signature with viem, byte compatible with that stack. On
// chain settlement is the only live piece, the demo records the verified authorization
// as settled. Flipping to Base Sepolia or mainnet is config, not new code.

export const X402_VERSION = 1;

export const EIP3009_TYPES = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
} as const;

// Base Sepolia USDC, the default asset when none is configured.
const DEFAULT_USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
// Base Sepolia chain id. Base mainnet is 8453, set via the config when going live.
const CHAIN_ID = 84532;

export interface PaymentRequirements {
  scheme: "exact";
  network: string;
  asset: string;
  payTo: string;
  amount: string;
  maxTimeoutSeconds: number;
  extra: { name: string; version: string };
}

export interface Authorization {
  from: string;
  to: string;
  value: string;
  validAfter: string;
  validBefore: string;
  nonce: string;
}

export interface PaymentPayload {
  x402Version: number;
  accepted: PaymentRequirements;
  signature: Hex;
  authorization: Authorization;
}

function domain(req: PaymentRequirements) {
  return {
    name: req.extra.name,
    version: req.extra.version,
    chainId: CHAIN_ID,
    verifyingContract: req.asset as Address,
  } as const;
}

export function buildRequirements(o: { payTo: string; amount: string }): PaymentRequirements {
  return {
    scheme: "exact",
    network: config.x402Network,
    asset: config.usdc || DEFAULT_USDC,
    payTo: o.payTo,
    amount: o.amount,
    maxTimeoutSeconds: 120,
    extra: { name: "USDC", version: "2" },
  };
}

function randNonce(): Hex {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  let s = "0x";
  for (const b of bytes) s += b.toString(16).padStart(2, "0");
  return s as Hex;
}

export async function signAuthorization(acct: Account, req: PaymentRequirements): Promise<PaymentPayload> {
  const now = Math.floor(Date.now() / 1000);
  const authorization: Authorization = {
    from: acct.address,
    to: req.payTo,
    value: req.amount,
    validAfter: String(now - 5),
    validBefore: String(now + req.maxTimeoutSeconds),
    nonce: randNonce(),
  };
  if (!acct.signTypedData) throw new Error("account cannot sign typed data");
  const signature = await acct.signTypedData({
    domain: domain(req),
    types: EIP3009_TYPES,
    primaryType: "TransferWithAuthorization",
    message: {
      from: authorization.from as Address,
      to: authorization.to as Address,
      value: BigInt(authorization.value),
      validAfter: BigInt(authorization.validAfter),
      validBefore: BigInt(authorization.validBefore),
      nonce: authorization.nonce as Hex,
    },
  });
  return { x402Version: X402_VERSION, accepted: req, signature, authorization };
}

export interface VerifyResult {
  valid: boolean;
  reason?: string;
  payer?: string;
}

// Mirror of the facilitator verify. Recipient and amount must match the demand, the
// validity window must hold, the nonce must be unseen, and the EIP-712 signature must
// recover the payer address.
export async function verifyPayment(
  p: PaymentPayload,
  req: PaymentRequirements,
  opts: { seen?: Set<string>; now?: number },
): Promise<VerifyResult> {
  const a = p.authorization;
  const now = opts.now ?? Math.floor(Date.now() / 1000);

  if (a.to.toLowerCase() !== req.payTo.toLowerCase())
    return { valid: false, reason: "recipient mismatch", payer: a.from };
  try {
    if (BigInt(a.value) < BigInt(req.amount))
      return { valid: false, reason: "amount too low", payer: a.from };
  } catch {
    return { valid: false, reason: "bad amount", payer: a.from };
  }
  if (!(now >= Number(a.validAfter))) return { valid: false, reason: "not yet valid", payer: a.from };
  if (!(now < Number(a.validBefore))) return { valid: false, reason: "expired", payer: a.from };
  if (opts.seen?.has(a.nonce)) return { valid: false, reason: "nonce replay", payer: a.from };

  let ok = false;
  try {
    ok = await verifyTypedData({
      address: a.from as Address,
      domain: domain(req),
      types: EIP3009_TYPES,
      primaryType: "TransferWithAuthorization",
      message: {
        from: a.from as Address,
        to: a.to as Address,
        value: BigInt(a.value),
        validAfter: BigInt(a.validAfter),
        validBefore: BigInt(a.validBefore),
        nonce: a.nonce as Hex,
      },
      signature: p.signature,
    });
  } catch {
    return { valid: false, reason: "signature verification failed", payer: a.from };
  }
  if (!ok) return { valid: false, reason: "bad signature", payer: a.from };

  opts.seen?.add(a.nonce);
  return { valid: true, payer: a.from };
}

export function encodeHeader(p: PaymentPayload): string {
  return Buffer.from(JSON.stringify(p), "utf8").toString("base64");
}

export function decodeHeader(h: string): PaymentPayload {
  const p = JSON.parse(Buffer.from(h, "base64").toString("utf8")) as PaymentPayload;
  if (!p || !p.authorization || !p.signature) throw new Error("malformed x402 payment header");
  return p;
}
