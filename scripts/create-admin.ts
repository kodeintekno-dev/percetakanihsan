import "./load-env";
import { createDatabaseClient } from "../src/lib/db-client";
import {
  bootstrapCredentials,
  databaseTarget,
  authSecret,
  appOrigin,
  ConfigurationError,
} from "../src/lib/env";
import { hashPassword } from "../src/lib/auth/password";
import { serializable } from "../src/lib/transaction";

async function main() {
  databaseTarget();
  authSecret();
  appOrigin();
  const { email, password } = bootstrapCredentials();
  const db = createDatabaseClient();
  try {
    const passwordHash = await hashPassword(password);
    const created = await serializable(db, async (tx) => {
      // Semua bootstrap memakai lock yang sama; tak ada perubahan password saat dijalankan ulang.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(3471261)`;
      if (await tx.adminUser.count()) return false;
      await tx.adminUser.create({ data: { email, passwordHash } });
      return true;
    });
    console.log(
      created
        ? "Admin pertama berhasil dibuat."
        : "Admin sudah tersedia. Akun dan password tidak diubah.",
    );
  } finally {
    await db.$disconnect();
  }
}
main().catch((error) => {
  console.error(
    error instanceof ConfigurationError
      ? error.message
      : "Bootstrap gagal. Periksa koneksi database dan migration; rahasia tidak dicetak.",
  );
  process.exitCode = 1;
});
