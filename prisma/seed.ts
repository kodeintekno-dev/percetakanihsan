import "../scripts/load-env";
import { createDatabaseClient } from "../src/lib/db-client";
import { databaseTarget, ConfigurationError } from "../src/lib/env";
import { serializable } from "../src/lib/transaction";
import { nameKey } from "../src/features/categories/schema";

export async function seedExamples(
  db: ReturnType<typeof createDatabaseClient>,
) {
  return serializable(db, async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(3471262)`;
    if (await tx.seedRun.findUnique({ where: { key: "examples-v1" } }))
      return false;
    const roots = ["Banner", "Kartu Nama", "Brosur", "Buku/Undangan"];
    for (const name of roots) {
      let parent = await tx.productCategory.findFirst({
        where: { parentId: null, nameKey: nameKey(name) },
      });
      parent ??= await tx.productCategory.create({
        data: { name, nameKey: nameKey(name) },
      });
      if (name === "Banner" && parent.isActive) {
        for (const child of [
          "Banner Outdoor",
          "Banner Indoor",
          "X-Banner",
          "Roll Up Banner",
        ]) {
          await tx.productCategory.upsert({
            where: {
              parentId_nameKey: {
                parentId: parent.id,
                nameKey: nameKey(child),
              },
            },
            create: {
              name: child,
              nameKey: nameKey(child),
              parentId: parent.id,
            },
            update: {},
          });
        }
      }
    }
    const posts = {
      PRODUCTION: [
        "Kertas",
        "Tinta",
        "Bahan Banner",
        "Plat Cetak",
        "Jasa Makloon",
      ],
      OPERATIONAL: [
        "Listrik",
        "Air",
        "Internet",
        "Gaji/Upah",
        "Perawatan Mesin",
        "Transportasi/Kurir",
        "Sewa Tempat",
        "Konsumsi",
      ],
      MARKETING: ["Iklan", "Promosi", "Cetak Sampel", "Komisi Sales"],
    } as const;
    for (const group of Object.keys(posts) as (keyof typeof posts)[]) {
      for (const name of posts[group])
        await tx.expensePost.upsert({
          where: { nameKey: nameKey(name) },
          create: { name, nameKey: nameKey(name), group },
          update: {},
        });
    }
    await tx.seedRun.create({ data: { key: "examples-v1" } });
    return true;
  });
}

// Import dari integration tests tidak menjalankan CLI/seed otomatis.
if (process.argv[1]?.replaceAll("\\", "/").endsWith("prisma/seed.ts")) {
  let db: ReturnType<typeof createDatabaseClient> | undefined;
  Promise.resolve()
    .then(async () => {
      databaseTarget();
      db = createDatabaseClient();
      console.log(
        (await seedExamples(db))
          ? "Master contoh ditambahkan. Tidak ada pesanan, kas, budget, atau saldo dummy."
          : "Seed contoh sudah diterapkan; perubahan/hapus milik pengguna dipertahankan.",
      );
    })
    .catch((error) => {
      console.error(
        error instanceof ConfigurationError
          ? error.message
          : "Seed gagal. Periksa konfigurasi database dan migration.",
      );
      process.exitCode = 1;
    })
    .finally(async () => {
      await db?.$disconnect();
    });
}
