import type { WalletRaw } from "../shared/types.js";
import { fetchChainBalances, type OnchainBalances } from "./chainBalances.js";

// Wallet intelligence source for the /whale endpoint. Blockscout v2 is open with no
// key and reachable from the VPS (unlike Binance/Bybit, see derivsSource). One host
// per supported chain; native coin is 18 decimals on both.
//
// Blockscout is the discovery and pricing source only. Its cached balances lag by days,
// so the numbers a buyer pays for come from the chain, see chainBalances.
export const WALLET_CHAINS: Record<string, string> = {
  base: "https://base.blockscout.com",
  ethereum: "https://eth.blockscout.com",
};

export const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

// Below this a holding is airdrop noise, not wallet size. Kept low because the
// reputation filter and the chain read already do the heavy lifting.
const MIN_HOLDING_USD = 0.1;

const num = (x: unknown): number | null => {
  const n = typeof x === "string" ? parseFloat(x) : typeof x === "number" ? x : NaN;
  return Number.isFinite(n) ? n : null;
};

interface TokenInfo {
  address_hash?: unknown;
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

// Every ERC-20 the indexer has seen for this address, whether it reported a current
// balance or only a transfer. The cached balances go stale, the transfer feed does not,
// so the union is the candidate set the chain gets asked about.
//
// Order is the priority order for the chain read, which is capped. Recently transferred
// tokens come first because those are exactly the ones whose cached balance is most
// likely wrong; the balance list follows, and Blockscout returns it largest first.
export function tokenCatalog(p: WalletParts): Map<string, TokenInfo> {
  const out = new Map<string, TokenInfo>();
  const add = (t?: TokenInfo) => {
    const addr = String(t?.address_hash ?? "").toLowerCase();
    if (!t || !ADDRESS_RE.test(addr) || out.has(addr)) return;
    out.set(addr, t);
  };
  for (const t of p.tokenTransfers ?? []) add(t.token);
  for (const b of p.tokenBalances ?? []) add(b.token);
  return out;
}

// Scam and unpriced tokens are excluded either way so a dust airdrop cannot inflate the
// wallet size. The only difference is where the balance came from.
const priced = (rows: { symbol: string; usd: number | null }[]) =>
  rows
    .filter((h): h is { symbol: string; usd: number } => h.usd !== null && h.usd >= MIN_HOLDING_USD)
    .sort((a, b) => b.usd - a.usd);

function holdingsFromChain(catalog: Map<string, TokenInfo>, onchain: OnchainBalances) {
  return priced(
    [...catalog]
      .filter(([, token]) => token.reputation === "ok")
      .map(([addr, token]) => ({
        symbol: String(token.symbol ?? "?"),
        usd: tokenUsd((onchain.tokens.get(addr) ?? 0n).toString(), token),
      })),
  );
}

function holdingsFromIndexer(p: WalletParts) {
  return priced(
    (p.tokenBalances ?? [])
      .filter((b) => b.token?.reputation === "ok")
      .map((b) => ({ symbol: String(b.token?.symbol ?? "?"), usd: tokenUsd(b.value, b.token) })),
  );
}

// Pure normalizer: raw Blockscout JSON pieces -> WalletRaw. Pass onchain to price the
// holdings off real balances; without it the indexer's cached ones ship, labelled.
export function parseWalletRaw(
  address: string,
  chain: string,
  p: WalletParts,
  ts: number,
  onchain?: OnchainBalances,
): WalletRaw {
  const addr = address.toLowerCase();
  const nativeBalance = onchain ? Number(onchain.nativeWei) / 1e18 : (num(p.info?.coin_balance) ?? 0) / 1e18;
  const nativeRate = num(p.info?.exchange_rate);

  const holdings = onchain ? holdingsFromChain(tokenCatalog(p), onchain) : holdingsFromIndexer(p);

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
    balanceSource: onchain ? "chain" : "indexer",
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

// Adapter: fetch all pieces for an address, verify the balances against the chain, and
// normalize. The address info is core (throws on failure); counters, balances, transfers
// and the chain read degrade to null/empty/indexer numbers.
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
  const parts: WalletParts = {
    info,
    counters,
    tokenBalances: Array.isArray(tokenBalances) ? tokenBalances : tokenBalances?.items,
    tokenTransfers: transfers?.items,
  };
  const onchain = await fetchChainBalances(chain, address, [...tokenCatalog(parts).keys()]);
  return parseWalletRaw(address, chain, parts, ts, onchain ?? undefined);
}
