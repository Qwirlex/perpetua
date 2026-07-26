import { describe, expect, it } from "vitest";
import { buildJobHandle, mapEngineError } from "../src/market/aegisEngine.js";

describe("engine error mapping", () => {
  it("passes a client error through with its status and message", () => {
    expect(mapEngineError(400, { detail: "chain not supported, use one of base" })).toEqual({
      status: 400,
      body: { error: "chain not supported, use one of base" },
    });
  });

  it("keeps 422 so the buyer is never charged for an unanalysable target", () => {
    expect(mapEngineError(422, { detail: "no verified source" }).status).toBe(422);
  });

  it("keeps 409 so a spent retry is not reported as an outage", () => {
    expect(mapEngineError(409, { detail: "no retry left for this job" }).status).toBe(409);
  });

  it("keeps an engine 503 as a 503 and carries its reason", () => {
    expect(mapEngineError(503, { detail: "could not reach the block explorer" })).toEqual({
      status: 503,
      body: { error: "could not reach the block explorer" },
    });
  });

  it("turns an unreachable engine into a 503 with a plain message", () => {
    expect(mapEngineError(0, null)).toEqual({
      status: 503,
      body: { error: "audit engine unavailable" },
    });
  });

  it("never turns an unexpected status into a success", () => {
    for (const status of [200, 301, 418, 500]) {
      expect(mapEngineError(status, { detail: "odd" }).status).toBe(503);
    }
  });
});

describe("job handle", () => {
  const res = {
    job_id: "a3f19c2b7d84",
    state: "running",
    target: { address: "0xabc", chain: "base", contract_name: "Vault", compiler: "0.8.25" },
  };

  it("builds the public urls from the job id", () => {
    const h = buildJobHandle(res, {
      apiBase: "https://api.tradeperpetua.xyz",
      reportBase: "https://aegiscan.xyz",
      etaSeconds: 180,
    });
    expect(h.jobId).toBe("a3f19c2b7d84");
    expect(h.statusUrl).toBe("https://api.tradeperpetua.xyz/audit/status?job=a3f19c2b7d84");
    expect(h.reportUrl).toBe("https://aegiscan.xyz/audit/a3f19c2b7d84");
    expect(h.etaSeconds).toBe(180);
    expect(h.target.contractName).toBe("Vault");
  });

  it("strips a trailing slash from either base url", () => {
    const h = buildJobHandle(
      { job_id: "abc123abc123", state: "running", target: {} },
      { apiBase: "https://api.x.xyz/", reportBase: "https://aegiscan.xyz/", etaSeconds: 60 },
    );
    expect(h.statusUrl).toBe("https://api.x.xyz/audit/status?job=abc123abc123");
    expect(h.reportUrl).toBe("https://aegiscan.xyz/audit/abc123abc123");
  });

  it("fills plain defaults when the engine sent a sparse target", () => {
    const h = buildJobHandle(
      { job_id: "abc123abc123", state: "running", target: {} },
      { apiBase: "https://a", reportBase: "https://b", etaSeconds: 1 },
    );
    expect(h.target).toEqual({
      address: null,
      chain: "base",
      contractName: "unknown",
      compiler: "unknown",
    });
  });
});
