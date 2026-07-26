import { config } from "../shared/config.js";

// The chains the audit engine can fetch verified source for. One Etherscan V2
// key covers all of them, so adding a chain is a change in the engine, not here.
export const AUDIT_CHAINS = ["base", "ethereum", "arbitrum", "optimism", "polygon", "bsc"] as const;
export const CONTRACT_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

export interface EngineJobResponse {
  job_id: string;
  state: string;
  target: { address?: string | null; chain?: string; contract_name?: string; compiler?: string };
}

export interface JobHandle {
  jobId: string;
  state: string;
  statusUrl: string;
  reportUrl: string;
  etaSeconds: number;
  target: { address: string | null; chain: string; contractName: string; compiler: string };
}

const trim = (s: string) => s.replace(/\/$/, "");

/** Map an engine status onto what the seller returns.
 *
 *  A 4xx stays a 4xx and a 5xx stays a 5xx, because the x402 middleware settles
 *  a payment only on a 2xx and the two failure kinds mean different things to a
 *  buyer. Anything unrecognized becomes a 503, never a 200, so a confused
 *  response can never take someone's money. */
export function mapEngineError(status: number, body: unknown): { status: number; body: { error: string } } {
  const detail =
    (body && typeof body === "object" && "detail" in body ? String((body as { detail: unknown }).detail) : "") ||
    "audit engine unavailable";
  if (status === 400 || status === 404 || status === 409 || status === 422) {
    return { status, body: { error: detail } };
  }
  return { status: 503, body: { error: status === 0 ? "audit engine unavailable" : detail } };
}

export function buildJobHandle(
  res: EngineJobResponse,
  opts: { apiBase: string; reportBase: string; etaSeconds: number },
): JobHandle {
  return {
    jobId: res.job_id,
    state: res.state,
    statusUrl: `${trim(opts.apiBase)}/audit/status?job=${res.job_id}`,
    reportUrl: `${trim(opts.reportBase)}/audit/${res.job_id}`,
    etaSeconds: opts.etaSeconds,
    target: {
      address: res.target?.address ?? null,
      chain: res.target?.chain ?? "base",
      contractName: res.target?.contract_name ?? "unknown",
      compiler: res.target?.compiler ?? "unknown",
    },
  };
}

async function call(path: string, init: RequestInit, timeoutMs: number) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(`${trim(config.aegisEngineUrl)}${path}`, { ...init, signal: ctrl.signal });
    const json = await r.json().catch(() => null);
    return { status: r.status, json };
  } catch {
    // A transport failure is reported as status 0, which mapEngineError turns
    // into a 503, so the buyer is never charged for an engine we cannot reach.
    return { status: 0, json: null };
  } finally {
    clearTimeout(t);
  }
}

const post = (path: string, body: unknown, timeoutMs = 120_000) =>
  call(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }, timeoutMs);

export const createAuditJob = (input: { address?: string; chain?: string; source?: string }) =>
  post("/audit/jobs", input);

export const runScan = (input: { address?: string; chain?: string; source?: string }) =>
  post("/scan", input);

export const retryAuditJob = (jobId: string) => post(`/audit/jobs/${jobId}/retry`, {});

export const getAuditJob = (jobId: string) => call(`/audit/jobs/${jobId}`, { method: "GET" }, 15_000);
