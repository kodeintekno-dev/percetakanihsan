import { z } from "zod";

export class ConfigurationError extends Error {}

type Environment = Record<string, string | undefined>;
function required(name: string, env: Environment) {
  const value = env[name]?.trim();
  if (!value) throw new ConfigurationError(`${name} wajib diisi.`);
  return value;
}

export function databaseUrl(
  name = "DATABASE_URL",
  env: Environment = process.env,
) {
  const value = required(name, env);
  try {
    const url = new URL(value);
    if (
      !["postgres:", "postgresql:"].includes(url.protocol) ||
      !url.hostname ||
      url.pathname.length < 2
    )
      throw new Error();
    return value;
  } catch {
    throw new ConfigurationError(
      `${name} harus berupa URL PostgreSQL yang valid.`,
    );
  }
}

export function authSecret(env: Environment = process.env) {
  const secret = required("AUTH_SECRET", env);
  if (secret.length < 32)
    throw new ConfigurationError("AUTH_SECRET harus minimal 32 karakter acak.");
  return secret;
}

export function appOrigin(env: Environment = process.env) {
  try {
    const url = new URL(required("APP_ORIGIN", env));
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.pathname !== "/" ||
      url.search ||
      url.hash ||
      url.username ||
      url.password
    )
      throw new Error();
    if (
      env.NODE_ENV === "production" &&
      url.protocol !== "https:" &&
      !["localhost", "127.0.0.1"].includes(url.hostname)
    )
      throw new Error();
    return url.origin;
  } catch {
    throw new ConfigurationError(
      "APP_ORIGIN harus origin HTTP/HTTPS tanpa path; deployment production wajib HTTPS.",
    );
  }
}

export function databaseTarget(env: Environment = process.env) {
  const target = required("DB_TARGET", env);
  if (!["development", "production"].includes(target))
    throw new ConfigurationError(
      "DB_TARGET harus development atau production.",
    );
  const pooled = new URL(databaseUrl("DATABASE_URL", env));
  const direct = new URL(databaseUrl("DIRECT_URL", env));
  if (direct.hostname.includes("-pooler"))
    throw new ConfigurationError(
      "DIRECT_URL harus menggunakan host direct, bukan pooler.",
    );
  if (
    pooled.hostname.replace("-pooler", "") !== direct.hostname ||
    pooled.pathname !== direct.pathname ||
    pooled.username !== direct.username
  ) {
    throw new ConfigurationError(
      "DATABASE_URL dan DIRECT_URL harus mengarah ke database/branch dan pengguna yang sama.",
    );
  }
  if (
    target === "production" &&
    (!pooled.hostname.endsWith(".neon.tech") ||
      !pooled.hostname.includes("-pooler") ||
      !["require", "verify-full"].includes(
        pooled.searchParams.get("sslmode") ?? "",
      ) ||
      !["require", "verify-full"].includes(
        direct.searchParams.get("sslmode") ?? "",
      ))
  ) {
    throw new ConfigurationError(
      "Production membutuhkan host Neon pooled/direct dengan SSL aktif.",
    );
  }
  return target;
}

export function bootstrapCredentials(env: Environment = process.env) {
  const email = z
    .email()
    .safeParse(required("SEED_ADMIN_EMAIL", env).toLowerCase());
  if (!email.success)
    throw new ConfigurationError("SEED_ADMIN_EMAIL harus email yang valid.");
  const password = env.SEED_ADMIN_PASSWORD ?? "";
  if (
    password.length < 12 ||
    password.length > 128 ||
    !/[a-z]/.test(password) ||
    !/[A-Z]/.test(password) ||
    !/\d/.test(password) ||
    !/[^a-zA-Z0-9]/.test(password)
  ) {
    throw new ConfigurationError(
      "SEED_ADMIN_PASSWORD perlu 12–128 karakter, huruf besar/kecil, angka, dan simbol.",
    );
  }
  return { email: email.data, password };
}
