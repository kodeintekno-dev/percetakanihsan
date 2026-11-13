import "server-only";
import { getDb } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { serializable } from "@/lib/transaction";
import { nameKey } from "@/features/categories/schema";
import { expenseSchema, type ExpenseRow } from "./schema";

export async function getExpenseRows(): Promise<ExpenseRow[]> {
  const rows = await getDb().expensePost.findMany({
    include: { _count: { select: { transactions: true, invoices: true } } },
    orderBy: [{ group: "asc" }, { name: "asc" }],
  });
  return rows.map(({ id, name, group, isActive, _count }) => ({
    id,
    name,
    group,
    isActive,
    usage: _count.transactions + _count.invoices,
  }));
}
export async function saveExpense(input: unknown, id?: string) {
  const data = expenseSchema.parse(input);
  const values = { ...data, nameKey: nameKey(data.name) };
  return id
    ? getDb().expensePost.update({ where: { id }, data: values })
    : getDb().expensePost.create({ data: values });
}
export async function deleteExpense(id: string) {
  return serializable(getDb(), async (tx) => {
    const row = await tx.expensePost.findUnique({
      where: { id },
      include: { _count: { select: { transactions: true } } },
    });
    if (!row) throw new AppError("Pos tidak ditemukan.", 404);
    if (
      row._count.transactions ||
      (await tx.tradeInvoice.count({ where: { expensePostId: id } }))
    ) {
      await tx.expensePost.update({ where: { id }, data: { isActive: false } });
      return {
        message:
          "Pos telah dipakai sehingga diarsipkan. Riwayat transaksi tetap tersimpan.",
      };
    }
    await tx.expensePost.delete({ where: { id } });
    return { message: "Pos pengeluaran berhasil dihapus." };
  });
}
