import { requirePageAdmin } from "@/lib/auth/session";
import { getCategoryRows } from "@/features/categories/service";
import { MasterManager } from "@/components/master-manager";
export default async function CategoriesPage() {
  await requirePageAdmin();
  return <MasterManager kind="category" rows={await getCategoryRows()} />;
}
