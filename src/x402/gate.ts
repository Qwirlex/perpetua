import type { Request, Response, NextFunction, RequestHandler } from "express";
import {
  buildRequirements,
  decodeHeader,
  verifyPayment,
  X402_VERSION,
  type PaymentPayload,
} from "./scheme.js";

// Express middleware that enforces an x402 payment on a route. No X-PAYMENT header
// gives a 402 with the payment requirements. A present header is verified, and on
// success the request proceeds and an X-PAYMENT-RESPONSE settlement receipt is set.
export function x402Gate(opts: { payTo: string; amount: string; resource?: string }): RequestHandler {
  const seen = new Set<string>();
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const requirements = buildRequirements({ payTo: opts.payTo, amount: opts.amount });
    const challenge = (reason: string) => {
      res.status(402).json({
        x402Version: X402_VERSION,
        error: reason,
        resource: opts.resource ?? req.path,
        accepts: [requirements],
      });
    };

    const header = req.header("x-payment");
    if (!header) {
      challenge("payment required");
      return;
    }

    let payload: PaymentPayload;
    try {
      payload = decodeHeader(header);
    } catch {
      challenge("malformed x-payment header");
      return;
    }

    const result = await verifyPayment(payload, requirements, { seen });
    if (!result.valid) {
      challenge(result.reason ?? "payment invalid");
      return;
    }

    const settlement = req.header("x-settlement") ?? "";
    const receipt = {
      success: true,
      payer: result.payer,
      transaction: settlement,
      network: requirements.network,
      amount: requirements.amount,
      asset: requirements.asset,
    };
    res.setHeader("x-payment-response", Buffer.from(JSON.stringify(receipt), "utf8").toString("base64"));

    (req as Request & { x402?: unknown }).x402 = {
      payer: result.payer,
      settlement,
      value: payload.authorization.value,
    };
    next();
  };
}
