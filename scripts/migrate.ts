import "./load-env";
import { spawnSync } from "node:child_process";
import { databaseTarget, ConfigurationError } from "../src/lib/env";
try {
  const target = databaseTarget();
  console.log(`Menerapkan migration versioned ke target ${target}.`);
  const result = spawnSync(
    process.execPath,
    ["node_modules/prisma/build/index.js", "migrate", "deploy"],
    { stdio: "pipe", env: process.env, encoding: "utf8" },
  );
  // Prisma dapat menyebut host/database pada output. Hanya tampilkan status aman.
  if (result.status !== 0) {
    console.error(
      "Migrasi gagal. Periksa DIRECT_URL, akses jaringan, dan status migrasi pada database target. Detail tidak dicetak demi menjaga kredensial.",
    );
    process.exitCode = 1;
  } else console.log("Migration berhasil diterapkan.");
} catch (error) {
  console.error(
    error instanceof ConfigurationError
      ? error.message
      : "Migrasi gagal; konfigurasi tidak valid.",
  );
  process.exitCode = 1;
}
