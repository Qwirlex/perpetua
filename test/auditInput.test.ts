import { describe, expect, it } from "vitest";
import { validateAuditInput } from "../src/seller/auditInput.js";

const ADDR = "0x" + "a".repeat(40);

describe("audit input validation", () => {
  it("accepts a valid address and chain", () => {
    expect(validateAuditInput({ address: ADDR, chain: "polygon" })).toEqual({
      ok: true,
      input: { address: ADDR, chain: "polygon" },
    });
  });

  it("defaults the chain to base", () => {
    const out = validateAuditInput({ address: ADDR });
    expect(out.ok && out.input.chain).toBe("base");
  });

  it("accepts a chain whatever its case or padding", () => {
    const out = validateAuditInput({ address: ADDR, chain: " Polygon " });
    expect(out.ok && out.input.chain).toBe("polygon");
  });

  it("rejects a malformed address before any engine call", () => {
    expect(validateAuditInput({ address: "0xnope" })).toEqual({
      ok: false,
      status: 400,
      error: "address must be a 0x-prefixed 40-hex contract address",
    });
  });

  it("rejects an unsupported chain and names the supported ones", () => {
    const out = validateAuditInput({ address: ADDR, chain: "solana" });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.status).toBe(400);
      expect(out.error).toContain("base");
    }
  });

  it("accepts raw source with no address", () => {
    const source = "contract A { function ping() external {} }";
    const out = validateAuditInput({ source });
    expect(out.ok && out.input.source).toBe(source);
  });

  it("rejects a request with neither an address nor source", () => {
    expect(validateAuditInput({})).toEqual({
      ok: false,
      status: 400,
      error: "pass an address with an optional chain, or a source body",
    });
  });

  it("rejects source that is too small to be a contract", () => {
    const out = validateAuditInput({ source: "hi" });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.status).toBe(400);
  });

  it("every rejection is a 4xx, so nothing can settle a payment", () => {
    const bad = [{}, { address: "0xnope" }, { address: ADDR, chain: "solana" }, { source: "hi" }];
    for (const q of bad) {
      const out = validateAuditInput(q);
      expect(out.ok).toBe(false);
      if (!out.ok) expect(out.status).toBeGreaterThanOrEqual(400);
      if (!out.ok) expect(out.status).toBeLessThan(500);
    }
  });
});
