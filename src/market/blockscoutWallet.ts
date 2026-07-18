import type { WalletRaw } from "../shared/types.js";

// Wallet intelligence source for the /whale endpoint. Blockscout v2 is open with no
// key and reachable from the VPS (unlike Binance/Bybit, see derivsSource). One host
// per supported chain; native coin is 18 decimals on both.
export const WALLET_CHAINS: Record<string, string> = {
  base: "https://base.blockscout.com",
  ethereum: "https://eth.blockscout.com",
};

export const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

const num = (x: unknown): number | null => {
  const n = typeof x === "string" ? parseFloat(x) : typeof x === "number" ? x : NaN;
  return Number.isFinite(n) ? n : null;
};

interface TokenInfo {
  decimals?: unknown;
  exchange_rate?: unknown;
  symbol?: unknown;
  reputation?: unknown;
}

export interface WalletParts {
  info: { coin_balance?: unknown; exchange_rate?: unknown; is_contract?: unknown };
  counters?: { transactions_count?: unknown; token_transfers_count?: unknown };
  tokenBalances?: { token?: TokenInfo; value?: unknown }[];
  tokenTransfers?: {
    timestamp?: unknown;
    from?: { hash?: unknown; is_contract?: unknown };
    to?: { hash?: unknown; is_contract?: unknown };
    total?: { decimals?: unknown; value?: unknown };
    token?: TokenInfo;
  }[];
}

function tokenUsd(value: unknown, token: TokenInfo | undefined): number | null {
  const rate = num(token?.exchange_rate);
  const raw = num(value);
  const dec = num(token?.decimals) ?? 18;
  if (rate === null || raw === null) return null;
  return (raw / 10 ** dec) * rate;
}

// Pure normalizer: raw Blockscout JSON pieces -> WalletRaw.
export function parseWalletRaw(address: string, chain: string, p: WalletParts, ts: number): WalletRaw {
  const addr = address.toLowerCase();
  const nativeBalance = (num(p.info?.coin_balance) ?? 0) / 1e18;
  const nativeRate = num(p.info?.exchange_rate);

  const holdings = (p.tokenBalances ?? [])
    .filter((b) => b.token?.reputation === "ok")
    .map((b) => ({ symbol: String(b.token?.symbol ?? "?"), usd: tokenUsd(b.value, b.token) }))
    .filter((h): h is { symbol: string; usd: number } => h.usd !== null && h.usd >= 1)
    .sort((a, b) => b.usd - a.usd);

  const recentTransfers = (p.tokenTransfers ?? [])
    .map((t) => {
      const when = typeof t.timestamp === "string" ? Date.parse(t.timestamp) : NaN;
      if (!Number.isFinite(when)) return null;
      const toMe = String(t.to?.hash ?? "").toLowerCase() === addr;
      const other = toMe ? t.from : t.to;
      return {
        ts: Math.floor(when / 1000),
        direction: (toMe ? "in" : "out") as "in" | "out",
        usd: tokenUsd(t.total?.value, { ...t.token, decimals: t.total?.decimals ?? t.token?.decimals }),
        symbol: String(t.token?.symbol ?? "?"),
        counterpartyContract: other?.is_contract === true,
      };
    })
    .filter((t): t is NonNullable<typeof t> => t !== null);

  return {
    address: addr,
    chain,
    isContract: p.info?.is_contract === true,
    nativeBalance,
    nativeUsd: nativeRate !== null ? nativeBalance * nativeRate : null,
    txCount: p.counters ? num(p.counters.transactions_count) : null,
    tokenTransfersCount: p.counters ? num(p.counters.token_transfers_count) : null,
    holdings,
    recentTransfers,
    ts,
  };
}

async function getJson(url: string): Promise<any> {
  const res = await fetch(url, { signal: AbortSignal.timeout(9000) });
  if (!res.ok) throw new Error(`blockscout ${res.status} ${url}`);
  return res.json();
}
async function tryJson(url: string): Promise<any | undefined> {
  try {
    return await getJson(url);
  } catch {
    return undefined; // optional metric — degrade gracefully
  }
}

// Adapter: fetch all pieces for an address and normalize. The address info is core
// (throws on failure); counters, balances and transfers degrade to null/empty.
export async function fetchWalletRaw(address: string, chain: string, ts: number): Promise<WalletRaw> {
  const host = WALLET_CHAINS[chain];
  if (!host) throw new Error(`unsupported chain ${chain}`);
  const base = `${host}/api/v2/addresses/${address}`;
  const info = await getJson(base);
  const [counters, tokenBalances, transfers] = await Promise.all([
    tryJson(`${base}/counters`),
    tryJson(`${base}/token-balances`),
    tryJson(`${base}/token-transfers?type=ERC-20`),
  ]);
  return parseWalletRaw(
    address,
    chain,
    {
      info,
      counters,
      tokenBalances: Array.isArray(tokenBalances) ? tokenBalances : tokenBalances?.items,
      tokenTransfers: transfers?.items,
    },
    ts,
  );
}
