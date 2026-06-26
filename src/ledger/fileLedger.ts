import { readFile, writeFile } from "node:fs/promises";
import type { Ledger } from "./ledger.js";
import type { LedgerEntry } from "../shared/types.js";

// The fallback ledger, an append only JSON file. Simple and durable, used when no
// MongoDB URI is configured.
export class FileLedger implements Ledger {
  constructor(private path = "perpetua-ledger.local.json") {}

  private async read(): Promise<LedgerEntry[]> {
    try {
      return JSON.parse(await readFile(this.path, "utf8")) as LedgerEntry[];
    } catch {
      return [];
    }
  }

  async record(e: LedgerEntry): Promise<void> {
    const all = await this.read();
    all.push(e);
    await writeFile(this.path, JSON.stringify(all, null, 2));
  }

  async history(limit = 500): Promise<LedgerEntry[]> {
    const all = await this.read();
    return all.slice(-limit);
  }

  async close(): Promise<void> {}
}
