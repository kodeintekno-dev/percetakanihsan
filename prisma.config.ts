import { config } from "dotenv";
import { defineConfig } from "prisma/config";
config({ path: ".env.local", quiet: true });
config({ quiet: true });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations", seed: "tsx prisma/seed.ts" },
  // Engine diff Prisma 7.10 memerlukan datasource walau offline. Port 1 adalah sentinel,
  // bukan DB aplikasi; wrapper deploy selalu mewajibkan DIRECT_URL yang valid.
  datasource: {
    url:
      process.env.DIRECT_URL ?? "postgresql://unused:unused@127.0.0.1:1/unused",
  },
});
