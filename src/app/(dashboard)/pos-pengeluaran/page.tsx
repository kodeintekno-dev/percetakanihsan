import { requirePageAdmin } from "@/lib/auth/session";
import { getExpenseRows } from "@/features/expenses/service";
import { MasterManager } from "@/components/master-manager";
export default async function ExpensePage() {
  await requirePageAdmin();
  return <MasterManager kind="expense" rows={await getExpenseRows()} />;
}
