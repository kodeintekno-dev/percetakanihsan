import "server-only";
import { createDatabaseClient } from "./db-client";

const globalDb = globalThis as unknown as {
  ihsanDb?: ReturnType<typeof createDatabaseClient>;
};
export function getDb() {
  globalDb.ihsanDb ??= createDatabaseClient();
  return globalDb.ihsanDb;
}
