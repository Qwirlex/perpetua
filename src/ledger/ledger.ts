import type { LedgerEntry } from "../shared/types.js";

// The ledger records every move of value, research spends and signal sales, plus the
// seed. Two implementations, MongoDB Atlas for the sponsor integration and a local
// JSON file fallback, behind one interface.
export interface Ledger {
  record(entry: LedgerEntry): Promise<void>;
  history(limit?: number): Promise<LedgerEntry[]>;
  close(): Promise<void>;
}
