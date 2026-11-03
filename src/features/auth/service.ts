import "server-only";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { dummyHash, verifyPassword } from "@/lib/auth/password";
import { createSession, tokenDigest } from "@/lib/auth/session";

export const loginSchema = z
  .object({
    email: z
      .email("Email tidak valid.")
      .max(254)
      .transform((v) => v.toLowerCase().trim()),
    password: z.string().min(1, "Password wajib diisi.").max(128),
  })
  .strict();
export async function login(input: unknown) {
  const data = loginSchema.parse(input);
  const db = getDb();
  // Limit berbasis akun di database: konsisten lintas instance dan tidak mempercayai X-Forwarded-For.
  const window = Math.floor(Date.now() / 900_000);
  const key = tokenDigest(`login:${data.email}:${window}`);
  const bucket = await db.loginThrottle.upsert({
    where: { key },
    create: { key, attempts: 1, expiresAt: new Date((window + 1) * 900_000) },
    update: { attempts: { increment: 1 } },
  });
  if (bucket.attempts > 8)
    throw new AppError(
      "Terlalu banyak percobaan. Tunggu 15 menit lalu coba lagi.",
      429,
    );
  const user = await db.adminUser.findUnique({ where: { email: data.email } });
  const correct = await verifyPassword(
    data.password,
    user?.passwordHash ?? dummyHash,
  );
  if (!user || !correct || user.disabledAt)
    throw new AppError("Email atau password tidak sesuai.", 401);
  await db.session.deleteMany({ where: { expiresAt: { lte: new Date() } } });
  await db.loginThrottle.deleteMany({
    where: { expiresAt: { lte: new Date() } },
  });
  await createSession(user.id);
}
