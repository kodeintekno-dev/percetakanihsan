import { describe, it, expect } from "vitest";
import {
  categorySchema,
  assertCategoryParent,
  cascadingOptions,
  nameKey,
} from "@/features/categories/schema";
import { expenseSchema } from "@/features/expenses/schema";
import {
  databaseTarget,
  bootstrapCredentials,
  authSecret,
  appOrigin,
} from "@/lib/env";

describe("CAT-02/03 dan SEC-02: validasi master", () => {
  it("menormalisasi nama dan menolak nama kosong/terlalu panjang", () => {
    expect(
      categorySchema.parse({ name: " Banner   Outdoor ", parentId: null }).name,
    ).toBe("Banner Outdoor");
    expect(nameKey(" BANNER   Outdoor ")).toBe("banner outdoor");
    for (const name of [" ", "a".repeat(101)])
      expect(categorySchema.safeParse({ name, parentId: null }).success).toBe(
        false,
      );
  });
  it("menolak self-parent, level tiga, parent asing, parent arsip, dan root bersubkategori menjadi child", () => {
    const root = { id: "root", parentId: null, isActive: true };
    expect(() => assertCategoryParent("root", root, false, "root")).toThrow();
    expect(() =>
      assertCategoryParent(
        "new",
        { ...root, parentId: "other" },
        false,
        "root",
      ),
    ).toThrow();
    expect(() => assertCategoryParent("new", null, false, "missing")).toThrow();
    expect(() =>
      assertCategoryParent("new", { ...root, isActive: false }, false, "root"),
    ).toThrow();
    expect(() => assertCategoryParent("new", root, true, "root")).toThrow();
    expect(() =>
      assertCategoryParent("new", root, false, "root"),
    ).not.toThrow();
  });
  it("cascading hanya anak aktif milik induk utama aktif", () => {
    const rows = [
      { id: "a", name: "A", parentId: null, isActive: true, usage: 0 },
      { id: "b", name: "B", parentId: null, isActive: false, usage: 0 },
      { id: "a1", name: "A1", parentId: "a", isActive: true, usage: 0 },
      { id: "a2", name: "A2", parentId: "a", isActive: false, usage: 0 },
      { id: "b1", name: "B1", parentId: "b", isActive: true, usage: 0 },
    ];
    expect(cascadingOptions(rows, "a").map((r) => r.id)).toEqual(["a1"]);
    expect(cascadingOptions(rows, "b")).toEqual([]);
    expect(cascadingOptions(rows, "missing")).toEqual([]);
  });
  it.each(["PRODUCTION", "OPERATIONAL", "MARKETING"])(
    "POS-01 menerima grup %s",
    (group) => {
      expect(expenseSchema.parse({ name: "Pos Uji", group }).group).toBe(group);
    },
  );
  it("menolak enum asing, field spoof dan tipe yang salah", () => {
    expect(
      expenseSchema.safeParse({ name: "Biaya", group: "COA" }).success,
    ).toBe(false);
    expect(
      categorySchema.safeParse({ name: "X", parentId: null, totalPrice: 1 })
        .success,
    ).toBe(false);
    expect(
      categorySchema.safeParse({ name: "X", parentId: null, isActive: "true" })
        .success,
    ).toBe(false);
  });
});

describe("konfigurasi rahasia", () => {
  const valid = {
    DB_TARGET: "production",
    DATABASE_URL:
      "postgresql://u:secret@ep-test-pooler.region.aws.neon.tech/db?sslmode=verify-full",
    DIRECT_URL:
      "postgresql://u:secret@ep-test.region.aws.neon.tech/db?sslmode=verify-full",
  };
  it("memisahkan pooled/direct pada branch yang sama", () => {
    expect(databaseTarget(valid)).toBe("production");
    expect(() =>
      databaseTarget({ ...valid, DIRECT_URL: valid.DATABASE_URL }),
    ).toThrow("direct");
    expect(() =>
      databaseTarget({
        ...valid,
        DIRECT_URL: valid.DIRECT_URL.replace("ep-test", "ep-foreign"),
      }),
    ).toThrow("sama");
    expect(() => databaseTarget({ ...valid, DB_TARGET: undefined })).toThrow(
      "DB_TARGET",
    );
  });
  it("menolak secret lemah dan production remote HTTP", () => {
    expect(() => authSecret({ AUTH_SECRET: "short" })).toThrow("AUTH_SECRET");
    expect(() =>
      appOrigin({ APP_ORIGIN: "http://example.com", NODE_ENV: "production" }),
    ).toThrow("APP_ORIGIN");
    expect(
      appOrigin({ APP_ORIGIN: "https://example.com", NODE_ENV: "production" }),
    ).toBe("https://example.com");
  });
  it("menolak kredensial lemah tanpa mencetak nilainya", () => {
    expect(() =>
      bootstrapCredentials({
        SEED_ADMIN_EMAIL: "admin@example.com",
        SEED_ADMIN_PASSWORD: "private-pass",
      }),
    ).toThrow("SEED_ADMIN_PASSWORD");
    expect(
      bootstrapCredentials({
        SEED_ADMIN_EMAIL: "ADMIN@example.com",
        SEED_ADMIN_PASSWORD: "Very-Strong123!",
      }).email,
    ).toBe("admin@example.com");
  });
});
