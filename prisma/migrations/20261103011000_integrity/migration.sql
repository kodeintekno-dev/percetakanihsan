-- PostgreSQL UNIQUE nullable biasa tidak melindungi duplikat kategori utama.
CREATE UNIQUE INDEX "ProductCategory_root_nameKey_key"
  ON "ProductCategory" ("nameKey") WHERE "parentId" IS NULL;

ALTER TABLE "ProductCategory" ADD CONSTRAINT "category_not_self_parent"
  CHECK ("parentId" IS NULL OR "parentId" <> "id");
ALTER TABLE "ProductCategory" ADD CONSTRAINT "category_nonempty_name"
  CHECK (length(btrim("name")) > 0 AND length("nameKey") > 0);
ALTER TABLE "ExpensePost" ADD CONSTRAINT "expense_nonempty_name"
  CHECK (length(btrim("name")) > 0 AND length("nameKey") > 0);
ALTER TABLE "CashOpeningSetting" ADD CONSTRAINT "opening_singleton" CHECK ("id" = 1);
ALTER TABLE "PrintOrder" ADD CONSTRAINT "order_positive_values"
  CHECK ("quantity" > 0 AND "unitPrice" >= 0 AND "totalPrice" >= 0);
ALTER TABLE "CashTransaction" ADD CONSTRAINT "cash_positive_amount" CHECK ("amount" > 0);
ALTER TABLE "CashTransaction" ADD CONSTRAINT "cash_sold_quantity"
  CHECK ("soldQuantity" IS NULL OR "soldQuantity" >= 0);
ALTER TABLE "CashTransaction" ADD CONSTRAINT "cash_type_fields" CHECK (
  ("type" = 'EXPENSE' AND "expensePostId" IS NOT NULL AND "expenseGroupSnapshot" IS NOT NULL
    AND "incomeKind" IS NULL AND "categoryId" IS NULL AND "subcategoryId" IS NULL
    AND "orderId" IS NULL AND "soldQuantity" IS NULL AND "soldUnit" IS NULL)
  OR
  ("type" = 'INCOME' AND "expensePostId" IS NULL AND "expenseGroupSnapshot" IS NULL
    AND "incomeKind" IS NOT NULL
    AND (("incomeKind" = 'SALE' AND "categoryId" IS NOT NULL)
      OR ("incomeKind" = 'OTHER' AND "categoryId" IS NULL AND "subcategoryId" IS NULL
        AND "orderId" IS NULL AND "soldQuantity" IS NULL AND "soldUnit" IS NULL)))
);
ALTER TABLE "BudgetEstimate" ADD CONSTRAINT "budget_positive_values"
  CHECK ("quantity" > 0 AND "marginValue" >= 0 AND "totalHpp" >= 0 AND "hppPerUnit" >= 0 AND "suggestedSellingTotal" >= 0);
ALTER TABLE "BudgetCostItem" ADD CONSTRAINT "cost_nonnegative_values"
  CHECK ("quantity" > 0 AND "unitCost" >= 0 AND "totalCost" >= 0);
ALTER TABLE "PaperCutSimulation" ADD CONSTRAINT "paper_positive_dimensions"
  CHECK ("sheetLengthCm" > 0 AND "sheetWidthCm" > 0 AND "cutLengthCm" > 0 AND "cutWidthCm" > 0
    AND "originalYield" >= 0 AND "rotatedYield" >= 0 AND "chosenYield" >= 0 AND "wasteAreaCm2" >= 0);

-- Pertahanan tambahan untuk penulisan di luar aplikasi. Transaksi service tetap SERIALIZABLE.
CREATE FUNCTION enforce_category_depth() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_parent text;
BEGIN
  IF NEW."parentId" IS NOT NULL THEN
    SELECT "parentId" INTO parent_parent FROM "ProductCategory"
      WHERE "id" = NEW."parentId" FOR UPDATE;
    IF parent_parent IS NOT NULL OR EXISTS (
      SELECT 1 FROM "ProductCategory" WHERE "parentId" = NEW."id"
    ) THEN
      RAISE EXCEPTION 'Kategori maksimal dua level' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "category_two_levels" BEFORE INSERT OR UPDATE OF "parentId" ON "ProductCategory"
  FOR EACH ROW EXECUTE FUNCTION enforce_category_depth();
