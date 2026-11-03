import "server-only";
import { createHmac, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { authSecret } from "@/lib/env";
import { AppError } from "@/lib/errors";

export const SESSION_SECONDS = 8 * 60 * 60;
export const cookieName = () =>
  process.env.NODE_ENV === "production"
    ? "__Host-ihsan_session"
    : "ihsan_session";
export const tokenDigest = (token: string) =>
  createHmac("sha256", authSecret()).update(token).digest("hex");
export const validToken = (token?: string) =>
  typeof token === "string" && /^[a-zA-Z0-9_-]{43}$/.test(token);
export const cookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: SESSION_SECONDS,
});

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_SECONDS * 1000);
  await getDb().session.create({
    data: { userId, tokenHash: tokenDigest(token), expiresAt },
  });
  (await cookies()).set(cookieName(), token, {
    ...cookieOptions(),
    expires: expiresAt,
  });
}

export async function currentAdmin() {
  const token = (await cookies()).get(cookieName())?.value;
  if (!validToken(token)) return null;
  const session = await getDb().session.findUnique({
    where: { tokenHash: tokenDigest(token!) },
    include: { user: { select: { id: true, email: true, disabledAt: true } } },
  });
  if (!session || session.expiresAt <= new Date() || session.user.disabledAt)
    return null;
  return { id: session.user.id, email: session.user.email };
}

export async function requireAdmin() {
  const user = await currentAdmin();
  if (!user) throw new AppError("Silakan masuk untuk melanjutkan.", 401);
  return user;
}

export async function requirePageAdmin() {
  const user = await currentAdmin();
  if (!user) redirect("/login");
  return user;
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(cookieName())?.value;
  if (validToken(token))
    await getDb().session.deleteMany({
      where: { tokenHash: tokenDigest(token!) },
    });
  jar.set(cookieName(), "", { ...cookieOptions(), maxAge: 0 });
}
