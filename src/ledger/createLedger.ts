import { config } from "../shared/config.js";
import { FileLedger } from "./fileLedger.js";
import type { Ledger } from "./ledger.js";

// Pick the store. MongoDB Atlas when a URI is configured, the local file ledger
// otherwise. A failed Atlas connection degrades to the file ledger so the agent keeps
// running rather than dying on an infra hiccup.
export async function createLedger(): Promise<Ledger> {
  if (config.mongoUri) {
    try {
      const { MongoLedger } = await import("./mongoLedger.js");
      const led = await new MongoLedger().init();
      console.log("ledger, MongoDB Atlas connected");
      return led;
    } catch (e) {
      console.warn("mongo unavailable, using file ledger:", (e as Error).message);
    }
  }
  console.log("ledger, local JSON file");
  return new FileLedger();
}
