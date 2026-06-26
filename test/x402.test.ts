import { describe, it, expect } from "vitest";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { buildRequirements, signAuthorization, verifyPayment } from "../src/x402/scheme.js";

const PAY_TO = "0x000000000000000000000000000000000000dEaD";

describe("x402 EIP-3009", () => {
  it("a signed authorization verifies", async () => {
    const acct = privateKeyToAccount(generatePrivateKey());
    const req = buildRequirements({ payTo: PAY_TO, amount: "10000" });
    const auth = await signAuthorization(acct, req);
    const r = await verifyPayment(auth, req, { seen: new Set() });
    expect(r.valid).toBe(true);
    expect(r.payer?.toLowerCase()).toBe(acct.address.toLowerCase());
  });

  it("a tampered amount is rejected", async () => {
    const acct = privateKeyToAccount(generatePrivateKey());
    const req = buildRequirements({ payTo: PAY_TO, amount: "10000" });
    const auth = await signAuthorization(acct, req);
    auth.authorization.value = "1"; // pay less than demanded
    const r = await verifyPayment(auth, req, { seen: new Set() });
    expect(r.valid).toBe(false);
  });

  it("a replayed nonce is rejected", async () => {
    const acct = privateKeyToAccount(generatePrivateKey());
    const req = buildRequirements({ payTo: PAY_TO, amount: "10000" });
    const auth = await signAuthorization(acct, req);
    const seen = new Set<string>();
    expect((await verifyPayment(auth, req, { seen })).valid).toBe(true);
    expect((await verifyPayment(auth, req, { seen })).valid).toBe(false); // nonce already used
  });
});
