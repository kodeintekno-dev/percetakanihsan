import { ZodError } from "zod";
import { Prisma } from "@/generated/prisma/client";

import { AppError } from "./app-error";
export { AppError } from "./app-error";

export function errorResponse(error: unknown) {
  if (error instanceof AppError)
    return Response.json(
      { error: error.message, fields: error.fields },
      { status: error.status },
    );
  if (error instanceof ZodError) {
    const fields: Record<string, string[]> = {};
    for (const issue of error.issues) {
      const key = String(
        (issue.path[0] === "data" ? issue.path[1] : issue.path[0]) ?? "_form",
      );
      (fields[key] ??= []).push(issue.message);
    }
    return Response.json(
      {
        error: "Periksa kembali data yang diisi.",
        fields,
      },
      { status: 422 },
    );
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002")
      return Response.json(
        {
          error: "Nama tersebut sudah ada pada kelompok yang sama.",
          fields: { name: ["Gunakan nama lain."] },
        },
        { status: 409 },
      );
    if (["P2003", "P2034"].includes(error.code))
      return Response.json(
        { error: "Data berkaitan atau berubah. Muat ulang lalu coba kembali." },
        { status: 409 },
      );
    if (error.code === "P2025")
      return Response.json(
        { error: "Data tidak ditemukan. Muat ulang daftar." },
        { status: 404 },
      );
  }
  // Tidak menulis objek error: adapter database dapat menyertakan URL/kredensial.
  console.error(
    "Operasi server gagal; periksa konfigurasi dan koneksi database secara aman.",
  );
  return Response.json(
    {
      error:
        "Layanan belum dapat diakses. Periksa konfigurasi server dan koneksi database.",
    },
    { status: 503 },
  );
}
