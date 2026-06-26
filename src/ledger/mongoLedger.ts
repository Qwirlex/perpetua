import { MongoClient } from "mongodb";
import { config } from "../shared/config.js";
import type { Ledger } from "./ledger.js";
import type { LedgerEntry } from "../shared/types.js";

// MongoDB Atlas ledger, the sponsor integration. Stores every entry so the agent has a
// durable memory of its own economy across restarts.
export class MongoLedger implements Ledger {
  private client: MongoClient;

  constructor() {
    this.client = new MongoClient(config.mongoUri);
  }

  async init(): Promise<MongoLedger> {
    await this.client.connect();
    await this.col().createIndex({ ts: 1 });
    return this;
  }

  private col() {
    return this.client.db(config.mongoDb).collection<LedgerEntry>("ledger");
  }

  async record(e: LedgerEntry): Promise<void> {
    await this.col().insertOne(e);
  }

  async history(limit = 500): Promise<LedgerEntry[]> {
    const rows = await this.col().find({}, { projection: { _id: 0 } }).sort({ ts: 1 }).limit(limit).toArray();
    return rows as LedgerEntry[];
  }

  async close(): Promise<void> {
    await this.client.close();
  }
}
