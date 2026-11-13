-- Gunakan kolom orderId yang sudah ada; seluruh data transaksi tetap dipertahankan.
-- Hanya pengeluaran yang kini boleh memiliki tautan pesanan opsional.
BEGIN;

ALTER TABLE "CashTransaction" DROP CONSTRAINT "cash_type_fields";
ALTER TABLE "CashTransaction" ADD CONSTRAINT "cash_type_fields" CHECK (
  ("type" = 'EXPENSE' AND "expensePostId" IS NOT NULL AND "expenseGroupSnapshot" IS NOT NULL
    AND "incomeKind" IS NULL AND "categoryId" IS NULL AND "subcategoryId" IS NULL
    AND "soldQuantity" IS NULL AND "soldUnit" IS NULL)
  OR
  ("type" = 'INCOME' AND "expensePostId" IS NULL AND "expenseGroupSnapshot" IS NULL
    AND "incomeKind" IS NOT NULL
    AND (("incomeKind" = 'SALE' AND "categoryId" IS NOT NULL)
      OR ("incomeKind" = 'OTHER' AND "categoryId" IS NULL AND "subcategoryId" IS NULL
        AND "orderId" IS NULL AND "soldQuantity" IS NULL AND "soldUnit" IS NULL)))
);

COMMIT;
